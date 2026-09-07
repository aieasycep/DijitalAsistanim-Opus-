import { describe, expect, it } from 'vitest'
import {
  comparePriority,
  deadlineUrgency,
  evaluatePriority,
  importanceFromScore,
  PRIORITY_BANDS,
  type PriorityCandidate,
  type PriorityContext,
} from './priority.ts'

/**
 * The ranking that decides what the user sees first.
 *
 * The design is a strict tier order, not a weighted sum: an explicit rule the
 * user wrote must always beat the model's opinion, however confident the model
 * is. The tests below are mostly about that ordering holding under pressure.
 */

const now = new Date('2026-09-07T09:00:00.000Z')

const candidate = (over: Partial<PriorityCandidate> = {}): PriorityCandidate => ({
  senderEmail: 'ayse@musteri.com',
  senderName: 'Ayşe Yılmaz',
  subject: 'Teklif hakkında',
  snippet: 'Merhaba, ekteki teklifi inceleyebilir misiniz?',
  category: 'information',
  aiImportance: 'normal',
  aiConfidence: 0.6,
  requiresUserAction: false,
  deadline: null,
  awaitingUserReply: false,
  hasUserCommitment: false,
  relatedMeetingWithinHours: null,
  receivedAt: new Date(now.getTime() - 3_600_000).toISOString(),
  ...over,
})

const context = (over: Partial<PriorityContext> = {}): PriorityContext => ({
  now,
  rules: [],
  learned: [],
  vipEmails: new Set<string>(),
  useLearnedPreferences: true,
  ...over,
})

const evaluate = (c: Partial<PriorityCandidate>, ctx: Partial<PriorityContext> = {}) =>
  evaluatePriority(candidate(c), context(ctx))

describe('mute rules', () => {
  it('silences a muted sender completely', () => {
    const result = evaluate(
      {},
      { rules: [{ kind: 'mute_sender', matchValue: 'ayse@musteri.com', enabled: true }] },
    )
    expect(result.muted).toBe(true)
    expect(result.score).toBe(0)
    expect(result.importance).toBe('low')
  })

  it('mutes regardless of case or surrounding whitespace in the rule', () => {
    const result = evaluate(
      {},
      { rules: [{ kind: 'mute_sender', matchValue: '  AYSE@Musteri.COM ', enabled: true }] },
    )
    expect(result.muted).toBe(true)
  })

  it('beats every other signal, including a deadline today', () => {
    // "I asked not to see this" is not a preference to be weighed.
    const result = evaluate(
      {
        deadline: new Date(now.getTime() + 3_600_000).toISOString(),
        awaitingUserReply: true,
        aiImportance: 'critical',
        aiConfidence: 1,
      },
      {
        vipEmails: new Set(['ayse@musteri.com']),
        rules: [{ kind: 'mute_sender', matchValue: 'ayse@musteri.com', enabled: true }],
      },
    )
    expect(result.muted).toBe(true)
    expect(result.score).toBe(0)
  })

  it('ignores a disabled rule', () => {
    const result = evaluate(
      {},
      { rules: [{ kind: 'mute_sender', matchValue: 'ayse@musteri.com', enabled: false }] },
    )
    expect(result.muted).toBe(false)
  })
})

describe('tier ordering', () => {
  const scoreOf = (c: Partial<PriorityCandidate>, ctx: Partial<PriorityContext> = {}): number =>
    evaluate(c, ctx).score

  it('puts an explicit rule above everything the model can produce', () => {
    const ruled = scoreOf(
      { aiImportance: 'low', aiConfidence: 0.1 },
      {
        rules: [{ kind: 'sender_always_important', matchValue: 'ayse@musteri.com', enabled: true }],
      },
    )
    const modelSure = scoreOf({ aiImportance: 'critical', aiConfidence: 1 })
    expect(ruled).toBeGreaterThan(modelSure)
    expect(ruled).toBeGreaterThanOrEqual(PRIORITY_BANDS.explicit_rule.base)
  })

  it('puts a VIP above a thread the model merely finds important', () => {
    const vip = scoreOf({ aiImportance: 'low' }, { vipEmails: new Set(['ayse@musteri.com']) })
    expect(vip).toBeGreaterThan(scoreOf({ aiImportance: 'critical', aiConfidence: 1 }))
  })

  it('puts an imminent deadline above a VIP with nothing pending', () => {
    const deadline = scoreOf({ deadline: new Date(now.getTime() + 2 * 3_600_000).toISOString() })
    const vip = scoreOf({}, { vipEmails: new Set(['ayse@musteri.com']) })
    expect(deadline).toBeGreaterThan(vip)
  })

  it('ranks a security notice above a deadline', () => {
    const security = scoreOf({
      subject: 'Güvenlik uyarısı: hesabınıza yeni bir cihazdan giriş yapıldı',
      snippet: 'Bu siz değilseniz şifrenizi değiştirin.',
      category: 'security',
    })
    expect(security).toBeGreaterThan(
      scoreOf({ deadline: new Date(now.getTime() + 3_600_000).toISOString() }),
    )
  })

  it('demotes a promotion below an ordinary message', () => {
    const promo = scoreOf({ category: 'promotion', subject: 'Sadece bugün %50 indirim' })
    expect(promo).toBe(PRIORITY_BANDS.promotion_penalty.base)
    expect(promo).toBeLessThan(scoreOf({}))
  })

  it('keeps each tier inside its own band so no tier can reach the next', () => {
    const tiers = Object.entries(PRIORITY_BANDS)
    for (const [, band] of tiers) {
      expect(band.base + band.span).toBeLessThanOrEqual(10_000)
    }
    // Adjacent bands never overlap.
    const sorted = tiers.map(([, b]) => b).sort((a, b) => a.base - b.base)
    for (let i = 1; i < sorted.length; i++) {
      const lower = sorted[i - 1]
      const upper = sorted[i]
      if (!lower || !upper) continue
      expect(lower.base + lower.span).toBeLessThanOrEqual(upper.base)
    }
  })
})

