import { fixedClock } from '@da/domain'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SUPPORT_ACCESS_WINDOW_MINUTES,
  GRANTS_PAGE_SIZE,
  GRANT_STATUS_OPTIONS,
  HOLDER_FILTERS,
  LIST_PARAMS,
  MAX_SUPPORT_ACCESS_REASON,
  MAX_SUPPORT_ACCESS_WINDOW_MINUTES,
  MIN_SUPPORT_ACCESS_REASON,
  REASON_HELP_TR,
  REVEAL_PAGE_PARAM,
  SUPPORT_ACCESS_PATH,
  SUPPORT_ACCESS_WINDOW_OPTIONS,
  clampWindowMinutes,
  effectiveStatus,
  firstParam,
  grantHref,
  grantListParamValues,
  grantStatusTone,
  isHolderFilter,
  isLapsedButUnswept,
  isOutcomeKey,
  isUuidParam,
  isValidSupportAccessReason,
  orderedScopes,
  parseGrantListParams,
  toGrantSnapshot,
  toQueryRecord,
  userHref,
  withOutcome,
  type GrantRowShape,
} from '../contract.ts'
import { SCOPE_SENSITIVITY_ORDER, SUPPORT_ACCESS_SCOPES, isGrantLive } from '../../../lib/redact.ts'

/**
 * The Support Access screens: what an operator is shown about a capability
 * somebody currently holds over another person's account.
 *
 * `lib/__tests__/support-access.test.ts` proves the gate — a reveal without a
 * live, matching grant is refused. This file covers the half a reviewer sees,
 * and the property that matters there is the opposite of the gate's: the screen
 * must not show a **live** badge over a **dead** permission.
 * `admin_cleanup_expired()` moves lapsed grants to `expired` on a schedule, so
 * a row can read `active` for a while after its window closed. The timestamps
 * are the truth — that is what `sa_assert_grant()` checks in Postgres — so the
 * badge is derived from the clock and the screen explains the difference.
 */

const ADMIN = 'a0000000-0000-4000-8000-000000000001'
const SUBJECT = 'b0000000-0000-4000-8000-000000000001'
const GRANT = 'c0000000-0000-4000-8000-000000000001'

const NOW = fixedClock('2026-09-08T12:00:00.000Z').now()

function row(overrides: Partial<GrantRowShape> = {}): GrantRowShape {
  return {
    grant_id: GRANT,
    admin_user_id: ADMIN,
    subject_user_id: SUBJECT,
    scopes: ['identity'],
    status: 'active',
    granted_at: '2026-09-08T11:00:00.000Z',
    expires_at: '2026-09-08T13:00:00.000Z',
    revoked_at: null,
    ...overrides,
  }
}

describe('effectiveStatus — the timestamps are the truth, not the stored status', () => {
  it('shows a running grant as active', () => {
    expect(effectiveStatus(row(), NOW)).toBe('active')
    expect(isLapsedButUnswept(row(), NOW)).toBe(false)
  })

  it('shows a lapsed but unswept grant as expired, never as live', () => {
    const lapsed = row({ expires_at: '2026-09-08T11:59:59.999Z' })
    expect(lapsed.status).toBe('active')
    expect(effectiveStatus(lapsed, NOW)).toBe('expired')
    expect(isLapsedButUnswept(lapsed, NOW)).toBe(true)
  })

  it('closes the window at the expiry instant, inclusive', () => {
    // `sa_assert_grant()` compares against `now()`, so the last usable instant
    // is strictly before `expires_at`.
    expect(effectiveStatus(row({ expires_at: '2026-09-08T12:00:00.000Z' }), NOW)).toBe('expired')
    expect(effectiveStatus(row({ expires_at: '2026-09-08T12:00:00.001Z' }), NOW)).toBe('active')
  })

  it('shows a grant whose window has not opened as expired rather than as live', () => {
    const notYet = row({ granted_at: '2026-09-08T12:00:00.001Z' })
    expect(effectiveStatus(notYet, NOW)).toBe('expired')
  })

  it('shows a grant that was never approved as expired rather than as live', () => {
    expect(effectiveStatus(row({ granted_at: null }), NOW)).toBe('expired')
  })

  it('leaves every other stored status alone', () => {
    for (const status of ['pending_approval', 'denied', 'revoked', 'expired'] as const) {
      expect(effectiveStatus(row({ status }), NOW)).toBe(status)
      expect(isLapsedButUnswept(row({ status }), NOW)).toBe(false)
    }
  })

  it('agrees with the reveal gate about which grants are live', () => {
    const rows = [
      row(),
      row({ expires_at: '2026-09-08T11:00:00.000Z' }),
      row({ revoked_at: '2026-09-08T11:30:00.000Z' }),
      row({ granted_at: null }),
    ]
    for (const candidate of rows) {
      const live = isGrantLive(toGrantSnapshot(candidate), NOW)
      expect(effectiveStatus(candidate, NOW) === 'active').toBe(live)
    }
  })
})

