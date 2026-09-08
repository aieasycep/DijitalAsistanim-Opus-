import type { ReactNode } from 'react'

/**
 * The top of every page: what you are looking at, what the numbers mean, and
 * the controls that change them.
 *
 * `description` is not optional in spirit. In a tool built on aggregates, a
 * heading without a sentence explaining the aggregate is a heading an operator
 * will misread.
 */

export interface PageHeaderProps {
  title: string
  description?: string
  /** Breadcrumb-ish context above the title, e.g. a user id on a detail page. */
  kicker?: ReactNode
  /** Right-hand slot: filters, a refresh form, an export button. */
  action?: ReactNode
  /** Rendered under the header, full width — usually a Filters bar. */
  children?: ReactNode
}

export function PageHeader({ title, description, kicker, action, children }: PageHeaderProps) {
  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {kicker ? <div className="bo-kicker mb-1">{kicker}</div> : null}
          <h1 className="text-[20px] leading-6 font-semibold tracking-[-0.01em] text-ink">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-[13px] text-muted">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </div>
  )
}
