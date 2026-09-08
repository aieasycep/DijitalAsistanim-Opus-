import { fixedClock } from '@da/domain'
import { describe, expect, it } from 'vitest'
import { istanbulDate, istanbulToday } from '../../../lib/format.ts'
import { MAX_RANGE_DAYS, resolveRange } from '../date-range.ts'

/**
 * The time window.
 *
 * These cases exist because the window is the one thing on a dashboard nobody
 * checks: an operator reads "son 24 saat" and believes it. So the arithmetic is
 * pinned against a frozen clock, in Istanbul, including the four ways a URL can
 * be wrong — and the requirement that every one of them still produces a
 * usable window rather than an empty table that looks like good news.
 */

// A Wednesday, 09:30 Istanbul (06:30 UTC).
const clock = fixedClock('2026-09-09T06:30:00.000Z')

describe('presets', () => {
  it('rolls with the clock rather than freezing an instant', () => {
    const range = resolveRange({ range: '24h' }, { clock })
    expect(range.selection).toBe('24h')
    expect(range.toIso).toBe('2026-09-09T06:30:00.000Z')
    expect(range.fromIso).toBe('2026-09-08T06:30:00.000Z')
  })

  it('measures 7, 30 and 90 days from now', () => {
    expect(resolveRange({ range: '7d' }, { clock }).fromIso).toBe('2026-09-02T06:30:00.000Z')
    expect(resolveRange({ range: '30d' }, { clock }).fromIso).toBe('2026-08-10T06:30:00.000Z')
    expect(resolveRange({ range: '90d' }, { clock }).fromIso).toBe('2026-06-11T06:30:00.000Z')
  })

  it('falls back rather than failing on an unknown preset', () => {
    expect(resolveRange({ range: 'yesterday' }, { clock }).selection).toBe('7d')
    expect(resolveRange({}, { clock, fallback: '30d' }).selection).toBe('30d')
  })
})

describe('custom ranges', () => {
  it('spans whole Istanbul days, half-open', () => {
    const range = resolveRange({ range: 'custom', from: '2026-09-01', to: '2026-09-07' }, { clock })
    expect(range.selection).toBe('custom')
    // 00:00 Istanbul on the 1st is 21:00 UTC on 31 August.
    expect(range.fromIso).toBe('2026-08-31T21:00:00.000Z')
    // Exclusive end: 00:00 Istanbul on the 8th.
    expect(range.toIso).toBe('2026-09-07T21:00:00.000Z')
    // And the inputs read back as the days the operator typed.
    expect(range.fromDate).toBe('2026-09-01')
    expect(range.toDate).toBe('2026-09-07')
    expect(range.correction).toBeNull()
  })

  it('includes the whole of a single-day range', () => {
    const range = resolveRange({ range: 'custom', from: '2026-09-09', to: '2026-09-09' }, { clock })
    expect(range.fromDate).toBe('2026-09-09')
    expect(range.toDate).toBe('2026-09-09')
    expect(new Date(range.toIso).getTime() - new Date(range.fromIso).getTime()).toBe(86_400_000)
  })

  it('swaps a range typed backwards instead of showing nothing', () => {
    const range = resolveRange({ range: 'custom', from: '2026-09-07', to: '2026-09-01' }, { clock })
    expect(range.correction).toBe('reversed')
    expect(range.fromDate).toBe('2026-09-01')
    expect(range.toDate).toBe('2026-09-07')
  })

  it('clamps an end date in the future to today', () => {
    const range = resolveRange({ range: 'custom', from: '2026-09-01', to: '2099-01-01' }, { clock })
    expect(range.correction).toBe('future')
    expect(range.toDate).toBe('2026-09-09')
  })

  it('caps an absurdly long window', () => {
    const range = resolveRange({ range: 'custom', from: '1990-01-01', to: '2026-09-09' }, { clock })
    expect(range.correction).toBe('too_long')
    const days = (new Date(range.toIso).getTime() - new Date(range.fromIso).getTime()) / 86_400_000
    expect(days).toBeCloseTo(MAX_RANGE_DAYS, 5)
  })

  it('falls back on a date that does not exist', () => {
    const range = resolveRange({ range: 'custom', from: '2026-02-30', to: '2026-03-01' }, { clock })
    expect(range.correction).toBe('invalid_dates')
    expect(range.selection).toBe('7d')
  })

  it('falls back on a missing or malformed date', () => {
    expect(resolveRange({ range: 'custom' }, { clock }).correction).toBe('invalid_dates')
    expect(resolveRange({ range: 'custom', from: 'dün', to: 'bugün' }, { clock }).correction).toBe(
      'invalid_dates',
    )
  })

  it('honours renamed parameters', () => {
    const range = resolveRange(
      { window: 'custom', start: '2026-09-01', end: '2026-09-02' },
      { clock, params: { range: 'window', from: 'start', to: 'end' } },
    )
    expect(range.selection).toBe('custom')
    expect(range.fromDate).toBe('2026-09-01')
  })
})

describe('istanbul calendar helpers', () => {
  it('reads the Istanbul day, not the UTC one', () => {
    // 22:30 UTC is already the next day in Istanbul.
    expect(istanbulDate(new Date('2026-09-08T22:30:00.000Z'))).toBe('2026-09-09')
    expect(istanbulDate(new Date('2026-09-08T20:30:00.000Z'))).toBe('2026-09-08')
  })

  it('takes today from the injected clock', () => {
    expect(istanbulToday(clock)).toBe('2026-09-09')
  })
})
