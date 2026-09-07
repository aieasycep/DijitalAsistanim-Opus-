import { describe, expect, it } from 'vitest'
import { extractDates, verifyDateAgainstSource } from './date-extraction.ts'

/**
 * The "no invented dates" rule, in code.
 *
 * The model may propose a deadline; nothing is persisted until this extractor
 * finds that instant actually written in the source. Two failure modes matter
 * and both are worse than having no deadline: reading a date out of a vague
 * phrase, and confirming a date the sender never gave.
 */

const IST = 'Europe/Istanbul'
const now = new Date('2026-09-07T09:00:00.000Z') // Monday, 12:00 in Istanbul

const localOf = (iso: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date(iso))
    .replace(', ', ' ')

const firstLocal = (text: string): string | null => {
  const found = extractDates(text, now, IST)
  return found[0] ? localOf(found[0].at) : null
}

describe('explicit dates', () => {
  it('reads an ISO date', () => {
    expect(firstLocal('Teslim 2026-09-12 tarihinde.')).toBe('2026-09-12 17:00')
  })

  it('reads a Turkish day-first numeric date', () => {
    expect(firstLocal('12.09.2026 tarihine kadar bekliyoruz.')).toBe('2026-09-12 17:00')
    expect(firstLocal('12/09/2026 son gün.')).toBe('2026-09-12 17:00')
  })

  it('reads a two-digit year as this century', () => {
    expect(firstLocal('12.09.26 tarihinde.')).toBe('2026-09-12 17:00')
  })

  it('attaches a time written after the date', () => {
    expect(firstLocal('12.09.2026 saat 14:30 buluşalım.')).toBe('2026-09-12 14:30')
    expect(firstLocal('2026-09-12 09:15 toplantı.')).toBe('2026-09-12 09:15')
  })

  it('reads a Turkish named month', () => {
    expect(firstLocal('12 Eylül 2026 günü sunum var.')).toBe('2026-09-12 17:00')
    expect(firstLocal('3 Ekim saat 10:00.')).toBe('2026-10-03 10:00')
  })

  it('reads an English named month', () => {
    expect(firstLocal('Due 12 September 2026.')).toBe('2026-09-12 17:00')
  })

  it('rolls a bare named month forward when the day has passed', () => {
    // "3 Eylül" on 7 September means next year, not four days ago.
    expect(firstLocal('3 Eylül tarihinde.')).toBe('2027-09-03 17:00')
    expect(firstLocal('12 Eylül tarihinde.')).toBe('2026-09-12 17:00')
  })

  it('ignores an impossible date rather than clamping it into a real one', () => {
    expect(extractDates('32.13.2026 tarihinde.', now, IST)).toEqual([])
  })
})

describe('vague language', () => {
  it.each([
    'Yakında dönüş yaparım.',
    'En kısa sürede ilgileneceğim.',
    'Müsait olduğunuzda konuşalım.',
    'Bu aralar yoğunum.',
    'ASAP please.',
    'Let me get back to you soon.',
    'İlerleyen günlerde bakarız.',
  ])('extracts nothing from %s', (text) => {
    expect(extractDates(text, now, IST)).toEqual([])
  })

  it('extracts nothing from a message with no date at all', () => {
    expect(extractDates('Merhaba, teklifi aldım. Teşekkürler.', now, IST)).toEqual([])
  })

  it('does not read a date out of a number that is not one', () => {
    // Money, version numbers and reference codes are not deadlines.
    expect(extractDates('Tutar 1.250 TL, referans 4567.', now, IST)).toEqual([])
  })
})

describe('verifyDateAgainstSource', () => {
  const source = 'Sunumu 12 Eylül 2026 saat 14:00’te yapacağız.'
  const proposed = extractDates(source, now, IST)[0]?.at ?? ''

  it('confirms a date that is written in the source', () => {
    const match = verifyDateAgainstSource(proposed, source, now, IST)
    expect(match).not.toBeNull()
    expect(match?.quote).toContain('12 Eylül')
  })

  it('rejects a date the source never mentions', () => {
    // The model hallucinating "next Tuesday" onto a message with one clear
    // date is the exact failure this guard exists for.
    const invented = new Date('2026-10-20T11:00:00.000Z').toISOString()
    expect(verifyDateAgainstSource(invented, source, now, IST)).toBeNull()
  })

  it('rejects any date when the source contains none', () => {
    const anything = new Date('2026-09-12T11:00:00.000Z').toISOString()
    expect(verifyDateAgainstSource(anything, 'Yakında dönerim.', now, IST)).toBeNull()
  })

  it('tolerates a same-day time difference but not a different day', () => {
    const sameDay = new Date('2026-09-12T06:00:00.000Z').toISOString()
    expect(verifyDateAgainstSource(sameDay, source, now, IST, 12 * 60)).not.toBeNull()

    const nextWeek = new Date('2026-09-19T11:00:00.000Z').toISOString()
    expect(verifyDateAgainstSource(nextWeek, source, now, IST, 12 * 60)).toBeNull()
  })

  it('rejects an unparseable proposal instead of throwing', () => {
    expect(verifyDateAgainstSource('sometime next week', source, now, IST)).toBeNull()
    expect(verifyDateAgainstSource('', source, now, IST)).toBeNull()
  })

  it('picks the closest of several dates in the source', () => {
    const many = '5 Ekim 2026 ön görüşme, 12 Ekim 2026 sunum, 20 Ekim 2026 karar.'
    const target = extractDates(many, now, IST)[1]?.at ?? ''
    expect(verifyDateAgainstSource(target, many, now, IST, 60)?.quote).toContain('12 Ekim')
  })
})

describe('daylight saving', () => {
  it('resolves a wall-clock time to the right instant on both sides of a change', () => {
    // Istanbul has no DST, so a European zone is used: 09:00 local is 07:00Z
    // in summer and 08:00Z in winter. Getting this wrong moves every deadline
    // by an hour for half the year.
    const summer = extractDates('12.07.2026 saat 09:00', now, 'Europe/Berlin')[0]
    const winter = extractDates('12.12.2026 saat 09:00', now, 'Europe/Berlin')[0]
    expect(summer?.at).toBe('2026-07-12T07:00:00.000Z')
    expect(winter?.at).toBe('2026-12-12T08:00:00.000Z')
  })
})
