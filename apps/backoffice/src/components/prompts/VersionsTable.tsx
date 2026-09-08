import type { Clock } from '@da/domain'
import Link from 'next/link'
import { DataTable, Mono, Num, type Column } from '@/components/ui'
import type { BoPromptVersionRow } from '@/lib/db'
import { formatCostMicros, formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { messages } from '@/lib/messages'
import { promptMessages } from '@/lib/messages/prompts'
import { promptPath, versionLabel } from './contract'
import { costPerCall, shortFingerprint } from './presentation'
import { StatusBadge } from './StatusBadge'

/**
 * Every version of one feature, with what each one cost per call.
 *
 * ---------------------------------------------------------------------------
 * THIS IS WHERE "THIS PROMPT MADE THINGS WORSE" BECOMES A NUMBER
 * ---------------------------------------------------------------------------
 *
 * Cost per call is the one quality-adjacent figure this schema can attribute to
 * a single prompt version: `bo_prompt_versions` derives the call count and the
 * cost of every `ai_usage_events` row carrying that `prompt_version_id`, and
 * dividing one by the other gives a figure that is comparable between two
 * versions of the same feature in a way a total never is.
 *
 * It is a derived value and the column header says so. It is also blind to
 * quality in the human sense — a cheaper prompt can be a worse one — which is
 * why it sits beside the diff rather than instead of it.
 *
 * The window is thirty days for every row, so a version activated last week and
 * one retired last month are not being compared over the same amount of
 * traffic. `lastUsed` is in the table for exactly that reason.
 */
export function VersionsTable({
  rows,
  currentPromptId,
  clock,
  error,
}: {
  rows: readonly BoPromptVersionRow[]
  /** The version whose page this is, marked rather than linked. */
  currentPromptId: string
  clock: Clock
  /** A message from `messages.errors`, never a raw exception string. */
  error: string | null
}) {
  const columns: readonly Column<BoPromptVersionRow>[] = [
    {
      key: 'version',
      header: promptMessages.table.version,
      hideable: false,
      width: 'w-28',
      cell: (row) =>
        row.prompt_version_id === currentPromptId ? (
          <span className="font-semibold text-ink">
            {versionLabel(row.version)}
            <span className="ml-1.5 text-[11px] font-normal text-faint">
              {promptMessages.detail.thisVersion}
            </span>
          </span>
        ) : (
          <Link
            href={promptPath(row.prompt_version_id)}
            className="font-medium text-primary hover:underline"
          >
            {versionLabel(row.version)}
          </Link>
        ),
    },
    {
      key: 'status',
      header: promptMessages.table.status,
      width: 'w-24',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'model',
      header: promptMessages.table.model,
      secondary: true,
      cell: (row) => (row.model === null ? null : <Mono>{row.model}</Mono>),
    },
    {
      key: 'body_length',
      header: promptMessages.table.length,
      title: promptMessages.table.lengthTitle,
      align: 'right',
      secondary: true,
      cell: (row) => <Num>{formatNumber(row.body_length)}</Num>,
    },
    {
      key: 'fingerprint',
      header: promptMessages.table.fingerprint,
      title: promptMessages.table.fingerprintTitle,
      secondary: true,
      cell: (row) => <Mono>{shortFingerprint(row.body_fingerprint)}</Mono>,
    },
    {
      key: 'calls',
      header: promptMessages.table.calls,
      align: 'right',
      cell: (row) => <Num>{formatNumber(row.event_count_30d)}</Num>,
    },
    {
      key: 'cost',
      header: promptMessages.table.cost,
      align: 'right',
      cell: (row) => <Num>{formatCostMicros(row.cost_micros_30d)}</Num>,
    },
    {
      key: 'perCall',
      header: promptMessages.usage.perCall,
      title: promptMessages.usage.perCallHint,
      align: 'right',
      cell: (row) => {
        const perCall = costPerCall(row.cost_micros_30d, row.event_count_30d)
        return perCall === null ? null : <Num>{formatCostMicros(perCall)}</Num>
      },
    },
    {
      key: 'activatedAt',
      header: promptMessages.table.activatedAt,
      secondary: true,
      cell: (row) =>
        row.activated_at === null ? (
          <span className="text-faint">{promptMessages.table.notActivated}</span>
        ) : (
          <span title={formatDateTime(row.activated_at)}>
            {formatRelative(row.activated_at, clock)}
          </span>
        ),
    },
    {
      key: 'lastUsed',
      header: promptMessages.table.lastUsed,
      secondary: true,
      cell: (row) =>
        row.last_used_at === null ? null : (
          <span title={formatDateTime(row.last_used_at)}>
            {formatRelative(row.last_used_at, clock)}
          </span>
        ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.prompt_version_id}
      caption={promptMessages.detail.versionsSection}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={promptMessages.roster.empty}
      total={rows.length}
    />
  )
}
