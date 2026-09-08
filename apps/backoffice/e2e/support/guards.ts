import { readFileSync } from 'node:fs'
import type { PermissionRequirement } from '../../src/lib/permissions.ts'
import { isAdminPermission } from '../../src/lib/permissions.ts'

/**
 * What each page actually asks for, read out of the page.
 *
 * `nav.ts` records the permission behind every sidebar entry and says it is kept
 * identical to the page's own guard. It is not, everywhere: several screens are
 * still on the migration bridge from the first pass and call
 * `requireStaff(tier)`, which resolves to a different permission from the one
 * the rail advertises. A spec that took the rail's word for it would then assert
 * a refusal that never comes and call the console broken.
 *
 * So the guard is taken from the source of the page being opened. The upside is
 * bigger than the workaround: this covers every screen in the console rather
 * than the nineteen with a rail entry, and a page that stops guarding itself
 * fails here rather than passing quietly.
 */

/**
 * The three legacy tiers, as `auth.ts`'s `LEGACY_TIER_PERMISSION` maps them.
 *
 * Mirrored rather than imported because the table is module-private there. It is
 * three rows and it is checked: `legacyTierPermissions()` below is asserted
 * against the console's real behaviour by the RBAC spec, so a change to the
 * bridge shows up as a failing test rather than as a stale copy.
 */
const LEGACY_TIER_PERMISSION: Readonly<Record<string, string>> = Object.freeze({
  support: 'users.read',
  ops: 'integration.resync',
  admin: 'admin.role.write',
})

const SINGLE = /requirePermission\(\s*'([a-z0-9.]+)'/
const ANY_OF = /requirePermission\(\s*\{\s*anyOf:\s*\[([^\]]*)\]/
const ALL_OF = /requirePermission\(\s*\{\s*allOf:\s*\[([^\]]*)\]/
const LEGACY = /requireStaff\(\s*(?:'(support|ops|admin)')?\s*\)/

function permissionList(raw: string): readonly string[] {
  return [...raw.matchAll(/'([a-z0-9.]+)'/g)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined)
}

function asRequirement(names: readonly string[], kind: 'anyOf' | 'allOf'): PermissionRequirement {
  const permissions = names.filter(isAdminPermission)
  if (permissions.length !== names.length) {
    throw new Error(`a page guard names something outside admin_permission: ${names.join(', ')}`)
  }
  return kind === 'anyOf' ? { anyOf: permissions } : { allOf: permissions }
}

/**
 * The requirement a `page.tsx` enforces, or an error naming the file.
 *
 * A page with no guard at all is a page anybody may open, and the console has no
 * such page by design — so it is a failure here rather than a silent skip.
 */
export function guardFor(file: string): PermissionRequirement {
  const source = readFileSync(file, 'utf8')

  const anyOf = ANY_OF.exec(source)
  if (anyOf?.[1] !== undefined) return asRequirement(permissionList(anyOf[1]), 'anyOf')

  const allOf = ALL_OF.exec(source)
  if (allOf?.[1] !== undefined) return asRequirement(permissionList(allOf[1]), 'allOf')

  const single = SINGLE.exec(source)
  if (single?.[1] !== undefined) {
    const permission = single[1]
    if (!isAdminPermission(permission)) {
      throw new Error(`${file} guards on "${permission}", which is not an admin_permission`)
    }
    return permission
  }

  const legacy = LEGACY.exec(source)
  if (legacy !== null) {
    // `requireStaff()` with no argument defaults to the support tier.
    const tier = legacy[1] ?? 'support'
    const permission = LEGACY_TIER_PERMISSION[tier]
    if (permission === undefined || !isAdminPermission(permission)) {
      throw new Error(`${file} uses the legacy tier "${tier}", which maps to nothing`)
    }
    return permission
  }

  throw new Error(
    `${file} calls neither requirePermission() nor requireStaff(); every console page must name ` +
      'the permission it needs, and a page with no guard is a page anybody may open',
  )
}