describe('reasons', () => {
  it('explains the ranking with i18n keys, never a translated sentence', () => {
    const result = evaluate({}, { vipEmails: new Set(['ayse@musteri.com']) })
    expect(result.reasons.length).toBeGreaterThan(0)
    for (const reason of result.reasons) {
      expect(reason.messageKey).toMatch(/^[a-z][a-zA-Z0-9.]*$/)
      expect(reason.messageKey.startsWith('priority.')).toBe(true)
    }
  })

  it('names the top tier that drove the score', () => {
    expect(evaluate({}, { vipEmails: new Set(['ayse@musteri.com']) }).topTier).toBe('vip')
    expect(evaluate({ awaitingUserReply: true }).topTier).toBe('awaiting_reply')
  })
})

describe('learned preferences', () => {
  const learned = [
    {
      kind: 'sender_always_important' as const,
      matchValue: 'ayse@musteri.com',
      strength: 0.9,
      enabled: true,
    },
  ]

  it('lifts a thread when learning is on', () => {
    expect(evaluate({}, { learned }).score).toBeGreaterThan(evaluate({}).score)
  })

  it('is ignored entirely when the user has switched learning off', () => {
    // The personalisation toggle has to actually mean something.
    expect(evaluate({}, { learned, useLearnedPreferences: false }).score).toBe(evaluate({}).score)
  })

  it('never outranks a rule the user wrote themselves', () => {
    const learnedScore = evaluate({}, { learned }).score
    const ruledScore = evaluate(
      {},
      {
        rules: [{ kind: 'sender_always_important', matchValue: 'ayse@musteri.com', enabled: true }],
      },
    ).score
    expect(ruledScore).toBeGreaterThan(learnedScore)
  })
})

describe('deadlineUrgency', () => {
  it('rises as the deadline approaches and peaks once it is passed', () => {
    const inAWeek = deadlineUrgency(new Date(now.getTime() + 7 * 86_400_000), now)
    const tomorrow = deadlineUrgency(new Date(now.getTime() + 86_400_000), now)
    const inAnHour = deadlineUrgency(new Date(now.getTime() + 3_600_000), now)
    const passed = deadlineUrgency(new Date(now.getTime() - 3_600_000), now)

    expect(inAWeek).toBeLessThan(tomorrow)
    expect(tomorrow).toBeLessThan(inAnHour)
    expect(passed).toBeGreaterThanOrEqual(inAnHour)
  })

  it('stays within 0..1', () => {
    for (const offset of [-1e10, -1, 0, 3_600_000, 1e10]) {
      const value = deadlineUrgency(new Date(now.getTime() + offset), now)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })
})

describe('importance and sorting', () => {
  it('maps a score onto an importance band', () => {
    expect(importanceFromScore(9500, 'low')).toBe('critical')
    expect(importanceFromScore(0, 'critical')).toBe('low')
  })

  it('sorts higher scores first, and newest first on a tie', () => {
    const rows = [
      { id: 'old-low', priorityScore: 100, receivedAt: '2026-09-01T09:00:00.000Z' },
      { id: 'new-low', priorityScore: 100, receivedAt: '2026-09-07T08:00:00.000Z' },
      { id: 'high', priorityScore: 9000, receivedAt: '2026-08-01T09:00:00.000Z' },
    ]
    expect([...rows].sort(comparePriority).map((r) => r.id)).toEqual(['high', 'new-low', 'old-low'])
  })

  it('is a well-behaved comparator on identical rows', () => {
    const row = { priorityScore: 100, receivedAt: '2026-09-01T09:00:00.000Z' }
    expect(comparePriority(row, row)).toBe(0)
  })
})