describe('toGrantSnapshot — an unrecognised scope must never widen a grant', () => {
  it('drops a scope the console does not know', () => {
    const snapshot = toGrantSnapshot(row({ scopes: ['identity', 'read_everything'] }))
    expect(snapshot.scopes).toEqual(['identity'])
  })

  it('carries the instants as instants, and a null as a null', () => {
    const snapshot = toGrantSnapshot(row({ revoked_at: null, granted_at: null }))
    expect(snapshot.grantedAt).toBeNull()
    expect(snapshot.revokedAt).toBeNull()
    expect(snapshot.expiresAt.toISOString()).toBe('2026-09-08T13:00:00.000Z')
  })

  it('carries the identifiers through unchanged', () => {
    const snapshot = toGrantSnapshot(row())
    expect(snapshot.grantId).toBe(GRANT)
    expect(snapshot.adminUserId).toBe(ADMIN)
    expect(snapshot.subjectUserId).toBe(SUBJECT)
  })

  it('yields an empty scope set when every member was unrecognised', () => {
    // Empty is the safe direction: `grantCoversScope` then matches nothing.
    expect(toGrantSnapshot(row({ scopes: ['everything', 'anything'] })).scopes).toEqual([])
  })
})

describe('orderedScopes — sensitivity order, whatever order they arrived in', () => {
  it('sorts by the declared order rather than by the array it was given', () => {
    expect(orderedScopes(['email_body', 'identity'], SCOPE_SENSITIVITY_ORDER)).toEqual([
      'identity',
      'email_body',
    ])
  })

  it('drops an unrecognised member and de-duplicates', () => {
    expect(orderedScopes(['identity', 'identity', 'nope'], SCOPE_SENSITIVITY_ORDER)).toEqual([
      'identity',
    ])
  })

  it('covers every scope the redaction module declares', () => {
    expect(orderedScopes([...SUPPORT_ACCESS_SCOPES], SCOPE_SENSITIVITY_ORDER)).toHaveLength(
      SUPPORT_ACCESS_SCOPES.length,
    )
  })
})

describe('clampWindowMinutes — every wrong answer is a shorter grant', () => {
  it('leaves a legal window alone', () => {
    for (const minutes of SUPPORT_ACCESS_WINDOW_OPTIONS) {
      expect(clampWindowMinutes(minutes)).toBe(minutes)
    }
  })

  it('brings anything past the ceiling back to the ceiling', () => {
    expect(clampWindowMinutes(MAX_SUPPORT_ACCESS_WINDOW_MINUTES + 1)).toBe(
      MAX_SUPPORT_ACCESS_WINDOW_MINUTES,
    )
    expect(clampWindowMinutes(60 * 24 * 30)).toBe(MAX_SUPPORT_ACCESS_WINDOW_MINUTES)
    expect(clampWindowMinutes(Number.MAX_SAFE_INTEGER)).toBe(MAX_SUPPORT_ACCESS_WINDOW_MINUTES)
  })

  it('brings anything below a minute up to one minute, never to zero', () => {
    for (const minutes of [0, -1, -10_000, 0.4]) {
      expect(clampWindowMinutes(minutes)).toBe(1)
    }
  })

  it('floors a fraction rather than rounding it up', () => {
    expect(clampWindowMinutes(59.9)).toBe(59)
    expect(clampWindowMinutes(1.999)).toBe(1)
  })

  it('falls back to the default, not to the maximum, for a value that is not a number', () => {
    for (const minutes of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(clampWindowMinutes(minutes)).toBe(DEFAULT_SUPPORT_ACCESS_WINDOW_MINUTES)
    }
    expect(DEFAULT_SUPPORT_ACCESS_WINDOW_MINUTES).toBeLessThan(MAX_SUPPORT_ACCESS_WINDOW_MINUTES)
  })

  it('never returns anything outside the range the constraint accepts', () => {
    const inputs = [-5, 0, 1, 59.5, 60, 1_439, 1_440, 1_441, 1e9, Number.NaN]
    for (const minutes of inputs) {
      const clamped = clampWindowMinutes(minutes)
      expect(Number.isInteger(clamped)).toBe(true)
      expect(clamped).toBeGreaterThanOrEqual(1)
      expect(clamped).toBeLessThanOrEqual(MAX_SUPPORT_ACCESS_WINDOW_MINUTES)
    }
  })

  it('offers only windows it would not itself clamp, shortest first', () => {
    for (const minutes of SUPPORT_ACCESS_WINDOW_OPTIONS) {
      expect(minutes).toBeLessThanOrEqual(MAX_SUPPORT_ACCESS_WINDOW_MINUTES)
    }
    const options = [...SUPPORT_ACCESS_WINDOW_OPTIONS]
    expect([...options].sort((a, b) => a - b)).toEqual(options)
    expect(MAX_SUPPORT_ACCESS_WINDOW_MINUTES).toBe(24 * 60)
  })
})

