import Link from 'next/link'
import { MAX_APPROVAL_ATTEMPTS } from '@da/domain'
import { Badge, DataTable, Mono, Num, type Column } from '@/components/ui'
import { formatDateTime, formatNumber } from '@/lib/format'
import { messages } from '@/lib/messages'
import type { FailureBreakdown, FailureCodeStats } from '@/lib/queries/approvals'
import type { ApprovalWindowKey } from './contract'
import { approvalMessages, actionTypeLabels } from './messages'
import { CountBar } from './RateBar'
import { ReviewForm } from './ReviewForm'

/**
 * Why executions failed, by code and by how many attempts they burned.
 *
 * The code is the whole story this tool is allowed to tell. `bo_approvals`
 * projects both `failure_code` and `failure_reason` through `bo_error_code()`,
 * which passes only token-shaped labels and collapses anything sentence-shaped
 * to `unstructured` — precisely because a provider's error message can quote the
 * message that failed to send.
 *
 * Attempt count is the second axis and the one that says whether a code is
 * transient. Three failures at attempt 1 is a blip; three at attempt 3 is three
 * approvals that will never run and three users who were told so.
 */

export interface FailureCodeTableProps {
  breakdown: FailureBreakdown | null
  error: string | null
  window: ApprovalWindowKey
  /** Turns a code into a link to the filtered failure queue. */
  codeHref: (code: string) => string
  /** The triage Server Action, threaded down from the page. */
  triageAction: (formData: FormData) => void | Promise<void>
  returnTo: string
  resultSubject: string | null
}

export function FailureCodeTable({
  breakdown,
  error,
  window,
  codeHref,
  triageAction,
  returnTo,
  resultSubject,
}: FailureCodeTableProps) {
  const rows = breakdown?.rows ?? []
  const maxCount = rows.reduce((largest, row) => Math.max(largest, row.count), 0)

  const columns: readonly Column<FailureCodeStats>[] = [
    {
      key: 'code',
      header: approvalMessages.failures.columnCode,
      cell: (row) => (
        <Link
          href={codeHref(row.code)}
          className="font-mono text-[12px] text-primary-on-soft underline underline-offset-2 hover:text-primary"
        >
          {row.code}
        </Link>
      ),
    },
    {
      key: 'count',
      header: approvalMessages.failures.columnCount,
      align: 'right',
      cell: (row) => (
        <div className="min-w-16">
          <Num>{formatNumber(row.count)}</Num>
          <CountBar value={row.count} max={maxCount} tone="critical" />
        </div>
      ),
    },
    {
      key: 'exhausted',
      header: approvalMessages.failures.columnExhausted,
      title: approvalMessages.failures.exhaustedTitle(MAX_APPROVAL_ATTEMPTS),
      align: 'right',
      cell: (row) =>
        row.exhausted === 0 ? (
          <span className="text-faint">0</span>
        ) : (
          <Badge tone="critical">{formatNumber(row.exhausted)}</Badge>
        ),
    },
    {
      key: 'attempts',
      header: approvalMessages.failures.columnMaxAttempts,
      align: 'right',
      secondary: true,
      cell: (row) => (
        <Num>
          {approvalMessages.failureQueue.attemptsOf(row.maxAttempts, MAX_APPROVAL_ATTEMPTS)}
        </Num>
      ),
    },
    {
      key: 'type',
      header: approvalMessages.failures.columnTopType,
      secondary: true,
      cell: (row) =>
        row.topType === null ? null : (
          <div className="flex min-w-0 items-baseline gap-1">
            <span className="text-ink">{actionTypeLabels[row.topType] ?? row.topType}</span>
            {row.typeCount > 1 ? <Mono>{`+${formatNumber(row.typeCount - 1)}`}</Mono> : null}
          </div>
        ),
    },
    {
      key: 'lastSeen',
      header: approvalMessages.failures.columnLastSeen,
      secondary: true,
      cell: (row) => <span className="whitespace-nowrap">{formatDateTime(row.lastSeenAt)}</span>,
    },
    {
      key: 'triage',
      header: approvalMessages.failures.columnTriage,
      cell: (row) => (
        <ReviewForm
          action={triageAction}
          scope="code"
          subject={row.code}
          subjectLabel={row.code}
          window={window}
          measure={row.count}
          sample={row.exhausted}
          measureLabel={approvalMessages.failures.measureCaption(
            formatNumber(row.count),
            formatNumber(row.exhausted),
          )}
          returnTo={returnTo}
          reopen={resultSubject === row.code}
        />
      ),
    },
  ]

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.code}
        error={error}
        errorHint={messages.errors.queryFailedHint}
        emptyMessage={approvalMessages.failures.empty}
        caption={approvalMessages.failures.description}
      />
      {error === null && breakdown !== null && rows.length > 0 ? (
        <p className="px-3 pt-2 text-[11px] text-faint">
          {breakdown.truncated
            ? approvalMessages.failures.truncated(breakdown.sampled, breakdown.total)
            : approvalMessages.failures.complete}
        </p>
      ) : null}
    </>
  )
}
