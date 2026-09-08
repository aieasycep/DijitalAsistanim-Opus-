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
 * The columns that decide a state.
 *
 * Declared structurally rather than imported from `@/lib/db`, so this module
 * stays importable from either side of the client boundary.
 * `AnnouncementTableRow` is assignable to it.
 */
export interface AnnouncementWindow {
  readonly published_at: string | null
  readonly starts_at: string
  readonly ends_at: string | null
}

/**
 * The state one announcement is in at a given instant.
 *
 * `published_at is null` wins over everything, exactly as the table's own
 * comment says it must: **a draft is never served, whatever its window says.**
 * The two dates are only consulted once publication has been established, which
 * is why a scheduled row and a draft with the same window are different states
 * rather than the same one.
 *
 * An unparseable instant falls through rather than deciding: a row whose
 * `starts_at` cannot be read is still published, and reporting it as a draft
 * would hide a live notice from the person looking for it.
 */
export function announcementState(row: AnnouncementWindow, now: Date): AnnouncementState {
  if (row.published_at === null) return 'draft'

  const startsAt = Date.parse(row.starts_at)
  if (Number.isFinite(startsAt) && startsAt > now.getTime()) return 'scheduled'

  if (row.ends_at === null) return 'open_ended'
  const endsAt = Date.parse(row.ends_at)
  if (Number.isFinite(endsAt) && endsAt <= now.getTime()) return 'ended'
  return 'live'
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
