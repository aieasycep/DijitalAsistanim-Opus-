import type { Page } from '@playwright/test'
import type { Pool } from 'pg'
import { admin, expect, test } from '../support/console.ts'
import type { StackState } from '../harness/state.ts'

/**
 * Support Access, the one controlled route to a user's own words.
 *
 * Section 7 of the specification asks for five things, and every one of them is
 * a rule in the database rather than a policy in a form handler. This spec
 * exercises them where they are enforced:
 *
 *   - a written reason, over a minimum the schema itself declares;
 *   - four eyes: the requester cannot approve their own request;
 *   - a second admin can, and the clock starts then;
 *   - every reveal writes a `support_access_reveals` row in the same statement
 *     that returns the data;
 *   - a scope that was not granted is refused, and logs nothing.
 *
 * The console governs access but never exercises it — the grant page says so in
 * as many words, and nothing under `(dash)` reaches an `sa_reveal_*` function.
 * So the reveal is performed the way the product would perform it, through the
 * project's own HTTP surface, and the assertion that closes the loop is that the
 * console then shows the log row it produced.
 */

const SUBJECT_FIELD = 'input[name="subjectUserId"]'
const REASON_FIELD = 'textarea[name="reason"]'

/** The floor the schema declares, read from the constraint rather than copied. */
async function reasonMinimum(db: Pool): Promise<number> {
  const result = await db.query<{ definition: string }>(
    `select pg_get_constraintdef(oid) as definition
       from pg_constraint where conname = 'support_access_grants_reason_is_written'`,
  )
  const definition = result.rows[0]?.definition ?? ''
  const match = />=\s*(\d+)/.exec(definition)
  expect(match?.[1], `could not read the reason floor from: ${definition}`).toBeDefined()
  return Number(match?.[1])
}

/**
 * Strip the courtesy attributes and submit anyway.
 *
 * `RequestForm` says in its own comment that `minLength` is "a courtesy so an
 * operator is told before they submit … not the check". This is what makes that
 * sentence testable: a client that never had those attributes still has to be
 * refused, by the schema and by `runAdminAction`, on the way in.
 */
async function submitPastClientValidation(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const field of document.querySelectorAll('textarea, input')) {
      field.removeAttribute('minlength')
      field.removeAttribute('required')
    }
    document.querySelector('form')?.setAttribute('novalidate', 'novalidate')
  })
  await page.getByRole('button', { name: 'Talebi aç' }).click()
}

async function openRequestForm(page: Page, state: StackState): Promise<void> {
  await page.goto(`/support/access/new?user=${state.subjectUser.userId}`)
  await expect(page.locator(SUBJECT_FIELD)).toHaveValue(state.subjectUser.userId)
  await page.getByRole('checkbox').first().check()
}

test('a request is refused without a reason over the minimum the schema declares', async ({
  page,
  state,
  db,
  signIn,
}) => {
  const minimum = await reasonMinimum(db)
  expect(minimum).toBeGreaterThan(3)

  const before = await db.query<{ total: string }>(
    'select count(*)::text as total from public.support_access_grants',
  )

  await signIn(admin(state, 'helpdesk'))
  await openRequestForm(page, state)
  await page.locator(REASON_FIELD).fill('x'.repeat(minimum - 1))
  await submitPastClientValidation(page)

  // The refusal lands on the field that caused it, not in a generic banner.
  await expect(page.getByText(`Gerekçe en az ${minimum} karakter olmalıdır.`)).toBeVisible()

  const after = await db.query<{ total: string }>(
    'select count(*)::text as total from public.support_access_grants',
  )
  expect(after.rows[0]?.total).toBe(before.rows[0]?.total)
})

test('a request with a real reason is opened, pending, and audited', async ({
  page,
  state,
  db,
  signIn,
}) => {
  const requester = admin(state, 'helpdesk')
  const reason =
    'Kullanıcı üç gündür yeni posta göremiyor; hangi klasörün eşitlenmediğini görmemiz gerekiyor.'

  await signIn(requester)
  await openRequestForm(page, state)
  await page.locator(REASON_FIELD).fill(reason)
  await page.getByRole('button', { name: 'Talebi aç' }).click()

  const open = page.getByRole('link', { name: 'Talebi aç' })
  await expect(open).toBeVisible()
  const href = await open.getAttribute('href')
  const grantId = (href ?? '').split('/').pop() ?? ''
  expect(grantId).toMatch(/^[0-9a-f-]{36}$/)

  const grant = await db.query<{ status: string; reason: string; admin_user_id: string }>(
    'select status::text as status, reason, admin_user_id::text as admin_user_id ' +
      'from public.support_access_grants where id = $1',
    [grantId],
  )
  expect(grant.rows[0]?.status).toBe('pending_approval')
  expect(grant.rows[0]?.reason).toBe(reason)
  expect(grant.rows[0]?.admin_user_id).toBe(requester.adminUserId)

  // The trail names who asked and why, in real columns rather than metadata.
  const trail = await db.query<{ actor: string; reason: string; sensitive: boolean }>(
    `select actor_admin_user_id::text as actor, reason, is_sensitive as sensitive
       from public.audit_logs
      where action = 'support_access.requested' and support_access_grant_id = $1`,
    [grantId],
  )
  expect(trail.rows).toHaveLength(1)
  expect(trail.rows[0]?.actor).toBe(requester.adminUserId)
  expect(trail.rows[0]?.reason).toBe(reason)
  expect(trail.rows[0]?.sensitive).toBe(true)
})

