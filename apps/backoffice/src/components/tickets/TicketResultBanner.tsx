import Link from 'next/link'
import { ticketMessages } from '@/lib/messages/tickets'
import { isAppliedOutcome, type TicketOutcome } from './contract'

/**
 * What the last action actually did.
 *
 * The outcome arrives in the URL rather than in component state, so the answer
 * survives the redirect, is linkable, and cannot drift out of sync with the
 * rows underneath it — which were re-queried on the same render.
 *
 * Only a token from `TICKET_OUTCOMES` and a ticket reference travel here.
 * `audit_failed` is deliberately loud: the change happened and the trail did
 * not, which is the one outcome an operator must escalate rather than retry.
 */

const TONE_CLASS = {
  success: 'bg-success-soft text-success-text',
  warning: 'bg-warning-soft text-warning-text',
  critical: 'bg-critical-soft text-critical-text',
} as const

function toneFor(outcome: TicketOutcome): keyof typeof TONE_CLASS {
  if (outcome === 'audit_failed') return 'critical'
  if (isAppliedOutcome(outcome)) return 'success'
  if (outcome === 'noop' || outcome === 'ineligible' || outcome === 'invalid') return 'warning'
  return 'critical'
}

export interface TicketResultBannerProps {
  outcome: TicketOutcome
  /** `DA-001234`, or null when the action never reached a ticket. */
  reference: string | null
  /** The same page without the result parameters. */
  dismissHref: string
}

export function TicketResultBanner({ outcome, reference, dismissHref }: TicketResultBannerProps) {
  return (
    <div
      role="status"
      className={[
        'mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2',
        TONE_CLASS[toneFor(outcome)],
      ].join(' ')}
    >
      <span className="bo-kicker text-current opacity-70">{ticketMessages.result.heading}</span>
      <span className="text-[13px] font-semibold">{ticketMessages.result[outcome]}</span>

      {reference === null ? null : (
        <span className="text-[12px] opacity-90">
          <span className="bo-kicker mr-1 text-current opacity-70">
            {ticketMessages.result.ticketLabel}
          </span>
          <span className="font-mono">{reference}</span>
        </span>
      )}

      <Link
        href={dismissHref}
        className="ml-auto text-[12px] font-medium underline underline-offset-2 opacity-80 hover:opacity-100"
      >
        {ticketMessages.result.dismiss}
      </Link>
    </div>
  )
}
