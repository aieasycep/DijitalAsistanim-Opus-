import { admin, expect, test } from '../support/console.ts'

/**
 * Getting in, staying in, and being put out.
 *
 * The console session is a row in `admin_sessions`, not a claim in a cookie:
 * `admin_touch_session()` validates the hash, both deadlines and the admin's
 * status in one statement on every protected render. The last test here revokes
 * that row from outside the browser and asserts the very next request is
 * refused, which is the only way to show that "log out all sessions" is a fact
 * about the database rather than a hope about a browser.
 *
 * One thing this suite asserts and does not assume: the console does *not*
 * carry the requested path through sign-in. An operator who is bounced from
 * `/users` lands on the overview afterwards, not back on `/users`. The route is
 * reachable the moment they are signed in, which is what the spec checks.
 */

const DASH_ROUTE = '/users'

test('an unauthenticated request to a dashboard route is sent to sign-in', async ({
  page,
  state,
}) => {
  // The edge proxy answers before a page renders, so the redirect is a real 307
  // rather than one buried in an RSC payload with a 200 on it.
  const response = await page.request.get(`${state.baseUrl}${DASH_ROUTE}`, { maxRedirects: 0 })
  expect(response.status()).toBe(307)
  expect(response.headers()['location']).toContain('/sign-in')

  await page.goto(DASH_ROUTE)
  await expect(page).toHaveURL(/\/sign-in$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Backoffice girişi' })).toBeVisible()
})

test('the route is reachable once signed in, and closed again after signing out', async ({
  page,
  state,
  signIn,
}) => {
  await page.goto(DASH_ROUTE)
  await expect(page).toHaveURL(/\/sign-in$/)

  await signIn(admin(state, 'owner'))
  await page.goto(DASH_ROUTE)
  await expect(page).toHaveURL(`${state.baseUrl}${DASH_ROUTE}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await page.getByRole('button', { name: 'Yönetici menüsü' }).click()
  await page.getByRole('menuitem', { name: 'Çıkış yap' }).click()
  // The action redirects through the router rather than reloading the document,
  // so this waits on the URL settling rather than on a `load` event.
  await expect(page).toHaveURL(/\/sign-in/)

  await page.goto(DASH_ROUTE)
  await expect(page).toHaveURL(/\/sign-in/)
})

test('a session revoked in the database is refused on the next request', async ({
  page,
  state,
  db,
  signIn,
}) => {
  const operator = admin(state, 'owner')
  await signIn(operator)
  await page.goto(DASH_ROUTE)
  await expect(page).toHaveURL(`${state.baseUrl}${DASH_ROUTE}`)

  const revoked = await db.query(
    `update public.admin_sessions
        set revoked_at = now(), revoked_reason = 'uçtan uca test'
      where admin_user_id = $1 and revoked_at is null`,
    [operator.adminUserId],
  )
  expect(revoked.rowCount).toBeGreaterThan(0)

  // The cookie is still in the browser and still valid-looking. It buys nothing.
  await page.goto(DASH_ROUTE)
  await expect(page).toHaveURL(/\/sign-in/)
})
