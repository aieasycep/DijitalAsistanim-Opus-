import { Badge, type Column, DataTable, Num, countTone } from '@/components/ui'
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { enumLabels, labelFor, messages } from '@/lib/messages'
import type { ProviderHealth } from '@/lib/queries/ops'
import { opsMessages } from './messages'

/**
 * Connection and sync health, one row per provider that has an account.
 *
 * Every cell is a separate exact `count(*)` from `bo_accounts` or
 * `bo_sync_health`, except `disconnected`, which is the remainder — a connected
 * account has exactly one status, so the five columns are a partition and the
 * subtraction is arithmetic, not an estimate.
 *
 * The last two columns are the staleness question: which resource on this
 * provider ran longest ago, and how far back the least-advanced backfill cursor
 * still points. Both come from an `ORDER BY … LIMIT 1` in Postgres, so a
 * provider with a hundred thousand sync states costs one row.
 */

const columns: readonly Column<ProviderHealth>[] = [
  {
    key: 'provider',
    header: opsMessages.providers.provider,
    cell: (row) => (
      <span className="font-medium text-ink">{labelFor(enumLabels.provider, row.provider)}</span>
    ),
  },
  {
    key: 'accounts',
    header: opsMessages.providers.accountTotal,
    align: 'right',
    cell: (row) => <Num>{formatNumber(row.accountTotal)}</Num>,
  },
  {
    key: 'connected',
    header: opsMessages.providers.connected,
    align: 'right',
    cell: (row) => (
      <span className={row.connected > 0 ? 'text-success-text' : 'text-faint'}>
        <Num>{formatNumber(row.connected)}</Num>
      </span>
    ),
  },
  {
    key: 'expired',
    header: opsMessages.providers.expired,
    align: 'right',
    cell: (row) => (
      <span className={row.expired > 0 ? 'text-warning-text' : 'text-faint'}>
        <Num>{formatNumber(row.expired)}</Num>
      </span>
    ),
  },
  {
    key: 'revoked',
    header: opsMessages.providers.revoked,
    align: 'right',
    cell: (row) => (
      <span className={row.revoked > 0 ? 'text-critical-text' : 'text-faint'}>
        <Num>{formatNumber(row.revoked)}</Num>
      </span>
    ),
  },
  {
    key: 'errored',
    header: opsMessages.providers.errored,
    align: 'right',
    cell: (row) => (
      <span className={row.errored > 0 ? 'text-critical-text' : 'text-faint'}>
        <Num>{formatNumber(row.errored)}</Num>
      </span>
    ),
  },
  {
    key: 'disconnected',
    header: opsMessages.providers.disconnected,
    align: 'right',
    secondary: true,
    cell: (row) => (
      <span className="text-faint">
        <Num>{formatNumber(row.disconnected)}</Num>
      </span>
    ),
  },
  {
    key: 'syncErrored',
    header: opsMessages.providers.syncErrored,
    align: 'right',
    cell: (row) => <Badge tone={countTone(row.syncErrored)}>{formatNumber(row.syncErrored)}</Badge>,
  },
  {
    key: 'syncStalled',
    header: opsMessages.providers.syncStalled,
    align: 'right',
    secondary: true,
    cell: (row) => (
      <Badge tone={row.syncStalled > 0 ? 'warning' : 'neutral'}>
        {formatNumber(row.syncStalled)}
      </Badge>
    ),
  },
  {
    key: 'backfilling',
    header: opsMessages.providers.backfilling,
    align: 'right',
    secondary: true,
    cell: (row) => (
      <span className={row.backfilling > 0 ? 'text-info-text' : 'text-faint'}>
        <Num>{formatNumber(row.backfilling)}</Num>
      </span>
    ),
  },
  {
    key: 'oldestRun',
    header: opsMessages.providers.oldestRun,
    title: opsMessages.providers.oldestRunTitle,
    align: 'right',
    cell: (row) => {
      if (row.oldestRunAt === null) {
        return <span className="text-faint">{opsMessages.providers.oldestRunNever}</span>
      }
      return (
        <div className="flex flex-col items-end leading-tight">
          <span title={formatDateTime(row.oldestRunAt)}>{formatRelative(row.oldestRunAt)}</span>
          {row.oldestRunResource ? (
            <span className="text-[11px] text-faint">
              {labelFor(enumLabels.accountKind, row.oldestRunResource)}
            </span>
          ) : null}
        </div>
      )
    },
  },
  {
    key: 'oldestCursor',
    header: opsMessages.providers.oldestCursor,
    title: opsMessages.providers.oldestCursorTitle,
    align: 'right',
    secondary: true,
    cell: (row) => {
      if (row.backfilling === 0) {
        return <span className="text-faint">{opsMessages.providers.oldestCursorNone}</span>
      }
      if (row.oldestBackfillCursor === null) {
        return <span className="text-faint">{messages.fields.unknown}</span>
      }
      return (
        <div className="flex flex-col items-end leading-tight">
          <span title={formatDateTime(row.oldestBackfillCursor)}>
            {formatRelative(row.oldestBackfillCursor)}
          </span>
          {row.oldestBackfillResource ? (
            <span className="text-[11px] text-faint">
              {labelFor(enumLabels.accountKind, row.oldestBackfillResource)}
            </span>
          ) : null}
        </div>
      )
    },
  },
]

export function ProviderHealthTable({
  rows,
  error,
}: {
  rows: readonly ProviderHealth[]
  error: string | null
}) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.provider}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={opsMessages.providers.empty}
      rowTone={(row) => (row.errored > 0 || row.syncErrored > 0 ? 'critical' : 'default')}
      caption={opsMessages.providers.section}
    />
  )
}
