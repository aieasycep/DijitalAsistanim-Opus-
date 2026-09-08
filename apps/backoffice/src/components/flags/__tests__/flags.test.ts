import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  APP_VERSION_PATTERN,
  DEFAULT_OVERRIDE_DURATION_DAYS,
  FLAG_DESCRIPTION_MAX,
  FLAG_DESCRIPTION_MIN,
  FLAG_KEY_MAX,
  FLAG_KEY_PATTERN,
  FLAG_OUTCOMES,
  FLAG_PLANS,
  FLAG_PLATFORMS,
  FLAG_STATES,
  LIST_PARAMS,
  OVERRIDE_DURATION_DAYS,
  RESULT_PARAMS,
  ROLLOUT_MAX,
  ROLLOUT_MIN,
  compareAppVersions,
  deriveState,
  hrefWithQuery,
  isFlagOutcome,
  isNarrowed,
  isOverrideDuration,
  isSearchable,
  isUuidParam,
  orderedPlans,
  orderedPlatforms,
  parseFlagListParams,
  targetingEquals,
  toQueryRecord,
  withOutcome,
  withoutResultParams,
  type FlagTargeting,
} from '../contract.ts'
import {
  adminLabel,
  audienceLine,
  audienceNote,
  describeAudience,
  flagStateTone,
  outcomeTone,
  overrideValueTone,
} from '../presentation.ts'

/**
 * Feature flags: who a flag reaches, and whether the screen says so honestly.
 *
 * The evaluator itself is `public.feature_flag_is_enabled()` — the console does
 * not reimplement it, and the last block here proves the console's derivation
 * still matches the SQL rather than drifting from it. What this file tests is
 * everything the console decides on its own: the effective state a form shows
 * before a row exists, whether "100%" may be rendered as "everyone", and the
 * sentence an operator reads before pulling a kill switch.
 */

const OPEN: FlagTargeting = Object.freeze({
  enabled: true,
  kill_switch: false,
  rollout_percentage: 100,
  platforms: [],
  plans: [],
  min_app_version: null,
  max_app_version: null,
})

function targeting(overrides: Partial<FlagTargeting> = {}): FlagTargeting {
  return { ...OPEN, ...overrides }
}

describe('deriveState — the kill switch outranks everything', () => {
  it('reports a killed flag as killed however it is otherwise configured', () => {
    expect(deriveState(targeting({ kill_switch: true }))).toBe('killed')
    expect(deriveState(targeting({ kill_switch: true, enabled: false }))).toBe('killed')
    expect(deriveState(targeting({ kill_switch: true, rollout_percentage: 0 }))).toBe('killed')
  })

  it('reports the main switch next, before the percentage', () => {
    expect(deriveState(targeting({ enabled: false }))).toBe('off')
    expect(deriveState(targeting({ enabled: false, rollout_percentage: 100 }))).toBe('off')
  })

  it('separates a full rollout from a partial one at 100', () => {
    expect(deriveState(targeting({ rollout_percentage: 100 }))).toBe('on')
    expect(deriveState(targeting({ rollout_percentage: 99 }))).toBe('partial')
    expect(deriveState(targeting({ rollout_percentage: 0 }))).toBe('partial')
  })

  it('only ever answers with a member of the vocabulary', () => {
    for (const percentage of [0, 1, 50, 99, 100]) {
      for (const enabled of [true, false]) {
        for (const kill of [true, false]) {
          const state = deriveState(
            targeting({ rollout_percentage: percentage, enabled, kill_switch: kill }),
          )
          expect(FLAG_STATES).toContain(state)
        }
      }
    }
  })
})

