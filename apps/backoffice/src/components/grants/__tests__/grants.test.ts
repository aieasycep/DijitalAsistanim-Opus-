import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { fixedClock } from '@da/domain'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GRANT_KIND,
  ENTITLEMENT_SOURCES,
  GRANTS_PATH,
  GRANT_DAY_SUGGESTIONS,
  GRANT_EFFECTS,
  GRANT_KINDS,
  GRANT_OUTCOMES,
  GRANT_STATUSES,
  LIST_PARAMS,
  RESULT_PARAMS,
  grantListParamValues,
  grantPath,
  hrefWithQuery,
  isFiltered,
  isGrantKind,
  isGrantOutcome,
  isGrantSortKey,
  isGrantStatus,
  isUuidParam,
  parseGrantListParams,
  toQueryRecord,
  userPath,
  withOutcome,
  withoutResultParams,
} from '../contract.ts'
import {
  adminLabel,
  entitlementSourceTone,
  grantEffectTone,
  grantStatusOf,
  grantStatusTone,
  outcomeTone,
  shareOf,
} from '../presentation.ts'
import { expiresAfterDays } from '../../../lib/expiry.ts'
import { grantOutcomeMessages } from '../../../lib/messages/grants.ts'

/**
 * Temporary Pro grants: free months, made visible.
 *
 * The area's central design decision is a negative one — the console does not
 * know how long a grant may be. `admin_entitlement_grants_days_range` decides
 * that, and copying "1 and 365" into a Zod schema would create a second bound
 * that drifts the first time finance changes the first. So the tests below
 * check that the console offers *suggestions* and enforces nothing, that the
 * window it computes is derived from the injected clock rather than from a
 * posted date, and that the database's bound is still where it was.
 */

const UUID = '3f2a1c44-0000-4000-8000-000000000001'
const OTHER_UUID = '3f2a1c44-0000-4000-8000-000000000002'

describe('grant days are suggestions, not bounds', () => {
  it('offers the durations an operator actually types', () => {
    expect([...GRANT_DAY_SUGGESTIONS]).toEqual([7, 14, 30, 90])
  })

  it('declares no minimum and no maximum of its own', () => {
    const source = readFileSync(fileURLToPath(new URL('../contract.ts', import.meta.url)), 'utf8')
    // The one number that must not appear as a console-side ceiling.
    expect(source).not.toMatch(/GRANT_DAYS_(MIN|MAX)/)
    expect(source).toContain('admin_entitlement_grants_days_range')
  })

  it('leaves the range where the database declares it', () => {
    const sql = readFileSync(
      fileURLToPath(
        new URL('../../../../../../supabase/migrations/0019_admin_platform.sql', import.meta.url),
      ),
      'utf8',
    )
    expect(sql).toContain('admin_entitlement_grants_days_range')
    expect(sql).toContain('days between 1 and 365')
  })
})

describe('the window a grant opens', () => {
  const grantedAt = fixedClock('2026-09-08T09:30:00.000Z').now()

  it('is computed from the injected instant, not from anything posted', () => {
    expect(expiresAfterDays(grantedAt, 30).toISOString()).toBe('2026-10-08T09:30:00.000Z')
  })

  it('ends strictly after it starts for every duration the form suggests', () => {
    // `admin_entitlement_grants_window_ordered` requires exactly this.
    for (const days of GRANT_DAY_SUGGESTIONS) {
      expect(expiresAfterDays(grantedAt, days).getTime()).toBeGreaterThan(grantedAt.getTime())
    }
  })

  it('is exact for durations that cross a daylight boundary, because it is UTC arithmetic', () => {
    // Türkiye has been on permanent UTC+3 since 2016, but the window is an
    // instant either way: 90 days is 90 × 86 400 000 milliseconds.
    const ninety = expiresAfterDays(grantedAt, 90)
    expect(ninety.getTime() - grantedAt.getTime()).toBe(90 * 86_400_000)
  })

  it('does not silently accept a duration the database would refuse', () => {
    // The console computes the window for any whole number; the row is what
    // gets refused, and the form says the database refused it.
    expect(expiresAfterDays(grantedAt, 0).getTime()).toBe(grantedAt.getTime())
    expect(expiresAfterDays(grantedAt, 400).getTime()).toBeGreaterThan(grantedAt.getTime())
  })
})

