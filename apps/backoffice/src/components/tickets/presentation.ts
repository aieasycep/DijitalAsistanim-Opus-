import type { BadgeTone } from '@/components/ui'
import { formatDuration } from '@/lib/format'
import { messages } from '@/lib/messages'
import { ticketMessages } from '@/lib/messages/tickets'
import type { TicketPriority, TicketStatus } from './contract'

/**
 * How the queue's values are rendered, decided once.
 *
 * A tone is a claim about health, not a colour choice: `critical` means someone
 * has to do something now, `warning` means watch it, `success` means the ticket
 * is off the queue. Two screens that disagreed about whether `waiting_user` is
 * a problem would be two screens an operator has to reconcile, so the mapping
 * lives here and both the table and the detail page read it.
 *
 * Everything in this module is pure and imports nothing that touches the
 * database, so a client component may use it as freely as a server one.
 */

export const statusTone: Readonly<Record<TicketStatus, BadgeTone>> = Object.freeze({
  // Nobody has picked it up yet.
  open: 'warning',
  in_progress: 'info',
  // The ball is with the user; the clock is not ours.
  waiting_user: 'neutral',
  resolved: 'success',
  closed: 'neutral',
})

export const priorityTone: Readonly<Record<TicketPriority, BadgeTone>> = Object.freeze({
  low: 'neutral',
  normal: 'neutral',
  high: 'warning',
  critical: 'critical',
})

/** A duration given in whole minutes, in the console's own units. */
export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—'
  return formatDuration(minutes * 60)
}

export interface FirstResponseDisplay {
  label: string
  tone: BadgeTone
}

/**
 * Time to first response, or the honest reason there is not one yet.
 *
 * Three different situations, and collapsing them into an em dash is how a
 * ticket that was closed without anyone ever answering it becomes invisible:
 *
 *   - answered: the measured duration;
 *   - still open and unanswered: how long the user has been waiting, which is
 *     the number the shift actually needs;
 *   - closed unanswered: said in words, because it is a finding.
 */
export function firstResponseDisplay(options: {
  minutes: number | null
  ageMinutes: number
  isActive: boolean
}): FirstResponseDisplay {
  if (options.minutes !== null) {
    return { label: formatMinutes(options.minutes), tone: 'neutral' }
  }
  if (options.isActive) {
    return {
      label: `${ticketMessages.values.awaitingResponse} · ${formatMinutes(options.ageMinutes)}`,
      tone: 'warning',
    }
  }
  return { label: ticketMessages.values.closedWithoutResponse, tone: 'critical' }
}

/**
 * How a staff member is named on screen.
 *
 * Their display name when they have one, otherwise the redacted address —
 * never the address in the clear, which `bo_admin_users` does not carry
 * anyway. An id that resolves to nothing is a disabled or deleted admin, and
 * the label says that rather than printing a bare uuid.
 */
export function adminLabel(
  admin: { name: string | null; emailRedacted: string | null } | undefined,
): string {
  if (admin === undefined) return ticketMessages.values.deletedAdmin
  if (admin.name !== null && admin.name.trim() !== '') return admin.name
  return admin.emailRedacted ?? ticketMessages.values.deletedAdmin
}

/**
 * A panel's error message, from the domain's own error vocabulary.
 *
 * Never the thrown message: a PostgREST error can name the row it failed on,
 * and this tool's promise is that such a string never reaches a screen.
 */
export function panelError(result: { ok: true } | { ok: false; code: string }): string | null {
  if (result.ok) return null
  return result.code === 'forbidden' ? messages.errors.forbidden : messages.errors.queryFailed
}
