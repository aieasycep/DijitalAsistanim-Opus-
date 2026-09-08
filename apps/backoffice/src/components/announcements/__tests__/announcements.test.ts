import { fixedClock } from '@da/domain'
import { describe, expect, it } from 'vitest'
import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_LOCALES,
  ANNOUNCEMENT_PLATFORMS,
  ANNOUNCEMENT_REASON_MAX,
  ANNOUNCEMENT_REASON_MIN,
  ANNOUNCEMENT_STATE_FILTERS,
  BODY_MAX_LENGTH,
  DEVICE_PLATFORMS,
  PLATFORM_AUDIENCES,
  TITLE_MAX_LENGTH,
  announcementPath,
  isAnnouncementAudience,
  isAnnouncementLocale,
  isAnnouncementPlatform,
  isDevicePlatform,
  isMinVersionShape,
  isPlatformAudience,
  targetedPlatforms,
  withOutcome,
  type AnnouncementTargeting,
} from '../contract.ts'
import { fromLocalInput, nextRoundFiveMinutes, toLocalInput } from '../datetime.ts'
import {
  STATE_TONES,
  announcementState,
  auditActionLabel,
  panelError,
  sharePercent,
  stateLabel,
  type AnnouncementWindow,
} from '../presentation.ts'
import { messages } from '../../../lib/messages.ts'
import { ANNOUNCEMENT_STATES, STATE_HINTS_TR } from '../../../lib/messages/announcements.ts'

/**
 * Announcements: what reaches a phone, and when.
 *
 * `announcements.published_at` is the whole safety property of the table — a
 * row with a null there is never served, whatever its window says — and the
 * state derivation below is the only place the console decides which of the
 * five states a row is in. A draft badged "live", or a scheduled notice badged
 * "draft", is a screen an operator would act on wrongly, so the ordering is
 * asserted rather than assumed.
 *
 * Every instant comes from an injected clock: a scheduling test that read the
 * wall clock would pass at 10:00 and fail at midnight.
 */

const NOW = fixedClock('2026-09-08T12:00:00.000Z').now()

function window_(overrides: Partial<AnnouncementWindow> = {}): AnnouncementWindow {
  return {
    published_at: '2026-09-01T00:00:00.000Z',
    starts_at: '2026-09-01T00:00:00.000Z',
    ends_at: null,
    ...overrides,
  }
}

describe('announcementState — a draft is never served, whatever its window says', () => {
  it('reports an unpublished row as a draft even inside a live window', () => {
    expect(
      announcementState(
        window_({
          published_at: null,
          starts_at: '2026-09-01T00:00:00.000Z',
          ends_at: '2026-12-01T00:00:00.000Z',
        }),
        NOW,
      ),
    ).toBe('draft')
  })

  it('reports an unpublished row as a draft even with no window at all', () => {
    expect(announcementState(window_({ published_at: null }), NOW)).toBe('draft')
  })

  it('waits for the start instant before calling a published row live', () => {
    const scheduled = window_({
      starts_at: '2026-09-08T12:00:00.001Z',
      ends_at: '2026-10-01T00:00:00.000Z',
    })
    expect(announcementState(scheduled, NOW)).toBe('scheduled')
  })

  it('is live from the start instant, inclusive', () => {
    const live = window_({
      starts_at: '2026-09-08T12:00:00.000Z',
      ends_at: '2026-10-01T00:00:00.000Z',
    })
    expect(announcementState(live, NOW)).toBe('live')
  })

  it('ends at the end instant, inclusive, so a closed window is never live', () => {
    expect(announcementState(window_({ ends_at: '2026-09-08T12:00:00.000Z' }), NOW)).toBe('ended')
    expect(announcementState(window_({ ends_at: '2026-09-08T12:00:00.001Z' }), NOW)).toBe('live')
  })

  it('separates a running notice with no end date from a running one with one', () => {
    // The one the copy calls a dark pattern when it is also not dismissible:
    // nobody will remember to take it down.
    expect(announcementState(window_({ ends_at: null }), NOW)).toBe('open_ended')
    expect(announcementState(window_({ ends_at: '2026-10-01T00:00:00.000Z' }), NOW)).toBe('live')
  })

  it('does not report a published row as a draft when a date is unreadable', () => {
    // Reporting it as a draft would hide a notice that is on somebody's phone.
    const state = announcementState(window_({ starts_at: 'not-an-instant' }), NOW)
    expect(state).not.toBe('draft')
    expect(ANNOUNCEMENT_STATES).toContain(state)
  })

  it('only ever answers with a state the filter above the table also offers', () => {
    const rows: AnnouncementWindow[] = [
      window_({ published_at: null }),
      window_({ starts_at: '2027-01-01T00:00:00.000Z' }),
      window_(),
      window_({ ends_at: '2026-10-01T00:00:00.000Z' }),
      window_({ ends_at: '2026-01-01T00:00:00.000Z' }),
    ]
    for (const row of rows) {
      const state = announcementState(row, NOW)
      expect(ANNOUNCEMENT_STATE_FILTERS).toContain(state)
      expect(stateLabel(state).length).toBeGreaterThan(0)
      expect(STATE_HINTS_TR[state].length).toBeGreaterThan(0)
    }
  })

  it('moves a row from scheduled to live to ended as the clock passes it', () => {
    const row = window_({
      starts_at: '2026-09-08T12:00:00.000Z',
      ends_at: '2026-09-09T12:00:00.000Z',
    })
    expect(announcementState(row, new Date('2026-09-08T11:59:59.999Z'))).toBe('scheduled')
    expect(announcementState(row, new Date('2026-09-08T12:00:00.000Z'))).toBe('live')
    expect(announcementState(row, new Date('2026-09-09T11:59:59.999Z'))).toBe('live')
    expect(announcementState(row, new Date('2026-09-09T12:00:00.000Z'))).toBe('ended')
  })
})

