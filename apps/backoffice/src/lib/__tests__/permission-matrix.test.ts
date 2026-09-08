import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ADMIN_AUDIT_ACTIONS,
  ADMIN_PERMISSIONS,
  ADMIN_ROLES,
  ADMIN_STATUSES,
  AUDIT_ACTIONS_WITHOUT_REASON,
  ROLE_DISPLAY_RANK,
  ROLE_PERMISSIONS,
  type AdminRole,
} from '../permissions.ts'
import { SUPPORT_ACCESS_SCOPES, SUPPORT_ACCESS_STATUSES } from '../redact.ts'

/**
 * Parity between the TypeScript mirror and the database.
 *
 * `public.admin_role_permissions` is the authority: `admin_permissions_for()`
 * reads it, and that is what actually decides whether a request succeeds. The
 * table in `permissions.ts` exists so the console can render without a query
 * and so a reviewer can read the model in one screen — which is only safe while
 * the two agree exactly.
 *
 * This test reads `supabase/migrations/0019_admin_platform.sql` and compares
 * them row for row, member for member, in order. Adding a permission to a role
 * in SQL without adding it here fails the build, and so does the reverse. The
 * same is done for the enums, the display ranks and the sensitive-action list.
 */

const MIGRATION = fileURLToPath(
  new URL('../../../../../supabase/migrations/0019_admin_platform.sql', import.meta.url),
)

const sql = readFileSync(MIGRATION, 'utf8')

/** The members of a Postgres enum, in declaration order. */
function enumMembers(typeName: string): string[] {
  const opening = `create type ${typeName} as enum (`
  const start = sql.indexOf(opening)
  expect(start, `${typeName} is declared in 0019`).toBeGreaterThan(-1)
  const end = sql.indexOf(');', start)
  const body = sql.slice(start + opening.length, end)
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1] ?? '')
}

/**
 * One statement, from a marker to `endMarker` (or to the first `;` after it).
 *
 * The explicit end marker is not decoration: a Turkish description in the roles
 * seed contains a semicolon, so cutting at the first one would silently read
 * two rows out of seven and pass.
 */
function statementFrom(marker: string, endMarker?: string): string {
  const start = sql.indexOf(marker)
  expect(start, `"${marker}" appears in 0019`).toBeGreaterThan(-1)
  const end = endMarker === undefined ? sql.indexOf(';', start) : sql.indexOf(endMarker, start)
  expect(end, `the end of "${marker}" is found`).toBeGreaterThan(start)
  return sql.slice(start, end)
}

describe('enums', () => {
  it('admin_role matches ADMIN_ROLES, in order', () => {
    expect(enumMembers('admin_role')).toEqual([...ADMIN_ROLES])
  })

  it('admin_status matches ADMIN_STATUSES, in order', () => {
    expect(enumMembers('admin_status')).toEqual([...ADMIN_STATUSES])
  })

  it('admin_permission matches ADMIN_PERMISSIONS, in order', () => {
    expect(enumMembers('admin_permission')).toEqual([...ADMIN_PERMISSIONS])
  })

  it('support_access_scope matches SUPPORT_ACCESS_SCOPES, in order', () => {
    expect(enumMembers('support_access_scope')).toEqual([...SUPPORT_ACCESS_SCOPES])
  })

  it('support_access_status matches SUPPORT_ACCESS_STATUSES, in order', () => {
    expect(enumMembers('support_access_status')).toEqual([...SUPPORT_ACCESS_STATUSES])
  })
})

