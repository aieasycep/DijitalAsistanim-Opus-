import type { Clock } from '@da/domain'
import Link from 'next/link'
import { Badge, DataTable, Mono, Num, type Column } from '@/components/ui'
import { formatCostMicros, formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { messages } from '@/lib/messages'
import { promptMessages } from '@/lib/messages/prompts'
import type { FeatureSummary } from '@/lib/queries/prompts'
import { LIST_PARAMS, PROMPTS_PATH, promptPath, versionLabel } from './contract'

/**
 * What is serving each feature right now.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS PANEL EXISTS SEPARATELY FROM THE VERSION LIST
 * ---------------------------------------------------------------------------
 *
 * The version list answers "what has been written". This answers the question an
 * operator actually arrives with: which instruction is in force, for which
 * feature, right now — one row per feature, guaranteed by
 * `prompt_versions_one_active_per_feature` rather than by anything this
 * component does.
 *
 * A feature with no active version is the row that matters. It means the
 * platform is running that feature without a versioned prompt: whatever the
 * service falls back to is not recorded here and cannot be diffed, so the row is
 * marked and says what to do about it.
 */
export function FeatureRosterTable({
  features,
  truncated,
  clock,
  error,
  limit,
}: {
  features: readonly FeatureSummary[]
  truncated: boolean
  clock: Clock
  /** A message from `messages.errors`, never a raw exception string. */
  error: string | null
  /** The read ceiling, for the sentence shown when it was reached. */
  limit: number
}) {
  const columns: readonly Column<FeatureSummary>[] = [
    {
      key: 'feature',
      header: promptMessages.roster.feature,
      hideable: false,
      cell: (row) => (
        <Link
          href={`${PROMPTS_PATH}?${LIST_PARAMS.feature}=${encodeURIComponent(row.feature)}`}
          className="font-mono text-[12px] text-ink hover:text-primary hover:underline"
        >
          {row.feature}
        </Link>
      ),
    },
    {
      key: 'active',
      header: promptMessages.roster.activeVersion,
      cell: (row) =>
        row.active === null ? (
          <Badge tone="warning" title={promptMessages.roster.noActiveHint}>
            {promptMessages.roster.noActive}
          </Badge>
        ) : (
          <Link
            href={promptPath(row.active.prompt_version_id)}
            className="font-medium text-primary hover:underline"
          >
            {versionLabel(row.active.version)}
          </Link>
        ),
    },
    {
      key: 'model',
      header: promptMessages.roster.model,
      secondary: true,
      cell: (row) => (row.active?.model == null ? null : <Mono>{row.active.model}</Mono>),
    },
    {
      key: 'drafts',
      header: promptMessages.roster.drafts,
      align: 'right',
      cell: (row) =>
        row.draftCount === 0 ? null : row.latestDraft === null ? (
          <Num>{formatNumber(row.draftCount)}</Num>
        ) : (
          <Link
            href={promptPath(row.latestDraft.prompt_version_id)}
            className="text-primary hover:underline"
          >
            <Num>{formatNumber(row.draftCount)}</Num>
          </Link>
        ),
    },
    {
      key: 'calls',
      header: promptMessages.roster.calls,
      align: 'right',
      cell: (row) =>
        row.active === null ? null : <Num>{formatNumber(row.active.event_count_30d)}</Num>,
    },
    {
      key: 'cost',
      header: promptMessages.roster.cost,
      align: 'right',
      cell: (row) =>
        row.active === null ? null : <Num>{formatCostMicros(row.active.cost_micros_30d)}</Num>,
    },
    {
      key: 'lastUsed',
      header: promptMessages.roster.lastUsed,
      secondary: true,
      cell: (row) =>
        row.active?.last_used_at == null ? null : (
          <span title={formatDateTime(row.active.last_used_at)}>
            {formatRelative(row.active.last_used_at, clock)}
          </span>
        ),
    },
  ]

  return (
    <div className="flex flex-col gap-2">
      <DataTable
        columns={columns}
        rows={features}
        rowKey={(row) => row.feature}
        caption={promptMessages.roster.section}
        error={error}
        errorHint={messages.errors.queryFailedHint}
        emptyMessage={promptMessages.roster.empty}
        total={features.length}
        rowTone={(row) => (row.active === null ? 'warning' : 'default')}
      />
      {truncated ? (
        <p
          role="status"
          className="rounded-md bg-warning-soft px-3 py-2 text-[11px] text-warning-text"
        >
          {promptMessages.roster.truncated(limit)}
        </p>
      ) : null}
    </div>
  )
}