describe('the state tones', () => {
  it('colours only a running notice green, and warns about an open-ended one', () => {
    expect(STATE_TONES.live).toBe('success')
    expect(STATE_TONES.open_ended).toBe('warning')
    expect(STATE_TONES.draft).toBe('neutral')
    expect(STATE_TONES.ended).toBe('neutral')
    expect(STATE_TONES.scheduled).toBe('info')
  })

  it('has a tone and a Turkish label for every state', () => {
    for (const state of ANNOUNCEMENT_STATES) {
      expect(STATE_TONES[state]).toBeDefined()
      expect(stateLabel(state).length).toBeGreaterThan(0)
    }
  })
})

describe('targetedPlatforms — the ios and android audiences ARE a platform filter', () => {
  function targeting(overrides: Partial<AnnouncementTargeting> = {}): AnnouncementTargeting {
    return { audience: 'all', platforms: [], locale: 'tr', minAppVersion: null, ...overrides }
  }

  it('resolves a platform audience to that platform', () => {
    expect(targetedPlatforms(targeting({ audience: 'ios' }))).toEqual(['ios'])
    expect(targetedPlatforms(targeting({ audience: 'android' }))).toEqual(['android'])
  })

  it('ignores an explicit array when the audience is already a platform', () => {
    // `announcements_one_platform_filter` refuses a row carrying both, so the
    // estimate must not narrow twice and report a reach of nobody.
    expect(targetedPlatforms(targeting({ audience: 'ios', platforms: ['android'] }))).toEqual([
      'ios',
    ])
  })

  it('passes the explicit array through for every other audience', () => {
    for (const audience of ['all', 'free', 'pro'] as const) {
      expect(targetedPlatforms(targeting({ audience, platforms: ['ios', 'web'] }))).toEqual([
        'ios',
        'web',
      ])
      expect(targetedPlatforms(targeting({ audience }))).toEqual([])
    }
  })

  it('agrees with `isPlatformAudience` about which audiences those are', () => {
    for (const audience of ANNOUNCEMENT_AUDIENCES) {
      const narrows = targetedPlatforms(targeting({ audience })).length === 1
      expect(narrows).toBe(isPlatformAudience(audience))
    }
    expect([...PLATFORM_AUDIENCES]).toEqual(['ios', 'android'])
  })

  it('can name a platform no device registration carries, which the estimate says out loud', () => {
    // `push_tokens.platform` holds only ios and android, so a `web` target is
    // real targeting the console cannot size.
    expect(targetedPlatforms(targeting({ platforms: ['web'] }))).toEqual(['web'])
    expect(isDevicePlatform('web')).toBe(false)
    expect([...DEVICE_PLATFORMS]).toEqual(['ios', 'android'])
  })
})

describe('the vocabularies', () => {
  it('recognises its own members and refuses anything else', () => {
    for (const audience of ANNOUNCEMENT_AUDIENCES)
      expect(isAnnouncementAudience(audience)).toBe(true)
    for (const platform of ANNOUNCEMENT_PLATFORMS)
      expect(isAnnouncementPlatform(platform)).toBe(true)
    for (const locale of ANNOUNCEMENT_LOCALES) expect(isAnnouncementLocale(locale)).toBe(true)

    expect(isAnnouncementAudience('everyone')).toBe(false)
    expect(isAnnouncementPlatform('IOS')).toBe(false)
    expect(isAnnouncementLocale('de')).toBe(false)
  })

  it('mirrors the min-version constraint so a typo is a field error', () => {
    expect(isMinVersionShape('2.1.0')).toBe(true)
    expect(isMinVersionShape('2.1')).toBe(false)
    expect(isMinVersionShape('2.1.0-rc1')).toBe(false)
    expect(isMinVersionShape('')).toBe(false)
  })

  it('holds a title to a phone banner and a reason to what the trail stores', () => {
    expect(TITLE_MAX_LENGTH).toBeLessThan(BODY_MAX_LENGTH)
    expect(ANNOUNCEMENT_REASON_MIN).toBeLessThan(ANNOUNCEMENT_REASON_MAX)
  })
})

