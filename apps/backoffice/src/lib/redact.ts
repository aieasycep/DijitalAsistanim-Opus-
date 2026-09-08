import { AppError } from '@da/domain'
import type { AdminPermission, AdminRole } from './permissions.ts'

/**
 * What an operator is allowed to see, and the one gate through which they may
 * ever see more.
 *
 * ---------------------------------------------------------------------------
 * THE DEFAULT IS BLINDNESS
 * ---------------------------------------------------------------------------
 *
 * Section 7 of the specification is the reason this product can be sold: mail
 * bodies, assistant conversations, calendar detail and captured content are
 * hidden from staff BY DEFAULT. An operator answering "my mail isn't syncing"
 * gets *connection healthy, last sync 10:42, 743 messages processed, 2 failed*
 * — which is almost always the whole answer — and gets it without seeing a
 * single subject line.
 *
 * Migration 0017 holds that in the database: the `bo_*` views have no content
 * column to project. This module is the application-side half. It exists so
 * that a page which does hold content — because it called one of the `sa_*`
 * reveal functions — has exactly one place to ask "may I render this?", and so
 * that the answer for every other page is a constant "no" rather than a
 * forgotten `if`.
 *
 * Like `permissions.ts`, everything here is pure. `assertRevealAllowed()` is a
 * total function of a grant, a scope, a permission set and an instant, so
 * `__tests__/support-access.test.ts` can prove that a reveal without a grant is
 * refused, rather than hoping a page remembered to check.
 *
 * ---------------------------------------------------------------------------
 * THIS IS THE SECOND OF THREE LOCKS
 * ---------------------------------------------------------------------------
 *
 *   1. `sa_assert_grant()` in Postgres re-checks the grant on every reveal, and
 *      the trigger on `support_access_reveals` re-checks it again on the log
 *      row. Neither can be bypassed by application code.
 *   2. This module decides which reveal controls a screen may draw at all, so a
 *      scope outside a grant is never offered as a button that then fails.
 *   3. `lib/actions/support-access.ts` runs every reveal through
 *      `runAdminAction`, which writes an `audit_logs` row naming the grant it
 *      happened under — on the failure path as well as the success path.
 *
 * Removing any one of the three leaves the other two standing. That is the
 * point of having three.
 */

// ===========================================================================
// 1. Scopes
// ===========================================================================

/**
 * The eight members of the `support_access_scope` Postgres enum, in declaration
 * order. Each has exactly one `sa_reveal_*` function and no other route: a
 * scope with no function unlocks nothing, and a function with no scope cannot
 * be called.
 */
export const SUPPORT_ACCESS_SCOPES = [
  'identity',
  'email_subject',
  'email_body',
  'calendar_detail',
  'assistant_conversation',
  'capture_content',
  'approval_payload',
  'notification_content',
] as const

export type SupportAccessScope = (typeof SUPPORT_ACCESS_SCOPES)[number]

export const SUPPORT_ACCESS_STATUSES = [
  'pending_approval',
  'active',
  'denied',
  'expired',
  'revoked',
] as const

export type SupportAccessStatus = (typeof SUPPORT_ACCESS_STATUSES)[number]

const SCOPE_SET: ReadonlySet<string> = Object.freeze(new Set<string>(SUPPORT_ACCESS_SCOPES))

export function isSupportAccessScope(value: unknown): value is SupportAccessScope {
  return typeof value === 'string' && SCOPE_SET.has(value)
}

export function isSupportAccessStatus(value: unknown): value is SupportAccessStatus {
  return typeof value === 'string' && (SUPPORT_ACCESS_STATUSES as readonly string[]).includes(value)
}

/** Turkish label per scope, shown on the request form and in the reveal log. */
export const SCOPE_LABELS_TR: Readonly<Record<SupportAccessScope, string>> = Object.freeze({
  identity: 'Kimlik bilgileri',
  email_subject: 'E-posta konu başlıkları',
  email_body: 'E-posta içeriği',
  calendar_detail: 'Takvim etkinlik ayrıntıları',
  assistant_conversation: 'Asistan konuşmaları',
  capture_content: 'Yakalanan içerik',
  approval_payload: 'Onay içeriği',
  notification_content: 'Bildirim içeriği',
})

