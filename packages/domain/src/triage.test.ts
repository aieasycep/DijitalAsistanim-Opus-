import { describe, expect, it } from 'vitest'
import { fingerprintInput, triage, type TriageInput } from './triage.ts'
import { DAY_MS } from './clock.ts'
import {
  DEFAULT_RETENTION,
  RETENTION_DAYS,
  RETENTION_SWEEP,
  describeRetentionChange,
  isExpiredUnderRetention,
  retentionCutoff,
} from './retention.ts'
import { estimateTimeSaved, TIME_SAVED_COEFFICIENTS } from './time-saved.ts'
import { RETENTION_WINDOWS } from './enums.ts'

/**
 * Triage decides what is worth spending a model call on. Getting it wrong is
 * expensive in two directions: a missed important thread, or a bill for
 * classifying newsletters. The stage-1 filters must never swallow something
 * the user explicitly asked to see.
 */

const input = (over: Partial<TriageInput> = {}): TriageInput => ({
  fromEmail: 'ayse@musteri.com',
  fromName: 'Ayşe Yılmaz',
  subject: 'Teklif hakkında',
  snippet: 'Merhaba, teklifi inceleyebilir misiniz?',
  providerLabels: [],
  headers: {},
  isDirectlyAddressed: true,
  vipEmails: new Set<string>(),
  ruleImportantSenders: new Set<string>(),
  ruleImportantDomains: new Set<string>(),
  ruleKeywords: [],
  ...over,
})

describe('stage 1 — bulk filters', () => {
  it('drops a provider-labelled promotion without a model call', () => {
    const decision = triage(input({ providerLabels: ['CATEGORY_PROMOTIONS'] }))
    expect(decision).toMatchObject({ stage: 1, sendToModel: false, category: 'promotion' })
  })

  it('drops bulk mail identified by its Precedence header', () => {
    for (const value of ['bulk', 'list', 'junk']) {
      expect(triage(input({ headers: { precedence: value } })).sendToModel).toBe(false)
    }
  })

  it('drops a newsletter that does not address the user directly', () => {
    const decision = triage(
      input({ headers: { 'list-unsubscribe': '<mailto:x@y.z>' }, isDirectlyAddressed: false }),
    )
    expect(decision).toMatchObject({ stage: 1, sendToModel: false })
  })

  it('keeps a mailing-list message that does address the user directly', () => {
    // Plenty of real correspondence carries List-Unsubscribe.
    const decision = triage(
      input({ headers: { 'list-unsubscribe': '<mailto:x@y.z>' }, isDirectlyAddressed: true }),
    )
    expect(decision.sendToModel).toBe(true)
  })

  it('never drops mail from a VIP, whatever the labels say', () => {
    // The user said this person matters. A provider label does not overrule it.
    const decision = triage(
      input({
        providerLabels: ['CATEGORY_PROMOTIONS'],
        headers: { precedence: 'bulk', 'list-unsubscribe': '<mailto:x@y.z>' },
        vipEmails: new Set(['ayse@musteri.com']),
      }),
    )
    expect(decision.sendToModel).toBe(true)
  })

  it('never drops mail covered by an explicit sender, domain or keyword rule', () => {
    const labelled = { providerLabels: ['CATEGORY_PROMOTIONS'] }
    expect(
      triage(input({ ...labelled, ruleImportantSenders: new Set(['ayse@musteri.com']) }))
        .sendToModel,
    ).toBe(true)
    expect(
      triage(input({ ...labelled, ruleImportantDomains: new Set(['musteri.com']) })).sendToModel,
    ).toBe(true)
    expect(triage(input({ ...labelled, ruleKeywords: ['teklif'] })).sendToModel).toBe(true)
  })

  it('downgrades an automated sender but still reads a security notice from one', () => {
    const routine = triage(
      input({
        fromEmail: 'noreply@bank.com',
        subject: 'Bülten',
        snippet: 'Bu ayın haberleri',
        isDirectlyAddressed: false,
      }),
    )
    expect(routine.sendToModel).toBe(false)

    const security = triage(
      input({
        fromEmail: 'noreply@bank.com',
        subject: 'Güvenlik uyarısı',
        snippet: 'Hesabınıza yeni bir cihazdan giriş yapıldı.',
      }),
    )
    expect(security.sendToModel).toBe(true)
  })
})

