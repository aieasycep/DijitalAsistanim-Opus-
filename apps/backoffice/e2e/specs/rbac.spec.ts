import { NAV_ITEMS } from '../../src/lib/nav.ts'
import {
  DENIAL_MESSAGES_TR,
  isAdminPermission,
  satisfiesRequirement,
  type AdminPermission,
} from '../../src/lib/permissions.ts'
import { admin, expect, permissionsForRole, test } from '../support/console.ts'
import { guardFor } from '../support/guards.ts'
import { dashboardRoutes } from '../support/routes.ts'

/**
 * Authorization, checked against the database rather than against the console's
 * own copy of it.
 *
 * `permissions.ts` is explicit that `public.admin_role_permissions` is the
 * authority and that the TypeScript matrix beside it is a mirror kept for
 * rendering and for defence in depth. A spec that read the mirror would prove
 * the console agrees with itself; this one reads the table the migration writes
 * and asks the console to agree with *that*.
 *
 * Two claims, and the second is the one that matters. The rail not offering a
 * door is a courtesy. The page refusing when the address is typed by hand is the
 * control, and it is checked separately for exactly that reason — against the
 * guard each page actually calls, not against the permission the rail
 * advertises for it.
 */

const PERMISSION_DENIED = DENIAL_MESSAGES_TR.permission_denied

async function grantedPermissions(
  db: Parameters<typeof permissionsForRole>[0],
  role: string,
): Promise<ReadonlySet<AdminPermission>> {
  const raw = await permissionsForRole(db, role)
  const granted = new Set<AdminPermission>()
  for (const value of raw) if (isAdminPermission(value)) granted.add(value)
  // A role with no rows would make every "cannot see it" assertion below pass
  // for the wrong reason.
  expect(granted.size).toBeGreaterThan(0)
  return granted
}

for (const key of ['money', 'viewer'] as const) {
  test(`the ${key} operator's rail matches admin_role_permissions exactly`, async ({
    page,
    state,
    db,
    signIn,
  }) => {
    const operator = admin(state, key)
    const granted = await grantedPermissions(db, operator.role)

    await signIn(operator)
    const rail = page.getByRole('navigation', { name: 'Ana gezinme' })
    await expect(rail).toBeVisible()

    let offered = 0
    let withheld = 0
    for (const item of NAV_ITEMS) {
      const link = rail.locator(`a[href="${item.href}"]`)
      if (satisfiesRequirement(granted, item.requires)) {
        await expect(link, `${operator.role} should be offered ${item.href}`).toHaveCount(1)
        offered += 1
      } else {
        await expect(link, `${operator.role} should not be offered ${item.href}`).toHaveCount(0)
        withheld += 1
      }
    }

    // Both halves of the comparison have to be non-empty for it to have said
    // anything: a rail with everything on it and a rail with nothing on it would
    // each satisfy one side alone.
    expect(offered).toBeGreaterThan(0)
    expect(withheld).toBeGreaterThan(0)
  })
}

test('every page enforces its own guard, typed straight into the address bar', async ({
  page,
  state,
  db,
  signIn,
}) => {
  const operator = admin(state, 'money')
  const granted = await grantedPermissions(db, operator.role)
  const routes = dashboardRoutes(state)
  expect(routes.length).toBeGreaterThan(20)

  await signIn(operator)

  let opened = 0
  let refused = 0
  for (const route of routes) {
    const requirement = guardFor(route.file)
    const allowed = satisfiesRequirement(granted, requirement)

    await page.goto(route.href)

    if (allowed) {
      await expect(page, `${route.pattern} should have opened for ${operator.role}`).not.toHaveURL(
        /\/forbidden/,
      )
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      opened += 1
    } else {
      await expect(page, `${route.pattern} should have refused ${operator.role}`).toHaveURL(
        /\/forbidden(\?|$)/,
      )
      await expect(page.getByRole('heading', { level: 1, name: 'Yetkin yok' })).toBeVisible()
      // The denial names the reason in Turkish, and it is the same sentence the
      // decision function produces — not a generic apology.
      await expect(page.getByText(PERMISSION_DENIED, { exact: false })).toBeVisible()
      refused += 1
    }
  }

  expect(opened).toBeGreaterThan(0)
  expect(refused).toBeGreaterThan(0)
})

test('a permission removed from the database is refused on the next request', async ({
  page,
  state,
  db,
  signIn,
}) => {
  // The strongest available proof that the console is not carrying a compiled-in
  // matrix: take a row out of `admin_role_permissions` and the page shuts,
  // without a restart, a re-deploy or a new session.
  const operator = admin(state, 'viewer')
  await signIn(operator)
  await page.goto('/users')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page).not.toHaveURL(/\/forbidden/)

  await db.query(
    "delete from public.admin_role_permissions where role = $1 and permission = 'users.read'",
    [operator.role],
  )
  try {
    await page.goto('/users')
    await expect(page).toHaveURL(/\/forbidden(\?|$)/)
    await expect(page.getByText(PERMISSION_DENIED, { exact: false })).toBeVisible()
  } finally {
    await db.query(
      `insert into public.admin_role_permissions (role, permission)
       values ($1, 'users.read') on conflict do nothing`,
      [operator.role],
    )
  }

  await page.goto('/users')
  await expect(page).not.toHaveURL(/\/forbidden/)
})