describe('the written reason a request has to carry', () => {
  it('asks for a sentence an auditor could weigh', () => {
    expect(isValidSupportAccessReason('x'.repeat(MIN_SUPPORT_ACCESS_REASON))).toBe(true)
    expect(isValidSupportAccessReason('x'.repeat(MIN_SUPPORT_ACCESS_REASON - 1))).toBe(false)
    expect(isValidSupportAccessReason('')).toBe(false)
  })

  it('does not count padding as a reason', () => {
    expect(isValidSupportAccessReason(`  ${'x'.repeat(MIN_SUPPORT_ACCESS_REASON - 1)}  `)).toBe(
      false,
    )
  })

  it('refuses a paragraph nobody will read on the approval screen', () => {
    expect(isValidSupportAccessReason('x'.repeat(MAX_SUPPORT_ACCESS_REASON))).toBe(true)
    expect(isValidSupportAccessReason('x'.repeat(MAX_SUPPORT_ACCESS_REASON + 1))).toBe(false)
  })

  it('tells the operator the floor in the same number it enforces', () => {
    expect(REASON_HELP_TR).toContain(String(MIN_SUPPORT_ACCESS_REASON))
  })
})

describe('the grant list query string', () => {
  it('keeps only a known status, a known holder filter and a uuid subject', () => {
    expect(
      parseGrantListParams({
        [LIST_PARAMS.status]: 'active',
        [LIST_PARAMS.live]: '1',
        [LIST_PARAMS.holder]: 'mine',
        [LIST_PARAMS.subject]: SUBJECT,
        [LIST_PARAMS.page]: '2',
      }),
    ).toEqual({
      status: 'active',
      liveOnly: true,
      holder: 'mine',
      subject: SUBJECT,
      subjectRejected: false,
      page: 2,
    })
  })

  it('says a subject was refused rather than searching for something else', () => {
    const rejected = parseGrantListParams({ subject: 'yasemin@example.com' })
    expect(rejected.subject).toBeNull()
    expect(rejected.subjectRejected).toBe(true)
    expect(JSON.stringify(rejected)).not.toContain('yasemin')
  })

  it('does not report an absent subject as refused', () => {
    const absent = parseGrantListParams({})
    expect(absent.subject).toBeNull()
    expect(absent.subjectRejected).toBe(false)
    expect(absent.liveOnly).toBe(false)
  })

  it('treats anything but `1` as "not live only"', () => {
    expect(parseGrantListParams({ live: 'true' }).liveOnly).toBe(false)
    expect(parseGrantListParams({ live: '0' }).liveOnly).toBe(false)
  })

  it('drops a holder filter it does not recognise', () => {
    expect(parseGrantListParams({ holder: 'everyone' }).holder).toBeNull()
    for (const holder of HOLDER_FILTERS) expect(isHolderFilter(holder)).toBe(true)
  })

  it('clamps a nonsense page to the first one', () => {
    for (const page of ['0', '-1', 'x', '']) {
      expect(parseGrantListParams({ page }).page).toBe(1)
    }
  })

  it('round-trips its own values back to strings for the filter bar', () => {
    const parsed = parseGrantListParams({ status: 'revoked', live: '1', page: '3' })
    expect(grantListParamValues(parsed)).toEqual({
      status: 'revoked',
      live: '1',
      holder: '',
      subject: '',
      page: '3',
    })
  })

  it('gives the reveal log its own pager', () => {
    expect(REVEAL_PAGE_PARAM).not.toBe(LIST_PARAMS.page)
    expect(GRANTS_PAGE_SIZE).toBeGreaterThan(0)
  })

  it('reads the first value of a repeated parameter', () => {
    expect(firstParam({ status: ['active', 'revoked'] }, 'status')).toBe('active')
    expect(firstParam({}, 'status')).toBe('')
  })

  it('offers every status the redaction module declares', () => {
    expect(GRANT_STATUS_OPTIONS).toHaveLength(5)
    for (const status of GRANT_STATUS_OPTIONS) expect(grantStatusTone(status)).toBeDefined()
  })
})

describe('what the screens claim with colour and with a link', () => {
  it('does not read a live grant as good news', () => {
    // It is a capability somebody currently holds over another person's
    // account, and the tile that counts them should read as attention.
    expect(grantStatusTone('active')).toBe('primary')
    expect(grantStatusTone('pending_approval')).toBe('warning')
    expect(grantStatusTone('revoked')).toBe('critical')
    expect(grantStatusTone('denied')).toBe('neutral')
    expect(grantStatusTone('expired')).toBe('neutral')
  })

  it('addresses a grant and a subject by id, never by address', () => {
    expect(grantHref(GRANT)).toBe(`${SUPPORT_ACCESS_PATH}/${GRANT}`)
    expect(userHref(SUBJECT)).toBe(`/users/${SUBJECT}`)
    expect(isUuidParam(GRANT)).toBe(true)
    expect(isUuidParam('not-a-uuid')).toBe(false)
  })

  it('carries a closed-set outcome token and nothing else', () => {
    expect(withOutcome(grantHref(GRANT), 'approved')).toBe(`${grantHref(GRANT)}?result=approved`)
    expect(isOutcomeKey('approved')).toBe(true)
    expect(isOutcomeKey('onaylandı')).toBe(false)
  })

  it("flattens the page's parameters without keeping the empty ones", () => {
    expect(toQueryRecord({ status: 'active', holder: '', subject: undefined })).toEqual({
      status: 'active',
    })
  })
})
