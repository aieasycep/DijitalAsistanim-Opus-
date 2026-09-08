import type { Page } from '@playwright/test'
import { admin, clearSignInLimit, expect, test } from '../support/console.ts'

/**
 * The front door.
 *
 * Two properties, and the second is the one that is easy to lose: a sign-in form
 * that says "no such account" for an unknown address and "wrong password" for a
 * known one is an account-existence oracle, and `session-actions.ts` returns the
 * same sentence for both on purpose. The spec asserts they are the *same string*
 * rather than that each is "an error", because that is the only assertion a
 * later refactor cannot quietly weaken.
 */

const INVALID = 'E-posta veya parola hatalı.'
/** `SIGN_IN_RATE_LIMIT.limit`. Well above it, so the limiter has to answer. */
const OVER_THE_LIMIT = 12

/**
 * The form's own message, not Next's route announcer — which is also
 * `role="alert"` and is empty, so an unscoped role query matches both.
 */
function signInError(page: Page) {
  return page.locator('form p[role="alert"]')
}

test('correct credentials land on the overview', async ({ page, state, signIn }) => {
  await signIn(admin(state, 'owner'))

  await expect(page).toHaveURL(`${state.baseUrl}/`)
  await expect(page.getByRole('heading', { level: 1, name: 'Genel bakış' })).toBeVisible()
  // The rail only renders for a resolved console session, so its presence is
  // evidence the `admin_sessions` row was created and validated.
  await expect(page.getByRole('navigation', { name: 'Ana gezinme' })).toBeVisible()
})

test('a wrong password does not sign anybody in', async ({ page, state, db }) => {
  const owner = admin(state, 'owner')
  await clearSignInLimit(db)

  await page.goto('/sign-in')
  await page.locator('input[name="email"]').fill(owner.email)
  await page.locator('input[name="password"]').fill(`${owner.password}-wrong`)
  await page.getByRole('button', { name: 'Giriş yap' }).click()

  await expect(signInError(page)).toHaveText(INVALID)
  await expect(page).toHaveURL(/\/sign-in$/)

  // And no session was issued for the account whose password was guessed at.
  await page.goto('/users')
  await expect(page).toHaveURL(/\/sign-in/)
})

test('the refusal says nothing about which half was wrong', async ({ page, state, db }) => {
  const owner = admin(state, 'owner')
  await clearSignInLimit(db)

  await page.goto('/sign-in')
  await page.locator('input[name="email"]').fill(owner.email)
  await page.locator('input[name="password"]').fill('definitely-not-the-password')
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  const wrongPassword = await signInError(page).textContent()

  await page.goto('/sign-in')
  await page.locator('input[name="email"]').fill('nobody@backoffice.example.com')
  await page.locator('input[name="password"]').fill('definitely-not-the-password')
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  const unknownAccount = await signInError(page).textContent()

  expect(wrongPassword).toBe(INVALID)
  expect(unknownAccount).toBe(INVALID)
  expect(unknownAccount).toBe(wrongPassword)
})

test('an authenticated account that is not an admin is refused', async ({ page, state, db }) => {
  await clearSignInLimit(db)
  // A paying customer's credentials are valid at GoTrue and worth nothing here:
  // authorization is a row in `admin_users`, and this account has none.
  const password = `fixture-${state.sentinel.slice(-12).toLowerCase()}`
  await db.query(
    'insert into e2e_fixture.credentials (user_id, email, password) values ($1, $2, $3) ' +
      'on conflict (user_id) do update set password = excluded.password',
    [state.subjectUser.userId, state.subjectUser.email, password],
  )

  await page.goto('/sign-in')
  await page.locator('input[name="email"]').fill(state.subjectUser.email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Giriş yap' }).click()

  await expect(signInError(page)).toHaveText('Bu hesabın backoffice yetkisi yok.')

  // The refusal is recorded with no admin actor, because the whole point is that
  // the account is not one.
  const trail = await db.query<{ outcome: string | null; actor: string | null }>(
    `select metadata ->> 'outcome' as outcome, actor_admin_user_id::text as actor
       from public.audit_logs
      where action = 'auth.admin_sign_in_denied' and user_id = $1`,
    [state.subjectUser.userId],
  )
  expect(trail.rows).toHaveLength(1)
  expect(trail.rows[0]?.outcome).toBe('not_staff')
  expect(trail.rows[0]?.actor).toBeNull()
})

test('guessing at one address is stopped before the password is even checked', async ({
  page,
  state,
  db,
}) => {
  // The limiter is real, and every other spec here clears it precisely because
  // it is — so it needs one test of its own, or the suite would be quietly
  // disabling a control nobody checks.
  const owner = admin(state, 'owner')
  await clearSignInLimit(db)

  let refusedForCredentials = 0
  let refusedForRate = 0

  for (let attempt = 0; attempt < OVER_THE_LIMIT; attempt += 1) {
    await page.goto('/sign-in')
    await page.locator('input[name="email"]').fill(owner.email)
    await page.locator('input[name="password"]').fill(`wrong-${attempt}`)
    await page.getByRole('button', { name: 'Giriş yap' }).click()

    const message = (await signInError(page).textContent()) ?? ''
    if (message === INVALID) refusedForCredentials += 1
    else if (message.includes('Çok fazla')) refusedForRate += 1
    else throw new Error(`unexpected sign-in refusal: ${message}`)
  }

  expect(refusedForCredentials).toBeGreaterThan(0)
  expect(refusedForRate).toBeGreaterThan(0)

  // The counter is a row, incremented in one atomic statement in Postgres.
  const window = await db.query<{ count: number }>(
    "select count from public.admin_rate_limits where scope = 'admin.sign_in'",
  )
  expect(window.rows.length).toBeGreaterThan(0)

  // Even the correct password is refused while the window is open.
  await page.goto('/sign-in')
  await page.locator('input[name="email"]').fill(owner.email)
  await page.locator('input[name="password"]').fill(owner.password)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(signInError(page)).toContainText('Çok fazla')

  await clearSignInLimit(db)
})