/**
 * What the operator is actually being handed, in plain Turkish. The request
 * form renders this next to each checkbox: somebody ticking a box should be
 * reading a description of a person's private life, not a column name.
 */
export const SCOPE_DESCRIPTIONS_TR: Readonly<Record<SupportAccessScope, string>> = Object.freeze({
  identity: 'Kullanıcının adı, e-posta adresi, dili ve saat dilimi.',
  email_subject: 'Konu başlıkları ve özetler — mesaj gövdeleri hariç.',
  email_body: 'Tam e-posta metni: gönderen, alıcılar ve gövde.',
  calendar_detail: 'Etkinlik başlığı, açıklaması, konumu ve düzenleyeni.',
  assistant_conversation: 'Kullanıcının asistanla yazıştığı tüm mesajlar.',
  capture_content: 'Yakalanan fotoğraf, metin ve çıkarılan alanlar.',
  approval_payload: 'Onay bekleyen işlemin tam içeriği.',
  notification_content: 'Gönderilen bildirimin başlığı ve gövdesi.',
})

/**
 * Scopes ordered by how much they expose, least to most. The request form lists
 * them in this order so the cheapest sufficient scope is the first one an
 * operator sees — most "I can't see my mail" tickets are answered by
 * `email_subject` and never need `email_body`.
 */
export const SCOPE_SENSITIVITY_ORDER: readonly SupportAccessScope[] = Object.freeze([
  'identity',
  'email_subject',
  'notification_content',
  'approval_payload',
  'calendar_detail',
  'capture_content',
  'assistant_conversation',
  'email_body',
])

// ===========================================================================
// 2. Redaction primitives
//
// These mirror `bo_redact_email()` and `bo_identifier()` from 0017 character
// for character. The database applies them to everything it projects; these
// exist for the few values the application composes itself — an address typed
// into a search box and echoed back in a heading, an id built into a label.
// ===========================================================================

/** What the UI renders in place of something it is not allowed to show. */
export const HIDDEN_LABEL_TR = 'Gizli'
/** What the UI renders where the value simply does not exist. */
export const ABSENT_LABEL_TR = '—'

const BULLET = '•'

/**
 * First character, three bullets, domain — `y•••@example.com`.
 *
 * Exactly `public.bo_redact_email()`. Enough for an operator to confirm they
 * are looking at the right account, never enough to contact the person from the
 * console. Returns null for anything that is not an address, because a string
 * that failed to parse must not be echoed back in the clear.
 */
export function redactEmail(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  const at = raw.indexOf('@')
  if (at <= 0) return null
  const domain = raw.slice(at + 1)
  if (domain === '') return null
  return `${raw.slice(0, 1)}${BULLET.repeat(3)}@${domain}`
}

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/

/**
 * Exactly `public.bo_identifier()`: a token-shaped string passes through, and
 * anything containing whitespace or `@` — an address, a subject line, a
 * sentence — collapses to `unstructured`.
 */
