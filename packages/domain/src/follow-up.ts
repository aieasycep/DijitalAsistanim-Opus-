import { DAY_MS, HOUR_MS, type IsoInstant, isWeekend, addLocalDays } from './clock.ts'
import type { Importance } from './enums.ts'

/**
 * Follow-up engine.
 *
 * Watches threads the user sent and flags the ones that went quiet. The point
 * is a single, well-timed "henüz dönüş gelmedi" — not a nagging loop — so the
 * thresholds widen every time the user dismisses, and stop entirely after a
 * few refusals.
 */

export interface FollowUpCandidate {
  sentAt: IsoInstant
  /** True when the message actually asked for something. */
  expectsReply: boolean
  recipientIsVip: boolean
  importance: Importance
  /** How many times the user has already dismissed a nudge on this thread. */
  dismissCount: number
  /** Set once the other side replies; a replied thread is never nudged. */
  repliedAt: IsoInstant | null
  /** Explicitly closed by the user. */
  closedAt: IsoInstant | null
}

/** Base silence, in hours, before a follow-up is worth surfacing. */
const BASE_WAIT_HOURS: Record<Importance, number> = {
  critical: 24,
  high: 48,
  normal: 96,
  low: 168,
}

/** After this many dismissals the engine stops proposing follow-ups. */
export const MAX_DISMISSALS = 3

export function followUpWaitHours(candidate: FollowUpCandidate): number {
  const base = BASE_WAIT_HOURS[candidate.importance]
  // A VIP's silence is notable sooner; each dismissal doubles the patience.
  const vipFactor = candidate.recipientIsVip ? 0.5 : 1
  return base * vipFactor * 2 ** candidate.dismissCount
}

/**
 * When the follow-up becomes due. Weekends do not count as silence: a mail
 * sent on Friday afternoon is not overdue on Sunday.
 */
export function followUpDueAt(
  candidate: FollowUpCandidate,
  timeZone: string,
): IsoInstant | null {
  if (!candidate.expectsReply) return null
  const sent = new Date(candidate.sentAt)
  if (Number.isNaN(sent.getTime())) return null

  let remainingHours = followUpWaitHours(candidate)
  let cursor = sent
  // Walk forward a day at a time, only consuming the budget on working days.
  let guard = 0
  while (remainingHours > 0 && guard++ < 60) {
    const step = Math.min(24, remainingHours)
    const next = new Date(cursor.getTime() + step * HOUR_MS)
    if (!isWeekend(cursor, timeZone)) remainingHours -= step
    cursor = next
  }
  return cursor.toISOString()
}

export type FollowUpVerdict =
  | { shouldSurface: false; reason: 'replied' | 'closed' | 'no_reply_expected' | 'too_soon' | 'dismissed_enough' }
  | { shouldSurface: true; silentHours: number; dueAt: IsoInstant }

export function evaluateFollowUp(
  candidate: FollowUpCandidate,
  now: Date,
  timeZone: string,
): FollowUpVerdict {
  if (candidate.repliedAt) return { shouldSurface: false, reason: 'replied' }
  if (candidate.closedAt) return { shouldSurface: false, reason: 'closed' }
  if (!candidate.expectsReply) return { shouldSurface: false, reason: 'no_reply_expected' }
  if (candidate.dismissCount >= MAX_DISMISSALS) {
    return { shouldSurface: false, reason: 'dismissed_enough' }
  }

  const dueAt = followUpDueAt(candidate, timeZone)
  if (!dueAt) return { shouldSurface: false, reason: 'no_reply_expected' }
  if (new Date(dueAt).getTime() > now.getTime()) {
    return { shouldSurface: false, reason: 'too_soon' }
  }

  const silentHours = Math.floor(
    (now.getTime() - new Date(candidate.sentAt).getTime()) / HOUR_MS,
  )
  return { shouldSurface: true, silentHours, dueAt }
}

/**
 * Phrases that mark a sent message as expecting an answer. Used as the
 * deterministic pre-filter so most sent mail never reaches the model.
 */
const REPLY_EXPECTATION_TERMS = [
  'bekliyorum',
  'dönüş',
  'donus',
  'geri dönüş',
  'geri donus',
  'onayınız',
  'onayiniz',
  'görüşünüz',
  'gorusunuz',
  'teyit',
  'ne dersin',
  'uygun mu',
  'müsait misin',
  'musait misin',
  'bilgi verir misin',
  'gönderebilir misin',
  'gonderebilir misin',
  '?',
  'let me know',
  'could you',
  'can you',
  'please confirm',
  'waiting for',
  'looking forward',
  'thoughts?',
]

export function looksLikeReplyExpected(bodyText: string): boolean {
  const t = bodyText.toLowerCase()
  return REPLY_EXPECTATION_TERMS.some((term) => t.includes(term))
}

/** Suggested actions offered alongside a surfaced follow-up. */
export const FOLLOW_UP_ACTIONS = ['draft_nudge', 'remind_tomorrow', 'close'] as const
export type FollowUpAction = (typeof FOLLOW_UP_ACTIONS)[number]

/** "Remind me tomorrow" on a follow-up means the start of the next working day. */
export function nextWorkingDay(now: Date, timeZone: string): Date {
  let candidate = addLocalDays(now, 1, timeZone)
  let guard = 0
  while (isWeekend(candidate, timeZone) && guard++ < 7) {
    candidate = new Date(candidate.getTime() + DAY_MS)
  }
  return candidate
}