describe('isNarrowed — "on" is not the same claim as "everyone"', () => {
  it('calls an unrestricted flag at 100% wide open', () => {
    expect(isNarrowed(OPEN)).toBe(false)
    expect(deriveState(OPEN)).toBe('on')
  })

  it('calls a flag narrowed by any one dimension narrowed', () => {
    expect(isNarrowed(targeting({ platforms: ['ios'] }))).toBe(true)
    expect(isNarrowed(targeting({ plans: ['pro'] }))).toBe(true)
    expect(isNarrowed(targeting({ min_app_version: '2.0.0' }))).toBe(true)
    expect(isNarrowed(targeting({ max_app_version: '3.0.0' }))).toBe(true)
    expect(isNarrowed(targeting({ rollout_percentage: 99 }))).toBe(true)
  })

  it('reports a fully rolled-out but platform-limited flag as on AND narrowed', () => {
    // The pair a green dot alone would misrepresent: the state pill says "on"
    // while two thirds of the userbase never sees the feature.
    const limited = targeting({ platforms: ['ios'], plans: ['pro'] })
    expect(deriveState(limited)).toBe('on')
    expect(isNarrowed(limited)).toBe(true)
    expect(audienceNote(limited)).toBe(
      'Bu bayrak herkese açık değil; yukarıdaki koşulları sağlayanlara açık.',
    )
  })

  it('says so plainly when a flag really does reach everybody it could', () => {
    expect(audienceNote(OPEN)).toBe('Hedefleme boş: koşul sağlayan herkes bu bayrağı görüyor.')
  })
})

describe('describeAudience — four phrases, in evaluation order, never blank', () => {
  it('spells out every unrestricted dimension rather than omitting it', () => {
    expect(describeAudience(OPEN)).toEqual([
      'tam yayılım',
      'tüm platformlar',
      'tüm planlar',
      'tüm sürümler',
    ])
  })

  it('names the percentage, the platforms, the plans and the version range', () => {
    const narrow = targeting({
      rollout_percentage: 25,
      platforms: ['ios'],
      plans: ['pro'],
      min_app_version: '2.1.0',
    })
    expect(audienceLine(narrow)).toBe('%25 yayılım · iOS · Pro · 2.1.0 ve üstü')
  })

  it('distinguishes a stopped rollout from a full one', () => {
    expect(describeAudience(targeting({ rollout_percentage: 0 }))[0]).toBe('yayılım %0')
    expect(describeAudience(targeting({ rollout_percentage: 100 }))[0]).toBe('tam yayılım')
  })

  it('describes each shape of version bound', () => {
    expect(describeAudience(targeting({ min_app_version: '2.0.0' }))[3]).toBe('2.0.0 ve üstü')
    expect(describeAudience(targeting({ max_app_version: '2.9.9' }))[3]).toBe('2.9.9 ve altı')
    expect(
      describeAudience(targeting({ min_app_version: '2.0.0', max_app_version: '2.9.9' }))[3],
    ).toBe('2.0.0 – 2.9.9')
  })

  it('always returns exactly four phrases, none of them empty', () => {
    for (const value of [OPEN, targeting({ platforms: ['web'], rollout_percentage: 5 })]) {
      const phrases = describeAudience(value)
      expect(phrases).toHaveLength(4)
      for (const phrase of phrases) expect(phrase.trim()).not.toBe('')
    }
  })
})

describe('ordering a targeting array', () => {
  it("renders members in the enum's declared order, whatever order they arrived in", () => {
    expect(orderedPlatforms(['web', 'ios', 'android'])).toEqual(['ios', 'android', 'web'])
    expect(orderedPlans(['pro', 'free'])).toEqual(['free', 'pro'])
  })

  it('drops a member the database produced that the console does not know', () => {
    expect(orderedPlatforms(['ios', 'windows_phone'])).toEqual(['ios'])
    expect(orderedPlans(['enterprise'])).toEqual([])
  })

  it('de-duplicates without inventing a member', () => {
    expect(orderedPlatforms(['ios', 'ios', 'ios'])).toEqual(['ios'])
  })
})

describe('targetingEquals — a no-op must not become an audit row', () => {
  it('treats an unchanged form as unchanged', () => {
    expect(targetingEquals(OPEN, targeting())).toBe(true)
  })

  it('ignores the order of the arrays, which a form does not control', () => {
    expect(
      targetingEquals(
        targeting({ platforms: ['ios', 'android'], plans: ['free', 'pro'] }),
        targeting({ platforms: ['android', 'ios'], plans: ['pro', 'free'] }),
      ),
    ).toBe(true)
  })

  it('notices a change in every field it compares', () => {
    const changes: Partial<FlagTargeting>[] = [
      { enabled: false },
      { kill_switch: true },
      { rollout_percentage: 99 },
      { platforms: ['ios'] },
      { plans: ['pro'] },
      { min_app_version: '1.0.0' },
      { max_app_version: '9.0.0' },
    ]
    for (const change of changes) {
      expect(targetingEquals(OPEN, targeting(change))).toBe(false)
    }
  })

  it('does not confuse a longer array with a permutation of a shorter one', () => {
    expect(
      targetingEquals(targeting({ platforms: ['ios'] }), targeting({ platforms: ['ios', 'web'] })),
    ).toBe(false)
  })
})