export function safeIdentifier(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  const trimmed = raw.trim()
  if (trimmed === '') return null
  return IDENTIFIER_RE.test(trimmed) ? trimmed : 'unstructured'
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

/** First and last four characters of an id — `3f2a…8c11` — for dense tables. */
export function shortId(id: string): string {
  if (id.length <= 12) return id
  return `${id.slice(0, 4)}${'…'}${id.slice(-4)}`
}

// ===========================================================================
// 3. Role-level redaction
//
// The matrix gives `analyst` `users.read`, because an analyst needs the user
// table to compute cohorts. The specification also says an analyst sees
// aggregated analytics only, with PII hidden. Both are true at once: an analyst
// may read the rows and may not read the identifiers in them.
// ===========================================================================

export type RedactionLevel =
  /** No per-person identifier at all. Counts, rates and buckets only. */
  | 'aggregate'
  /** Redacted identifiers: `y•••@example.com`, user ids, states, timestamps. */
  | 'metadata'

/**
 * The floor for a role, before any Support Access grant is considered.
 *
 * Only `analyst` is `aggregate`. `readonly` is `metadata`: it is the view a new
 * hire or an external auditor gets, and it still needs to identify the row it
 * is looking at.
 */
export function baseRedactionLevel(role: AdminRole): RedactionLevel {
  return role === 'analyst' ? 'aggregate' : 'metadata'
}

/** True when this role may see which individual a row is about. */
export function canSeeIndividuals(role: AdminRole): boolean {
  return baseRedactionLevel(role) === 'metadata'
}

/** A redacted address for this role, or null when the role sees no addresses. */
export function redactEmailFor(role: AdminRole, raw: string | null | undefined): string | null {
  if (!canSeeIndividuals(role)) return null
  return redactEmail(raw)
}

/** A user id for this role, or null when the role works on aggregates only. */
export function userRefFor(role: AdminRole, userId: string | null | undefined): string | null {
  if (!canSeeIndividuals(role)) return null
  if (userId === null || userId === undefined) return null
  return isUuid(userId) ? userId : null
}

// ===========================================================================
// 4. The redacted value
//
// A page never receives a bare string it might render by accident. It receives
// a `Redacted<T>`, which either carries the value or carries the reason it does
// not, so the two cases cannot be confused at the call site.
// ===========================================================================

export type RedactionReason =
  'privacy_default' | 'aggregate_only' | 'no_grant' | 'scope_not_granted' | 'grant_expired'

export type Redacted<T> =
  | { readonly revealed: true; readonly value: T }
  | { readonly revealed: false; readonly reason: RedactionReason; readonly label: string }

export const REDACTION_MESSAGES_TR: Readonly<Record<RedactionReason, string>> = Object.freeze({
  privacy_default: 'İçerik varsayılan olarak gizlidir. Görmek için Destek Erişimi gerekir.',
  aggregate_only: 'Bu rolde kişisel veri görüntülenmez; yalnızca toplulaştırılmış metrikler.',
  no_grant: 'Bu kullanıcı için etkin bir Destek Erişimi izniniz yok.',
  scope_not_granted: 'Destek Erişimi izniniz bu içerik türünü kapsamıyor.',
  grant_expired: 'Destek Erişimi izninizin süresi doldu.',
})

export function revealed<T>(value: T): Redacted<T> {
  return { revealed: true, value }
}

export function hidden<T>(reason: RedactionReason = 'privacy_default'): Redacted<T> {
  return { revealed: false, reason, label: HIDDEN_LABEL_TR }
}

/** The value if it was revealed, otherwise the Turkish placeholder. */
export function renderRedacted(value: Redacted<string>): string {
  return value.revealed ? value.value : value.label
}

// ===========================================================================
// 5. Grants
// ===========================================================================

/**
 * The fields of a Support Access grant that bear on whether a reveal may
 * happen. `lib/queries/support-access.ts` loads the full row; this is the subset
 * every guard actually reads, so the guard can be called with a literal in a
 * test.
 */
export interface GrantSnapshot {
  readonly grantId: string
  readonly adminUserId: string
  readonly subjectUserId: string
  readonly scopes: readonly SupportAccessScope[]
  readonly status: SupportAccessStatus
  /** Null until an approver acts. A grant with no `grantedAt` is not usable. */
  readonly grantedAt: Date | null
  readonly expiresAt: Date
  readonly revokedAt: Date | null
}

/**
 * Live means: approved, unrevoked, started, and inside its window.
 *
 * `status === 'active'` alone is not enough and is never trusted on its own —
 * `admin_cleanup_expired()` moves lapsed grants to `expired` on a schedule, so
 * between the lapse and the sweep the status still reads `active`. Every guard
 * here checks the timestamps, which is why that lag is cosmetic rather than a
 * hole.
 */
export function isGrantLive(grant: GrantSnapshot, now: Date): boolean {
  if (grant.status !== 'active') return false
  if (grant.revokedAt !== null) return false
  if (grant.grantedAt === null) return false
  const instant = now.getTime()
  if (grant.grantedAt.getTime() > instant) return false
  return grant.expiresAt.getTime() > instant
}

export function grantCoversScope(grant: GrantSnapshot, scope: SupportAccessScope): boolean {
  return grant.scopes.includes(scope)
}

/** Whole minutes left on a grant, floored at zero. Drives the active banner. */
export function grantMinutesRemaining(grant: GrantSnapshot, now: Date): number {
  const ms = grant.expiresAt.getTime() - now.getTime()
  return ms <= 0 ? 0 : Math.floor(ms / 60_000)
}

/** `43 dakika` / `2 saat 5 dakika` — the countdown in the banner. */
export function formatMinutesRemainingTr(minutes: number): string {
  if (minutes <= 0) return 'süresi doldu'
  if (minutes < 60) return `${minutes} dakika`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} saat` : `${hours} saat ${rest} dakika`
}

// ===========================================================================
// 6. The reveal gate
// ===========================================================================

export type RevealDenialReason =
  'permission_denied' | 'wrong_admin' | 'wrong_subject' | 'grant_not_live' | 'scope_denied'

export type RevealDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: RevealDenialReason }

export const REVEAL_DENIAL_MESSAGES_TR: Readonly<Record<RevealDenialReason, string>> =
  Object.freeze({
    permission_denied: 'Rolünüz Destek Erişimi ile içerik görüntüleyemez.',
    wrong_admin: 'Bu Destek Erişimi izni başka bir yöneticiye ait.',
    wrong_subject: 'Bu Destek Erişimi izni başka bir kullanıcıyı kapsıyor.',
    grant_not_live: 'Destek Erişimi izniniz etkin değil veya süresi doldu.',
    scope_denied: 'Destek Erişimi izniniz bu içerik türünü kapsamıyor.',
  })

export interface RevealRequest {
  /** The grant being spent. `null` is the ordinary case and is always refused. */
  readonly grant: GrantSnapshot | null
  /** The admin asking, as `admin_users.id`. */
  readonly adminUserId: string
  /** The user whose content is being asked for. */
  readonly subjectUserId: string
  readonly scope: SupportAccessScope
  /** The caller's effective permissions, from `admin_permissions_for()`. */
  readonly permissions: ReadonlySet<AdminPermission>
  readonly now: Date
}

/**
 * The five checks, in the order a reviewer would ask them.
 *
 * Mirrors `sa_assert_grant()` in 0019 so that a refusal is identical whether it
 * happens here or in Postgres — the difference is only that here it costs no
 * round trip and leaves no partially-formed reveal.
 *
 * `grant === null` is the first branch on purpose: the overwhelmingly common
 * call is a page with no grant at all, and its answer must be "no" before any
 * other consideration.
 */
export function evaluateReveal(request: RevealRequest): RevealDecision {
  if (!request.permissions.has('support.access.reveal')) {
    return { allowed: false, reason: 'permission_denied' }
  }
  const grant = request.grant
  if (grant === null) return { allowed: false, reason: 'grant_not_live' }
  if (grant.adminUserId !== request.adminUserId) {
    return { allowed: false, reason: 'wrong_admin' }
  }
  if (grant.subjectUserId !== request.subjectUserId) {
    return { allowed: false, reason: 'wrong_subject' }
  }
  if (!isGrantLive(grant, request.now)) return { allowed: false, reason: 'grant_not_live' }
  if (!grantCoversScope(grant, request.scope)) return { allowed: false, reason: 'scope_denied' }
  return { allowed: true }
}

/**
 * `evaluateReveal`, but it throws.
 *
 * For a caller that has already established it holds a grant and wants a
 * refusal to be an error rather than a value it might ignore. The reveal
 * console does not use it — it renders the refusal instead — and the reveal
 * itself is refused inside Postgres by `sa_assert_grant()`, which is the lock
 * this function mirrors rather than replaces.
 */
export function assertRevealAllowed(request: RevealRequest): void {
  const decision = evaluateReveal(request)
  if (decision.allowed) return
  throw new AppError('forbidden', {
    status: 403,
    detail: `support access refused: ${decision.reason} (scope ${request.scope})`,
  })
}

/**
 * The content-shaped answer: the value when a grant covers it, and a named
 * refusal when it does not.
 *
 * A page that holds a subject line calls this instead of rendering the string,
 * so "we forgot to check" and "we checked and it was allowed" cannot look the
 * same in a diff.
 */
export function revealOrHide<T>(value: T, request: RevealRequest): Redacted<T> {
  const decision = evaluateReveal(request)
  if (decision.allowed) return revealed(value)
  switch (decision.reason) {
    case 'scope_denied':
      return hidden<T>('scope_not_granted')
    case 'grant_not_live':
      return hidden<T>(request.grant === null ? 'no_grant' : 'grant_expired')
    default:
      return hidden<T>('privacy_default')
  }
}
