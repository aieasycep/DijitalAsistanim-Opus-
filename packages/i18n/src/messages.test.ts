import { describe, expect, it } from 'vitest'
import { catalogues, defaultLocale, resolveLocale } from './index.ts'
import {
  createTranslator,
  flattenKeys,
  interpolate,
  type Message,
  type MessageTree,
  type PluralMessage,
} from './engine.ts'

/**
 * The catalogue's own guard rails.
 *
 * Turkish and English must expose the same key set, every key referenced by
 * shipped code must exist, and no string may leak a placeholder that nothing
 * fills. These are cheap checks that catch the exact class of bug that only
 * shows up on a user's screen in the other language.
 */

const trKeys = flattenKeys(catalogues.tr)
const enKeys = flattenKeys(catalogues.en)

describe('locale parity', () => {
  it('exposes the same key set in both locales', () => {
    const trSet = new Set(trKeys)
    const enSet = new Set(enKeys)
    const missingInEn = trKeys.filter((k) => !enSet.has(k))
    const missingInTr = enKeys.filter((k) => !trSet.has(k))

    expect({ missingInEn, missingInTr }).toEqual({ missingInEn: [], missingInTr: [] })
  })

  it('has a non-trivial catalogue', () => {
    expect(trKeys.length).toBeGreaterThan(400)
  })
})

/**
 * Keys that shipped code resolves at runtime. A rename that breaks one of
 * these would otherwise surface as a raw dotted key rendered in the UI.
 */
const REQUIRED_KEYS = [
  // packages/domain/src/priority.ts
  'priority.reason.mutedSender',
  'priority.reason.senderRule',
  'priority.reason.domainRule',
  'priority.reason.keywordRule',
  'priority.reason.vipRule',
  'priority.reason.categoryDemoted',
  'priority.reason.promotion',
  'priority.reason.security',
  'priority.reason.deadline',
  'priority.reason.deadlinePassed',
  'priority.reason.vip',
  'priority.reason.awaitingReply',
  'priority.reason.commitment',
  'priority.reason.meetingRelevance',
  'priority.reason.learned',
  'priority.reason.aiImportance',
  // packages/domain/src/reminders.ts
  'reminder.preset.in30Minutes',
  'reminder.preset.in1Hour',
  'reminder.preset.thisEvening',
  'reminder.preset.eveningPassed',
  'reminder.preset.tomorrowMorning',
  'reminder.preset.custom',
  'reminder.smart.freeSlotToday',
  'reminder.smart.freeSlotTomorrow',
  'reminder.smart.nextFreeMorning',
  'reminder.quietHoursShifted',
  'reminder.beforeDeadline',
  // packages/domain/src/calendar-intelligence.ts
  'calendar.conflict.overlap',
  'calendar.conflict.backToBack',
  'calendar.conflict.noPrepTime',
  'calendar.conflict.locationChange',
  'plan.suggestion.focusBlock',
  // packages/i18n/src/format.ts
  'common.today',
  'common.tomorrow',
  'common.yesterday',
  'common.inDays',
  'common.daysAgo',
  'common.onDate',
  'common.elapsed.justNow',
  'common.elapsed.minutes',
  'common.elapsed.hours',
  'common.elapsed.days',
  'common.elapsed.months',
  'common.elapsed.years',
] as const

describe('required keys', () => {
  it.each(['tr', 'en'] as const)('%s resolves every key shipped code references', (locale) => {
    const t = createTranslator({ locale, catalogues, fallbackLocale: defaultLocale })
    const missing = REQUIRED_KEYS.filter((key) => !t.has(key))
    expect(missing).toEqual([])
  })

  it('covers every ErrorCode under errors.*', async () => {
    const { ERROR_CODES } = await import('@da/domain')
    const t = createTranslator({ locale: 'tr', catalogues, fallbackLocale: defaultLocale })
    const missing = ERROR_CODES.filter((code) => !t.has(`errors.${code}`))
    expect(missing).toEqual([])
  })
})

