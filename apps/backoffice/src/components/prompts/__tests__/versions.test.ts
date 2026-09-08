import { describe, expect, it } from 'vitest'
import {
  BODY_MAX,
  BODY_MIN,
  FEATURE_MAX,
  FEATURE_PATTERN,
  MODEL_MAX,
  MODEL_PATTERN,
  NOTES_MAX,
  PROMPT_OUTCOMES,
  PROMPT_REASON_MAX,
  PROMPT_REASON_MIN,
  PROMPT_STATUSES,
  RESULT_PARAMS,
  chooseDiffBaseline,
  hrefWithQuery,
  isFeatureName,
  isPromptOutcome,
  isPromptSortKey,
  isPromptStatus,
  isSearchable,
  isUuidParam,
  newPromptPath,
  parsePromptListParams,
  promptEditPath,
  promptPath,
  toQueryRecord,
  versionLabel,
  versionReference,
  withOutcome,
  withoutResultParams,
} from '../contract.ts'
import {
  adminLabel,
  costPerCall,
  outcomeTone,
  promptStatusTone,
  shortFingerprint,
} from '../presentation.ts'
import { diffPromptBodies, diffScale } from '../diff.ts'

/**
 * Prompt versions: what an operator compares before pressing "etkinleştir".
 *
 * `__tests__/diff.test.ts` proves the diff algorithm is lossless. This file
 * covers the decisions around it — which version the diff is taken *against*,
 * what a version may be called, and how a body's size is described — plus the
 * two diff properties that matter to the decision rather than to the rendering:
 * that an activation with nothing to compare against is never displayed as "no
 * changes", and that a wholesale rewrite is reported as one.
 */

interface Version {
  readonly id: string
  readonly version: number
}

const DRAFT: Version = { id: 'v-draft', version: 5 }
const ACTIVE: Version = { id: 'v-active', version: 4 }
const PREVIOUS: Version = { id: 'v-previous', version: 3 }

describe('chooseDiffBaseline — the question the operator is actually asking', () => {
  it('reads a draft against what is serving today', () => {
    // "What would change if I pressed the button."
    expect(chooseDiffBaseline(DRAFT, ACTIVE, PREVIOUS)).toEqual({
      kind: 'active',
      baseline: ACTIVE,
    })
  })

  it('reads the active version against the previous one, not against itself', () => {
    // Diffing the live prompt with itself would show nothing; what matters is
    // what changed when it went live.
    expect(chooseDiffBaseline(ACTIVE, ACTIVE, PREVIOUS)).toEqual({
      kind: 'previous',
      baseline: PREVIOUS,
    })
  })

  it('falls back to the previous version when the feature has none active', () => {
    expect(chooseDiffBaseline(DRAFT, null, PREVIOUS)).toEqual({
      kind: 'previous',
      baseline: PREVIOUS,
    })
  })

  it('says there is no baseline for the first version of a feature', () => {
    // `none` rather than an empty diff: an empty diff reads as "no changes",
    // which is a different and much more dangerous claim.
    expect(chooseDiffBaseline(DRAFT, null, null)).toEqual({ kind: 'none', baseline: null })
  })

  it('says there is no baseline for the first version even when it is the active one', () => {
    expect(chooseDiffBaseline(ACTIVE, ACTIVE, null)).toEqual({ kind: 'none', baseline: null })
  })

  it('never returns the record itself as its own baseline', () => {
    const cases: [Version | null, Version | null][] = [
      [ACTIVE, PREVIOUS],
      [ACTIVE, null],
      [null, PREVIOUS],
      [null, null],
    ]
    for (const [active, previous] of cases) {
      const chosen = chooseDiffBaseline(ACTIVE, active, previous)
      expect(chosen.baseline?.id).not.toBe(ACTIVE.id)
    }
  })

  it('pairs `none` with a null baseline and every other kind with a real one', () => {
    const cases: [Version | null, Version | null][] = [
      [ACTIVE, PREVIOUS],
      [ACTIVE, null],
      [null, PREVIOUS],
      [null, null],
    ]
    for (const [active, previous] of cases) {
      const chosen = chooseDiffBaseline(DRAFT, active, previous)
      expect(chosen.baseline === null).toBe(chosen.kind === 'none')
    }
  })
})

