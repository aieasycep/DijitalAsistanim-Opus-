import Link from 'next/link'
import type { ReactNode } from 'react'
import { systemClock, type Clock } from '@da/domain'
import { Badge, DataTable, Mono, type Column } from '@/components/ui'
import type { BoAuditRow } from '@/lib/db'
import { formatDateTime, formatRelative, shortId } from '@/lib/format'
import { actorBucketOf, userDetailHref } from './contract'
import { actorTone, outcomeBucketOf, outcomeTone, rowTone, truncate } from './format'
import { reviewHref, type ParamValues } from './href'
import { ACTOR_LABEL, OUTCOME_LABEL, actionLabel, auditMessages } from './messages'
import type { ReviewMark } from '@/lib/queries/audit'

/**
 * The trail itself.
 *
 * Nine columns, every one of them a fact about the shape of an event rather
 * than its content: when it happened, which token names it, who caused it,
 * which user it concerned, which record it touched, how it ended, and — for a
 * staff action only — the justification the operator typed before taking it.
 *
 * There is no subject, no recipient and no message. `bo_audit` has no column
 * that could carry one: `action`, `entity_type` and `entity_id` are filtered by
 * `bo_identifier()`, which drops any value containing whitespace or an `@`, and
 * the metadata document is never projected at all.
 *
 * Identifiers are shortened to eight characters and linked rather than printed
 * in full. An operator who needs the whole id follows the link; a screen full
 * of uuids is a screen nobody reads.
 */

export interface AuditTableProps {
  rows: readonly BoAuditRow[]
  /** Which rows already carry a review note, keyed by `audit_id`. */
  marks: ReadonlyMap<string, ReviewMark>
  /** Current query parameters, so a row action can link back to this exact view. */
  params: ParamValues
  /** The entry whose review panel is open, if any. */
  openReviewId: string | null
  error?: string | null
  errorHint?: string
  errorAction?: ReactNode
  emptyAction?: ReactNode
  total?: number
  clock?: Clock
}

const REASON_PREVIEW_LENGTH = 64

export function AuditTable({
  rows,
  marks,
  params,
  openReviewId,
  error = null,
  errorHint,
  errorAction,
  emptyAction,
  total,
  clock = systemClock,
}: AuditTableProps) {
  const columns: readonly Column<BoAuditRow>[] = [
    {
      key: 'time',
      header: auditMessages.columns.time,
      width: 'w-40',
      cell: (row) => (
        <div className="leading-tight">
          <div className="text-[12px] whitespace-nowrap text-ink">
            {formatDateTime(row.created_at)}
          </div>
          <div className="text-[11px] whitespace-nowrap text-faint">
            {formatRelative(row.created_at, clock)}
          </div>
        </div>
      ),
    },
    {
      key: 'action',
      header: auditMessages.columns.action,
      cell: (row) => (
        <div className="leading-tight">
          <div className="text-[12px] font-medium text-ink">{actionLabel(row.action)}</div>
          <Mono>{row.action ?? '—'}</Mono>
        </div>
      ),
    },
    {
      key: 'actor',
      header: auditMessages.columns.actor,
      width: 'w-32',
      cell: (row) => {
        const bucket = actorBucketOf(row.actor)
        return (
          <div className="flex flex-col items-start gap-0.5">
            <Badge tone={actorTone(bucket)}>{ACTOR_LABEL[bucket]}</Badge>
            {row.staff_user_id !== null ? <Mono>{shortId(row.staff_user_id)}</Mono> : null}
          </div>
        )
      },
    },
    {
      key: 'subject',
      header: auditMessages.columns.subject,
      width: 'w-28',
      secondary: true,
      cell: (row) =>
        row.subject_user_id === null ? null : (
          <Link
            href={userDetailHref(row.subject_user_id)}
            className="font-mono text-[12px] text-primary-on-soft underline-offset-2 hover:underline"
          >
            {shortId(row.subject_user_id)}
          </Link>
        ),
    },
    {
      key: 'entity',
      header: auditMessages.columns.entity,
      secondary: true,
      cell: (row) =>
        row.entity_type === null && row.entity_id === null ? null : (
          <div className="leading-tight">
            <div className="text-[12px] text-muted">{row.entity_type ?? '—'}</div>
            {row.entity_id !== null ? <Mono>{truncate(row.entity_id, 24)}</Mono> : null}
          </div>
        ),
    },
    {
      key: 'outcome',
      header: auditMessages.columns.outcome,
      width: 'w-28',
      cell: (row) => {
        const bucket = outcomeBucketOf(row.outcome)
        return (
          <div className="flex flex-col items-start gap-0.5">
            <Badge tone={outcomeTone(bucket)}>{OUTCOME_LABEL[bucket]}</Badge>
            {row.outcome !== null && row.outcome !== 'success' ? <Mono>{row.outcome}</Mono> : null}
          </div>
        )
      },
    },
    {
      key: 'reason',
      header: auditMessages.columns.reason,
      secondary: true,
      cell: (row) =>
        row.staff_reason === null ? null : (
          <span className="text-[12px] text-muted" title={row.staff_reason}>
            {truncate(row.staff_reason, REASON_PREVIEW_LENGTH)}
          </span>
        ),
    },
    {
      key: 'review',
      header: auditMessages.columns.review,
      align: 'right',
      width: 'w-32',
      cell: (row) => {
        const mark = marks.get(row.audit_id)
        const open = openReviewId === row.audit_id
        return (
          <div className="flex items-center justify-end gap-1.5">
            {mark ? (
              <Badge tone="info" title={formatDateTime(mark.lastAt)}>
                {auditMessages.review.markedBy(mark.count)}
              </Badge>
            ) : null}
            <Link
              href={reviewHref(params, open ? null : row.audit_id)}
              aria-current={open ? 'true' : undefined}
              className={[
                'rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors',
                open
                  ? 'border-primary/50 bg-primary-soft text-primary-on-soft'
                  : 'border-hairline text-muted hover:border-primary/40 hover:text-ink',
              ].join(' ')}
            >
              {open ? auditMessages.review.close : auditMessages.review.open}
            </Link>
          </div>
        )
      },
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.audit_id}
      error={error}
      errorHint={errorHint}
      errorAction={errorAction}
      emptyMessage={auditMessages.log.empty}
      emptyAction={emptyAction}
      total={total}
      rowTone={(row) => rowTone(row.outcome, row.action)}
      caption={auditMessages.log.tableCaption}
    />
  )
}