describe('message hygiene', () => {
  // `MessageTree` carries an index signature, so `'other' in value` does not
  // discriminate it from a plural family on its own — the shape of both
  // members has to be checked.
  const isPluralFamily = (value: Message | MessageTree): value is PluralMessage =>
    typeof value === 'object' &&
    typeof (value as PluralMessage).one === 'string' &&
    typeof (value as PluralMessage).other === 'string'

  function collectStrings(tree: MessageTree, prefix = ''): Array<[string, string]> {
    const out: Array<[string, string]> = []
    for (const [key, value] of Object.entries(tree)) {
      const path = prefix ? `${prefix}.${key}` : key
      if (typeof value === 'string') out.push([path, value])
      else if (isPluralFamily(value)) {
        if (typeof value.zero === 'string') out.push([`${path}.zero`, value.zero])
        out.push([`${path}.one`, value.one], [`${path}.other`, value.other])
      } else out.push(...collectStrings(value as MessageTree, path))
    }
    return out
  }

  const allStrings = [
    ...collectStrings(catalogues.tr).map(([k, v]) => ['tr', k, v] as const),
    ...collectStrings(catalogues.en).map(([k, v]) => ['en', k, v] as const),
  ]

  it('contains no empty strings', () => {
    // `*.decorative` is the one exception: a decorative image's alt text is
    // deliberately empty so a screen reader skips it instead of announcing a
    // filename. Every other empty string is a copy gap.
    const empty = allStrings.filter(
      ([, key, value]) => value.trim() === '' && !key.endsWith('.decorative'),
    )
    expect(empty).toEqual([])
  })

  it('contains no unfinished-work markers', () => {
    const markers = /\b(TODO|FIXME|coming soon|yakında gelecek|placeholder|lorem ipsum)\b/i
    const offenders = allStrings.filter(([, , value]) => markers.test(value))
    expect(offenders).toEqual([])
  })

  it('never claims end-to-end encryption', () => {
    // The architecture is not end-to-end encrypted — the server reads the
    // data in order to analyse it — so no string may imply that it is.
    const forbidden = /(uçtan\s*uca|end[-\s]to[-\s]end)/i
    const offenders = allStrings.filter(([, , value]) => forbidden.test(value))
    expect(offenders).toEqual([])
  })

  it('uses matching placeholders across locales', () => {
    const placeholders = (s: string): string[] =>
      [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort()

    const trMap = new Map(collectStrings(catalogues.tr))
    const enMap = new Map(collectStrings(catalogues.en))

    const mismatches: Array<{ key: string; tr: string[]; en: string[] }> = []
    for (const [key, trValue] of trMap) {
      const enValue = enMap.get(key)
      if (enValue === undefined) continue
      const a = placeholders(trValue)
      const b = placeholders(enValue)
      if (a.join(',') !== b.join(',')) mismatches.push({ key, tr: a, en: b })
    }
    expect(mismatches).toEqual([])
  })
})

describe('runtime behaviour', () => {
  it('interpolates named placeholders', () => {
    expect(interpolate('Günaydın, {name}', { name: 'Yunus' })).toBe('Günaydın, Yunus')
  })

  it('leaves an unmatched placeholder visible rather than blanking it', () => {
    expect(interpolate('Merhaba {name}', {})).toBe('Merhaba {name}')
  })

  it('selects plural forms and exposes count', () => {
    const t = createTranslator({ locale: 'tr', catalogues, fallbackLocale: 'tr' })
    const one = t.plural('common.elapsed.days', 1)
    const many = t.plural('common.elapsed.days', 5)
    expect(one).not.toBe(many)
    expect(many).toContain('5')
  })

  it('falls back to Turkish when a key is missing in English', () => {
    const t = createTranslator({
      locale: 'en',
      catalogues: {
        tr: { only: { here: 'sadece burada' } },
        en: {},
      },
      fallbackLocale: 'tr',
    })
    expect(t.t('only.here')).toBe('sadece burada')
  })

  it('returns the key itself when nothing resolves', () => {
    const t = createTranslator({ locale: 'tr', catalogues: { tr: {}, en: {} } })
    expect(t.t('nope.not.here')).toBe('nope.not.here')
  })
})

describe('resolveLocale', () => {
  it.each([
    ['tr-TR', 'tr'],
    ['tr', 'tr'],
    ['en-GB', 'en'],
    ['de-DE', 'en'],
    [null, 'tr'],
    [undefined, 'tr'],
  ])('maps %s to %s', (input, expected) => {
    expect(resolveLocale(input)).toBe(expected)
  })
})
