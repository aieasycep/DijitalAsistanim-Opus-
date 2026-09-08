#!/usr/bin/env node
/**
 * Verify that `docs/BACKOFFICE_RBAC.md` still describes the matrix the database
 * actually enforces.
 *
 * `public.admin_role_permissions` is the authority: `admin_has_permission()` and
 * `admin_permissions_for()` read it, and 0019 rewrites the table in full on
 * every migration run. A document that claims `support` cannot approve its own
 * Support Access request is only useful while that is true — and a matrix
 * document that has quietly gone stale is worse than none, because people plan
 * around it and reviewers cite it.
 *
 * So the matrix is not maintained by hand. This script re-derives it from
 * `supabase/migrations/0019_admin_platform.sql` — the enum members in
 * declaration order, and every `(role, permission)` pair the seed inserts — and
 * compares it cell by cell with the two tables the document marks with HTML
 * anchors. Any disagreement fails the build and names the cell.
 *
 * `apps/backoffice/src/lib/__tests__/permission-matrix.test.ts` does the same
 * job for the TypeScript mirror in `permissions.ts`. Between the two, the
 * migration, the console and this document cannot drift apart in any direction.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATION = path.join(root, 'supabase', 'migrations', '0019_admin_platform.sql')
const DOC = path.join(root, 'docs', 'BACKOFFICE_RBAC.md')

/** Granted, and not granted, as the document spells them. */
const YES = '✓'
const NO = '·'

const problems = []
const fail = (message) => problems.push(message)

// ===========================================================================
// The authority: the migration
// ===========================================================================

let sql
try {
  sql = readFileSync(MIGRATION, 'utf8')
} catch {
  console.error(`RBAC doc check failed: cannot read ${path.relative(root, MIGRATION)}`)
  process.exit(1)
}

/** The members of a Postgres enum, in declaration order. */
function enumMembers(typeName) {
  const opening = `create type ${typeName} as enum (`
  const start = sql.indexOf(opening)
  if (start === -1) {
    console.error(`RBAC doc check failed: 0019 no longer declares ${typeName}`)
    process.exit(1)
  }
  const end = sql.indexOf(');', start)
  const body = sql.slice(start + opening.length, end)
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1] ?? '')
}

const roles = enumMembers('admin_role')
const permissions = enumMembers('admin_permission')

/**
 * The seeded matrix.
 *
 * `super_admin` is populated in SQL from `enum_range(null::admin_permission)`
 * rather than listed, so it is reconstructed the same way here: a permission
 * added to the enum later belongs to super_admin without anybody editing a
 * list. The explicit pairs are read from the one `values` statement, which is
 * bounded by the section rule that follows it — the seed's Turkish text
 * contains semicolons, so cutting at the first `;` would read a fraction of the
 * matrix and pass.
 */
const MATRIX_MARKER = 'insert into public.admin_role_permissions (role, permission) values'
const matrixStart = sql.indexOf(MATRIX_MARKER)
const matrixEnd = sql.indexOf('-- ==========', matrixStart)
if (matrixStart === -1 || matrixEnd === -1) {
  console.error('RBAC doc check failed: the admin_role_permissions seed is not where expected')
  process.exit(1)
}
const matrixSql = sql.slice(matrixStart, matrixEnd)

if (!sql.includes('from unnest(enum_range(null::admin_permission)) as p')) {
  fail(
    'the migration no longer grants super_admin every permission from the enum; this script assumes it does',
  )
}

const granted = new Map(roles.map((role) => [role, new Set()]))
for (const permission of permissions) granted.get('super_admin')?.add(permission)

for (const match of matrixSql.matchAll(/\('([a-z_]+)',\s*'([a-z][a-z0-9_.]*)'\)/g)) {
  const role = match[1] ?? ''
  const permission = match[2] ?? ''
  const bucket = granted.get(role)
  if (bucket === undefined) {
    fail(`the migration grants to "${role}", which is not a member of admin_role`)
    continue
  }
  if (!permissions.includes(permission)) {
    fail(`the migration grants "${permission}", which is not a member of admin_permission`)
    continue
  }
  bucket.add(permission)
}

// ===========================================================================
// The document
// ===========================================================================

let doc
try {
  doc = readFileSync(DOC, 'utf8')
} catch {
  console.error(`RBAC doc check failed: cannot read ${path.relative(root, DOC)}`)
  process.exit(1)
}

/**
 * The lines of a markdown table between two HTML anchors.
 *
 * The anchors are what make this survive Prettier: it reflows a table's column
 * widths on every format run, so the block has to be found by something it does
 * not touch.
 */
