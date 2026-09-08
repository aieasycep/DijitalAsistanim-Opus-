import type { ReactNode } from 'react'

/**
 * A state pill. Tone carries meaning, not decoration: `critical` means someone
 * has to do something, `warning` means watch it, `success` means healthy,
 * `neutral` means it is simply a fact.
 *
 * The `*ToneFor` helpers map database enum members to a tone once, here, so two
 * different pages cannot disagree about whether `grace_period` is a warning.
 */

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'critical' | 'info' | 'primary'

const TONE_CLASS: Readonly<Record<BadgeTone, string>> = {
  neutral: 'bg-surface2 text-muted',
  success: 'bg-success-soft text-success-text',
  warning: 'bg-warning-soft text-warning-text',
  critical: 'bg-critical-soft text-critical-text',
  info: 'bg-info-soft text-info-text',
  primary: 'bg-primary-soft text-primary-on-soft',
}

export interface BadgeProps {
  children: ReactNode
  tone?: BadgeTone
  /** Adds a leading dot, for a status that reads better as an indicator. */
  dot?: boolean
  title?: string
}

export function Badge({ children, tone = 'neutral', dot = false, title }: BadgeProps) {
  return (
    <span
      title={title}
      className={[
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        TONE_CLASS[tone],
      ].join(' ')}
    >
      {dot ? (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-current opacity-70" />
      ) : null}
      {children}
    </span>
  )
}

export function connectionTone(status: string): BadgeTone {
  switch (status) {
    case 'connected':
      return 'success'
    case 'expired':
    case 'disconnected':
      return 'warning'
    case 'error':
    case 'revoked':
      return 'critical'
    default:
      return 'neutral'
  }
}

export function syncTone(status: string): BadgeTone {
  switch (status) {
    case 'idle':
      return 'neutral'
    case 'syncing':
    case 'backfilling':
      return 'info'
    case 'error':
      return 'critical'
    default:
      return 'neutral'
  }
}

export function subscriptionTone(status: string): BadgeTone {
  switch (status) {
    case 'active':
      return 'success'
    case 'trialing':
      return 'primary'
    case 'grace_period':
      return 'warning'
    case 'billing_issue':
      return 'critical'
    case 'expired':
      return 'neutral'
    default:
      return 'neutral'
  }
}

export function approvalTone(status: string): BadgeTone {
  switch (status) {
    case 'executed':
    case 'approved':
      return 'success'
    case 'pending':
    case 'executing':
      return 'info'
    case 'rejected':
      return 'neutral'
    case 'failed':
      return 'critical'
    case 'expired':
      return 'warning'
    default:
      return 'neutral'
  }
}

export function exportTone(status: string): BadgeTone {
  switch (status) {
    case 'ready':
      return 'success'
    case 'requested':
    case 'processing':
      return 'info'
    case 'failed':
      return 'critical'
    case 'expired':
      return 'warning'
    default:
      return 'neutral'
  }
}

export function roleTone(role: string): BadgeTone {
  switch (role) {
    case 'admin':
      return 'primary'
    case 'ops':
      return 'info'
    default:
      return 'neutral'
  }
}

/** A count is critical when it is not zero: these are all "should be zero". */
export function countTone(count: number): BadgeTone {
  return count > 0 ? 'critical' : 'neutral'
}
