import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { APP_DIR } from '../harness/paths.ts'
import type { StackState } from '../harness/state.ts'

/**
 * Every route the console has, read from the console's own file tree.
 *
 * The alternative is a hand-written list, and a hand-written list is exactly how
 * a page added next month escapes the content-blindness crawl — the promise it
 * would break is the product's, and the spec that should have caught it would
 * still be green. So the routes come from the same `page.tsx` files Next itself
 * routes on, and a new screen joins the crawl the moment it exists.
 */

export interface ConsoleRoute {
  /** The route as Next declares it, e.g. `/users/[userId]`. */
  readonly pattern: string
  /** The same route with the run's seeded identifiers substituted in. */
  readonly href: string
  /** True when the pattern carried a dynamic segment. */
  readonly dynamic: boolean
  /** The `page.tsx` behind it, so a spec can read the guard it enforces. */
  readonly file: string
}

function pageFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry)
    if (statSync(full).isDirectory()) {
      pageFiles(full, found)
      continue
    }
    if (entry === 'page.tsx') found.push(full)
  }
  return found
}

function patternFor(file: string): string {
  const segments = path
    .relative(APP_DIR, path.dirname(file))
    .split(path.sep)
    .filter((segment) => segment !== '' && segment !== '.')
    // `(dash)` and friends are organisational and do not appear in a URL.
    .filter((segment) => !/^\(.*\)$/.test(segment))
  return `/${segments.join('/')}`
}

/**
 * The seeded row each dynamic segment should resolve to.
 *
 * Keyed by the parameter name the route file uses, so a renamed segment fails
 * loudly here rather than crawling `/users/undefined`.
 */
function substitutions(state: StackState): Readonly<Record<string, string>> {
  return {
    userId: state.subjectUser.userId,
    ticketId: state.entities.ticketId,
    grantId: state.entities.pendingGrantId,
    flagId: state.entities.flagId,
    adminUserId: state.admins.helpdesk.adminUserId,
    promptId: state.entities.promptId,
    announcementId: state.entities.announcementId,
  }
}

export function consoleRoutes(state: StackState): readonly ConsoleRoute[] {
  const map = substitutions(state)
  const routes: ConsoleRoute[] = []

  for (const file of pageFiles(APP_DIR)) {
    const pattern = patternFor(file)
    let dynamic = false
    const href = pattern.replace(/\[([^\]]+)\]/g, (_match, name: string) => {
      dynamic = true
      const value = map[name]
      if (value === undefined) {
        throw new Error(
          `route ${pattern} has a [${name}] segment with no seeded value; ` +
            'add one to e2e/support/routes.ts so the crawl reaches the page',
        )
      }
      return value
    })
    routes.push({ pattern, href, dynamic, file })
  }

  return routes.sort((a, b) => a.pattern.localeCompare(b.pattern))
}

/** The signed-in console, which is what a privileged operator actually walks. */
export function dashboardRoutes(state: StackState): readonly ConsoleRoute[] {
  const excluded = new Set(['/sign-in', '/forbidden'])
  return consoleRoutes(state).filter((route) => !excluded.has(route.pattern))
}