describe('admin_roles seed', () => {
  const seed = statementFrom(
    'insert into public.admin_roles (role, rank, label_tr',
    'on conflict (role) do update',
  )

  it('seeds all seven roles with the ranks the console renders', () => {
    const rows = [...seed.matchAll(/\('([a-z_]+)',\s*(\d+),/g)].map((match) => ({
      role: match[1] ?? '',
      rank: Number(match[2]),
    }))
    expect(rows).toHaveLength(ADMIN_ROLES.length)
    for (const row of rows) {
      expect(ADMIN_ROLES).toContain(row.role)
      expect(ROLE_DISPLAY_RANK[row.role as AdminRole]).toBe(row.rank)
    }
  })
})

describe('admin_role_permissions', () => {
  /**
   * super_admin is populated in SQL from `enum_range(null::admin_permission)`
   * rather than listed, and `ROLE_PERMISSIONS.super_admin` is spread from
   * `ADMIN_PERMISSIONS` for the same reason: a permission added later belongs
   * to super_admin in both places without an edit.
   */
  it('populates super_admin from the enum itself, in both places', () => {
    expect(sql).toContain('from unnest(enum_range(null::admin_permission)) as p')
    expect([...ROLE_PERMISSIONS.super_admin].sort()).toEqual([...ADMIN_PERMISSIONS].sort())
  })

  const matrix = statementFrom(
    'insert into public.admin_role_permissions (role, permission) values',
    '-- ==========',
  )

  const fromSql = new Map<string, Set<string>>()
  for (const match of matrix.matchAll(/\('([a-z_]+)',\s*'([a-z][a-z0-9_.]*)'\)/g)) {
    const role = match[1] ?? ''
    const permission = match[2] ?? ''
    const bucket = fromSql.get(role) ?? new Set<string>()
    bucket.add(permission)
    fromSql.set(role, bucket)
  }

  it('names only known roles and known permissions', () => {
    for (const [role, permissions] of fromSql) {
      expect(ADMIN_ROLES, `${role} is a known role`).toContain(role)
      for (const permission of permissions) {
        expect(ADMIN_PERMISSIONS, `${permission} is a known permission`).toContain(permission)
      }
    }
  })

  it('grants nothing twice', () => {
    const pairs = [...matrix.matchAll(/\('([a-z_]+)',\s*'([a-z][a-z0-9_.]*)'\)/g)].map(
      (match) => `${match[1]}:${match[2]}`,
    )
    expect(new Set(pairs).size).toBe(pairs.length)
  })

  for (const role of ADMIN_ROLES) {
    if (role === 'super_admin') continue
    it(`${role} holds the same permissions in SQL and in TypeScript`, () => {
      const sqlSet = [...(fromSql.get(role) ?? new Set<string>())].sort()
      const tsSet = [...ROLE_PERMISSIONS[role]].sort()
      expect(sqlSet).toEqual(tsSet)
    })
  }

  it('matches the counts the schema documents', () => {
    const expectedCounts: Readonly<Record<AdminRole, number>> = {
      super_admin: 36,
      operations: 24,
      support: 14,
      finance: 9,
      ai_ops: 11,
      analyst: 9,
      readonly: 5,
    }
    for (const role of ADMIN_ROLES) {
      expect(ROLE_PERMISSIONS[role]).toHaveLength(expectedCounts[role])
      if (role === 'super_admin') continue
      expect(fromSql.get(role)?.size ?? 0).toBe(expectedCounts[role])
    }
  })
})

describe('admin_sensitive_actions', () => {
  const seed = statementFrom(
    'insert into public.admin_sensitive_actions (action, description_tr, requires_reason) values',
    'on conflict (action) do update',
  )
  const rows = [...seed.matchAll(/\('([a-z][a-z0-9_.]*)',\s*'[^']*',\s*(true|false)\)/g)].map(
    (match) => ({ action: match[1] ?? '', requiresReason: match[2] === 'true' }),
  )

  it('seeds the same actions the console can write', () => {
    expect(rows.map((row) => row.action)).toEqual([...ADMIN_AUDIT_ACTIONS])
  })

  it('agrees on which actions need no written reason', () => {
    const withoutReason = rows.filter((row) => !row.requiresReason).map((row) => row.action)
    expect(withoutReason.sort()).toEqual([...AUDIT_ACTIONS_WITHOUT_REASON].sort())
  })

  it('requires a reason for every destructive action', () => {
    for (const row of rows) {
      if (AUDIT_ACTIONS_WITHOUT_REASON.has(row.action)) continue
      expect(row.requiresReason, `${row.action} must carry a reason`).toBe(true)
    }
  })
})

describe('the guarantees the console relies on', () => {
  it('keeps the four-eyes rule as a database constraint', () => {
    expect(sql).toContain('support_access_grants_four_eyes')
    expect(sql).toContain('check (approved_by is null or approved_by <> admin_user_id)')
  })

  it('keeps the twenty-four hour ceiling as a database constraint', () => {
    expect(sql).toContain('support_access_grants_window_is_short')
    expect(sql).toContain("expires_at <= requested_at + interval '24 hours'")
  })

  it('keeps the twenty-character reason floor as a database constraint', () => {
    expect(sql).toContain('support_access_grants_reason_is_written')
    expect(sql).toContain('length(btrim(reason)) >= 20')
  })

  it('keeps the rate-limit subject hashed by constraint', () => {
    expect(sql).toContain(
      "admin_rate_limits_subject_is_hash check (subject_key ~ '^[a-f0-9]{64}$')",
    )
  })

  it('stores only a hash of every session and invite token', () => {
    expect(sql).toContain(
      'admin_sessions_token_hash_is_sha256 check (octet_length(token_hash) = 32)',
    )
    expect(sql).toContain(
      'admin_invites_token_hash_is_sha256 check (octet_length(token_hash) = 32)',
    )
  })
})

/**
 * Any second copy of the vocabulary in the console must agree with this one.
 *
 * The data-access layer declares its own `ADMIN_ROLES` / `ADMIN_PERMISSIONS` /
 * `SUPPORT_ACCESS_SCOPES` so its row types can name them without importing the
 * authorization layer. Two copies of a closed vocabulary is a drift waiting to
 * happen, and the drift would be invisible: both files would compile, and the
 * console would authorise against one list while the database read used the
 * other.
 *
 * `db.ts` is read as text rather than imported, because it is `server-only` and
 * constructs a Supabase client. A copy that is absent is not a failure — that is
 * what the two files being consolidated looks like — but a copy that disagrees
 * is.
 */
describe('no second copy of the vocabulary disagrees', () => {
  const dbSource = readFileSync(fileURLToPath(new URL('../db.ts', import.meta.url)), 'utf8')

  function literalList(source: string, constName: string): string[] | null {
    const match = new RegExp(`export const ${constName} = \\[([\\s\\S]*?)\\] as const`, 'm').exec(
      source,
    )
    if (match === null) return null
    return [...(match[1] ?? '').matchAll(/'([^']+)'/g)].map((entry) => entry[1] ?? '')
  }

  const copies: readonly [string, readonly string[]][] = [
    ['ADMIN_ROLES', ADMIN_ROLES],
    ['ADMIN_STATUSES', ADMIN_STATUSES],
    ['ADMIN_PERMISSIONS', ADMIN_PERMISSIONS],
    ['ADMIN_AUDIT_ACTIONS', ADMIN_AUDIT_ACTIONS],
    ['SUPPORT_ACCESS_SCOPES', SUPPORT_ACCESS_SCOPES],
    ['SUPPORT_ACCESS_STATUSES', SUPPORT_ACCESS_STATUSES],
  ]

  for (const [name, canonical] of copies) {
    it(`db.ts's ${name}, if it has one, matches`, () => {
      const copy = literalList(dbSource, name)
      if (copy === null) return
      expect(copy).toEqual([...canonical])
    })
  }
})
