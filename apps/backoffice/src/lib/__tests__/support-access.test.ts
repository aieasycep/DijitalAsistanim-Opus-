import { isAppError } from '@da/domain'
import { describe, expect, it } from 'vitest'
import { ADMIN_ROLES, permissionsForRole, type AdminPermission } from '../permissions.ts'
import {
  SCOPE_DESCRIPTIONS_TR,
  SCOPE_LABELS_TR,
  SCOPE_SENSITIVITY_ORDER,
  SUPPORT_ACCESS_SCOPES,
  SUPPORT_ACCESS_STATUSES,
  assertRevealAllowed,
  evaluateReveal,
  grantCoversScope,
  grantMinutesRemaining,
  hidden,
  isGrantLive,
  isSupportAccessScope,
  isSupportAccessStatus,
  revealOrHide,
  revealed,
  type GrantSnapshot,
  type RevealRequest,
  type SupportAccessScope,
} from '../redact.ts'

/**
 * Support Access: the gate, not the workflow.
 *
 * `support-access.ts` is a thin server wrapper — it loads a grant, calls the
 * guard below, rate-limits, calls the `sa_*` function and writes the audit row.
 * Every decision it makes is made here, in pure code, which is what lets this
 * file prove the property that matters most: **a reveal without a live,
 * matching grant is refused**, and it is refused before anything reaches
 * Postgres.
 */

const ADMIN = 'a0000000-0000-4000-8000-000000000001'
const OTHER_ADMIN = 'a0000000-0000-4000-8000-000000000002'
const SUBJECT = 'b0000000-0000-4000-8000-000000000001'
const OTHER_SUBJECT = 'b0000000-0000-4000-8000-000000000002'
const NOW = new Date('2026-09-08T10:00:00.000Z')

function at(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60_000)
}

function grant(over: Partial<GrantSnapshot> = {}): GrantSnapshot {
  return {
    grantId: 'g0000000-0000-4000-8000-000000000001',
    adminUserId: ADMIN,
    subjectUserId: SUBJECT,
    scopes: ['email_subject'],
    status: 'active',
    grantedAt: at(-10),
    expiresAt: at(50),
    revokedAt: null,
    ...over,
  }
}

function request(over: Partial<RevealRequest> = {}): RevealRequest {
  return {
    grant: grant(),
    adminUserId: ADMIN,
    subjectUserId: SUBJECT,
    scope: 'email_subject',
    permissions: permissionsForRole('support'),
    now: NOW,
    ...over,
  }
}

describe('the scope vocabulary', () => {
  it('declares eight scopes, each labelled and described in Turkish', () => {
    expect(SUPPORT_ACCESS_SCOPES).toHaveLength(8)
    expect(new Set(SUPPORT_ACCESS_SCOPES).size).toBe(8)
    for (const scope of SUPPORT_ACCESS_SCOPES) {
      expect(SCOPE_LABELS_TR[scope].length).toBeGreaterThan(0)
      expect(SCOPE_DESCRIPTIONS_TR[scope].length).toBeGreaterThan(0)
    }
  })

  it('orders the request form least-revealing first', () => {
    expect([...SCOPE_SENSITIVITY_ORDER].sort()).toEqual([...SUPPORT_ACCESS_SCOPES].sort())
    expect(SCOPE_SENSITIVITY_ORDER[0]).toBe('identity')
    expect(SCOPE_SENSITIVITY_ORDER[SCOPE_SENSITIVITY_ORDER.length - 1]).toBe('email_body')
    expect(SCOPE_SENSITIVITY_ORDER.indexOf('email_subject')).toBeLessThan(
      SCOPE_SENSITIVITY_ORDER.indexOf('email_body'),
    )
  })

  it('narrows unknown scopes and statuses instead of coercing them', () => {
    expect(isSupportAccessScope('email_body')).toBe(true)
    expect(isSupportAccessScope('email_bodies')).toBe(false)
    expect(isSupportAccessScope(null)).toBe(false)
    expect(isSupportAccessStatus('active')).toBe(true)
    expect(isSupportAccessStatus('live')).toBe(false)
    expect(SUPPORT_ACCESS_STATUSES).toHaveLength(5)
  })
})