describe('stage 2 — deterministic promotions', () => {
  it.each([
    ['security', { subject: 'Güvenlik uyarısı', snippet: 'şifrenizi değiştirin' }],
    ['deadline', { subject: 'Son tarih', snippet: 'son gün 12 Eylül' }],
    ['meeting', { subject: 'Toplantı daveti', snippet: 'yarın görüşelim' }],
    ['payment', { subject: 'Fatura', snippet: 'ödeme bekleniyor' }],
    ['travel', { subject: 'Uçuş bilgileriniz', snippet: 'check-in açıldı' }],
    ['shipment', { subject: 'Kargonuz yolda', snippet: 'takip numarası' }],
  ])('presumes the %s category from its own vocabulary', (category, over) => {
    const decision = triage(input(over))
    expect(decision.sendToModel).toBe(true)
    if (decision.sendToModel) expect(decision.presumedCategory).toBe(category)
  })

  it('ranks a security notice above every other presumption', () => {
    const decision = triage(
      input({ subject: 'Güvenlik uyarısı — fatura', snippet: 'ödeme ve şifre' }),
    )
    if (decision.sendToModel) expect(decision.presumedCategory).toBe('security')
  })
})

describe('stage 3 — the ambiguous rest', () => {
  it('sends a directly addressed human message to the model', () => {
    const decision = triage(input({ subject: 'Selam', snippet: 'Bir fikrim var.' }))
    expect(decision).toMatchObject({ stage: 3, sendToModel: true })
  })

  it('spends nothing on a message with no signal and no direct address', () => {
    const decision = triage(
      input({ subject: 'Duyuru', snippet: 'Genel bilgilendirme', isDirectlyAddressed: false }),
    )
    expect(decision).toMatchObject({ sendToModel: false, importance: 'low' })
  })

  it('always gives a reason for its decision', () => {
    for (const over of [{}, { providerLabels: ['SPAM'] }, { isDirectlyAddressed: false }]) {
      expect(triage(input(over)).reason).toMatch(/^[a-z_]+$/)
    }
  })
})

describe('fingerprintInput', () => {
  it('is stable for the same message', () => {
    const parts = { fromEmail: 'a@b.co', subject: 'Konu', bodyText: 'Gövde' }
    expect(fingerprintInput(parts)).toBe(fingerprintInput(parts))
  })

  it('ignores whitespace and case, which reformatting changes and meaning does not', () => {
    expect(
      fingerprintInput({ fromEmail: 'A@B.co', subject: ' Konu ', bodyText: 'Gövde\n\nmetni' }),
    ).toBe(fingerprintInput({ fromEmail: 'a@b.co', subject: 'Konu', bodyText: 'Gövde metni' }))
  })

  it('differs when any part differs', () => {
    const base = { fromEmail: 'a@b.co', subject: 'Konu', bodyText: 'Gövde' }
    expect(fingerprintInput({ ...base, subject: 'Başka' })).not.toBe(fingerprintInput(base))
    expect(fingerprintInput({ ...base, fromEmail: 'c@d.co' })).not.toBe(fingerprintInput(base))
    expect(fingerprintInput({ ...base, bodyText: 'Başka gövde' })).not.toBe(fingerprintInput(base))
  })
})

