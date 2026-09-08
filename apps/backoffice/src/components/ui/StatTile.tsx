import Link from 'next/link'
import type { ReactNode } from 'react'
import type { BadgeTone } from './Badge'

/**
 * One number, named. The unit of the overview.
 *
 * A tile with a `tone` other than `neutral` is saying "this number is not
 * where it should be" — the colour is a claim about health, so tiles that are
 * merely informational stay neutral. A tile with an `href` is a promise that
 * the linked page explains the number; a tile without one is a dead end by
 * design, not by omission.
 */

export interface StatTileProps {
  label: string
  value: string
  /** Secondary line: a comparison, a timestamp, a share. */
  hint?: string
  tone?: BadgeTone
  /** Where to go to act on this number. */
  href?: string
  icon?: ReactNode
}

const VALUE_TONE: Readonly<Record<BadgeTone, string>> = {
  neutral: 'text-ink',
  success: 'text-success-text',
  warning: 'text-warning-text',
  critical: 'text-critical-text',
  info: 'text-info-text',
  primary: 'text-primary-on-soft',
}

export function StatTile({ label, value, hint, tone = 'neutral', href, icon }: StatTileProps) {
  const body = (
    <>
      <span className="bo-kicker flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span
        className={[
          'mt-1 block text-[24px] leading-7 font-semibold tabular-nums',
          VALUE_TONE[tone],
        ].join(' ')}
      >
        {value}
      </span>
      {hint ? <span className="mt-0.5 block text-[12px] text-faint">{hint}</span> : null}
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className="bo-panel block px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-surface2/50"
      >
        {body}
      </Link>
    )
  }

  return <div className="bo-panel px-3 py-2.5">{body}</div>
}

/** A responsive row of tiles. Four across on a wide screen, two on a tablet. */
export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{children}</div>
}

/** The loading counterpart, so the overview never flashes an empty grid. */
export function StatTileSkeleton() {
  return (
    <div className="bo-panel px-3 py-2.5" aria-hidden="true">
      <span className="bo-skeleton block h-2.5 w-24" />
      <span className="bo-skeleton mt-2 block h-6 w-16" />
      <span className="bo-skeleton mt-1.5 block h-2.5 w-20" />
    </div>
  )
}