describe('isGrantLive', () => {
  it('is live only while approved, started, unrevoked and inside the window', () => {
    expect(isGrantLive(grant(), NOW)).toBe(true)
  })

  it('is not live before an approver has acted', () => {
    expect(isGrantLive(grant({ status: 'pending_approval', grantedAt: null }), NOW)).toBe(false)
    expect(isGrantLive(grant({ grantedAt: null }), NOW)).toBe(false)
  })

  it('is not live once revoked, even with time on the clock', () => {
    expect(isGrantLive(grant({ status: 'revoked', revokedAt: at(-1) }), NOW)).toBe(false)
    // A revoked_at with a stale `active` status is still refused.
    expect(isGrantLive(grant({ revokedAt: at(-1) }), NOW)).toBe(false)
  })

  it('is not live after it expires, whatever the status column still says', () => {
    // This is the sweep lag: `admin_cleanup_expired()` has not run yet, so the
    // row still reads `active`. The timestamps decide, so the lag is cosmetic.
    const lapsed = grant({ expiresAt: at(-1) })
    expect(lapsed.status).toBe('active')
    expect(isGrantLive(lapsed, NOW)).toBe(false)
  })

  it('treats the expiry instant itself as over', () => {
    expect(isGrantLive(grant({ expiresAt: NOW }), NOW)).toBe(false)
  })

  it('is not live before its start instant', () => {
    expect(isGrantLive(grant({ grantedAt: at(5) }), NOW)).toBe(false)
  })

  it('counts down in whole minutes and floors at zero', () => {
    expect(grantMinutesRemaining(grant({ expiresAt: at(50) }), NOW)).toBe(50)
    expect(grantMinutesRemaining(grant({ expiresAt: at(-30) }), NOW)).toBe(0)
  })

  it('covers only the scopes it names', () => {
    const g = grant({ scopes: ['identity', 'email_subject'] })
    expect(grantCoversScope(g, 'identity')).toBe(true)
    expect(grantCoversScope(g, 'email_body')).toBe(false)
  })
})

describe('a reveal without a grant is refused', () => {
  it('refuses when there is no grant at all — the ordinary case', () => {
    expect(evaluateReveal(request({ grant: null }))).toEqual({
      allowed: false,
      reason: 'grant_not_live',
    })
  })

  it('throws rather than returning a value the caller might ignore', () => {
    expect(() => assertRevealAllowed(request({ grant: null }))).toThrowError()
    try {
      assertRevealAllowed(request({ grant: null }))
      expect.unreachable('assertRevealAllowed must throw without a grant')
    } catch (error) {
      expect(isAppError(error)).toBe(true)
      if (isAppError(error)) {
        expect(error.code).toBe('forbidden')
        expect(error.status).toBe(403)
      }
    }
  })

  it('refuses every scope, for every role, when no grant is presented', () => {
    for (const role of ADMIN_ROLES) {
      for (const scope of SUPPORT_ACCESS_SCOPES) {
        const decision = evaluateReveal(
          request({ grant: null, scope, permissions: permissionsForRole(role) }),
        )
        expect(decision.allowed, `${role} must not reveal ${scope} without a grant`).toBe(false)
      }
    }
  })

  it('refuses even a super_admin, because a grant is not a permission', () => {
    expect(
      evaluateReveal(request({ grant: null, permissions: permissionsForRole('super_admin') }))
        .allowed,
    ).toBe(false)
  })
})