function tableBetween(name) {
  const open = `<!-- ${name}:start -->`
  const close = `<!-- ${name}:end -->`
  const start = doc.indexOf(open)
  const end = doc.indexOf(close, start)
  if (start === -1 || end === -1) {
    fail(`docs/BACKOFFICE_RBAC.md has no "${name}" block (${open} … ${close})`)
    return null
  }
  const rows = doc
    .slice(start + open.length, end)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'))
    .map((line) =>
      line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim().replace(/^`|`$/g, '')),
    )
  // The header and the `---` separator beneath it.
  if (rows.length < 3) {
    fail(`the "${name}" block does not contain a markdown table`)
    return null
  }
  return { header: rows[0] ?? [], body: rows.slice(2) }
}

// ── The matrix ─────────────────────────────────────────────────────────────

const matrix = tableBetween('rbac-matrix')
if (matrix !== null) {
  const expectedHeader = ['Permission', ...roles]
  if (matrix.header.join('|') !== expectedHeader.join('|')) {
    fail(
      `the matrix header is "${matrix.header.join(' | ')}" but the admin_role enum declares "${expectedHeader.join(' | ')}"`,
    )
  } else {
    const documented = matrix.body.map((row) => row[0] ?? '')

    for (const permission of permissions) {
      if (!documented.includes(permission)) {
        fail(`the matrix has no row for "${permission}"`)
      }
    }
    for (const permission of documented) {
      if (!permissions.includes(permission)) {
        fail(`the matrix has a row for "${permission}", which is not a member of admin_permission`)
      }
    }

    if (
      documented.join('|') !== permissions.join('|') &&
      documented.length === permissions.length
    ) {
      fail('the matrix rows are not in the declaration order of the admin_permission enum')
    }

    for (const row of matrix.body) {
      const permission = row[0] ?? ''
      if (!permissions.includes(permission)) continue
      if (row.length !== roles.length + 1) {
        fail(`the row for "${permission}" has ${row.length - 1} cells, expected ${roles.length}`)
        continue
      }
      roles.forEach((role, index) => {
        const cell = row[index + 1] ?? ''
        if (cell !== YES && cell !== NO) {
          fail(`the cell for ${role} × ${permission} is "${cell}", expected "${YES}" or "${NO}"`)
          return
        }
        const held = granted.get(role)?.has(permission) === true
        if (held && cell === NO) {
          fail(`${role} holds ${permission} in 0019, but the matrix says it does not`)
        }
        if (!held && cell === YES) {
          fail(`the matrix says ${role} holds ${permission}, but 0019 does not grant it`)
        }
      })
    }
  }
}

// ── The per-role totals ────────────────────────────────────────────────────

const summary = tableBetween('rbac-role-totals')
if (summary !== null) {
  if ((summary.header[0] ?? '') !== 'Role' || (summary.header[1] ?? '') !== 'Permissions') {
    fail('the role-totals table must open with the columns "Role" and "Permissions"')
  } else {
    const documented = summary.body.map((row) => row[0] ?? '')
    if (documented.join('|') !== roles.join('|')) {
      fail(
        `the role-totals table lists "${documented.join(', ')}" but the admin_role enum declares "${roles.join(', ')}"`,
      )
    }
    for (const row of summary.body) {
      const role = row[0] ?? ''
      const expected = granted.get(role)?.size
      if (expected === undefined) continue
      const stated = Number.parseInt((row[1] ?? '').replace(/[^0-9]/g, ''), 10)
      if (stated !== expected) {
        fail(`the role-totals table says ${role} holds ${row[1]}, but 0019 grants it ${expected}`)
      }
    }
  }
}

// ── The permission count, stated in prose ──────────────────────────────────

const statedTotal = /the\s+(\d+)\s+members\s+of\s+`admin_permission`/i.exec(doc)
if (statedTotal === null) {
  fail(
    'the document must state the permission count as "the N members of `admin_permission`", so a widened enum is caught in the prose too',
  )
} else if (Number.parseInt(statedTotal[1] ?? '', 10) !== permissions.length) {
  fail(
    `the document says admin_permission has ${statedTotal[1]} members; 0019 declares ${permissions.length}`,
  )
}

// ===========================================================================
// The verdict
// ===========================================================================

if (problems.length > 0) {
  console.error(
    `RBAC doc check failed: docs/BACKOFFICE_RBAC.md has drifted from supabase/migrations/0019_admin_platform.sql (${problems.length} problem${problems.length === 1 ? '' : 's'}).\n`,
  )
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error(
    '\nThe migration is the authority. Correct the document, not the migration, unless the grant itself is wrong.',
  )
  process.exit(1)
}

const cells = roles.length * permissions.length
console.log(
  `RBAC doc check passed: ${cells} matrix cells across ${roles.length} roles and ${permissions.length} permissions match 0019_admin_platform.sql.`,
)
