import type { EmailCategory, Importance } from './enums.ts'

/**
 * Stages 1 and 2 of the ingestion pipeline: the deterministic filters that
 * decide, without spending a token, whether a message is worth a model call.
 *
 * This is the single biggest lever on running cost, so the rules are explicit
 * and unit-tested rather than folded into a prompt. Stage 3 (the model) only
 * ever sees what survives here.
 */

export interface TriageInput {
  fromEmail: string
  fromName: string | null
  subject: string
  snippet: string
  /** Labels the provider itself applied (`CATEGORY_PROMOTIONS`, `SPAM`, …). */
  providerLabels: string[]
  /** List-Unsubscribe / Precedence headers, lower-cased keys. */
  headers: Record<string, string>
  /** True when the user is on the To/Cc line rather than Bcc'd or list-blasted. */
  isDirectlyAddressed: boolean
  /** Lower-cased VIP addresses. */
  vipEmails: ReadonlySet<string>
  /** Lower-cased addresses covered by an explicit "always important" rule. */
  ruleImportantSenders: ReadonlySet<string>
  /** Lower-cased domains covered by an explicit rule. */
  ruleImportantDomains: ReadonlySet<string>
  /** Keywords from explicit rules, lower-cased. */
  ruleKeywords: readonly string[]
}

export type TriageDecision =
  /** Stage 1 settled it — bulk mail, no model call. */
  | { stage: 1; sendToModel: false; category: EmailCategory; importance: Importance; reason: string }
  /** Stage 2 settled it — a rule or signal made it important without a model call. */
  | { stage: 2; sendToModel: true; presumedCategory: EmailCategory | null; reason: string }
  /** Ambiguous — the model decides. */
  | { stage: 2; sendToModel: false; category: EmailCategory; importance: Importance; reason: string }
  | { stage: 3; sendToModel: true; presumedCategory: EmailCategory | null; reason: string }

const AUTOMATED_LOCAL_PARTS = [
  'no-reply',
  'noreply',
  'no_reply',
  'donotreply',
  'do-not-reply',
  'notifications',
  'notification',
  'mailer-daemon',
  'postmaster',
  'bounce',
  'newsletter',
  'news',
  'marketing',
  'campaign',
  'info',
]

const PROMO_LABELS = [
  'category_promotions',
  'category_social',
  'category_forums',
  'promotions',
  'spam',
  'junk',
  'junkemail',
]

const SECURITY_TERMS = [
  'güvenlik uyarısı',
  'guvenlik uyarisi',
  'şifreni',
  'sifreni',
  'parolanı',
  'parolani',
  'doğrulama kodu',
  'dogrulama kodu',
  'yetkisiz giriş',
  'yetkisiz giris',
  'security alert',
  'suspicious login',
  'unusual sign-in',
  'verify your account',
  'password reset',
  'two-factor',
]

const DEADLINE_TERMS = [
  'son tarih',
  'son gün',
  'son gun',
  'termin',
  'deadline',
  'due date',
  'en geç',
  'en gec',
  'kadar',
  'expires',
  'sona eriyor',
  'teslim',
]

const MEETING_TERMS = [
  'toplantı',
  'toplanti',
  'görüşme',
  'gorusme',
  'meeting',
  'invitation',
  'davet',
  'takvim',
  'calendar',
  'zoom.us',
  'meet.google.com',
  'teams.microsoft.com',
]

const FINANCE_TERMS = [
  'fatura',
  'ödeme',
  'odeme',
  'tahsilat',
  'invoice',
  'payment',
  'receipt',
  'makbuz',
  'ekstre',
  'abonelik',
  'subscription',
]

const TRAVEL_TERMS = [
  'uçuş',
  'ucus',
  'bilet',
  'rezervasyon',
  'flight',
  'booking',
  'reservation',
  'check-in',
  'pnr',
  'otel',
  'hotel',
]

const SHIPMENT_TERMS = [
  'kargo',
  'gönderi',
  'gonderi',
  'teslimat',
  'shipment',
  'tracking',
  'takip numarası',
  'takip numarasi',
  'delivered',
  'shipped',
]

function localPart(email: string): string {
  const at = email.indexOf('@')
  return at === -1 ? email : email.slice(0, at)
}

function domainOf(email: string): string {
  const at = email.lastIndexOf('@')
  return at === -1 ? '' : email.slice(at + 1)
}

function containsAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((n) => haystack.includes(n))
}

/**
 * Classify a message with deterministic signals only.
 *
 * The escape hatch matters as much as the filters: a message from a VIP or a
 * rule-matched sender is *never* dropped at stage 1, however bulk it looks.
 */
