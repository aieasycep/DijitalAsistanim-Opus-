import { DAY_MS, HOUR_MS, type IsoInstant } from './clock.ts'
import type { EmailCategory, Importance, PriorityRuleKind } from './enums.ts'
import { IMPORTANCE_RANK } from './enums.ts'

/**
 * The priority engine.
 *
 * Ordering is fixed by product rule and deliberately puts what the user said
 * above what the model inferred:
 *
 *   1. explicit user rules      6. user's own commitment
 *   2. security                 7. upcoming-meeting relevance
 *   3. hard deadline            8. learned preference
 *   4. VIP person               9. AI importance
 *   5. awaiting user's reply   10. promotion / newsletter penalty
 *
 * Each tier contributes a score from a disjoint band, so a lower tier can
 * never outrank a higher one no matter how many signals it stacks. The result
 * is a single `priorityScore` the feed and briefing sort on, plus a
 * `reasons` trail that explains the ranking in the UI without re-deriving it.
 */

export interface PriorityRuleInput {
  kind: PriorityRuleKind
  matchValue: string
  enabled: boolean
  matchCategory?: EmailCategory | null
}

export interface LearnedPreferenceInput {
  kind: PriorityRuleKind
  matchValue: string
  /** 0..1 */
  strength: number
  enabled: boolean
}

export interface PriorityCandidate {
  /** Sender address, lower-cased by the engine before matching. */
  senderEmail: string | null
  senderName: string | null
  subject: string
  /** Short text the keyword rules scan alongside the subject. */
  snippet: string
  category: EmailCategory
  /** The model's own read, used only as a tie-breaker within its tier. */
  aiImportance: Importance
  /** 0..1 confidence attached to the model's read. */
  aiConfidence: number
  requiresUserAction: boolean
  deadline: IsoInstant | null
  /** True when the thread's last message is from someone else and asks the user something. */
  awaitingUserReply: boolean
  /** True when a commitment the user made is attached to this item. */
  hasUserCommitment: boolean
  /** Emails of meeting attendees the user meets within the relevance window. */
  relatedMeetingWithinHours: number | null
  receivedAt: IsoInstant
}

export interface PriorityContext {
  now: Date
  rules: PriorityRuleInput[]
  learned: LearnedPreferenceInput[]
  /** Lower-cased VIP email addresses. */
  vipEmails: ReadonlySet<string>
  /** Honour learned preferences at all — mirrors the personalisation toggle. */
  useLearnedPreferences: boolean
}

export type PriorityTier =
  | 'explicit_rule'
  | 'security'
  | 'deadline'
  | 'vip'
  | 'awaiting_reply'
  | 'commitment'
  | 'meeting_relevance'
  | 'learned'
  | 'ai_importance'
  | 'promotion_penalty'

/**
 * Score bands. A tier's contribution is clamped into its band so tiers stay
 * strictly ordered: no amount of tier-4 signal reaches tier-3's floor.
 */
const BANDS: Record<PriorityTier, { base: number; span: number }> = {
  explicit_rule: { base: 9000, span: 900 },
  security: { base: 8000, span: 900 },
  deadline: { base: 7000, span: 900 },
  vip: { base: 6000, span: 900 },
  awaiting_reply: { base: 5000, span: 900 },
  commitment: { base: 4000, span: 900 },
  meeting_relevance: { base: 3000, span: 900 },
  learned: { base: 2000, span: 900 },
  ai_importance: { base: 1000, span: 900 },
  promotion_penalty: { base: 0, span: 0 },
}

export interface PriorityReason {
  tier: PriorityTier
  /** i18n key the UI renders; never a pre-translated sentence. */
  messageKey: string
  /** Interpolation values for the key. */
  values?: Record<string, string | number>
  contribution: number
}

export interface PriorityResult {
  score: number
  /** Effective importance after the rules have had their say. */
  importance: Importance
  /** Highest tier that fired, i.e. the headline explanation. */
  topTier: PriorityTier | null
  reasons: PriorityReason[]
  /** True when a `mute_sender` rule matched: the item is hidden, not ranked. */
  muted: boolean
}

function normaliseEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase()
}

function domainOf(email: string): string {
  const at = email.lastIndexOf('@')
  return at === -1 ? '' : email.slice(at + 1)
}

function clampToBand(tier: PriorityTier, fraction: number): number {
  const band = BANDS[tier]
  const f = Math.max(0, Math.min(1, fraction))
  return band.base + f * band.span
}

/**
 * Deadline urgency as a 0..1 fraction: due now (or overdue) is 1, due in a
 * week or later is 0. Anything past its deadline stays pinned at 1 rather
 * than wrapping around.
 */
export function deadlineUrgency(deadline: Date, now: Date): number {
  const msLeft = deadline.getTime() - now.getTime()
  if (msLeft <= 0) return 1
  const week = 7 * DAY_MS
  if (msLeft >= week) return 0
  return 1 - msLeft / week
}

const SECURITY_KEYWORDS = [
  'güvenlik',
  'guvenlik',
  'şifre',
  'sifre',
  'parola',
  'doğrulama',
  'dogrulama',
  'yetkisiz',
  'security',
  'password',
  'verification',
  'unauthorized',
  'suspicious sign',
  'two-factor',
  'iki adımlı',
]

function looksLikeSecurity(candidate: PriorityCandidate): boolean {
  if (candidate.category === 'security') return true
  const haystack = `${candidate.subject} ${candidate.snippet}`.toLowerCase()
  return SECURITY_KEYWORDS.some((k) => haystack.includes(k))
}

