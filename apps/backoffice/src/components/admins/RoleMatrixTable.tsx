import { Fragment } from 'react'
import { Badge } from '@/components/ui'
import { adminMessages } from '@/lib/messages/admins'
import { PERMISSION_LABELS_TR, type AdminPermission } from '@/lib/permissions'
import type { RoleMatrix } from '@/lib/queries/admins'
import { MATRIX_CELL_CLASS, MATRIX_GLYPH, matrixCell, type MatrixCell } from './presentation'

/**
 * The role → permission matrix, as the database holds it.
 *
 * ---------------------------------------------------------------------------
 * EVERY TICK IS A ROW SOMEBODY QUERIED
 * ---------------------------------------------------------------------------
 *
 * A cell is `granted` only when `bo_admin_permissions` returned that permission
 * for that role. The permission *names* down the left come from
 * `ADMIN_PERMISSIONS` — the labels have to be keyed by something, and that
 * array mirrors the `admin_permission` enum's declaration order — but no cell
 * is filled in from it. A role the view could not answer for renders `?`, not
 * an inferred column.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE ARE TWO KINDS OF WARNING
 * ---------------------------------------------------------------------------
 *
 * `decideAccess()` grants the *intersection* of what the database returned and
 * what `ROLE_PERMISSIONS` — the reviewed mirror in `@/lib/permissions` —
 * accepts. So a permission present on only one side is not an effective
 * permission, and the two cases mean opposite things: a row only in the
 * database is somebody having written to `admin_role_permissions` outside a
 * reviewed migration; a row only in the mirror is a migration that has not
 * landed on this deployment. Both are shown as `!` and counted, because a
 * matrix screen that quietly reconciled them would be the one place in the
 * console where a disagreement about authorization is invisible.
 */

const CELL_TITLE: Readonly<Record<MatrixCell, string>> = {
  granted: adminMessages.roles.legendGranted,
  database_only: adminMessages.roles.legendDbOnly,
  console_only: adminMessages.roles.legendMirrorOnly,
  none: adminMessages.roles.legendNone,
  unknown: adminMessages.roles.legendUnknown,
}

export function RoleMatrixTable({
  matrix,
  groups,
}: {
  matrix: RoleMatrix
  groups: readonly { namespace: string; permissions: readonly AdminPermission[] }[]
}) {
  return (
    <div className="bo-panel overflow-hidden">
      <div className="bo-scroll overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{adminMessages.roles.matrixSection}</caption>
          <thead className="bg-surface2/80">
            <tr className="border-b border-hairline">
              <th scope="col" className="bo-kicker px-3 py-2 font-semibold">
                {adminMessages.roles.permissionColumn}
              </th>
              {matrix.entries.map((entry) => (
                <th
                  key={entry.role.role}
                  scope="col"
                  className="bo-kicker px-2 py-2 text-center font-semibold whitespace-nowrap"
                  title={entry.role.descriptionTr}
                >
                  <span className="block text-ink">{entry.role.labelTr}</span>
                  <span className="mt-0.5 block text-[10px] font-normal text-faint">
                    {adminMessages.roles.holders(entry.holders, entry.activeHolders)}
                  </span>
                  {entry.observable ? null : (
                    <span className="mt-0.5 block text-[10px] font-normal text-warning-text">
                      {MATRIX_GLYPH.unknown}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {groups.map((group) => (
              <Fragment key={group.namespace}>
                <tr className="border-b border-hairline/70">
                  <th
                    scope="colgroup"
                    colSpan={matrix.entries.length + 1}
                    className="bo-kicker bg-surface2/40 px-3 py-1 text-left font-semibold"
                  >
                    {group.namespace}
                  </th>
                </tr>

                {group.permissions.map((permission) => (
                  <tr
                    key={permission}
                    className="border-b border-hairline/70 last:border-b-0 hover:bg-surface2/50"
                  >
                    <th scope="row" className="px-3 py-1.5 text-left font-normal">
                      <span className="block text-[12px] text-ink">
                        {PERMISSION_LABELS_TR[permission]}
                      </span>
                      <code className="block font-mono text-[10px] text-faint">{permission}</code>
                    </th>

                    {matrix.entries.map((entry) => {
                      const cell = matrixCell(
                        entry.observable,
                        entry.database.has(permission),
                        entry.console.has(permission),
                      )
                      return (
                        <td
                          key={`${entry.role.role}-${permission}`}
                          className={`px-2 py-1.5 text-center text-[13px] ${MATRIX_CELL_CLASS[cell]}`}
                          title={CELL_TITLE[cell]}
                        >
                          <span aria-hidden="true">{MATRIX_GLYPH[cell]}</span>
                          <span className="sr-only">{CELL_TITLE[cell]}</span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline px-3 py-2 text-[11px] text-faint">
        <span className="bo-kicker">{adminMessages.roles.legendTitle}</span>
        <LegendItem cell="granted" />
        <LegendItem cell="database_only" />
        <LegendItem cell="none" />
        <LegendItem cell="unknown" />
      </div>
    </div>
  )
}

function LegendItem({ cell }: { cell: MatrixCell }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span aria-hidden="true" className={MATRIX_CELL_CLASS[cell]}>
        {MATRIX_GLYPH[cell]}
      </span>
      <span>{CELL_TITLE[cell]}</span>
    </span>
  )
}

/**
 * The roles whose permission list could not be read, and why.
 *
 * `bo_admin_permissions` joins `admin_users` to `admin_role_permissions` and
 * keeps only active accounts, so a role nobody active holds produces no rows.
 * The console does not fill that in from its TypeScript mirror — it reports the
 * gap, and where any admin row carries the role at all it can still say how
 * many permissions the database counts for it, because `permission_count` in
 * `bo_admin_users` is joined from the role rather than from the account.
 */
export function UnobservableRoles({
  matrix,
  reasonFor,
}: {
  matrix: RoleMatrix
  reasonFor: (entry: RoleMatrix['entries'][number]) => string
}) {
  const unobservable = matrix.entries.filter((entry) => !entry.observable)
  if (unobservable.length === 0) return null

  return (
    <div className="rounded-md bg-info-soft px-3 py-2.5">
      <p className="text-[13px] font-semibold text-info-text">
        {adminMessages.roles.unobservableTitle}
      </p>
      <p className="mt-0.5 max-w-prose text-[12px] text-info-text/90">
        {adminMessages.roles.unobservableBody}
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {unobservable.map((entry) => (
          <li key={entry.role.role} className="flex flex-wrap items-baseline gap-2 text-[12px]">
            <Badge tone="info">{entry.role.labelTr}</Badge>
            <span className="text-info-text/90">{reasonFor(entry)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
