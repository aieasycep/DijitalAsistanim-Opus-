import { DAY_MS, type IsoInstant } from './clock.ts'
import type { RetentionWindow } from './enums.ts'

/**
 * Retention policy. The cleanup job and the privacy screen both read these,
 * so the number the user is shown is the number the job enforces.
 */

export const RETENTION_DAYS: Record<RetentionWindow, number | null> = {
  '30d': 30,
  '90d': 90,
  '1y': 365,
  forever: null,
}

export const DEFAULT_RETENTION: RetentionWindow = '90d'

/** Instant before which records are eligible for deletion; null = keep all. */
export function retentionCutoff(window: RetentionWindow, now: Date): Date | null {
  const days = RETENTION_DAYS[window]
  if (days === null) return null
  return new Date(now.getTime() - days * DAY_MS)
}

export function isExpiredUnderRetention(
  recordInstant: IsoInstant,
  window: RetentionWindow,
  now: Date,
): boolean {
  const cutoff = retentionCutoff(window, now)
  if (!cutoff) return false
  const t = new Date(recordInstant).getTime()
  return Number.isFinite(t) && t < cutoff.getTime()
}

/**
 * Tables the retention job sweeps, and the column each is aged by.
 *
 * OAuth connection state is deliberately absent: disconnecting an account is
 * an explicit user action, never a side effect of a retention window elapsing.
 * Approvals and audit logs are kept on their own fixed schedules because they
 * are the record of what the assistant did on the user's behalf.
 */
export const RETENTION_SWEEP: ReadonlyArray<{
  table: string
  column: string
  /** When set, this table uses a fixed window rather than the user's choice. */
  fixedDays?: number
  /** Null out these columns instead of deleting the row. */
  anonymizeColumns?: readonly string[]
}> = [
  { table: 'email_messages', column: 'sent_at' },
  { table: 'email_threads', column: 'last_message_at' },
  { table: 'memory_chunks', column: 'occurred_at' },
  { table: 'insights', column: 'created_at' },
  { table: 'life_events', column: 'created_at' },
  { table: 'briefings', column: 'created_at' },
  { table: 'captures', column: 'created_at' },
  { table: 'assistant_messages', column: 'created_at' },
  { table: 'device_notifications', column: 'posted_at', fixedDays: 30 },
  { table: 'approval_actions', column: 'created_at', fixedDays: 365 },
  // Audit rows outlive user content on purpose, but lose their entity linkage.
  {
    table: 'audit_logs',
    column: 'created_at',
    fixedDays: 400,
    anonymizeColumns: ['entity_id', 'metadata'],
  },
  { table: 'data_export_requests', column: 'created_at', fixedDays: 30 },
]

/**
 * Retention only ever applies going forward: shortening the window schedules
 * old records for the next sweep, it does not delete anything synchronously
 * while the user is still on the settings screen.
 */
export interface RetentionChange {
  previous: RetentionWindow
  next: RetentionWindow
  /** How many days of history the change will eventually remove. */
  daysRemoved: number | null
  effectiveFrom: IsoInstant
}

export function describeRetentionChange(
  previous: RetentionWindow,
  next: RetentionWindow,
  now: Date,
): RetentionChange {
  const prevDays = RETENTION_DAYS[previous]
  const nextDays = RETENTION_DAYS[next]
  let daysRemoved: number | null = null
  if (nextDays !== null) daysRemoved = prevDays === null ? null : Math.max(0, prevDays - nextDays)
  return { previous, next, daysRemoved, effectiveFrom: now.toISOString() }
}
