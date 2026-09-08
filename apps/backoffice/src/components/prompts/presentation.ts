import type { BadgeTone } from '@/components/ui/Badge'
import { promptMessages } from '@/lib/messages/prompts'
import type { PromptOutcome, PromptStatusValue } from './contract'

/**
 * How a prompt version's values are rendered, decided once.
 *
 * ---------------------------------------------------------------------------
 * WHY "ETKIN" IS NOT GREEN
 * ---------------------------------------------------------------------------
 *
 * A tone is a claim. Green in this console means healthy, and "this prompt is
 * the one serving traffic" is not a health claim — an active version can be the
 * one that broke the feature this morning, which is the entire reason this area
 * exists. So `active` is `primary`: stated firmly, judged not at all. `draft` is
 * `info` (written, reaching nobody) and `archived` is `neutral` (a fact about
 * the past).
 *
 * The one place a colour does judge is the outcome banner, where `auditMissing`
 * is critical: a privileged change with no trail is the only outcome on these
 * screens that somebody has to act on immediately.
 *
 * Everything here is pure and imports nothing that touches the database, so a
 * Client Component may use it as freely as a Server one.
 */

export const promptStatusTone: Readonly<Record<PromptStatusValue, BadgeTone>> = Object.freeze({
  draft: 'info',
  active: 'primary',
  archived: 'neutral',
})

const OUTCOME_TONE: Readonly<Record<PromptOutcome, BadgeTone>> = Object.freeze({
  created: 'success',
  saved: 'success',
  activated: 'primary',
  archived: 'neutral',
  locked: 'warning',
  duplicate: 'warning',
  conflict: 'warning',
  invalid: 'warning',
  forbidden: 'critical',
  notfound: 'warning',
  ratelimited: 'warning',
  failed: 'critical',
  auditMissing: 'critical',
})

export function outcomeTone(outcome: PromptOutcome): BadgeTone {
  return OUTCOME_TONE[outcome]
}

// ===========================================================================
// Naming a person
// ===========================================================================

/** The subset of `bo_admin_users` every screen in this area needs. */
export interface NamedAdmin {
  readonly adminUserId: string
  readonly name: string | null
  readonly emailRedacted: string | null
  readonly roleLabel: string
  readonly isActive: boolean
}

/**
 * How an operator is named in a table cell.
 *
 * Falls back to the redacted address and then to "Bilinmiyor" — which is the
 * truth when the roster lookup failed or when the row predates the admin
 * platform. It never renders a bare uuid: an id is not a person's name, and a
 * column full of them is a column nobody reads.
 */
export function adminLabel(admin: NamedAdmin | undefined): string {
  if (admin === undefined) return promptMessages.table.unknownAdmin
  const name = admin.name?.trim() ?? ''
  if (name !== '') return name
  const email = admin.emailRedacted?.trim() ?? ''
  if (email !== '') return email
  return promptMessages.table.unknownAdmin
}

// ===========================================================================
// Derived figures
//
// Every one of these is arithmetic over two numbers a query already returned.
// Nothing here invents a value: a ratio whose denominator is zero is `null`, and
// `null` renders as an em dash rather than as a confident zero.
// ===========================================================================

/** Cost of one model call with this prompt, in micros. Null when never called. */
export function costPerCall(costMicros: number, eventCount: number): number | null {
  if (eventCount <= 0) return null
  return Math.round(costMicros / eventCount)
}

/**
 * The short form of a body fingerprint.
 *
 * `body_fingerprint` is an md5 of the body, generated in Postgres. Twelve
 * characters is enough for a person to tell two versions apart at a glance and
 * short enough to sit in a dense table; the full value is on the record page.
 */
export function shortFingerprint(fingerprint: string): string {
  return fingerprint.length <= 12 ? fingerprint : fingerprint.slice(0, 12)
}