describe('retention', () => {
  const now = new Date('2026-09-07T12:00:00.000Z')

  it('defaults to 90 days', () => {
    expect(DEFAULT_RETENTION).toBe('90d')
    expect(RETENTION_DAYS[DEFAULT_RETENTION]).toBe(90)
  })

  it('defines a window for every option the settings screen offers', () => {
    for (const window of RETENTION_WINDOWS) {
      expect(window in RETENTION_DAYS).toBe(true)
    }
  })

  it('computes a cutoff, and none at all for "keep everything"', () => {
    expect(retentionCutoff('30d', now)?.toISOString()).toBe('2026-08-08T12:00:00.000Z')
    expect(retentionCutoff('forever', now)).toBeNull()
  })

  it('expires a record older than the window and keeps one inside it', () => {
    const old = new Date(now.getTime() - 100 * DAY_MS).toISOString()
    const recent = new Date(now.getTime() - 10 * DAY_MS).toISOString()
    expect(isExpiredUnderRetention(old, '90d', now)).toBe(true)
    expect(isExpiredUnderRetention(recent, '90d', now)).toBe(false)
  })

  it('never expires anything under "keep everything"', () => {
    const ancient = new Date(now.getTime() - 4000 * DAY_MS).toISOString()
    expect(isExpiredUnderRetention(ancient, 'forever', now)).toBe(false)
  })

  it('treats an unreadable timestamp as not expired rather than deleting it', () => {
    // Failing closed here means the sweep never deletes a row it cannot date.
    expect(isExpiredUnderRetention('not-a-date', '30d', now)).toBe(false)
  })

  it('sweeps only content tables, never the OAuth connection itself', () => {
    const tables = RETENTION_SWEEP.map((s) => s.table)
    expect(tables).toContain('email_messages')
    expect(tables).toContain('memory_chunks')
    expect(tables).not.toContain('oauth_credentials')
    expect(tables).not.toContain('connected_accounts')
    expect(tables).not.toContain('profiles')
  })

  it('keeps device notifications on a short fixed window regardless of the user setting', () => {
    const rule = RETENTION_SWEEP.find((s) => s.table === 'device_notifications')
    expect(rule?.fixedDays).toBe(30)
  })

  it('anonymises audit rows instead of deleting the record of what was done', () => {
    const rule = RETENTION_SWEEP.find((s) => s.table === 'audit_logs')
    expect(rule?.anonymizeColumns).toContain('entity_id')
    expect(rule?.fixedDays).toBeGreaterThan(365)
  })

  it('describes how much history a shorter window will remove', () => {
    expect(describeRetentionChange('90d', '30d', now)).toMatchObject({ daysRemoved: 60 })
    expect(describeRetentionChange('30d', '90d', now)).toMatchObject({ daysRemoved: 0 })
    expect(describeRetentionChange('forever', '30d', now).daysRemoved).toBeNull()
    expect(describeRetentionChange('30d', 'forever', now).daysRemoved).toBeNull()
  })
})

describe('estimateTimeSaved', () => {
  const empty = {
    emailsTriagedWithoutOpening: 0,
    threadsReadAsSummary: 0,
    draftsUsed: 0,
    meetingPrepsOpened: 0,
    followUpsSurfaced: 0,
    commitmentsCaptured: 0,
  }

  it('claims nothing when nothing happened', () => {
    const result = estimateTimeSaved(empty)
    expect(result.totalSeconds).toBe(0)
    expect(result.totalMinutes).toBe(0)
    expect(result.breakdown).toEqual([])
  })

  it('adds up the coefficients', () => {
    const result = estimateTimeSaved({ ...empty, emailsTriagedWithoutOpening: 10, draftsUsed: 2 })
    expect(result.totalSeconds).toBe(
      10 * TIME_SAVED_COEFFICIENTS.emailTriage + 2 * TIME_SAVED_COEFFICIENTS.draft,
    )
  })

  it('orders the breakdown by contribution so the headline reason comes first', () => {
    const result = estimateTimeSaved({
      ...empty,
      emailsTriagedWithoutOpening: 5,
      meetingPrepsOpened: 2,
    })
    expect(result.breakdown[0]?.key).toBe('meetingPrepsOpened')
    expect(result.breakdown).toHaveLength(2)
  })

  it('never reports a negative saving from a nonsensical count', () => {
    const result = estimateTimeSaved({ ...empty, draftsUsed: -5 })
    expect(result.totalSeconds).toBe(0)
  })

  it('keeps every coefficient plausible rather than flattering', () => {
    // A claim of "we saved you an hour per email" would be a lie the user can
    // check against their own morning.
    for (const seconds of Object.values(TIME_SAVED_COEFFICIENTS)) {
      expect(seconds).toBeGreaterThan(0)
      expect(seconds).toBeLessThanOrEqual(600)
    }
  })
})
