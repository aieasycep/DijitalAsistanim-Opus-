import type { Page } from '@playwright/test'
import { admin, expect, test } from '../support/console.ts'

/**
 * An accessibility smoke over the console's list screens.
 *
 * Two properties, both of which fail silently for sighted mouse users and fail
 * loudly for everybody else.
 *
 *   1. Every interactive control has an accessible name. An icon-only button
 *      with no label is a button a screen reader announces as "button", and the
 *      rail is full of icon-only controls when it is collapsed.
 *
 *   2. Nothing that looks pressable is inert. `check-no-dead-code.mjs` catches
 *      the static spellings of that — `href="#"`, an empty handler — but not a
 *      control that is wired up and still does nothing at runtime. This suite
 *      already found one: the sign-out item in the admin menu submitted a form
 *      that Radix had just unmounted, so the button did nothing at all.
 */

/** The screens an operator spends the day on. */
const LIST_PAGES = ['/users', '/support', '/flags', '/system/admins'] as const

/**
 * Roles that a person is meant to operate. A `heading` or an `alert` with no
 * name is a different (and much smaller) problem; these are the ones where a
 * missing name means a control cannot be used at all.
 */
const INTERACTIVE_ROLES = [
  'button',
  'link',
  'checkbox',
  'radio',
  'switch',
  'textbox',
  'searchbox',
  'combobox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'slider',
  'spinbutton',
] as const

// The negative lookahead stops `tab` from matching the start of `table`.
const ROLE_LINE = new RegExp(`^\\s*-\\s+(${INTERACTIVE_ROLES.join('|')})(?![a-z])(.*)$`)

async function settle(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.waitForLoadState('networkidle')
}

test('every interactive control on the list screens announces itself', async ({
  page,
  state,
  signIn,
}) => {
  await signIn(admin(state, 'owner'))

  for (const route of LIST_PAGES) {
    await page.goto(route)
    await settle(page)

    const snapshot = await page.locator('body').ariaSnapshot()
    const unnamed: string[] = []
    let interactive = 0

    for (const line of snapshot.split('\n')) {
      const match = ROLE_LINE.exec(line)
      if (match === null) continue
      interactive += 1
      // The ARIA snapshot writes a control's accessible name as a quoted string
      // straight after its role; a control with no name has nothing there.
      const rest = match[2] ?? ''
      if (!rest.trimStart().startsWith('"')) unnamed.push(line.trim())
    }

    expect(interactive, `${route} rendered no interactive controls`).toBeGreaterThan(5)
    expect(unnamed, `${route} has controls with no accessible name`).toEqual([])
  }
})

test('no link on the list screens goes nowhere', async ({ page, state, signIn }) => {
  await signIn(admin(state, 'owner'))
  const checked = new Set<string>()

  for (const route of LIST_PAGES) {
    await page.goto(route)
    await settle(page)

    const hrefs = await page
      .locator('a[href]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') ?? ''))
    expect(hrefs.length).toBeGreaterThan(5)

    for (const href of hrefs) {
      // An in-page anchor with a real target is a skip link and is fine; `#`
      // alone, an empty href or a `javascript:` URL is a control that pretends.
      expect(href, `${route} has a link that goes nowhere`).not.toBe('')
      expect(href, `${route} has a link that goes nowhere`).not.toBe('#')
      expect(href.startsWith('javascript:'), `${route} has a javascript: link`).toBe(false)
      if (href.startsWith('#')) continue

      if (checked.has(href)) continue
      checked.add(href)
      const response = await page.request.get(`${state.baseUrl}${href}`)
      expect(response.status(), `${href} answered ${response.status()}`).toBeLessThan(400)
      // A link the operator may not open is a link that should not have been
      // drawn for them; the rail is filtered by permission for exactly that
      // reason, and this is the runtime check on it.
      expect(response.url(), `${href} bounced to ${response.url()}`).not.toContain('/forbidden')
    }
  }

  expect(checked.size).toBeGreaterThan(10)
})

test('every button on the list screens does something when it is pressed', async ({
  page,
  state,
  signIn,
}) => {
  await signIn(admin(state, 'owner'))

  for (const route of LIST_PAGES) {
    await page.goto(route)
    await settle(page)
    const total = await page.locator('button').count()
    expect(total).toBeGreaterThan(3)

    for (let index = 0; index < total; index += 1) {
      // Every button is pressed from a freshly loaded page, so one control's
      // effect cannot mask the next one's lack of an effect.
      await page.goto(route)
      await settle(page)
      const button = page.locator('button').nth(index)

      const before = await button.evaluate((node) => ({
        text: (node.textContent ?? '').trim().slice(0, 40),
        disabled: node.hasAttribute('disabled'),
        submit: node.getAttribute('type') === 'submit' && node.closest('form') !== null,
        pressed: node.getAttribute('aria-pressed'),
        expanded: node.getAttribute('aria-expanded'),
      }))

      // A disabled control announces its own inertness, and a submit button
      // inside a form is wired to that form's action by construction.
      if (before.disabled || before.submit) continue
      // A segmented option that is already selected has nothing left to do.
      if (before.pressed === 'true') continue

      const url = page.url()
      await button.click()
      await page.waitForTimeout(400)

      const overlay = await page.locator('[role="dialog"], [role="menu"]').count()
      const after = await button
        .evaluate((node) => ({
          pressed: node.getAttribute('aria-pressed'),
          expanded: node.getAttribute('aria-expanded'),
        }))
        .catch(() => ({ pressed: null, expanded: null }))

      const acted =
        page.url() !== url ||
        overlay > 0 ||
        after.pressed !== before.pressed ||
        after.expanded !== before.expanded

      expect(acted, `"${before.text}" on ${route} did nothing when pressed`).toBe(true)

      if (overlay > 0) await page.keyboard.press('Escape')
    }
  }
})
