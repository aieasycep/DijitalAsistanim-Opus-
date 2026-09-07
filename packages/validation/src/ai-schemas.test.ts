import { describe, expect, it } from 'vitest'
import {
  assistantAnswerSchema,
  commitmentExtractionSchema,
  emailAnalysisSchema,
  LOW_CONFIDENCE_THRESHOLD,
  REJECT_CONFIDENCE_THRESHOLD,
  stripUnverifiedClaims,
  verifyQuotes,
  type EmailAnalysis,
} from './ai-schemas.ts'

/**
 * The model's output is untrusted input.
 *
 * The product rule is that the assistant never states a date, an amount or a
 * commitment that is not written in the source. The mechanism is a nullable
 * field paired with a verbatim quote: to invent a deadline the model must also
 * invent the sentence it came from, and that sentence will not be found. These
 * tests are that mechanism.
 */

const source = `Merhaba,

Teklifi inceledik. Revizyonu 12 Eylül 2026 tarihine kadar göndereceğim.
Sözleşmeyi de bu hafta içinde imzalayıp ileteceğiz.

İyi çalışmalar.`

const analysis = (over: Partial<EmailAnalysis> = {}): EmailAnalysis =>
  emailAnalysisSchema.parse({
    summary: 'Revizyon 12 Eylül’e kadar gönderilecek.',
    importance: 'high',
    category: 'action_required',
    reasonImportant: 'Bir tarih verilmiş.',
    requiresUserAction: true,
    deadline: '2026-09-12T14:00:00.000Z',
    deadlineQuote: 'Revizyonu 12 Eylül 2026 tarihine kadar göndereceğim.',
    people: [],
    commitments: [],
    followUp: { expectsReply: true, awaiting: 'other' },
    suggestedActions: [],
    confidence: 0.8,
    ...over,
  })

describe('emailAnalysisSchema', () => {
  it('accepts a well-formed analysis', () => {
    expect(emailAnalysisSchema.safeParse(analysis()).success).toBe(true)
  })

  it('rejects a category or importance outside the enum', () => {
    expect(emailAnalysisSchema.safeParse({ ...analysis(), category: 'urgent!' }).success).toBe(
      false,
    )
    expect(emailAnalysisSchema.safeParse({ ...analysis(), importance: 'very' }).success).toBe(false)
  })

  it('rejects a deadline that is not a real instant', () => {
    // A model returning "next Tuesday" in a date field must not be persisted.
    expect(emailAnalysisSchema.safeParse({ ...analysis(), deadline: 'next Tuesday' }).success).toBe(
      false,
    )
    expect(emailAnalysisSchema.safeParse({ ...analysis(), deadline: '2026-13-45' }).success).toBe(
      false,
    )
  })

  it('accepts an explicit null deadline — the honest answer when there is none', () => {
    const parsed = emailAnalysisSchema.parse({
      ...analysis(),
      deadline: null,
      deadlineQuote: null,
    })
    expect(parsed.deadline).toBeNull()
  })

  it('rejects a confidence outside 0..1', () => {
    for (const confidence of [-0.1, 1.5, Number.NaN]) {
      expect(emailAnalysisSchema.safeParse({ ...analysis(), confidence }).success).toBe(false)
    }
  })

  it('caps the collections so one response cannot flood the database', () => {
    const tooMany = Array.from({ length: 50 }, (_, i) => ({
      name: `Kişi ${i}`,
      email: null,
      role: 'mentioned' as const,
    }))
    expect(emailAnalysisSchema.safeParse({ ...analysis(), people: tooMany }).success).toBe(false)
  })

  it('defaults the optional collections instead of leaving them undefined', () => {
    const bare = emailAnalysisSchema.parse({
      summary: 'Kısa özet.',
      importance: 'normal',
      category: 'information',
      reasonImportant: null,
      requiresUserAction: false,
      deadline: null,
      deadlineQuote: null,
      followUp: null,
      confidence: 0.5,
    })
    expect(bare.people).toEqual([])
    expect(bare.commitments).toEqual([])
    expect(bare.suggestedActions).toEqual([])
  })
})

describe('commitmentExtractionSchema', () => {
  it('requires a source quote for every promise', () => {
    const withoutQuote = {
      text: 'Sözleşmeyi imzalayıp iletecek',
      direction: 'other_owes',
      personName: 'Ayşe',
      dueAt: null,
      confidence: 0.7,
    }
    expect(commitmentExtractionSchema.safeParse(withoutQuote).success).toBe(false)
  })

  it('accepts a promise with no date, which is the common case', () => {
    expect(
      commitmentExtractionSchema.safeParse({
        text: 'Sözleşmeyi imzalayıp iletecek',
        direction: 'other_owes',
        personName: 'Ayşe',
        dueAt: null,
        sourceQuote: 'Sözleşmeyi de bu hafta içinde imzalayıp ileteceğiz.',
        confidence: 0.7,
      }).success,
    ).toBe(true)
  })
})

