import type { ReactNode } from 'react'

/**
 * The panel every section sits in. A card is a container, not a decoration:
 * it always has a heading an operator can scan, and it can hold its own error
 * state so one failed query does not take the whole page down.
 */

export interface CardProps {
  title?: ReactNode
  /** One line under the title. Says what the numbers mean. */
  description?: ReactNode
  /** Top-right slot: a filter, a link, a count. */
  action?: ReactNode
  children: ReactNode
  /** Removes the inner padding, for a card whose body is a DataTable. */
  flush?: boolean
  className?: string
}

export function Card({ title, description, action, children, flush, className }: CardProps) {
  return (
    <section className={['bo-panel', className ?? ''].filter(Boolean).join(' ')}>
      {title || action ? (
        <header className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
            {description ? <p className="mt-0.5 text-[12px] text-muted">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className={flush ? '' : 'p-4'}>{children}</div>
    </section>
  )
}

/**
 * The card-level error state. Used when a section's query failed but the rest
 * of the page succeeded — the panel says what happened rather than going blank.
 */
export function CardError({
  message,
  hint,
  action,
}: {
  message: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div role="alert" className="flex flex-col items-start gap-1 rounded-md bg-critical-soft p-3">
      <p className="text-[13px] font-semibold text-critical-text">{message}</p>
      {hint ? <p className="text-[12px] text-critical-text/80">{hint}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}

/** The card-level empty state. */
export function CardEmpty({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <p className="text-muted">{message}</p>
      {action ? <div>{action}</div> : null}
    </div>
  )
}

/** The card-level loading state, matching DataTable's skeleton weight. */
export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          className="bo-skeleton block h-3"
          style={{ width: `${100 - index * 12}%` }}
        />
      ))}
    </div>
  )
}