describe('the vocabularies', () => {
  it('knows its own kinds, statuses, effects and sources', () => {
    for (const kind of GRANT_KINDS) expect(isGrantKind(kind)).toBe(true)
    for (const status of GRANT_STATUSES) expect(isGrantStatus(status)).toBe(true)
    expect(isGrantKind('free_month')).toBe(false)
    expect(isGrantStatus('pending')).toBe(false)
    expect(GRANT_EFFECTS).toHaveLength(4)
    expect(ENTITLEMENT_SOURCES).toContain('none')
  })

  it('does not list an operator grant as something the product resolver returns', () => {
    // `resolveEntitlements` reads a store subscription and a referral bonus and
    // nothing else; listing `admin_grant` here would describe a rule that does
    // not exist.
    expect(ENTITLEMENT_SOURCES).not.toContain('admin_grant')
  })

  it('starts the form on the kind the column itself defaults to', () => {
    expect(DEFAULT_GRANT_KIND).toBe('goodwill')
    expect(isGrantKind(DEFAULT_GRANT_KIND)).toBe(true)
  })
})

describe("grantStatusOf — revoked outranks the view's own liveness", () => {
  it('reports a revoked row as revoked even while its window is open', () => {
    expect(grantStatusOf({ is_live: true, revoked_at: '2026-09-08T00:00:00.000Z' })).toBe('revoked')
  })

  it('separates a running grant from a lapsed one', () => {
    expect(grantStatusOf({ is_live: true, revoked_at: null })).toBe('live')
    expect(grantStatusOf({ is_live: false, revoked_at: null })).toBe('expired')
  })

  it('only ever answers with a status the filter above the table offers', () => {
    for (const isLive of [true, false]) {
      for (const revokedAt of [null, '2026-09-08T00:00:00.000Z']) {
        expect(GRANT_STATUSES).toContain(grantStatusOf({ is_live: isLive, revoked_at: revokedAt }))
      }
    }
  })
})

describe('tones — a free month is a cost, not a success', () => {
  it('does not paint a running grant green', () => {
    expect(grantStatusTone('live')).toBe('primary')
    expect(grantStatusTone('revoked')).toBe('warning')
    expect(grantStatusTone('expired')).toBe('neutral')
    expect(Object.values(GRANT_STATUSES.map(grantStatusTone))).not.toContain('success')
  })

  it('reads writing a grant as a fact and stopping one as good news', () => {
    expect(outcomeTone('granted')).toBe('primary')
    expect(outcomeTone('revoked')).toBe('success')
  })

  it('warns only about goodwill spent on an account that is already paying', () => {
    expect(grantEffectTone('overlaps_store')).toBe('warning')
    expect(grantEffectTone('behind_referral')).toBe('info')
    expect(grantEffectTone('only_record')).toBe('neutral')
    expect(grantEffectTone('not_live')).toBe('neutral')
  })

  it('has a tone for every effect and every entitlement source', () => {
    for (const effect of GRANT_EFFECTS) expect(grantEffectTone(effect)).toBeDefined()
    for (const source of ENTITLEMENT_SOURCES) expect(entitlementSourceTone(source)).toBeDefined()
  })

  it('has a tone and a Turkish sentence for every outcome', () => {
    for (const outcome of GRANT_OUTCOMES) {
      expect(outcomeTone(outcome)).toBeDefined()
      expect(isGrantOutcome(outcome)).toBe(true)
      expect(grantOutcomeMessages[outcome].title.length).toBeGreaterThan(0)
      expect(grantOutcomeMessages[outcome].body.length).toBeGreaterThan(0)
    }
    expect(isGrantOutcome('tanımlandı')).toBe(false)
  })

  it('treats a change with no audit row as critical', () => {
    expect(outcomeTone('auditMissing')).toBe('critical')
  })
})

