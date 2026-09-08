import Link from 'next/link'
import { type Column, DataTable, Num } from '@/components/ui'
import { formatNumber } from '@/lib/format'
import { messages } from '@/lib/messages'
import {
  MISSING_CODE,
  UNSTRUCTURED_CODE,
  type ErrorCodeBreakdown,
  type ErrorCodeRow,
} from '@/lib/queries/ops'
import { opsMessages } from './messages'

/**
 * Which failures, by code, across the four surfaces that record one.
 *
 * The code column is the whole point of the panel and the reason it is safe:
 * `bo_error_code()` in migration 0017 admits only a token — ASCII, no
 * whitespace, 63 characters — and rewrites everything else to `unstructured`.
 * So a provider that answers a failed fetch with the offending subject line
 * arrives here as the literal word "unstructured" and nothing more. That row is
 * itself a signal: it means an upstream error path is throwing prose instead of
 * an `ErrorCode`, and someone should go and fix the throw.
 *
 * Sync rows link into the queue filtered by that code, so a spike is one click
 * from the accounts causing it.
 */

export interface ErrorCodeTableProps {
  breakdown: ErrorCodeBreakdown | null
  error: string | null
  /** Queue link for a sync error code. */
  codeHref: (code: string) => string
}

function codeLabel(code: string): string {
  if (code === UNSTRUCTURED_CODE) return opsMessages.errorCodes.unstructured
  if (code === MISSING_CODE) return opsMessages.queue.codeUnknown
  return code
}

export function ErrorCodeTable({ breakdown, error, codeHref }: ErrorCodeTableProps) {
  const columns: readonly Column<ErrorCodeRow>[] = [
    {
      key: 'source',
      header: opsMessages.errorCodes.source,
      cell: (row) => (
        <span className="text-muted">
          {opsMessages.errorCodes.sources[row.source] ?? row.source}
        </span>
      ),
    },
    {
      key: 'code',
      header: opsMessages.errorCodes.code,
      cell: (row) => {
        const label = codeLabel(row.code)
        const linkable = row.source === 'sync' && row.code !== MISSING_CODE
        if (!linkable) {
          return <span className="font-mono text-[12px] text-ink">{label}</span>
        }
        return (
          <Link
            href={codeHref(row.code)}
            title={opsMessages.errorCodes.inspect}
            className="font-mono text-[12px] text-ink underline decoration-hairline underline-offset-2 hover:decoration-primary"
          >
            {label}
          </Link>
        )
      },
    },
    {
      key: 'count24h',
      header: opsMessages.errorCodes.count24h,
      align: 'right',
      cell: (row) => (
        <span className={row.count24h > 0 ? 'text-critical-text' : 'text-faint'}>
          <Num>{formatNumber(row.count24h)}</Num>
        </span>
      ),
    },
    {
      key: 'count7d',
      header: opsMessages.errorCodes.count7d,
      align: 'right',
      cell: (row) => (
        <span className="text-muted">
          <Num>{formatNumber(row.count7d)}</Num>
        </span>
      ),
    },
  ]

  return (
    <>
      <DataTable
        columns={columns}
        rows={breakdown?.rows ?? []}
        rowKey={(row) => `${row.source}:${row.code}`}
        error={error}
        errorHint={messages.errors.queryFailedHint}
        emptyMessage={opsMessages.errorCodes.empty}
        rowTone={(row) => (row.count24h > 0 ? 'warning' : 'default')}
        caption={opsMessages.errorCodes.section}
      />
      {breakdown?.truncated ? (
        <p className="border-t border-hairline px-3 py-1.5 text-[11px] text-faint">
          {opsMessages.errorCodes.truncated(breakdown.sampled, breakdown.total)}
        </p>
      ) : null}
    </>
  )
}