describe('verifyQuotes', () => {
  it('finds a quote that is really in the source', () => {
    expect(
      verifyQuotes(source, [
        { field: 'deadline', quote: 'Revizyonu 12 Eylül 2026 tarihine kadar göndereceğim.' },
      ]),
    ).toEqual([])
  })

  it('reports a quote the source does not contain', () => {
    expect(
      verifyQuotes(source, [{ field: 'deadline', quote: 'Ödemeyi 5 Ekim’de yapacağım.' }]),
    ).toEqual([{ field: 'deadline', quote: 'Ödemeyi 5 Ekim’de yapacağım.' }])
  })

  it('tolerates reformatting: line breaks, doubled spaces and curly quotes', () => {
    expect(
      verifyQuotes(source, [
        { field: 'a', quote: 'Revizyonu  12 Eylül 2026\ntarihine kadar göndereceğim.' },
      ]),
    ).toEqual([])
  })

  it('is case-insensitive in Turkish, where the dotless ı makes that non-trivial', () => {
    expect(verifyQuotes('İYİ ÇALIŞMALAR', [{ field: 'a', quote: 'iyi çalışmalar' }])).toEqual([])
  })

  it('ignores a null or trivially short quote rather than failing on it', () => {
    expect(verifyQuotes(source, [{ field: 'a', quote: null }])).toEqual([])
    expect(verifyQuotes(source, [{ field: 'a', quote: undefined }])).toEqual([])
    expect(verifyQuotes(source, [{ field: 'a', quote: 'ok' }])).toEqual([])
  })
})

describe('stripUnverifiedClaims', () => {
  it('keeps a deadline whose quote is in the source', () => {
    const { analysis: kept, stripped } = stripUnverifiedClaims(analysis(), source)
    expect(kept.deadline).not.toBeNull()
    expect(stripped).toEqual([])
  })

  it('drops a deadline whose quote is invented', () => {
    const { analysis: cleaned, stripped } = stripUnverifiedClaims(
      analysis({ deadlineQuote: 'Ödemeyi 5 Ekim’de yapacağım.' }),
      source,
    )
    expect(cleaned.deadline).toBeNull()
    expect(cleaned.deadlineQuote).toBeNull()
    expect(stripped).toContain('deadline')
  })

  it('drops a deadline that arrives with no quote at all', () => {
    const { analysis: cleaned } = stripUnverifiedClaims(analysis({ deadlineQuote: null }), source)
    expect(cleaned.deadline).toBeNull()
  })

  it('keeps the summary — only the unverifiable claim is removed', () => {
    // Rejecting the whole analysis over one bad field would lose the useful
    // part of a mostly-correct response.
    const original = analysis({ deadlineQuote: 'uydurma bir cümle burada' })
    const { analysis: cleaned } = stripUnverifiedClaims(original, source)
    expect(cleaned.summary).toBe(original.summary)
    expect(cleaned.importance).toBe(original.importance)
  })

  it('drops a commitment whose quote is invented and keeps the grounded one', () => {
    const withCommitments = analysis({
      commitments: [
        {
          text: 'Sözleşmeyi iletecek',
          direction: 'other_owes',
          personName: null,
          dueAt: null,
          sourceQuote: 'Sözleşmeyi de bu hafta içinde imzalayıp ileteceğiz.',
          confidence: 0.8,
        },
        {
          text: 'Fatura kesecek',
          direction: 'other_owes',
          personName: null,
          dueAt: null,
          sourceQuote: 'Faturayı yarın keseceğim.',
          confidence: 0.8,
        },
      ],
    })
    const { analysis: cleaned, stripped } = stripUnverifiedClaims(withCommitments, source)
    expect(cleaned.commitments).toHaveLength(1)
    expect(cleaned.commitments[0]?.text).toBe('Sözleşmeyi iletecek')
    expect(stripped.some((s) => s.startsWith('commitment:'))).toBe(true)
  })

  it('does not mutate the analysis it was given', () => {
    const original = analysis({ deadlineQuote: 'uydurma' })
    stripUnverifiedClaims(original, source)
    expect(original.deadline).not.toBeNull()
  })
})

describe('confidence thresholds', () => {
  it('orders the two thresholds so "hedge" is above "drop"', () => {
    expect(REJECT_CONFIDENCE_THRESHOLD).toBeLessThan(LOW_CONFIDENCE_THRESHOLD)
    expect(REJECT_CONFIDENCE_THRESHOLD).toBeGreaterThan(0)
    expect(LOW_CONFIDENCE_THRESHOLD).toBeLessThan(1)
  })
})

describe('assistantAnswerSchema', () => {
  const answer = {
    answer: 'Yarın 14:00’te Ayşe ile toplantın var.',
    citations: [{ sourceType: 'calendar_event', sourceId: 'evt-1', label: 'Ayşe ile toplantı' }],
    proposedAction: null,
    grounded: true,
    confidence: 0.9,
  }

  it('accepts a grounded answer with citations', () => {
    expect(assistantAnswerSchema.safeParse(answer).success).toBe(true)
  })

  it('carries a write as a *proposal*, never as something already done', () => {
    const parsed = assistantAnswerSchema.parse({
      ...answer,
      proposedAction: {
        type: 'email_send',
        what: 'Ayşe’ye yanıt taslağı',
        why: 'Sorusu yanıtsız kalmış.',
        draft: { subject: 'Re: Teklif', body: '…' },
      },
    })
    expect(parsed.proposedAction?.type).toBe('email_send')
    // Nothing in the shape can express "sent" — only "proposed".
    expect(Object.keys(parsed.proposedAction ?? {}).sort()).toEqual([
      'draft',
      'type',
      'what',
      'why',
    ])
  })

  it('rejects a proposed action type that is not one of the six approvable writes', () => {
    expect(
      assistantAnswerSchema.safeParse({
        ...answer,
        proposedAction: { type: 'delete_everything', what: 'x', why: 'y', draft: {} },
      }).success,
    ).toBe(false)
  })

  it('rejects an empty answer', () => {
    expect(assistantAnswerSchema.safeParse({ ...answer, answer: '' }).success).toBe(false)
  })

  it('lets the model say it could not ground the answer', () => {
    const parsed = assistantAnswerSchema.parse({
      ...answer,
      answer: 'Kaynakta kesinleşmiyor.',
      citations: [],
      grounded: false,
      confidence: 0.2,
    })
    expect(parsed.grounded).toBe(false)
  })
})