describe('the five checks, in order', () => {
  it('refuses a role without support.access.reveal before anything else', () => {
    // Operations may approve a grant but may not spend one. Even holding a
    // perfectly live grant, the reveal is refused on the permission.
    expect(evaluateReveal(request({ permissions: permissionsForRole('operations') }))).toEqual({
      allowed: false,
      reason: 'permission_denied',
    })
    for (const role of ADMIN_ROLES) {
      const permissions = permissionsForRole(role)
      const canReveal = permissions.has('support.access.reveal' as AdminPermission)
      const decision = evaluateReveal(request({ permissions }))
      expect(decision.allowed, `${role}`).toBe(canReveal)
    }
  })

  it("refuses another admin's grant", () => {
    expect(evaluateReveal(request({ adminUserId: OTHER_ADMIN }))).toEqual({
      allowed: false,
      reason: 'wrong_admin',
    })
  })

  it('refuses a grant covering a different user', () => {
    expect(evaluateReveal(request({ subjectUserId: OTHER_SUBJECT }))).toEqual({
      allowed: false,
      reason: 'wrong_subject',
    })
  })

  it('refuses an expired grant', () => {
    expect(evaluateReveal(request({ now: at(120) }))).toEqual({
      allowed: false,
      reason: 'grant_not_live',
    })
  })

  it('refuses a revoked grant', () => {
    expect(
      evaluateReveal(request({ grant: grant({ status: 'revoked', revokedAt: at(-1) }) })),
    ).toEqual({ allowed: false, reason: 'grant_not_live' })
  })

  it('refuses a grant awaiting approval — self-service is not access', () => {
    expect(
      evaluateReveal(request({ grant: grant({ status: 'pending_approval', grantedAt: null }) })),
    ).toEqual({ allowed: false, reason: 'grant_not_live' })
  })

  it('refuses a scope the grant does not name', () => {
    expect(evaluateReveal(request({ scope: 'email_body' }))).toEqual({
      allowed: false,
      reason: 'scope_denied',
    })
  })

  it('allows only when all five hold', () => {
    expect(evaluateReveal(request())).toEqual({ allowed: true })
    expect(() => assertRevealAllowed(request())).not.toThrow()
  })

  it('allows exactly the scopes the grant names and no others', () => {
    const granted: readonly SupportAccessScope[] = ['identity', 'assistant_conversation']
    const g = grant({ scopes: granted })
    for (const scope of SUPPORT_ACCESS_SCOPES) {
      expect(evaluateReveal(request({ grant: g, scope })).allowed).toBe(granted.includes(scope))
    }
  })
})

describe('revealOrHide — the value or a named refusal', () => {
  it('hands over the value when the grant covers it', () => {
    const result = revealOrHide('Fatura hatırlatması', request())
    expect(result).toEqual({ revealed: true, value: 'Fatura hatırlatması' })
  })

  it('hides with `no_grant` when there is no grant', () => {
    const result = revealOrHide('Fatura hatırlatması', request({ grant: null }))
    expect(result.revealed).toBe(false)
    if (!result.revealed) {
      expect(result.reason).toBe('no_grant')
      expect(result.label).toBe('Gizli')
    }
  })

  it('hides with `grant_expired` when a grant existed but has lapsed', () => {
    const result = revealOrHide('Fatura hatırlatması', request({ now: at(120) }))
    expect(result.revealed).toBe(false)
    if (!result.revealed) expect(result.reason).toBe('grant_expired')
  })

  it('hides with `scope_not_granted` for a scope outside the grant', () => {
    const result = revealOrHide('gövde', request({ scope: 'email_body' }))
    expect(result.revealed).toBe(false)
    if (!result.revealed) expect(result.reason).toBe('scope_not_granted')
  })

  it('hides with the privacy default when the role may not reveal at all', () => {
    const result = revealOrHide('gövde', request({ permissions: permissionsForRole('analyst') }))
    expect(result.revealed).toBe(false)
    if (!result.revealed) expect(result.reason).toBe('privacy_default')
  })

  it('distinguishes a revealed value from a hidden one at the type level', () => {
    expect(revealed(42)).toEqual({ revealed: true, value: 42 })
    expect(hidden<number>('aggregate_only').revealed).toBe(false)
  })
})