describe('compareAppVersions — on the numbers, as the evaluator does', () => {
  it('sorts 1.10.0 above 1.9.0, which a string comparison would not', () => {
    expect(compareAppVersions('1.10.0', '1.9.0')).toBe(1)
    expect(compareAppVersions('1.9.0', '1.10.0')).toBe(-1)
    expect('1.10.0' < '1.9.0').toBe(true)
  })

  it('reports equality and orders each component', () => {
    expect(compareAppVersions('2.3.4', '2.3.4')).toBe(0)
    expect(compareAppVersions('3.0.0', '2.99.99')).toBe(1)
    expect(compareAppVersions('2.3.4', '2.3.5')).toBe(-1)
  })

  it('ignores leading zeroes, because 1.02.0 and 1.2.0 are the same release', () => {
    expect(compareAppVersions('1.02.0', '1.2.0')).toBe(0)
  })

  it('refuses to compare anything that is not a triple', () => {
    expect(compareAppVersions('1.2', '1.2.0')).toBeNull()
    expect(compareAppVersions('1.2.0', 'latest')).toBeNull()
    expect(compareAppVersions('', '1.0.0')).toBeNull()
  })
})

describe('the shapes the database enforces, mirrored for the form', () => {
  it('accepts a lower-snake dotted key and refuses everything else', () => {
    for (const key of ['assistant', 'assistant.new_composer', 'a1.b2.c3']) {
      expect(FLAG_KEY_PATTERN.test(key)).toBe(true)
    }
    for (const key of [
      'Assistant',
      '1assistant',
      'assistant.',
      '.assistant',
      'assistant-new',
      '',
    ]) {
      expect(FLAG_KEY_PATTERN.test(key)).toBe(false)
    }
  })

  it('accepts a three-part version and refuses a two-part or suffixed one', () => {
    expect(APP_VERSION_PATTERN.test('2.1.0')).toBe(true)
    expect(APP_VERSION_PATTERN.test('10.20.30')).toBe(true)
    expect(APP_VERSION_PATTERN.test('2.1')).toBe(false)
    expect(APP_VERSION_PATTERN.test('2.1.0-beta')).toBe(false)
    expect(APP_VERSION_PATTERN.test('v2.1.0')).toBe(false)
  })

  it('asks for a description a later operator can act on', () => {
    // The column accepts one character; the console asks for a sentence,
    // because "test" answers nothing when somebody is deciding to pull a flag.
    expect(FLAG_DESCRIPTION_MIN).toBeGreaterThan(1)
    expect(FLAG_DESCRIPTION_MAX).toBeGreaterThan(FLAG_DESCRIPTION_MIN)
    expect(FLAG_KEY_MAX).toBeGreaterThan(0)
  })

  it('holds the rollout to the range the constraint allows', () => {
    expect(ROLLOUT_MIN).toBe(0)
    expect(ROLLOUT_MAX).toBe(100)
  })
})

describe('override durations', () => {
  it('offers "süresiz" as zero, and the default is not it', () => {
    expect(OVERRIDE_DURATION_DAYS).toContain(0)
    expect(isOverrideDuration(0)).toBe(true)
    // A pin that never lapses is how a "50% rollout" quietly becomes something
    // else, so it is available and it is not what the form starts on.
    expect(DEFAULT_OVERRIDE_DURATION_DAYS).not.toBe(0)
    expect(isOverrideDuration(DEFAULT_OVERRIDE_DURATION_DAYS)).toBe(true)
  })

  it('refuses a duration the form does not offer', () => {
    expect(isOverrideDuration(2)).toBe(false)
    expect(isOverrideDuration(-1)).toBe(false)
    expect(isOverrideDuration(7.5)).toBe(false)
    expect(isOverrideDuration(Number.NaN)).toBe(false)
  })

  it('is ordered shortest first, so the safest option is nearest', () => {
    const timed = OVERRIDE_DURATION_DAYS.filter((days) => days > 0)
    expect([...timed].sort((a, b) => a - b)).toEqual([...timed])
  })
})