describe('naming and arithmetic on a row', () => {
  it('never leaves an actor cell blank, which would read as "nobody did this"', () => {
    expect(adminLabel(undefined, 'Bilinmiyor')).toBe('Bilinmiyor')
    expect(adminLabel({ name: null, emailRedacted: null }, 'Bilinmiyor')).toBe('Bilinmiyor')
    expect(adminLabel({ name: null, emailRedacted: 'y•••@example.com' }, 'Bilinmiyor')).toBe(
      'y•••@example.com',
    )
    expect(adminLabel({ name: 'Yasemin', emailRedacted: 'y•••@example.com' }, 'Bilinmiyor')).toBe(
      'Yasemin',
    )
  })

  it('reports a share of nothing as nothing rather than dividing by zero', () => {
    expect(shareOf(3, 12)).toBe(25)
    expect(shareOf(0, 12)).toBe(0)
    expect(shareOf(5, 0)).toBe(0)
    expect(shareOf(5, -1)).toBe(0)
    expect(Number.isFinite(shareOf(1, 0))).toBe(true)
  })
})

describe('the list query string', () => {
  it('keeps only a known status, a known kind and a uuid admin', () => {
    expect(
      parseGrantListParams({
        [LIST_PARAMS.status]: 'live',
        [LIST_PARAMS.kind]: 'goodwill',
        [LIST_PARAMS.admin]: UUID,
        [LIST_PARAMS.page]: '2',
      }),
    ).toEqual({ status: 'live', kind: 'goodwill', admin: UUID, page: 2 })
  })

  it('drops an admin filter that is not an id, rather than passing it to an order by', () => {
    expect(parseGrantListParams({ admin: 'yasemin@example.com' }).admin).toBeNull()
    expect(parseGrantListParams({ status: 'canlı' }).status).toBeNull()
    expect(parseGrantListParams({ kind: 'gift' }).kind).toBeNull()
  })

  it('clamps a nonsense page to the first one', () => {
    for (const page of ['0', '-3', 'x', '']) {
      expect(parseGrantListParams({ page }).page).toBe(1)
    }
    expect(parseGrantListParams({ page: '3.9' }).page).toBe(3)
  })

  it('round-trips its own values back to strings for the filter bar', () => {
    const parsed = parseGrantListParams({ status: 'revoked', kind: 'compensation', page: '4' })
    expect(grantListParamValues(parsed)).toEqual({
      status: 'revoked',
      kind: 'compensation',
      admin: '',
      page: '4',
    })
    expect(grantListParamValues(parseGrantListParams({})).page).toBe('')
  })

  it('knows when the list is narrowed, so the empty state says the right thing', () => {
    expect(isFiltered(parseGrantListParams({}))).toBe(false)
    expect(isFiltered(parseGrantListParams({ page: '3' }))).toBe(false)
    expect(isFiltered(parseGrantListParams({ status: 'live' }))).toBe(true)
  })

  it('orders only by a real column of the view', () => {
    expect(isGrantSortKey('granted_at')).toBe(true)
    expect(isGrantSortKey('reason')).toBe(false)
  })
})

describe('links an action lands on carry an id, never an address', () => {
  it('names the grant by its own uuid', () => {
    expect(withOutcome(GRANTS_PATH, 'granted', UUID)).toBe(
      `${GRANTS_PATH}?result=granted&grant=${UUID}`,
    )
  })

  it('refuses to put anything that is not a uuid on the URL', () => {
    for (const bad of ['yasemin@example.com', '../../etc', '']) {
      const href = withOutcome(GRANTS_PATH, 'failed', bad)
      expect(new URLSearchParams(href.split('?')[1] ?? '').get(RESULT_PARAMS.grant)).toBeNull()
      expect(href).not.toContain('yasemin')
    }
  })

  it('builds the record and user paths from ids', () => {
    expect(grantPath(UUID)).toBe(`${GRANTS_PATH}/${UUID}`)
    expect(userPath(OTHER_UUID)).toBe(`/users/${OTHER_UUID}`)
    expect(isUuidParam(UUID)).toBe(true)
    expect(isUuidParam('3f2a1c44')).toBe(false)
  })

  it('drops the last answer from a paging link', () => {
    const query = toQueryRecord({ result: 'revoked', grant: UUID, status: 'live', page: '2' })
    expect(withoutResultParams(query)).toEqual({ status: 'live', page: '2' })
  })

  it('builds a query with the keys in a stable order', () => {
    expect(hrefWithQuery(GRANTS_PATH, { status: 'live', kind: 'goodwill' })).toBe(
      `${GRANTS_PATH}?kind=goodwill&status=live`,
    )
    expect(hrefWithQuery(GRANTS_PATH, {})).toBe(GRANTS_PATH)
  })
})