test('the requester is offered no approval, and the database refuses one anyway', async ({
  page,
  state,
  db,
  signIn,
}) => {
  const requester = admin(state, 'helpdesk')
  await signIn(requester)
  await page.goto(`/support/access/${state.entities.pendingGrantId}`)

  await expect(page.getByRole('button', { name: 'Onayla' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Reddet' })).toHaveCount(0)
  // Revocation is offered — an operator may always hand back what they asked for.
  await expect(page.getByRole('button', { name: 'Geri al' })).toBeVisible()

  // The rendered control is a courtesy; `support_access_grants_four_eyes` is the
  // rule, and it refuses the write even when nothing rendered it.
  await expect(
    db.query(
      `update public.support_access_grants
          set status = 'active', approved_by = admin_user_id, approved_at = now(), granted_at = now()
        where id = $1`,
      [state.entities.pendingGrantId],
    ),
  ).rejects.toThrow(/support_access_grants_four_eyes/)
})

test('a second admin can approve, and the grant becomes live', async ({
  page,
  state,
  db,
  signIn,
}) => {
  const approver = admin(state, 'ops')
  await signIn(approver)
  await page.goto(`/support/access/${state.entities.pendingGrantId}`)

  await page.getByRole('button', { name: 'Onayla' }).click()
  await page
    .getByRole('textbox', { name: 'Onay gerekçesi' })
    .fill('Talep gerekçesi yeterli, kapsam dar tutulmuş.')
  await page.getByRole('button', { name: 'Onayla ve süreyi başlat' }).click()

  await expect(page.getByText('Erişim onaylandı')).toBeVisible()

  const grant = await db.query<{ status: string; approved_by: string; live: boolean }>(
    `select status::text as status,
            approved_by::text as approved_by,
            (status = 'active' and granted_at is not null and expires_at > now()) as live
       from public.support_access_grants where id = $1`,
    [state.entities.pendingGrantId],
  )
  expect(grant.rows[0]?.status).toBe('active')
  expect(grant.rows[0]?.approved_by).toBe(approver.adminUserId)
  expect(grant.rows[0]?.live).toBe(true)

  const trail = await db.query<{ actor: string; reason: string }>(
    `select actor_admin_user_id::text as actor, reason from public.audit_logs
      where action = 'support_access.approved' and support_access_grant_id = $1`,
    [state.entities.pendingGrantId],
  )
  expect(trail.rows).toHaveLength(1)
  expect(trail.rows[0]?.actor).toBe(approver.adminUserId)
  expect(trail.rows[0]?.reason).toContain('kapsam dar tutulmuş')
})

test('a reveal returns the content, writes a log row, and the console shows it', async ({
  page,
  state,
  db,
  signIn,
}) => {
  const holder = admin(state, 'helpdesk')

  const revealed = await revealAs(state, 'sa_reveal_identity', {
    p_grant_id: state.entities.pendingGrantId,
    p_admin_user_id: holder.adminUserId,
    p_request_id: 'e2e-identity',
  })
  expect(revealed.status).toBe(200)

  // The one place in the whole product where a seeded user's own words come back
  // out. Everywhere else in this suite the same string must be absent.
  const rows = revealed.body as readonly { display_name: string | null; email: string }[]
  expect(rows).toHaveLength(1)
  expect(rows[0]?.display_name).toContain(state.sentinel)
  expect(rows[0]?.email).toBe(state.subjectUser.email)

  const log = await db.query<{ scope: string; admin: string; request: string | null }>(
    `select scope::text as scope, admin_user_id::text as admin, request_id as request
       from public.support_access_reveals where grant_id = $1`,
    [state.entities.pendingGrantId],
  )
  expect(log.rows).toHaveLength(1)
  expect(log.rows[0]?.scope).toBe('identity')
  expect(log.rows[0]?.admin).toBe(holder.adminUserId)
  expect(log.rows[0]?.request).toBe('e2e-identity')

  // And the console renders the record of it — without rendering what was seen.
  await signIn(admin(state, 'ops'))
  await page.goto(`/support/access/${state.entities.pendingGrantId}`)
  await expect(page.getByText('Kimlik bilgileri').first()).toBeVisible()
  expect(await page.content()).not.toContain(state.sentinel)
})

test('a scope that was not granted is refused, and logs nothing', async ({ state, db }) => {
  const holder = admin(state, 'helpdesk')
  const before = await db.query<{ total: string }>(
    'select count(*)::text as total from public.support_access_reveals where grant_id = $1',
    [state.entities.pendingGrantId],
  )

  // The seeded grant carries `identity` and `email_subject`. A message body is
  // `email_body`, which nobody approved.
  const refused = await revealAs(state, 'sa_reveal_email_message', {
    p_grant_id: state.entities.pendingGrantId,
    p_admin_user_id: holder.adminUserId,
    p_message_id: state.entities.emailMessageId,
    p_request_id: 'e2e-body',
  })
  expect(refused.status).toBeGreaterThanOrEqual(400)
  const error = refused.body as { hint?: string }
  expect(error.hint).toBe('support_access_scope_denied')

  const after = await db.query<{ total: string }>(
    'select count(*)::text as total from public.support_access_reveals where grant_id = $1',
    [state.entities.pendingGrantId],
  )
  expect(after.rows[0]?.total).toBe(before.rows[0]?.total)
})

/**
 * Call a reveal function the way the product would: over the project's HTTP
 * surface, with the service role, exactly as `lib/db.ts` composes it.
 */
async function revealAs(
  state: StackState,
  fn: string,
  args: Readonly<Record<string, string | null>>,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${state.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: state.serviceRoleKey,
      Authorization: `Bearer ${state.serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  return { status: response.status, body: (await response.json()) as unknown }
}
