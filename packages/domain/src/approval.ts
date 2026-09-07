import { DAY_MS, type IsoInstant } from './clock.ts'
import type { ApprovalActionType, ApprovalStatus } from './enums.ts'
import type { ApprovalPayload } from './entities.ts'

/**
 * Approval state machine. Every write that leaves the app — a sent mail, a
 * calendar change, a task in the user's Google Tasks list — passes through
 * here, so "the assistant did something behind my back" is structurally
 * impossible rather than merely discouraged.
 */

const TRANSITIONS: Record<ApprovalStatus, readonly ApprovalStatus[]> = {
  pending: ['approved', 'rejected', 'expired'],
  approved: ['executing', 'rejected', 'expired'],
  // `executing` may fall back to `approved` when a transient failure is retried.
  executing: ['executed', 'failed', 'approved'],
  failed: ['approved', 'rejected', 'expired'],
  executed: [],
  rejected: [],
  expired: [],
}

export function canTransition(from: ApprovalStatus, to: ApprovalStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

export function isTerminal(status: ApprovalStatus): boolean {
  return TRANSITIONS[status].length === 0
}

export class ApprovalTransitionError extends Error {
  constructor(
    readonly from: ApprovalStatus,
    readonly to: ApprovalStatus,
  ) {
    super(`Illegal approval transition: ${from} → ${to}`)
    this.name = 'ApprovalTransitionError'
  }
}

export function assertTransition(from: ApprovalStatus, to: ApprovalStatus): void {
  if (!canTransition(from, to)) throw new ApprovalTransitionError(from, to)
}

/** Proposals go stale rather than lingering: a two-day-old draft is noise. */
export const APPROVAL_TTL_MS = 2 * DAY_MS

export function approvalExpiryFrom(now: Date): IsoInstant {
  return new Date(now.getTime() + APPROVAL_TTL_MS).toISOString()
}

export function isExpired(expiresAt: IsoInstant, now: Date): boolean {
  const t = new Date(expiresAt).getTime()
  return Number.isFinite(t) && t <= now.getTime()
}

/** Retries stop here; beyond this the user is told rather than silently retried. */
export const MAX_APPROVAL_ATTEMPTS = 3

export function shouldRetry(attemptCount: number): boolean {
  return attemptCount < MAX_APPROVAL_ATTEMPTS
}

/**
 * Backoff between execution attempts, in ms. Deterministic — no jitter — so a
 * queued approval's next attempt time is reproducible in tests.
 */
export function retryDelayMs(attemptCount: number): number {
  return Math.min(60_000, 2 ** Math.max(0, attemptCount) * 2_000)
}

/**
 * An idempotency key that survives retries and duplicate taps across devices.
 * Derived from the user, the action and a caller-supplied discriminator (the
 * thread id, the event id, …) so re-proposing the same action reuses the key
 * and the executor's uniqueness constraint absorbs the duplicate.
 */
export function buildIdempotencyKey(
  userId: string,
  type: ApprovalActionType,
  discriminator: string,
): string {
  return `${userId}:${type}:${discriminator}`.slice(0, 200)
}

/**
 * Fields the user is allowed to change while reviewing. Everything else in the
 * payload is fixed at proposal time, so an "edit" cannot be used to retarget a
 * send at a different recipient without the card showing it.
 */
export const EDITABLE_FIELDS: Record<ApprovalActionType, readonly string[]> = {
  email_send: ['subject', 'body', 'to', 'cc', 'tone'],
  calendar_create: ['title', 'description', 'location', 'startsAt', 'endsAt', 'attendees'],
  calendar_update: ['changes'],
  task_create: ['title', 'notes', 'dueAt'],
  reminder_create: ['title', 'body', 'remindAt', 'preset'],
  commitment_create: ['text', 'personName', 'dueAt'],
}

export interface PayloadDiffEntry {
  field: string
  before: unknown
  after: unknown
}

/**
 * Shallow diff between the original proposal and the edited payload, so the
 * approval card can show "you changed the subject and the send time" rather
 * than asking the user to spot it.
 */
export function diffPayload(
  original: ApprovalPayload,
  edited: ApprovalPayload,
): PayloadDiffEntry[] {
  const diffs: PayloadDiffEntry[] = []
  const keys = new Set([...Object.keys(original), ...Object.keys(edited)])
  for (const key of keys) {
    if (key === 'kind') continue
    const before = (original as unknown as Record<string, unknown>)[key]
    const after = (edited as unknown as Record<string, unknown>)[key]
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      diffs.push({ field: key, before, after })
    }
  }
  return diffs
}

/**
 * Reject an edit that touched a field the action type does not expose. The
 * executor calls this before it sends anything, so a tampered client payload
 * fails closed.
 */
export function validateEdit(
  type: ApprovalActionType,
  original: ApprovalPayload,
  edited: ApprovalPayload,
): { valid: true } | { valid: false; illegalFields: string[] } {
  const allowed = new Set(EDITABLE_FIELDS[type])
  const illegal = diffPayload(original, edited)
    .map((d) => d.field)
    .filter((f) => !allowed.has(f))
  return illegal.length === 0 ? { valid: true } : { valid: false, illegalFields: illegal }
}

/** True when the action has an effect outside the app and therefore needs approval. */
export function hasExternalSideEffect(type: ApprovalActionType): boolean {
  // Reminders and commitments are internal records: the user creating one by
  // hand takes effect immediately. Everything else touches a provider.
  return type !== 'reminder_create' && type !== 'commitment_create'
}