describe('tones', () => {
  it('has no green anywhere in the flag state palette', () => {
    expect(Object.values(flagStateTone)).not.toContain('success')
    expect(flagStateTone.killed).toBe('critical')
    expect(flagStateTone.on).toBe('primary')
    expect(flagStateTone.partial).toBe('info')
    expect(flagStateTone.off).toBe('neutral')
  })

  it('reads a kill switch as a warning even though pulling it worked', () => {
    expect(outcomeTone('killed')).toBe('warning')
    expect(outcomeTone('unkilled')).toBe('success')
    expect(outcomeTone('created')).toBe('success')
    expect(outcomeTone('forbidden')).toBe('critical')
    expect(outcomeTone('auditMissing')).toBe('critical')
  })

  it('has a tone for every outcome the actions can report', () => {
    for (const outcome of FLAG_OUTCOMES) {
      expect(['success', 'warning', 'critical']).toContain(outcomeTone(outcome))
      expect(isFlagOutcome(outcome)).toBe(true)
    }
    expect(isFlagOutcome('done')).toBe(false)
  })

  it('tells a live pin that forces a flag on from one that forces it off', () => {
    expect(overrideValueTone(true, false)).toBe('primary')
    expect(overrideValueTone(false, false)).toBe('critical')
    // A lapsed pin is doing nothing; it is listed so somebody removes it.
    expect(overrideValueTone(true, true)).toBe('neutral')
    expect(overrideValueTone(false, true)).toBe('neutral')
  })

  it('names an unresolvable admin rather than printing a uuid', () => {
    expect(adminLabel(undefined)).toBe('Bilinmiyor')
    expect(adminLabel({ name: null, emailRedacted: 'y•••@example.com', roleLabel: 'Destek' })).toBe(
      'y•••@example.com',
    )
    expect(adminLabel({ name: 'Yasemin', emailRedacted: null, roleLabel: 'Destek' })).toBe(
      'Yasemin',
    )
  })
})

describe('the list query string', () => {
  it('keeps only values from its own vocabularies', () => {
    const parsed = parseFlagListParams({
      state: 'partial',
      platform: 'ios',
      plan: 'pro',
      q: 'assistant.',
      page: '3',
    })
    expect(parsed).toEqual({
      state: 'partial',
      platform: 'ios',
      plan: 'pro',
      search: 'assistant.',
      searchRejected: false,
      page: 3,
    })
  })

  it('drops a filter it does not recognise instead of passing it to PostgREST', () => {
    const parsed = parseFlagListParams({ state: 'on-ish', platform: 'blackberry', plan: 'gold' })
    expect(parsed.state).toBeNull()
    expect(parsed.platform).toBeNull()
    expect(parsed.plan).toBeNull()
  })

  it('says a search was refused rather than silently searching for nothing', () => {
    const rejected = parseFlagListParams({ q: 'yasemin@example.com' })
    expect(rejected.search).toBeNull()
    expect(rejected.searchRejected).toBe(true)

    const absent = parseFlagListParams({})
    expect(absent.search).toBeNull()
    expect(absent.searchRejected).toBe(false)
  })

  it('accepts only the charset a flag key is written in', () => {
    expect(isSearchable('assistant.new_composer')).toBe(true)
    expect(isSearchable('ASSISTANT')).toBe(false)
    expect(isSearchable('assistant%')).toBe(false)
    expect(isSearchable("assistant'")).toBe(false)
    expect(isSearchable('a'.repeat(81))).toBe(false)
    expect(isSearchable('')).toBe(false)
  })

  it('lower-cases a typed search so the charset check is about characters, not case', () => {
    expect(parseFlagListParams({ q: 'Assistant.New' }).search).toBe('assistant.new')
  })

  it('clamps a nonsense page to the first one', () => {
    for (const page of ['0', '-2', 'abc', '', '1e9999']) {
      expect(parseFlagListParams({ page }).page).toBeGreaterThanOrEqual(1)
    }
    expect(parseFlagListParams({ page: '2.7' }).page).toBe(2)
  })

  it('reads the first value of a repeated parameter', () => {
    expect(parseFlagListParams({ [LIST_PARAMS.state]: ['on', 'off'] }).state).toBe('on')
  })
})

