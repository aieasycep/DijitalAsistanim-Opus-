import type { BadgeTone } from '@/components/ui'
import { messages } from '@/lib/messages'
import {
  ANNOUNCEMENT_ACTION_LABELS_TR,
  STATE_LABELS_TR,
  type AnnouncementState,
} from '@/lib/messages/announcements'

/**
 * The presentation decisions the announcements area makes, in one module so a
 * table and a detail page cannot disagree about what a colour means.
 */

/**
 * A tone per state, and only two of them are loud.
 *
 * `open_ended` is a warning because an announcement with no end date is one
 * nobody will remember to take down — `announcements.dismissible`'s own comment
 * calls the non-dismissible version of that a dark pattern. `draft` is
 * deliberately the flattest tone available: a draft reaches nobody, and colour
 * it does not deserve is colour the live states lose.
 */
export const STATE_TONES: Readonly<Record<AnnouncementState, BadgeTone>> = Object.freeze({
  draft: 'neutral',
  scheduled: 'info',
  live: 'success',
  open_ended: 'warning',
  ended: 'neutral',
})

export function stateLabel(state: AnnouncementState): string {
  return STATE_LABELS_TR[state]
}

/**
 * The Turkish label for an audit action, falling back to the raw token.
 *
 * A trail that hid an action it did not recognise would be a trail that hid
 * exactly the action somebody added without telling this screen.
 */
export function auditActionLabel(action: string | null): string {
  if (action === null) return messages.fields.unknown
  return ANNOUNCEMENT_ACTION_LABELS_TR[action] ?? action
}

/** A settled panel's error message, from `messages.errors` — never an exception. */
export function panelError(result: { ok: true } | { ok: false; code: string }): string | null {
  if (result.ok) return null
  return result.code === 'forbidden' ? messages.errors.forbidden : messages.errors.queryFailed
}

/** `%12` — a share, rounded to whole percent, with a floor of `<1`. */
export function sharePercent(part: number, whole: number): string | null {
  if (whole <= 0) return null
  const ratio = (part / whole) * 100
  if (ratio > 0 && ratio < 1) return '<1'
  return String(Math.round(ratio))
}
