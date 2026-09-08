import { DataTable, Num, type Column } from '@/components/ui'
import { formatNumber } from '@/lib/format'
import { grantMessages } from '@/lib/messages/grants'
import type { AdminGrantTally, GrantAdmin, PeriodBudget } from '@/lib/queries/grants'
import { adminLabel, shareOf } from './presentation'

/**
 * Who handed out how much, over the chosen window.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS TABLE EXISTS
 * ---------------------------------------------------------------------------
 *
 * Every row in the list below has a name attached to it, and until they are
 * added up that name is decoration. Two grants a month from one person is a
 * support engineer doing their job; forty is a policy nobody wrote down. The
 * only way anybody notices the difference is a table like this one, which is
 * why the specification calls a goodwill budget nobody can see a goodwill
 * budget nobody controls.
 *
 * ---------------------------------------------------------------------------
 * IT SAYS HOW IT WAS COUNTED
 * ---------------------------------------------------------------------------
 *
 * PostgREST exposes no `GROUP BY` through this console's foundation, so the
 * split is tallied from a bounded page of the window's grants while the total
 * beside it is a real `count(*)`. When the page was the whole window — the
 * usual case, because grants are rare — the numbers are exact and the footnote
 * says so. When it was not, the footnote says that too, and names the remedy: a
 * narrower window. A number that quietly under-reports a budget is worse than
 * no number.
 */
export function AdminBudgetTable({
  budget,
  admins,
  error,
}: {
  budget: PeriodBudget | null
  /** `granted_by` resolved to a staff member, keyed by admin id. */
  admins: ReadonlyMap<string, GrantAdmin>
  error: string | null
}) {
  const rows = budget?.perAdmin ?? []
  const totalDays = budget?.issuedDays ?? 0

  const columns: readonly Column<AdminGrantTally>[] = [
    {
      key: 'admin',
      header: grantMessages.period.columnAdmin,
      hideable: false,
      cell: (row) => {
        const admin = admins.get(row.adminUserId)
        return (
          <span className="flex flex-col">
            <span className="text-[12px] text-ink">
              {adminLabel(admin, grantMessages.period.unknownAdmin)}
            </span>
            {admin === undefined ? null : (
              <span className="text-[11px] text-faint">{admin.roleLabel}</span>
            )}
          </span>
        )
      },
    },
    {
      key: 'count',
      header: grantMessages.period.columnCount,
      align: 'right',
      width: 'w-24',
      cell: (row) => <Num>{formatNumber(row.grantCount)}</Num>,
    },
    {
      key: 'days',
      header: grantMessages.period.columnDays,
      align: 'right',
      width: 'w-28',
      cell: (row) => (
        <Num>
          <span className="font-semibold text-ink">{formatNumber(row.totalDays)}</span>
        </Num>
      ),
    },
    {
      key: 'average',
      header: grantMessages.period.columnAverage,
      align: 'right',
      width: 'w-28',
      secondary: true,
      cell: (row) => (
        <Num>
          {grantMessages.period.averageUnit(
            Math.round(row.totalDays / Math.max(1, row.grantCount)),
          )}
        </Num>
      ),
    },
    {
      key: 'share',
      header: grantMessages.period.columnShare,
      align: 'right',
      width: 'w-24',
      cell: (row) => <Num>%{shareOf(row.totalDays, totalDays)}</Num>,
    },
  ]

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.adminUserId}
        caption={grantMessages.period.tableCaption}
        error={error}
        emptyMessage={grantMessages.period.empty}
        total={rows.length}
      />
      {error === null && budget !== null && rows.length > 0 ? (
        <p className="px-3 py-1.5 text-[11px] text-faint">
          {budget.exact
            ? grantMessages.period.exactNote
            : grantMessages.period.sampledNote(budget.sampleSize, budget.issuedCount)}
        </p>
      ) : null}
    </>
  )
}