describe('the diff, read as a decision', () => {
  it('reports a rewrite as substantial and a tweak as not', () => {
    const baseline = Array.from({ length: 40 }, (_unused, index) => `kural ${index}`).join('\n')
    const rewritten = Array.from({ length: 40 }, (_unused, index) => `yeni ${index}`).join('\n')
    expect(diffScale(diffPromptBodies(baseline, rewritten)).substantial).toBe(true)

    const tweaked = baseline.replace('kural 7', 'kural 7 (düzeltildi)')
    expect(diffScale(diffPromptBodies(baseline, tweaked)).substantial).toBe(false)
  })

  it('does not call an unchanged body a change of any size', () => {
    const body = 'Sen bir asistansın.\nKısa yanıt ver.'
    const diff = diffPromptBodies(body, body)
    expect(diff.identical).toBe(true)
    expect(diffScale(diff).ratio).toBe(0)
    expect(diffScale(diff).substantial).toBe(false)
  })

  it('is not identical when a body gained only trailing whitespace', () => {
    // The instruction the model receives differs, so the screen must say so.
    const diff = diffPromptBodies('Kısa yanıt ver.', 'Kısa yanıt ver. ')
    expect(diff.identical).toBe(false)
    expect(diff.added).toBe(1)
    expect(diff.removed).toBe(1)
  })

  it('reports an emptied prompt as a full removal rather than as no change', () => {
    const diff = diffPromptBodies('bir\niki\nüç', '')
    expect(diff.identical).toBe(false)
    expect(diff.removed).toBe(3)
    expect(diffScale(diff).ratio).toBe(1)
  })
})

describe('the shapes a version is held to', () => {
  it('accepts a lower-snake dotted feature name and refuses a sentence', () => {
    for (const name of ['briefing', 'briefing.compose', 'a1.b2_c3']) {
      expect(isFeatureName(name)).toBe(true)
      expect(FEATURE_PATTERN.test(name)).toBe(true)
    }
    for (const name of ['Briefing', 'briefing compose', '1briefing', 'briefing.', '']) {
      expect(isFeatureName(name)).toBe(false)
    }
  })

  it("refuses a feature name past the console's own ceiling", () => {
    expect(isFeatureName('a'.repeat(FEATURE_MAX))).toBe(true)
    expect(isFeatureName('a'.repeat(FEATURE_MAX + 1))).toBe(false)
  })

  it('accepts the model identifiers the providers actually spell', () => {
    for (const model of ['claude-opus-4-1-20250805', 'gpt-4o-mini', 'model.v2:preview']) {
      expect(MODEL_PATTERN.test(model)).toBe(true)
    }
    // A sentence would reach the audit trail, where `safeIdentifier()` would
    // collapse it — better refused at the form.
    expect(MODEL_PATTERN.test('the best model we have')).toBe(false)
    expect(MODEL_PATTERN.test('-leading-dash')).toBe(false)
    expect(MODEL_PATTERN.test('a'.repeat(MODEL_MAX + 1))).toBe(false)
  })

  it('asks for something that could plausibly be an instruction', () => {
    // The column accepts one character; a one-character "prompt" is a mistake,
    // and the cheapest place to catch it is before it takes a version number.
    expect(BODY_MIN).toBeGreaterThan(1)
    expect(BODY_MAX).toBeGreaterThan(BODY_MIN)
    expect(NOTES_MAX).toBeGreaterThan(0)
    expect(PROMPT_REASON_MIN).toBeLessThan(PROMPT_REASON_MAX)
  })

  it('knows its own status vocabulary', () => {
    for (const status of PROMPT_STATUSES) expect(isPromptStatus(status)).toBe(true)
    expect(isPromptStatus('published')).toBe(false)
    expect(isPromptStatus('')).toBe(false)
  })
})

describe('how a version is named on screen', () => {
  it('is `feature · vN` everywhere', () => {
    expect(versionLabel(4)).toBe('v4')
    expect(versionReference('briefing.compose', 4)).toBe('briefing.compose · v4')
  })

  it('addresses a record and its editor by id', () => {
    const id = '3f2a1c44-0000-4000-8000-000000000001'
    expect(promptPath(id)).toBe(`/ai/prompts/${id}`)
    expect(promptEditPath(id)).toBe(`/ai/prompts/${id}/edit`)
  })

  it('pre-loads the composer from a feature and a version to copy', () => {
    expect(newPromptPath('briefing.compose', 'abc')).toBe(
      '/ai/prompts/new?feature=briefing.compose&from=abc',
    )
    expect(newPromptPath()).toBe('/ai/prompts/new')
    expect(newPromptPath(null, null)).toBe('/ai/prompts/new')
  })

  it('bounds the feature name it will put on a URL', () => {
    const href = newPromptPath('a'.repeat(FEATURE_MAX + 40))
    expect(new URL(href, 'https://x.invalid').searchParams.get('feature')).toHaveLength(FEATURE_MAX)
  })
})