export function triage(input: TriageInput): TriageDecision {
  const from = input.fromEmail.trim().toLowerCase()
  const domain = domainOf(from)
  const local = localPart(from)
  const haystack = `${input.subject} ${input.snippet}`.toLowerCase()
  const labels = input.providerLabels.map((l) => l.toLowerCase())

  const isProtected =
    input.vipEmails.has(from) ||
    input.ruleImportantSenders.has(from) ||
    input.ruleImportantDomains.has(domain) ||
    input.ruleKeywords.some((k) => k && haystack.includes(k))

  // ── Stage 1 · deterministic bulk filters ────────────────────────────────
  if (!isProtected) {
    if (labels.some((l) => PROMO_LABELS.includes(l))) {
      return {
        stage: 1,
        sendToModel: false,
        category: 'promotion',
        importance: 'low',
        reason: 'provider_label',
      }
    }

    const precedence = (input.headers['precedence'] ?? '').toLowerCase()
    if (precedence === 'bulk' || precedence === 'list' || precedence === 'junk') {
      return {
        stage: 1,
        sendToModel: false,
        category: 'promotion',
        importance: 'low',
        reason: 'precedence_header',
      }
    }

    // A List-Unsubscribe header on a message that does not address the user
    // directly is a newsletter by any reasonable reading.
    if (input.headers['list-unsubscribe'] && !input.isDirectlyAddressed) {
      return {
        stage: 1,
        sendToModel: false,
        category: 'promotion',
        importance: 'low',
        reason: 'list_unsubscribe',
      }
    }

    if (AUTOMATED_LOCAL_PARTS.some((p) => local === p || local.startsWith(`${p}+`))) {
      // Automated senders still carry real signal (security, shipping,
      // payments), so they are downgraded rather than dropped, and only
      // skipped entirely when nothing notable appears in the text.
      const notable =
        containsAny(haystack, SECURITY_TERMS) ||
        containsAny(haystack, FINANCE_TERMS) ||
        containsAny(haystack, TRAVEL_TERMS) ||
        containsAny(haystack, SHIPMENT_TERMS) ||
        containsAny(haystack, DEADLINE_TERMS)
      if (!notable) {
        return {
          stage: 1,
          sendToModel: false,
          category: 'information',
          importance: 'low',
          reason: 'automated_sender',
        }
      }
    }
  }

  // ── Stage 2 · deterministic promotions to "worth a model call" ───────────
  if (containsAny(haystack, SECURITY_TERMS)) {
    return { stage: 2, sendToModel: true, presumedCategory: 'security', reason: 'security_terms' }
  }
  if (isProtected) {
    return { stage: 2, sendToModel: true, presumedCategory: null, reason: 'vip_or_rule' }
  }
  if (containsAny(haystack, DEADLINE_TERMS)) {
    return { stage: 2, sendToModel: true, presumedCategory: 'deadline', reason: 'deadline_terms' }
  }
  if (containsAny(haystack, MEETING_TERMS)) {
    return { stage: 2, sendToModel: true, presumedCategory: 'meeting', reason: 'meeting_terms' }
  }
  if (containsAny(haystack, FINANCE_TERMS)) {
    return { stage: 2, sendToModel: true, presumedCategory: 'payment', reason: 'finance_terms' }
  }
  if (containsAny(haystack, TRAVEL_TERMS)) {
    return { stage: 2, sendToModel: true, presumedCategory: 'travel', reason: 'travel_terms' }
  }
  if (containsAny(haystack, SHIPMENT_TERMS)) {
    return { stage: 2, sendToModel: true, presumedCategory: 'shipment', reason: 'shipment_terms' }
  }

  // A message addressed straight to the user by a human deserves a look.
  if (input.isDirectlyAddressed) {
    return { stage: 3, sendToModel: true, presumedCategory: null, reason: 'directly_addressed' }
  }

  return {
    stage: 2,
    sendToModel: false,
    category: 'information',
    importance: 'low',
    reason: 'no_signal',
  }
}

/**
 * Stable fingerprint for a message. Identical content is never classified
 * twice — the pipeline looks the hash up before it spends anything.
 *
 * Hashing itself is the caller's job (SubtleCrypto server-side); this only
 * defines the canonical input string so every caller hashes the same bytes.
 */
export function fingerprintInput(parts: {
  fromEmail: string
  subject: string
  bodyText: string
}): string {
  const normalise = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
  return [
    normalise(parts.fromEmail),
    normalise(parts.subject),
    // Long bodies rarely differ meaningfully past the first few KB, and
    // capping keeps the hash cheap on large newsletters.
    normalise(parts.bodyText).slice(0, 4000),
  ].join(' ')
}