describe('the Istanbul wall clock a form works in', () => {
  it('round-trips a reading through the zone', () => {
    const instant = fromLocalInput('2026-09-08T15:30')
    expect(instant).not.toBeNull()
    expect(toLocalInput(instant?.toISOString())).toBe('2026-09-08T15:30')
  })

  it("reads a reading as Istanbul, not as UTC and not as the browser's zone", () => {
    // Türkiye is UTC+3, so 15:30 in Istanbul is 12:30Z.
    expect(fromLocalInput('2026-09-08T15:30')?.toISOString()).toBe('2026-09-08T12:30:00.000Z')
  })

  it('refuses a date that is not a moment rather than correcting it', () => {
    expect(fromLocalInput('2026-02-30T09:00')).toBeNull()
    expect(fromLocalInput('2026-13-01T09:00')).toBeNull()
    expect(fromLocalInput('2026-09-08T25:00')).toBeNull()
    expect(fromLocalInput('2026-09-08T09:60')).toBeNull()
  })

  it("refuses anything that is not the input's own spelling", () => {
    expect(fromLocalInput('')).toBeNull()
    expect(fromLocalInput('2026-09-08')).toBeNull()
    expect(fromLocalInput('2026-09-08T09:00:00')).toBeNull()
    expect(fromLocalInput('08.09.2026 09:00')).toBeNull()
  })

  it('tolerates the whitespace a paste brings with it', () => {
    expect(fromLocalInput('  2026-09-08T15:30  ')?.toISOString()).toBe('2026-09-08T12:30:00.000Z')
  })

  it('renders nothing for an absent or unreadable instant, so a round trip invents no date', () => {
    expect(toLocalInput(null)).toBe('')
    expect(toLocalInput(undefined)).toBe('')
    expect(toLocalInput('')).toBe('')
    expect(toLocalInput('not-an-instant')).toBe('')
  })

  it('spells midnight as 00 rather than 24', () => {
    expect(toLocalInput('2026-09-07T21:00:00.000Z')).toBe('2026-09-08T00:00')
  })

  it('rounds a default start up to the next five minutes, never back', () => {
    expect(nextRoundFiveMinutes(new Date('2026-09-08T12:01:00.000Z')).toISOString()).toBe(
      '2026-09-08T12:05:00.000Z',
    )
    expect(nextRoundFiveMinutes(new Date('2026-09-08T12:04:59.999Z')).toISOString()).toBe(
      '2026-09-08T12:05:00.000Z',
    )
    // Already round: left alone rather than pushed five minutes out.
    expect(nextRoundFiveMinutes(new Date('2026-09-08T12:05:00.000Z')).toISOString()).toBe(
      '2026-09-08T12:05:00.000Z',
    )
  })

  it('never rounds a start into the past', () => {
    for (const iso of ['2026-09-08T12:00:00.001Z', '2026-09-08T12:02:30.000Z']) {
      const now = new Date(iso)
      expect(nextRoundFiveMinutes(now).getTime()).toBeGreaterThanOrEqual(now.getTime())
    }
  })
})

describe('what the screens render around a result', () => {
  it('names every audit action this area writes, and passes an unknown one through', () => {
    expect(auditActionLabel('announcement.published')).toBe('Duyuru yayınlandı')
    expect(auditActionLabel('admin.announcement_unpublished')).toBe('Duyuru yayından kaldırıldı')
    // A trail that hid an action it did not recognise would hide exactly the
    // action somebody added without telling this screen.
    expect(auditActionLabel('announcement.something_new')).toBe('announcement.something_new')
    expect(auditActionLabel(null)).toBe('Bilinmiyor')
  })

  it('never quotes a thrown message in a panel', () => {
    expect(panelError({ ok: true })).toBeNull()
    expect(panelError({ ok: false, code: 'forbidden' })).toBe(messages.errors.forbidden)
    const generic = panelError({ ok: false, code: 'PGRST116: row not found in announcements' })
    expect(generic).not.toContain('PGRST116')
    expect(generic).not.toContain('announcements')
  })

  it('reports a share with a floor, so a real audience is never rendered as zero', () => {
    expect(sharePercent(12, 100)).toBe('12')
    expect(sharePercent(1, 10_000)).toBe('<1')
    expect(sharePercent(0, 100)).toBe('0')
    expect(sharePercent(5, 0)).toBeNull()
    expect(sharePercent(5, -1)).toBeNull()
  })

  it('appends an outcome without clobbering an existing query', () => {
    expect(withOutcome('/announcements', 'published')).toBe('/announcements?outcome=published')
    expect(withOutcome('/announcements?state=live', 'saved')).toBe(
      '/announcements?state=live&outcome=saved',
    )
  })

  it('addresses a record by id', () => {
    expect(announcementPath('3f2a1c44-0000-4000-8000-000000000001')).toBe(
      '/announcements/3f2a1c44-0000-4000-8000-000000000001',
    )
  })
})