describe('tones', () => {
  it('does not paint the version serving traffic green', () => {
    // An active version can be the one that broke the feature this morning,
    // which is the entire reason this area exists.
    expect(promptStatusTone.active).toBe('primary')
    expect(promptStatusTone.draft).toBe('info')
    expect(promptStatusTone.archived).toBe('neutral')
    expect(Object.values(promptStatusTone)).not.toContain('success')
  })

  it('treats a change with no trail as the thing to act on immediately', () => {
    expect(outcomeTone('auditMissing')).toBe('critical')
    expect(outcomeTone('forbidden')).toBe('critical')
    expect(outcomeTone('failed')).toBe('critical')
  })

  it('has a tone for every outcome an action can report', () => {
    for (const outcome of PROMPT_OUTCOMES) {
      expect(outcomeTone(outcome)).toBeDefined()
      expect(isPromptOutcome(outcome)).toBe(true)
    }
    expect(isPromptOutcome('etkinleştirildi')).toBe(false)
  })

  it('names an unresolvable author rather than printing a uuid', () => {
    expect(adminLabel(undefined)).toBe('Bilinmiyor')
    expect(
      adminLabel({
        adminUserId: 'a1',
        name: '   ',
        emailRedacted: 'y•••@example.com',
        roleLabel: 'Destek',
        isActive: true,
      }),
    ).toBe('y•••@example.com')
    expect(
      adminLabel({
        adminUserId: 'a1',
        name: null,
        emailRedacted: null,
        roleLabel: 'Destek',
        isActive: false,
      }),
    ).toBe('Bilinmiyor')
  })
})

describe('derived figures never invent a value', () => {
  it('reports a cost per call only when there were calls', () => {
    expect(costPerCall(10_000, 4)).toBe(2_500)
    expect(costPerCall(10_000, 0)).toBeNull()
    expect(costPerCall(0, 0)).toBeNull()
    expect(costPerCall(10_000, -1)).toBeNull()
  })

  it('shortens a fingerprint without lengthening a short one', () => {
    expect(shortFingerprint('0123456789abcdef0123')).toBe('0123456789ab')
    expect(shortFingerprint('short')).toBe('short')
  })
})

describe('the list query string', () => {
  it('keeps only a feature name, a known status and a searchable prefix', () => {
    expect(
      parsePromptListParams({
        feature: 'Briefing.Compose',
        status: 'active',
        q: 'brief',
        page: '2',
      }),
    ).toEqual({
      feature: 'briefing.compose',
      status: 'active',
      search: 'brief',
      searchRejected: false,
      page: 2,
    })
  })

  it('drops a feature filter that could not be a feature name', () => {
    expect(parsePromptListParams({ feature: 'not a feature' }).feature).toBeNull()
    expect(parsePromptListParams({ status: 'live' }).status).toBeNull()
  })

  it('says a search was refused rather than searching for something else', () => {
    const rejected = parsePromptListParams({ q: "briefing'; drop table" })
    expect(rejected.search).toBeNull()
    expect(rejected.searchRejected).toBe(true)
    expect(isSearchable("briefing'")).toBe(false)
  })

  it('clamps a nonsense page to the first one', () => {
    for (const page of ['0', '-1', 'x', '']) {
      expect(parsePromptListParams({ page }).page).toBe(1)
    }
  })

  it('orders only by a real column of the view', () => {
    expect(isPromptSortKey('created_at')).toBe(true)
    expect(isPromptSortKey('body')).toBe(false)
    expect(isPromptSortKey('created_at desc')).toBe(false)
  })
})

describe('links an action lands on', () => {
  it('carries the outcome, the feature and the version number', () => {
    expect(
      withOutcome('/ai/prompts', 'activated', { feature: 'briefing.compose', version: 4 }),
    ).toBe('/ai/prompts?result=activated&pf=briefing.compose&pv=4')
  })

  it('omits a version that is not a real version number', () => {
    for (const version of [0, -1, 1.5, Number.NaN, null]) {
      const href = withOutcome('/ai/prompts', 'created', { feature: 'a.b', version })
      expect(new URLSearchParams(href.split('?')[1] ?? '').get(RESULT_PARAMS.version)).toBeNull()
    }
  })

  it('drops the last answer from a paging link', () => {
    const query = toQueryRecord({ result: 'activated', pf: 'a.b', pv: '4', status: 'draft' })
    expect(withoutResultParams(query)).toEqual({ status: 'draft' })
  })

  it('builds a query with the keys in a stable order', () => {
    expect(hrefWithQuery('/ai/prompts', { status: 'draft', feature: 'a.b' })).toBe(
      '/ai/prompts?feature=a.b&status=draft',
    )
    expect(hrefWithQuery('/ai/prompts', {})).toBe('/ai/prompts')
  })

  it('recognises a uuid route parameter and refuses anything else', () => {
    expect(isUuidParam('3f2a1c44-0000-4000-8000-000000000001')).toBe(true)
    expect(isUuidParam('..%2F..%2Fetc')).toBe(false)
  })
})
