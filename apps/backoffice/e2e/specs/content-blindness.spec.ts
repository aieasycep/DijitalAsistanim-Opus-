import type { Response } from '@playwright/test'
import { admin, expect, test } from '../support/console.ts'
import { dashboardRoutes } from '../support/routes.ts'

/**
 * The most important spec in this suite.
 *
 * The product's public promise is that nobody at the company reads a user's
 * mail, and the console is where that promise would break first. Migration 0017
 * makes it true in the database by projecting `bo_*` views with no content
 * column at all; `db.ts` makes it true in the application by refusing to name
 * any other relation. This is the third check, and the only one that looks at
 * what actually arrives in a browser.
 *
 * The method is deliberately blunt. One seeded user's own words — a mail
 * subject, a mail body, a calendar title, an assistant message, a capture, a
 * notification, an approval, even their display name — all carry a string
 * generated for this run and existing nowhere else. Then every route the
 * console has is opened as the most privileged role there is, and the string
 * must appear in nothing: not the rendered DOM, not the server's HTML, not any
 * response the page fetched along the way.
 *
 * The crawl reads its route list from `src/app` rather than from a list here, so
 * a screen added later is covered by this spec before anyone remembers it
 * exists.
 */

/**
 * What the console says when a read did not come back.
 *
 * Checked against the *visible* text rather than the markup: these strings are
 * also props on client components and so appear in the serialised payload of a
 * perfectly healthy page. Seeing one on screen means a panel failed, and a
 * failed panel is a page with no data — which would satisfy every "the sentinel
 * is absent" assertion below for entirely the wrong reason.
 */
const FAILURE_TEXT = [
  'Beklenmeyen bir hata oluştu',
  'Veri getirilemedi',
  'Sorgu tamamlanamadı.',
  'Bu veriye erişim yetkin yok.',
] as const

/** `bo_redact_email()`: first character, three bullets, and the domain. */
function redacted(email: string): string {
  const [local, domain] = email.split('@')
  return `${(local ?? '').slice(0, 1)}•••@${domain ?? ''}`
}

test('the sentinel really is in the database, in the columns a user fills', async ({
  state,
  db,
}) => {
  // A negative assertion is only worth what the positive one behind it is worth.
  // If the seed silently stopped writing the sentinel, every "it does not appear"
  // below would pass for the wrong reason.
  const rows = await db.query<{ relation: string; hits: string }>(
    `select 'email_messages' as relation, count(*)::text as hits
       from public.email_messages
      where user_id = $1 and (subject like $2 or body_text like $2 or snippet like $2)
     union all
     select 'email_threads', count(*)::text
       from public.email_threads where user_id = $1 and (subject like $2 or summary like $2)
     union all
     select 'profiles', count(*)::text
       from public.profiles where id = $1 and (display_name like $2 or given_name like $2)
     union all
     select 'calendar_events', count(*)::text
       from public.calendar_events where user_id = $1 and (title like $2 or description like $2)
     union all
     select 'assistant_messages', count(*)::text
       from public.assistant_messages where user_id = $1 and content like $2
     union all
     select 'captures', count(*)::text
       from public.captures where user_id = $1 and raw_text like $2
     union all
     select 'notification_deliveries', count(*)::text
       from public.notification_deliveries where user_id = $1 and (title like $2 or body like $2)
     union all
     select 'approval_actions', count(*)::text
       from public.approval_actions where user_id = $1 and (what like $2 or why like $2)`,
    [state.subjectUser.userId, `%${state.sentinel}%`],
  )

  for (const row of rows.rows) {
    expect(Number(row.hits), `${row.relation} should hold the sentinel`).toBeGreaterThan(0)
  }
})

test('no route a super_admin can open leaks the sentinel', async ({ page, state, signIn }) => {
  const routes = dashboardRoutes(state)
  // A crawl over an empty list would pass silently, which is the failure mode
  // this whole spec exists to avoid.
  expect(routes.length).toBeGreaterThan(20)

  const bodies: Promise<{ url: string; text: string }>[] = []
  const collect = (response: Response): void => {
    const type = response.headers()['content-type'] ?? ''
    if (!type.includes('text/') && !type.includes('json')) return
    bodies.push(
      response
        .text()
        .then((text) => ({ url: response.url(), text }))
        .catch(() => ({ url: response.url(), text: '' })),
    )
  }
  page.on('response', collect)

  await signIn(admin(state, 'owner'))

  for (const route of routes) {
    const response = await page.goto(route.href, { waitUntil: 'domcontentloaded' })
    const status = response?.status() ?? 0
    expect(status, `${route.pattern} answered ${status}`).toBeLessThan(400)

    // A page that failed to render would also contain no sentinel, so each one
    // has to prove it actually drew itself — a heading, and none of the three
    // sentences the console shows when a query did not come back.
    await expect(
      page.getByRole('heading', { level: 1 }),
      `${route.pattern} rendered no heading`,
    ).toBeVisible()

    const visible = await page.locator('body').innerText()
    for (const failure of FAILURE_TEXT) {
      expect(visible, `${route.pattern} rendered "${failure}"`).not.toContain(failure)
    }

    expect(await page.content(), `${route.pattern} rendered the sentinel`).not.toContain(
      state.sentinel,
    )
  }

  page.off('response', collect)
  const collected = await Promise.all(bodies)
  expect(collected.length).toBeGreaterThan(routes.length)
  for (const body of collected) {
    expect(body.text, `${body.url} carried the sentinel`).not.toContain(state.sentinel)
  }
})

test('the user record shows counts and a redacted address, and nothing else', async ({
  page,
  state,
  signIn,
}) => {
  await signIn(admin(state, 'owner'))
  await page.goto(`/users/${state.subjectUser.userId}`)

  const body = await page.content()

  // What an operator is entitled to: the account exists, on which domain, with
  // how much traffic behind it.
  expect(body).toContain(redacted(state.subjectUser.email))
  expect(body).toContain(state.subjectUser.emailDomain)

  // What they are not: the address in full, the person's name, or one word of
  // anything the account received.
  expect(body).not.toContain(state.subjectUser.email)
  expect(body).not.toContain(state.sentinel)
  expect(body).not.toContain('Teklif revizyonu')
})