describe('links an action lands on', () => {
  it('carries an outcome token and the flag key, and nothing else', () => {
    expect(withOutcome('/flags', 'killed', 'assistant.composer')).toBe(
      '/flags?result=killed&flag=assistant.composer',
    )
    expect(withOutcome('/flags', 'noop')).toBe('/flags?result=noop')
  })

  it('bounds the key it puts on a URL', () => {
    const long = 'a'.repeat(FLAG_KEY_MAX + 50)
    const href = withOutcome('/flags', 'updated', long)
    expect(new URLSearchParams(href.split('?')[1] ?? '').get(RESULT_PARAMS.key)).toHaveLength(
      FLAG_KEY_MAX,
    )
  })

  it('drops the last answer from a paging link, so it is not re-announced', () => {
    const query = toQueryRecord({ result: 'killed', flag: 'a.b', state: 'off', page: '2' })
    expect(withoutResultParams(query)).toEqual({ state: 'off', page: '2' })
  })

  it('builds a query with the keys in a stable order', () => {
    expect(hrefWithQuery('/flags', { plan: 'pro', state: 'on' })).toBe('/flags?plan=pro&state=on')
    expect(hrefWithQuery('/flags', {})).toBe('/flags')
  })

  it('recognises a uuid route parameter and refuses anything else', () => {
    expect(isUuidParam('3f2a1c44-0000-4000-8000-000000000001')).toBe(true)
    expect(isUuidParam('3f2a1c44-0000-4000-8000-00000000000')).toBe(false)
    expect(isUuidParam('../../etc/passwd')).toBe(false)
  })
})

describe('parity with the evaluator in migration 0019', () => {
  const sql = readFileSync(
    fileURLToPath(
      new URL('../../../../../../supabase/migrations/0019_admin_platform.sql', import.meta.url),
    ),
    'utf8',
  )

  const evaluator = sql.slice(
    sql.indexOf('create or replace function public.feature_flag_is_enabled'),
    sql.indexOf('comment on function public.feature_flag_is_enabled'),
  )

  it('reads the same precedence the console derives its state from', () => {
    // Kill switch first, then the per-user pin, then the main switch — the
    // order `deriveState` short-circuits in.
    const killAt = evaluator.indexOf('if v_flag.kill_switch then')
    const overrideAt = evaluator.indexOf('feature_flag_overrides o')
    const enabledAt = evaluator.indexOf('if not v_flag.enabled then')
    expect(killAt).toBeGreaterThan(-1)
    expect(killAt).toBeLessThan(overrideAt)
    expect(overrideAt).toBeLessThan(enabledAt)
  })

  it('agrees that 100 is everybody and 0 is nobody', () => {
    expect(evaluator).toContain('if v_flag.rollout_percentage >= 100 then')
    expect(evaluator).toContain('if v_flag.rollout_percentage <= 0 then')
    expect(ROLLOUT_MAX).toBe(100)
    expect(ROLLOUT_MIN).toBe(0)
  })

  it('buckets a user per flag rather than globally', () => {
    // The bucket is `md5(key || ':' || user)`, so a user in the first bucket of
    // one flag is not thereby in the first bucket of every flag.
    expect(evaluator).toContain("md5(v_flag.key || ':' || p_user_id::text)")
    expect(evaluator).toContain('% 100')
    expect(evaluator).toContain('return v_bucket < v_flag.rollout_percentage')
  })

  it('refuses an anonymous caller a partial rollout rather than guessing', () => {
    const bucketAt = evaluator.indexOf('v_bucket :=')
    const anonymousGuard = evaluator.indexOf('if p_user_id is null then')
    expect(anonymousGuard).toBeGreaterThan(-1)
    expect(anonymousGuard).toBeLessThan(bucketAt)
  })

  it('declares the same platform and plan vocabularies the console offers', () => {
    for (const platform of FLAG_PLATFORMS) expect(sql).toContain(platform)
    for (const plan of FLAG_PLANS) expect(sql).toContain(plan)
  })

  it('mirrors the key and version constraints the form pre-checks', () => {
    expect(sql).toContain("'^[a-z][a-z0-9_]*(\\.[a-z0-9_]+)*$'")
    expect(sql).toContain("'^[0-9]+\\.[0-9]+\\.[0-9]+$'")
  })
})
