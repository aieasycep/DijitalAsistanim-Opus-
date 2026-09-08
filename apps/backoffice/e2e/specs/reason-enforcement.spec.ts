import { randomUUID } from 'node:crypto'
import { admin, expect, test } from '../support/console.ts'

/**
 * "Why did you do that?", enforced rather than requested.
 *
 * `admin_sensitive_actions` is the list, `audit_logs_enforce_accountability()`
 * is the refusal, and `runAdminAction` refuses earlier so an operator sees a
 * field error instead of a database exception. The three have to agree, and the
 * only way they can disagree quietly is if nobody ever submits an action without
 * a reason — which a browser never lets you do, because the confirm button is
 * disabled until you have typed one.
 *
 * So this spec does what a script would: it takes the disabled attribute off and
 * submits anyway. The action must still refuse, nothing must change, and when
 * the same action is then done properly the audit row must carry the actor and
 * the sentence in real columns — not in the metadata the 400-day sweep erases.
 */

const ACTION = 'support_access.revoked'

test('the database says this action needs a reason', async ({ db }) => {
  const listed = await db.query<{ requires: boolean }>(
    'select requires_reason as requires from public.admin_sensitive_actions where action = $1',
    [ACTION],
  )
  expect(listed.rows).toHaveLength(1)
  expect(listed.rows[0]?.requires).toBe(true)
})

test('every listed action refuses an audit row that carries no reason', async ({ state, db }) => {
  // Driven from the table rather than from a list here, so an action added by a
  // later migration is covered the day it lands.
  const actions = await db.query<{ action: string }>(
    'select action from public.admin_sensitive_actions where requires_reason order by action',
  )
  expect(actions.rows.length).toBeGreaterThan(20)

  const actor = admin(state, 'owner').adminUserId
  for (const row of actions.rows) {
    await expect(
      db.query('select public.admin_write_audit($1, $2, null)', [actor, row.action]),
      `${row.action} accepted an audit row with no reason`,
    ).rejects.toThrow(/audit_reason_required|must carry a written reason/)
  }
})

test('the console refuses the action without a reason, and records it with one', async ({
  page,
  state,
  db,
  signIn,
}) => {
  // A grant of its own, so revoking it cannot disturb the one the Support Access
  // spec approves.
  const operator = admin(state, 'ops')
  const grantId = randomUUID()
  await db.query(
    `insert into public.support_access_grants
       (id, admin_user_id, subject_user_id, scopes, reason, status, requested_at, expires_at)
     values ($1, $2, $3, '{identity}'::support_access_scope[], $4, 'pending_approval',
             now(), now() + interval '1 hour')`,
    [
      grantId,
      operator.adminUserId,
      state.otherUser.userId,
      'Fatura itirazında hesabın kimlik bilgilerini doğrulamamız gerekiyor.',
    ],
  )

  await signIn(operator)
  await page.goto(`/support/access/${grantId}`)
  await page.getByRole('button', { name: 'Geri al' }).click()

  const confirm = page.getByRole('button', { name: 'Erişimi geri al' })
  // The courtesy: nothing to press until a sentence has been typed.
  await expect(confirm).toBeDisabled()

  // The control: submit the form the way something that is not a browser form
  // would — no disabled button, no `required`, no length floor. All three are
  // client-side hints, and the point of this spec is that removing them changes
  // nothing about the answer.
  await page.evaluate(() => {
    const form = document.querySelector('[role="dialog"] form')
    if (form === null) throw new Error('the confirmation dialog rendered no form')
    for (const field of form.querySelectorAll('input, textarea')) {
      field.removeAttribute('required')
      field.removeAttribute('minlength')
    }
    for (const button of form.querySelectorAll('button')) button.removeAttribute('disabled')
    form.setAttribute('novalidate', 'novalidate')
    ;(form as HTMLFormElement).requestSubmit()
  })

  await expect(page).toHaveURL(new RegExp(`/support/access/${grantId}\\?result=invalid`))
  await expect(page.getByText('Eksik veya geçersiz bilgi')).toBeVisible()

  const untouched = await db.query<{ status: string }>(
    'select status::text as status from public.support_access_grants where id = $1',
    [grantId],
  )
  expect(untouched.rows[0]?.status).toBe('pending_approval')

  const noRow = await db.query<{ total: string }>(
    `select count(*)::text as total from public.audit_logs
      where action = $1 and support_access_grant_id = $2 and metadata ->> 'outcome' = 'success'`,
    [ACTION, grantId],
  )
  expect(noRow.rows[0]?.total).toBe('0')

  // Now do it the way it is meant to be done.
  const reason = 'Talep sahibi vazgeçti, erişime gerek kalmadı.'
  await page.goto(`/support/access/${grantId}`)
  await page.getByRole('button', { name: 'Geri al' }).click()
  await page.getByRole('textbox', { name: 'Geri alma gerekçesi' }).fill(reason)
  await page.getByRole('button', { name: 'Erişimi geri al' }).click()

  await expect(page.getByText('Erişim geri alındı')).toBeVisible()

  const revoked = await db.query<{ status: string; revoked_reason: string; revoked_by: string }>(
    `select status::text as status, revoked_reason, revoked_by::text as revoked_by
       from public.support_access_grants where id = $1`,
    [grantId],
  )
  expect(revoked.rows[0]?.status).toBe('revoked')
  expect(revoked.rows[0]?.revoked_reason).toBe(reason)
  expect(revoked.rows[0]?.revoked_by).toBe(operator.adminUserId)

  // The columns that matter: actor and reason as real columns, and the row
  // marked sensitive by the trigger rather than by the application.
  const trail = await db.query<{
    actor: string
    role: string
    reason: string
    sensitive: boolean
  }>(
    `select actor_admin_user_id::text as actor, actor_role::text as role, reason,
            is_sensitive as sensitive
       from public.audit_logs
      where action = $1 and support_access_grant_id = $2`,
    [ACTION, grantId],
  )
  expect(trail.rows).toHaveLength(1)
  expect(trail.rows[0]?.actor).toBe(operator.adminUserId)
  expect(trail.rows[0]?.role).toBe(operator.role)
  expect(trail.rows[0]?.reason).toBe(reason)
  expect(trail.rows[0]?.sensitive).toBe(true)
})
