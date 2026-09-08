import { AlertTriangle, Inbox } from 'lucide-react'
import type { ReactNode } from 'react'
import { messages } from '@/lib/messages'
import { cn } from './utils.ts'

/**
 * The three states a panel has when it is not showing data, defined once.
 *
 * Every page in this console renders loading, empty, error and success. Before
 * this file each area invented its own, which is how "no rows" and "the query
 * failed" ended up looking identical on two different screens — the single most
 * expensive kind of inconsistency in an operations tool, because it makes an
 * outage look like good news.
 *
 * The rules these encode:
 *   - an error says what failed, what to do about it, and offers the retry;
 *   - an error never quotes the thrown message, because a PostgREST error can
 *     name the row it failed on and this tool's promise is that such a string
 *     never reaches a screen;
 *   - an empty state distinguishes "nothing matched your filters" from
 *     "nothing exists", because the remedy differs;
 *   - a loading state is announced (`role="status"`) rather than only drawn.
 */

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('bo-skeleton block h-3', className)} />
}

export interface ErrorStateProps {
  /** A message from `messages.errors`, never a raw exception string. */
  message: string
  /** What the operator should do next. */
  hint?: string
  /** The retry — a form posting to a Server Action, or a link. */
  action?: ReactNode
  className?: string
}

export function ErrorState({ message, hint, action, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center gap-1.5 px-4 py-10 text-center', className)}
    >
      <span className="mb-1 flex size-8 items-center justify-center rounded-full bg-critical-soft text-critical-text">
        <AlertTriangle aria-hidden="true" className="size-4" />
      </span>
      <p className="text-[13px] font-semibold text-critical-text">{messages.states.errorTitle}</p>
      <p className="max-w-sm text-[12px] text-muted">{message}</p>
      {hint ? <p className="max-w-sm text-[11px] text-faint">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export interface EmptyStateProps {
  /** What is not here. Defaults to the generic "no records". */
  message?: string
  /** Why it might not be here, or what to try. */
  hint?: string
  /** Usually "clear the filters". */
  action?: ReactNode
  /** True when filters are active: changes the wording and the suggestion. */
  filtered?: boolean
  className?: string
}

export function EmptyState({
  message,
  hint,
  action,
  filtered = false,
  className,
}: EmptyStateProps) {
  const text = message ?? (filtered ? messages.states.emptyFiltered : messages.states.empty)
  const detail = hint ?? (filtered ? messages.states.emptyFilteredHint : undefined)
  return (
    <div className={cn('flex flex-col items-center gap-1.5 px-4 py-10 text-center', className)}>
      <span className="mb-1 flex size-8 items-center justify-center rounded-full bg-surface2 text-faint">
        <Inbox aria-hidden="true" className="size-4" />
      </span>
      <p className="max-w-sm text-[13px] text-muted">{text}</p>
      {detail ? <p className="max-w-sm text-[11px] text-faint">{detail}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

/**
 * The loading state, announced.
 *
 * `role="status"` on a visually hidden line is what tells a screen reader that
 * something is happening; the bars are for everybody else. `lines` should match
 * the shape of what is arriving so the panel does not jump when it lands.
 */
export function LoadingState({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2 px-4 py-6', className)}>
      <span role="status" className="sr-only">
        {messages.states.loading}
      </span>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={index === 0 ? 'w-2/5' : 'w-full'} />
      ))}
    </div>
  )
}
