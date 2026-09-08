import { admin, expect, test } from '../support/console.ts'

/**
 * The suite auditing itself.
 *
 * Named to sort last, because the first test here is only meaningful once every
 * other spec has run: it asks the fixture Supabase whether it had to refuse
 * anything during the whole session. A shim that quietly answered an
 * untranslated filter with an empty array would make every "no user content
 * here" assertion pass for the wrong reason, so it refuses instead — and this is
 * where that refusal becomes a failing test rather than a line in a log.
 *
 * The rest of the file is the other half of the same worry. A console reading
 * from an empty database also shows nothing, and "shows nothing" satisfies every
 * negative assertion in this suite. So each screen is asked to prove it rendered
 * the row that was seeded for it.
 */

test('the fixture Supabase was never asked for something it could not translate', async ({
  state,
}) => {
  const response = await fetch(`${state.supabaseUrl}/__fixture/diagnostics`, {
    headers: { apikey: state.serviceRoleKey },
  })
  expect(response.status).toBe(200)

  const body = (await response.json()) as {
    unsupported: readonly { feature: string; detail: string; method: string; path: string }[]
  }
  // Each entry is a request the console made that this shim could not turn into
  // SQL faithfully. Any one of them means a spec was answered by a guess.
  expect(body.unsupported).toEqual([])
})

test('every list screen shows the row that was seeded for it', async ({ page, state, signIn }) => {
  await signIn(admin(state, 'owner'))

  const expectations: readonly { route: string; text: string }[] = [
    // `bo_redact_email()` output, which is the only form of an address the
    // console ever renders.
    { route: '/users', text: `z•••@${state.subjectUser.emailDomain}` },
    { route: '/users', text: `b•••@${state.otherUser.emailDomain}` },
    { route: '/support', text: state.entities.ticketReference },
    { route: '/flags', text: state.entities.flagKey },
    { route: '/ai/prompts', text: 'briefing.morning' },
    { route: '/announcements', text: 'Bakım penceresi' },
    { route: '/system/admins', text: state.admins.helpdesk.displayName },
    { route: '/billing/grants', text: 'Senkronizasyon kesintisi telafisi' },
    { route: '/support/access', text: 'Destek Erişimi' },
    // The latency the seed recorded, which only a real `system_health_checks`
    // row can produce — an unmeasured target renders "hiç ölçülmedi".
    { route: '/health', text: '42 ms' },
  ]

  for (const expectation of expectations) {
    await page.goto(expectation.route)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(
      page.getByText(expectation.text, { exact: false }).first(),
      `${expectation.route} did not show "${expectation.text}"`,
    ).toBeVisible()
  }
})

test('a count on screen is the count in the database', async ({ page, state, db, signIn }) => {
  // The strongest available check that the shim is not simply returning empty
  // pages: the console's own total and Postgres's own total, compared.
  const rows = await db.query<{ total: string }>(
    'select count(*)::text as total from public.bo_users',
  )
  const total = Number(rows.rows[0]?.total ?? '0')
  expect(total).toBeGreaterThan(1)

  await signIn(admin(state, 'owner'))
  await page.goto('/users')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  const visible = await page.locator('body').innerText()
  expect(visible, `the users list should account for all ${total} rows`).toContain(String(total))
})