export function evaluatePriority(
  candidate: PriorityCandidate,
  context: PriorityContext,
): PriorityResult {
  const reasons: PriorityReason[] = []
  const sender = normaliseEmail(candidate.senderEmail)
  const senderDomain = domainOf(sender)
  const haystack = `${candidate.subject} ${candidate.snippet}`.toLowerCase()

  // ── Tier 1 · explicit rules ───────────────────────────────────────────────
  // A mute rule short-circuits everything: the user asked not to see this.
  const activeRules = context.rules.filter((r) => r.enabled)

  for (const rule of activeRules) {
    if (rule.kind === 'mute_sender' && normaliseEmail(rule.matchValue) === sender) {
      return {
        score: 0,
        importance: 'low',
        topTier: 'explicit_rule',
        reasons: [
          {
            tier: 'explicit_rule',
            messageKey: 'priority.reason.mutedSender',
            values: { sender: candidate.senderName ?? sender },
            contribution: 0,
          },
        ],
        muted: true,
      }
    }
  }

  let explicitBoost = 0
  for (const rule of activeRules) {
    switch (rule.kind) {
      case 'sender_always_important':
        if (normaliseEmail(rule.matchValue) === sender) {
          explicitBoost = Math.max(explicitBoost, 1)
          reasons.push({
            tier: 'explicit_rule',
            messageKey: 'priority.reason.senderRule',
            values: { sender: candidate.senderName ?? sender },
            contribution: 0,
          })
        }
        break
      case 'domain_always_important':
        if (senderDomain && normaliseEmail(rule.matchValue).replace(/^@/, '') === senderDomain) {
          explicitBoost = Math.max(explicitBoost, 0.9)
          reasons.push({
            tier: 'explicit_rule',
            messageKey: 'priority.reason.domainRule',
            values: { domain: senderDomain },
            contribution: 0,
          })
        }
        break
      case 'keyword_high_priority':
        if (rule.matchValue.trim() && haystack.includes(rule.matchValue.trim().toLowerCase())) {
          explicitBoost = Math.max(explicitBoost, 0.8)
          reasons.push({
            tier: 'explicit_rule',
            messageKey: 'priority.reason.keywordRule',
            values: { keyword: rule.matchValue },
            contribution: 0,
          })
        }
        break
      case 'vip_always_notify':
        if (context.vipEmails.has(sender)) {
          explicitBoost = Math.max(explicitBoost, 0.95)
          reasons.push({
            tier: 'explicit_rule',
            messageKey: 'priority.reason.vipRule',
            values: { sender: candidate.senderName ?? sender },
            contribution: 0,
          })
        }
        break
      case 'category_low_priority':
        // Handled in the penalty tier so it can push below every positive tier.
        break
      case 'mute_sender':
        break
    }
  }

  // ── Tier 10 · demotion ────────────────────────────────────────────────────
  // A user rule that demotes a category, or an inherently low-value category,
  // caps the item below everything else — unless an explicit boost said
  // otherwise, because rule-vs-rule ties resolve in favour of "show me".
  const demotedByRule = activeRules.some(
    (r) => r.kind === 'category_low_priority' && r.matchCategory === candidate.category,
  )
  const inherentlyLow = candidate.category === 'promotion'

  if ((demotedByRule || inherentlyLow) && explicitBoost === 0) {
    const messageKey = demotedByRule
      ? 'priority.reason.categoryDemoted'
      : 'priority.reason.promotion'
    return {
      score: BANDS.promotion_penalty.base,
      importance: 'low',
      topTier: 'promotion_penalty',
      reasons: [
        {
          tier: 'promotion_penalty',
          messageKey,
          values: { category: candidate.category },
          contribution: 0,
        },
      ],
      muted: false,
    }
  }

  const tierScores: Array<{ tier: PriorityTier; score: number }> = []

  if (explicitBoost > 0) {
    tierScores.push({ tier: 'explicit_rule', score: clampToBand('explicit_rule', explicitBoost) })
  }

  // ── Tier 2 · security ─────────────────────────────────────────────────────
  if (looksLikeSecurity(candidate)) {
    tierScores.push({ tier: 'security', score: clampToBand('security', 1) })
    reasons.push({ tier: 'security', messageKey: 'priority.reason.security', contribution: 0 })
  }

  // ── Tier 3 · hard deadline ────────────────────────────────────────────────
  if (candidate.deadline) {
    const due = new Date(candidate.deadline)
    if (!Number.isNaN(due.getTime())) {
      const urgency = deadlineUrgency(due, context.now)
      tierScores.push({ tier: 'deadline', score: clampToBand('deadline', urgency) })
      const hoursLeft = Math.round((due.getTime() - context.now.getTime()) / HOUR_MS)
      reasons.push({
        tier: 'deadline',
        messageKey: hoursLeft < 0 ? 'priority.reason.deadlinePassed' : 'priority.reason.deadline',
        values: { hours: Math.abs(hoursLeft) },
        contribution: 0,
      })
    }
  }

  // ── Tier 4 · VIP ──────────────────────────────────────────────────────────
  if (sender && context.vipEmails.has(sender)) {
    tierScores.push({ tier: 'vip', score: clampToBand('vip', 1) })
    reasons.push({
      tier: 'vip',
      messageKey: 'priority.reason.vip',
      values: { sender: candidate.senderName ?? sender },
      contribution: 0,
    })
  }

  // ── Tier 5 · awaiting the user's reply ────────────────────────────────────
  if (candidate.awaitingUserReply || candidate.category === 'waiting_for_user') {
    const ageHours = (context.now.getTime() - new Date(candidate.receivedAt).getTime()) / HOUR_MS
    // Older unanswered asks climb within the band, saturating after 3 days.
    const fraction = Math.min(1, Math.max(0, ageHours) / 72)
    tierScores.push({ tier: 'awaiting_reply', score: clampToBand('awaiting_reply', fraction) })
    reasons.push({
      tier: 'awaiting_reply',
      messageKey: 'priority.reason.awaitingReply',
      contribution: 0,
    })
  }

  // ── Tier 6 · the user's own commitment ────────────────────────────────────
  if (candidate.hasUserCommitment) {
    tierScores.push({ tier: 'commitment', score: clampToBand('commitment', 1) })
    reasons.push({ tier: 'commitment', messageKey: 'priority.reason.commitment', contribution: 0 })
  }

  // ── Tier 7 · relevance to an upcoming meeting ─────────────────────────────
  if (candidate.relatedMeetingWithinHours != null && candidate.relatedMeetingWithinHours >= 0) {
    // Sooner meeting → more relevant. Beyond 48h the link stops mattering.
    const fraction = Math.max(0, 1 - candidate.relatedMeetingWithinHours / 48)
    if (fraction > 0) {
      tierScores.push({
        tier: 'meeting_relevance',
        score: clampToBand('meeting_relevance', fraction),
      })
      reasons.push({
        tier: 'meeting_relevance',
        messageKey: 'priority.reason.meetingRelevance',
        values: { hours: Math.round(candidate.relatedMeetingWithinHours) },
        contribution: 0,
      })
    }
  }

  // ── Tier 8 · learned preference ───────────────────────────────────────────
  if (context.useLearnedPreferences) {
    let learnedStrength = 0
    for (const pref of context.learned) {
      if (!pref.enabled) continue
      const matches =
        (pref.kind === 'sender_always_important' && normaliseEmail(pref.matchValue) === sender) ||
        (pref.kind === 'domain_always_important' &&
          senderDomain &&
          normaliseEmail(pref.matchValue).replace(/^@/, '') === senderDomain) ||
        (pref.kind === 'keyword_high_priority' &&
          pref.matchValue.trim() !== '' &&
          haystack.includes(pref.matchValue.trim().toLowerCase()))
      if (matches && pref.strength > learnedStrength) learnedStrength = pref.strength
    }
    if (learnedStrength > 0) {
      tierScores.push({ tier: 'learned', score: clampToBand('learned', learnedStrength) })
      reasons.push({ tier: 'learned', messageKey: 'priority.reason.learned', contribution: 0 })
    }
  }

  // ── Tier 9 · the model's own read ─────────────────────────────────────────
  // Weighted by confidence so a hedged classification cannot outrank a
  // confident one, and never able to reach the tier above it.
  const importanceFraction = 1 - IMPORTANCE_RANK[candidate.aiImportance] / 3
  const aiFraction = importanceFraction * Math.max(0.1, Math.min(1, candidate.aiConfidence))
  tierScores.push({ tier: 'ai_importance', score: clampToBand('ai_importance', aiFraction) })
  if (candidate.aiImportance === 'critical' || candidate.aiImportance === 'high') {
    reasons.push({
      tier: 'ai_importance',
      messageKey: 'priority.reason.aiImportance',
      values: { importance: candidate.aiImportance },
      contribution: 0,
    })
  }

  const winner = tierScores.reduce(
    (best, cur) => (cur.score > best.score ? cur : best),
    tierScores[0] ?? { tier: 'ai_importance' as PriorityTier, score: BANDS.ai_importance.base },
  )

  // Lower tiers still break ties between two items that fired the same top
  // tier, but they are scaled far below one band so they cannot cross it.
  const tieBreak =
    tierScores
      .filter((t) => t.tier !== winner.tier)
      .reduce((sum, t) => sum + (t.score % 1000) / 1000, 0) / 20

  const score = Number((winner.score + tieBreak).toFixed(4))

  for (const reason of reasons) {
    reason.contribution = tierScores.find((t) => t.tier === reason.tier)?.score ?? 0
  }

  return {
    score,
    importance: importanceFromScore(score, candidate.aiImportance),
    topTier: winner.tier,
    reasons: reasons.sort((a, b) => b.contribution - a.contribution),
    muted: false,
  }
}

/**
 * Effective importance. The score decides, except that the model is never
 * allowed to *raise* importance above what its own tier can reach — only the
 * user-driven tiers promote an item to `critical`.
 */
export function importanceFromScore(score: number, aiImportance: Importance): Importance {
  if (score >= BANDS.vip.base) return 'critical'
  if (score >= BANDS.meeting_relevance.base) return 'high'
  if (score >= BANDS.ai_importance.base) {
    return aiImportance === 'critical' ? 'high' : aiImportance
  }
  return 'low'
}

/** Sort helper: highest priority first, newest first on a tie. */
export function comparePriority(
  a: { priorityScore: number; receivedAt: string },
  b: { priorityScore: number; receivedAt: string },
): number {
  if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore
  return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
}

export const PRIORITY_BANDS = BANDS
