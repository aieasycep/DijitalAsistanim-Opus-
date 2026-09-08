import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { messages } from '@/lib/messages'
import { cn } from './utils.ts'

/**
 * The top of every page: where you are, what you are looking at, what the
 * numbers mean, and the controls that change them.
 *
 * `description` is optional in the type and mandatory in spirit. This console
 * shows almost nothing but aggregates, and an aggregate without a sentence
 * saying what it counts is an aggregate somebody will misread — "743" is not an
 * answer until the page says 743 what, over what window, counted where.
 *
 * The `<h1>` is here and nowhere else. One page, one first-level heading, so a
 * screen reader's heading list is the page's outline rather than a pile of
 * equally important titles.
 */

export interface Breadcrumb {
  label: string
  /** Omit on the last crumb — it is the page you are on. */
  href?: string
}

export interface PageHeaderProps {
  title: string
  /** What the page counts and over what window. */
  description?: string
  /** Small line above the title — a user id on a detail page. */
  kicker?: ReactNode
  /** Trail above the kicker. The last entry should have no `href`. */
  breadcrumbs?: readonly Breadcrumb[]
  /** Right-hand slot: a refresh form, an export button, a primary action. */
  action?: ReactNode
  /** Under the description: a timestamp, a row count, a freshness note. */
  meta?: ReactNode
  /** Tabs for the page's sub-views, rendered under the heading block. */
  tabs?: ReactNode
  /** Full width under everything — usually a filter bar or a range picker. */
  children?: ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  kicker,
  breadcrumbs,
  action,
  meta,
  tabs,
  children,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('mb-4 flex flex-col gap-3', className)}>
      {breadcrumbs !== undefined && breadcrumbs.length > 0 ? (
        <nav aria-label={messages.pageHeader.breadcrumbLabel}>
          <ol className="flex flex-wrap items-center gap-1 text-[11px] text-faint">
            {breadcrumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {index > 0 ? (
                  <ChevronRight aria-hidden="true" className="size-3 opacity-60" />
                ) : null}
                {crumb.href === undefined ? (
                  <span aria-current="page" className="text-muted">
                    {crumb.label}
                  </span>
                ) : (
                  <Link href={crumb.href} className="hover:text-ink hover:underline">
                    {crumb.label}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {kicker ? <div className="bo-kicker mb-1">{kicker}</div> : null}
          <h1 className="text-[20px] leading-6 font-semibold tracking-[-0.01em] text-ink">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-[13px] text-muted">{description}</p>
          ) : null}
          {meta ? <div className="mt-1 text-[11px] text-faint">{meta}</div> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      {tabs ? <div className="border-b border-hairline">{tabs}</div> : null}
      {children}
    </div>
  )
}
