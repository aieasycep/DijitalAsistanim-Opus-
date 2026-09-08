import { randomUUID } from 'node:crypto'
import { admin, expect, test } from '../support/console.ts'

/**
 * Which deployment is this, and does the console say so?
 *
 * `env.ts` is blunt about why this matters: a console that looks identical
 * against production and against staging is a console where somebody eventually
 * disconnects a real customer's mailbox while reproducing a bug. Two things have
 * to be true outside production — a chip that names the environment, and a
 * different treatment on anything destructive — and both are rendered from a
 * descriptor resolved on the server, so neither can be checked from the source
 * alone.
 *
 * The suite runs the console with `BACKOFFICE_ENV=staging`, which is the case
 * that matters: the production branch is the one that renders *less*.
 */

const STAGING_CODE = 'TEST'
const STAGING_LABEL = 'Hazırlık ortamı'

test('the console names the environment it is pointed at', async ({ page, state, signIn }) => {
  expect(state.environment).toBe('staging')

  await signIn(admin(state, 'owner'))
  const bar = page.getByRole('banner', { name: 'Konsol araç çubuğu' })
  const chip = bar.getByText(STAGING_CODE, { exact: false }).first()

  await expect(chip).toBeVisible()
  // The chip carries the whole sentence as its title, project reference and all,
  // so "am I really on staging?" is answered from the screen.
  await expect(chip).toHaveAttribute(
    'title',
    new RegExp(`${STAGING_LABEL}.*canlı müşteri verisi değildir`),
  )
  // And it announces itself as the environment rather than as four loose letters.
  await expect(bar.getByText('Ortam:')).toBeAttached()
})

test('the environment chip is on every dashboard screen, not just the first', async ({
  page,
  state,
  signIn,
}) => {
  await signIn(admin(state, 'owner'))
  for (const route of ['/users', '/support/access', '/system/admins', '/audit']) {
    await page.goto(route)
    await expect(page.getByRole('banner', { name: 'Konsol araç çubuğu' })).toBeVisible()
    await expect(
      page.getByRole('banner', { name: 'Konsol araç çubuğu' }).getByText(STAGING_CODE),
    ).toBeVisible()
  }
})

test('a destructive action carries the non-production treatment', async ({
  page,
  state,
  db,
  signIn,
}) => {
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
      'Ortam uyarısının göründüğünü doğrulamak için açılmış bir talep.',
    ],
  )

  await signIn(operator)
  await page.goto(`/support/access/${grantId}`)
  await page.getByRole('button', { name: 'Geri al' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  // `dangerousActionNote()` renders only outside production, and this is the
  // sentence it produces for staging.
  await expect(
    dialog.getByText(`${STAGING_LABEL}: bu işlem gerçek müşteriyi etkilemez.`),
  ).toBeVisible()
  // The destructive treatment itself: the dialog says the action cannot be undone.
  await expect(dialog.getByText('geri alınamaz', { exact: false })).toBeVisible()

  await page.keyboard.press('Escape')
})
