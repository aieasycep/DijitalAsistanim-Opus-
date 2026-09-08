import type { Clock } from '@da/domain'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { DataTable, Mono, Num, type Column, type TableLocation } from '@/components/ui'
import type { BoPromptVersionRow } from '@/lib/db'
import { formatCostMicros, formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { messages } from '@/lib/messages'
import { promptMessages } from '@/lib/messages/prompts'
import {
  LIST_PARAMS,
  PROMPTS_PATH,
  PROMPTS_PAGE_SIZE,
  promptPath,
  versionLabel,
  type PromptSort,
} from './contract'
import { adminLabel, shortFingerprint, type NamedAdmin } from './presentation'
import { StatusBadge } from './StatusBadge'

/**
 * Every prompt version, one bounded page at a time.
 *
 * ---------------------------------------------------------------------------
 * WHAT EACH COLUMN IS FOR
 * ---------------------------------------------------------------------------
 *
 * The left half identifies the version — feature, number, status, model — and
 * the right half is the evidence: how long the body is, the md5 fingerprint that
 * says whether two versions are the same text, and the calls and cost
 * `ai_usage_events.prompt_version_id` attributes to it over thirty days.
 *
 * The fingerprint earns its place because it answers a question nothing else on
 * the screen can: two versions with the same fingerprint are the same prompt,
 * which is how a rollback is recognised as a rollback rather than as a fourth
 * new version.
 *
 * ---------------------------------------------------------------------------
 * SORTING AND PAGING ARE THE SERVER'S
 * ---------------------------------------------------------------------------
 *
 * `DataTable` runs TanStack in `manual*` mode: the header links rewrite `?sort=`
 * and the footer rewrites `?page=`, and `listPromptVersions` re-queries. The
 * browser is never handed the version table to slice, and the total in the
 * footer is `count=exact` from Postgres rather than `rows.length`.
 */

export function PromptTable({
  rows,
  total,
  page,
  sort,
  admins,
  location,
  clock,
  error,
  emptyMessage,
  emptyAction,
  filtered,
  hiddenColumns,
}: {
  rows: readonly BoPromptVersionRow[]
  total: number
  page: number
  sort: PromptSort
  admins: ReadonlyMap<string, NamedAdmin>
  location: TableLocation
  clock: Clock
  /** A message from `messages.errors`, never a raw exception string. */
  error: string | null
  emptyMessage: string
  emptyAction?: ReactNode
  filtered: boolean
  hiddenColumns: readonly string[] | null
}) {
  const columns: readonly Column<BoPromptVersionRow>[] = [
    {
      key: 'feature',
      header: promptMessages.table.feature,
      sortKey: 'feature',
      hideable: false,
      width: 'w-64',
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
      key: 'version',
      header: promptMessages.table.version,
      sortKey: 'version',
      hideable: false,
      align: 'right',
      width: 'w-20',
      cell: (row) => (
        <Link
          href={promptPath(row.prompt_version_id)}
          className="font-medium text-primary hover:underline"
        >
          <Num>{versionLabel(row.version)}</Num>
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
      sortKey: 'body_length',
      align: 'right',
      secondary: true,
      cell: (row) => <Num>{formatNumber(row.body_length)}</Num>,
    },
    {
      key: 'body_fingerprint',
      header: promptMessages.table.fingerprint,
      title: promptMessages.table.fingerprintTitle,
      secondary: true,
      defaultHidden: true,
      cell: (row) => <Mono>{shortFingerprint(row.body_fingerprint)}</Mono>,
    },
    {
      key: 'event_count_30d',
      header: promptMessages.table.calls,
      sortKey: 'event_count_30d',
      align: 'right',
      cell: (row) => <Num>{formatNumber(row.event_count_30d)}</Num>,
    },
    {
      key: 'cost_micros_30d',
      header: promptMessages.table.cost,
      sortKey: 'cost_micros_30d',
      align: 'right',
      cell: (row) => <Num>{formatCostMicros(row.cost_micros_30d)}</Num>,
    },
    {
      key: 'last_used_at',
      header: promptMessages.table.lastUsed,
      secondary: true,
      cell: (row) =>
        row.last_used_at === null ? null : (
          <span title={formatDateTime(row.last_used_at)}>
            {formatRelative(row.last_used_at, clock)}
          </span>
        ),
    },
    {
      key: 'created_by',
      header: promptMessages.table.createdBy,
      secondary: true,
      defaultHidden: true,
      cell: (row) =>
        adminLabel(
          row.created_by_admin_user_id === null
            ? undefined
            : admins.get(row.created_by_admin_user_id),
        ),
    },
    {
      key: 'activated_by',
      header: promptMessages.table.activatedBy,
      secondary: true,
      defaultHidden: true,
      cell: (row) =>
        row.activated_by_admin_user_id === null
          ? null
          : adminLabel(admins.get(row.activated_by_admin_user_id)),
    },
    {
      key: 'activated_at',
      header: promptMessages.table.activatedAt,
      sortKey: 'activated_at',
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
      key: 'created_at',
      header: promptMessages.table.createdAt,
      sortKey: 'created_at',
      secondary: true,
      cell: (row) => (
        <span title={formatDateTime(row.created_at)}>{formatRelative(row.created_at, clock)}</span>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.prompt_version_id}
      caption={promptMessages.table.caption}
      error={error}
      errorHint={messages.errors.queryFailedHint}
      emptyMessage={emptyMessage}
      emptyAction={emptyAction}
      filtered={filtered}
      location={location}
      sorting={{ current: { key: sort.key, direction: sort.direction } }}
      pagination={{ page, pageSize: PROMPTS_PAGE_SIZE, total }}
      columnVisibility={{ hidden: hiddenColumns }}
    />
  )
}
