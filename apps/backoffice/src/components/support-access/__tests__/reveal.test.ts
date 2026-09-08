import { fixedClock } from '@da/domain'
import { describe, expect, it } from 'vitest'
import { REVEAL_SCOPE_PARAM, grantHref, revealHref, type GrantRowShape } from '../contract.ts'
import {
  DEFAULT_REVEAL_LISTING_LIMIT,
  MAX_REVEAL_LISTING_LIMIT,
  MAX_REVEAL_RANGE_DAYS,
  REVEAL_LISTING_LIMIT_OPTIONS,
  SCOPE_INPUT_KIND,
  clampRevealLimit,
  resolveRevealRange,
  revealAvailability,
  selectRevealScope,
} from '../reveal.ts'
import { ADMIN_ROLES, permissionsForRole } from '../../../lib/permissions.ts'
import {
  SCOPE_SENSITIVITY_ORDER,
  SUPPORT_ACCESS_SCOPES,
  evaluateReveal,
  type SupportAccessScope,
} from '../../../lib/redact.ts'

/**
 * The reveal console's own decisions.
 *
 * `lib/__tests__/support-access.test.ts` proves the gate: a reveal without a
 * live, matching grant is refused. `__tests__/screens.test.ts` proves the badge:
 * a lapsed grant is never painted as live. This file proves the third thing the
 * screen has to get right, which is what it *offers*.
 *
 * A control that posts a form the database will refuse is worse than no control:
 * it tells an operator the access exists, it makes them type a record id to find
 * out that it does not, and it does all of that on a screen about somebody
 * else's mail. So every scope button is derived from the same guard the reveal
 * itself passes through, and these tests are the proof that the derivation
 * cannot be wider than the grant.
 */

const ADMIN = 'a0000000-0000-4000-8000-000000000001'
const OTHER_ADMIN = 'a0000000-0000-4000-8000-000000000002'
const SUBJECT = 'b0000000-0000-4000-8000-000000000001'
const GRANT = 'c0000000-0000-4000-8000-000000000001'

const NOW = fixedClock('2026-09-08T12:00:00.000Z').now()

function row(overrides: Partial<GrantRowShape> = {}): GrantRowShape {
  return {
    grant_id: GRANT,
    admin_user_id: ADMIN,
    subject_user_id: SUBJECT,
    scopes: ['email_subject', 'identity'],
    status: 'active',
    granted_at: '2026-09-08T11:00:00.000Z',
    expires_at: '2026-09-08T13:00:00.000Z',
    revoked_at: null,
    ...overrides,
  }
}

function ask(overrides: Partial<GrantRowShape> = {}, role: 'support' | 'operations' = 'support') {
  return revealAvailability({
    row: row(overrides),
    viewerAdminUserId: ADMIN,
    permissions: permissionsForRole(role),
    now: NOW,
  })
}

describe('revealAvailability — the screen offers exactly what the grant covers', () => {
  it('offers the granted scopes, least revealing first', () => {
    const availability = ask()
    expect(availability.permitted).toBe(true)
    if (availability.permitted) {
      // Asked for as `email_subject, identity`; offered the other way round,
      // because the cheapest sufficient scope should be the first one reached.
      expect(availability.scopes).toEqual(['identity', 'email_subject'])
    }
  })

  it('never offers a scope the grant does not name', () => {
    const availability = ask({ scopes: ['identity'] })
    expect(availability.permitted).toBe(true)
    if (availability.permitted) {
      expect(availability.scopes).toEqual(['identity'])
      for (const scope of SUPPORT_ACCESS_SCOPES) {
        if (scope === 'identity') continue
        expect(availability.scopes.includes(scope)).toBe(false)
      }
    }
  })

  it('agrees, scope by scope, with the guard the reveal itself passes through', () => {
    const candidate = row({ scopes: ['identity', 'email_body', 'capture_content'] })
    const availability = revealAvailability({
      row: candidate,
      viewerAdminUserId: ADMIN,
      permissions: permissionsForRole('support'),
      now: NOW,
    })
    const offered = availability.permitted ? availability.scopes : []

    for (const scope of SUPPORT_ACCESS_SCOPES) {
      const decision = evaluateReveal({
        grant: {
          grantId: GRANT,
          adminUserId: ADMIN,
          subjectUserId: SUBJECT,
          scopes: ['identity', 'email_body', 'capture_content'],
          status: 'active',
          grantedAt: new Date('2026-09-08T11:00:00.000Z'),
          expiresAt: new Date('2026-09-08T13:00:00.000Z'),
          revokedAt: null,
        },
        adminUserId: ADMIN,
        subjectUserId: SUBJECT,
        scope,
        permissions: permissionsForRole('support'),
        now: NOW,
      })
      expect(offered.includes(scope), scope).toBe(decision.allowed)
    }
  })

  it('offers nothing on a lapsed grant, and says the window is the reason', () => {
    // The stored status still reads `active`: the sweep has not run. The
    // timestamps decide, exactly as `sa_assert_grant()` decides.
    const availability = ask({ expires_at: '2026-09-08T11:59:59.999Z' })
    expect(availability.permitted).toBe(false)
    if (!availability.permitted) expect(availability.reason).toBe('grant_not_live')
  })

  it('offers nothing before an approver has acted', () => {
    const availability = ask({ status: 'pending_approval', granted_at: null })
    expect(availability.permitted).toBe(false)
    if (!availability.permitted) expect(availability.reason).toBe('grant_not_live')
  })

  it('offers nothing once revoked, whatever the clock says', () => {
    const availability = ask({ status: 'revoked', revoked_at: '2026-09-08T11:30:00.000Z' })
    expect(availability.permitted).toBe(false)
    if (!availability.permitted) expect(availability.reason).toBe('grant_not_live')
  })

  it("offers nothing on another administrator's grant, and says so", () => {
    const availability = revealAvailability({
      row: row({ admin_user_id: OTHER_ADMIN }),
      viewerAdminUserId: ADMIN,
      permissions: permissionsForRole('support'),
      now: NOW,
    })
    expect(availability.permitted).toBe(false)
    if (!availability.permitted) expect(availability.reason).toBe('wrong_admin')
  })

  it('offers nothing to a role that may approve a grant but not spend one', () => {
    const availability = ask({}, 'operations')
    expect(availability.permitted).toBe(false)
    if (!availability.permitted) expect(availability.reason).toBe('permission_denied')
  })

  it('offers only what each role could actually spend, across the whole matrix', () => {
    for (const role of ADMIN_ROLES) {
      const permissions = permissionsForRole(role)
      const availability = revealAvailability({
        row: row(),
        viewerAdminUserId: ADMIN,
        permissions,
        now: NOW,
      })
      expect(availability.permitted, role).toBe(permissions.has('support.access.reveal'))
    }
  })

  it('offers nothing when every stored scope is one the console does not know', () => {
    // `toGrantSnapshot` drops an unrecognised member rather than passing it on,
    // so a grant naming only unknown scopes covers nothing at all.
    const availability = ask({ scopes: ['read_everything'] })
    expect(availability.permitted).toBe(false)
    if (!availability.permitted) expect(availability.reason).toBe('scope_denied')
  })

  it('counts the remaining window down in whole minutes and floors it at zero', () => {
    expect(ask().minutesRemaining).toBe(60)
    expect(ask({ expires_at: '2026-09-08T12:43:30.000Z' }).minutesRemaining).toBe(43)
    expect(ask({ expires_at: '2026-09-08T11:00:00.000Z' }).minutesRemaining).toBe(0)
  })

  it('reports the remaining window even when nothing may be spent', () => {
    // The refusal screen still shows a countdown, and a negative or absent one
    // would read as a bug rather than as a closed window.
    const refused = ask({ admin_user_id: OTHER_ADMIN })
    expect(refused.minutesRemaining).toBe(60)
  })
})

describe('selectRevealScope — a scope on the URL is not an authorisation', () => {
  const offered: readonly SupportAccessScope[] = ['identity', 'email_subject']

  it('selects nothing when nothing was asked for', () => {
    expect(selectRevealScope('', offered)).toEqual({ scope: null, rejected: false })
  })

  it('selects a scope the grant covers', () => {
    expect(selectRevealScope('email_subject', offered)).toEqual({
      scope: 'email_subject',
      rejected: false,
    })
  })

  it('refuses a real scope this grant does not cover, and says it refused', () => {
    expect(selectRevealScope('email_body', offered)).toEqual({ scope: null, rejected: true })
  })

  it('refuses a scope that is not in the enum at all', () => {
    for (const raw of ['everything', 'EMAIL_BODY', 'identity;drop', '../identity']) {
      expect(selectRevealScope(raw, offered), raw).toEqual({ scope: null, rejected: true })
    }
  })

  it('offers nothing at all when the grant permits nothing', () => {
    for (const scope of SUPPORT_ACCESS_SCOPES) {
      expect(selectRevealScope(scope, []).scope).toBeNull()
    }
  })
})

describe('the form each scope needs, from the signatures in 0019', () => {
  it('declares one input kind for every scope and no others', () => {
    expect(Object.keys(SCOPE_INPUT_KIND).sort()).toEqual([...SUPPORT_ACCESS_SCOPES].sort())
  })

  it('asks for a record id exactly where the function takes one', () => {
    expect(SCOPE_INPUT_KIND.identity).toBe('none')
    expect(SCOPE_INPUT_KIND.email_subject).toBe('listing')
    expect(SCOPE_INPUT_KIND.calendar_detail).toBe('range')
    for (const scope of [
      'email_body',
      'assistant_conversation',
      'capture_content',
      'approval_payload',
      'notification_content',
    ] as const) {
      expect(SCOPE_INPUT_KIND[scope], scope).toBe('record')
    }
  })

  it('orders the picker by sensitivity, as the request form orders its boxes', () => {
    expect([...SCOPE_SENSITIVITY_ORDER].sort()).toEqual([...SUPPORT_ACCESS_SCOPES].sort())
  })
})

describe('clampRevealLimit — every wrong answer is a smaller listing', () => {
  it('leaves an offered size alone', () => {
    for (const limit of REVEAL_LISTING_LIMIT_OPTIONS) {
      expect(clampRevealLimit(limit)).toBe(limit)
    }
  })

  it('brings anything past the ceiling back to the ceiling the function enforces', () => {
    expect(clampRevealLimit(MAX_REVEAL_LISTING_LIMIT + 1)).toBe(MAX_REVEAL_LISTING_LIMIT)
    expect(clampRevealLimit(100_000)).toBe(MAX_REVEAL_LISTING_LIMIT)
  })

  it('never returns zero, a fraction or a negative', () => {
    for (const limit of [0, -1, 0.5, -999]) {
      expect(clampRevealLimit(limit)).toBe(1)
    }
    expect(clampRevealLimit(25.9)).toBe(25)
  })

  it('falls back to the default rather than to the maximum for a non-number', () => {
    for (const limit of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(clampRevealLimit(limit)).toBe(DEFAULT_REVEAL_LISTING_LIMIT)
    }
    expect(DEFAULT_REVEAL_LISTING_LIMIT).toBeLessThan(MAX_REVEAL_LISTING_LIMIT)
  })

  it('offers only sizes it would not itself clamp, smallest first', () => {
    const options = [...REVEAL_LISTING_LIMIT_OPTIONS]
    expect([...options].sort((a, b) => a - b)).toEqual(options)
    for (const limit of options) expect(limit).toBeLessThanOrEqual(MAX_REVEAL_LISTING_LIMIT)
  })
})

describe('resolveRevealRange — days in Istanbul, instants for Postgres', () => {
  it('covers one whole day, with an exclusive upper bound', () => {
    // `sa_reveal_calendar_events` filters `starts_at >= p_from and < p_to`, so
    // an event at 23:59 on the closing day has to fall inside the range.
    const range = resolveRevealRange('2026-09-08', '2026-09-08')
    expect(range.ok).toBe(true)
    if (range.ok) {
      expect(range.from).toBe('2026-09-07T21:00:00.000Z')
      expect(range.to).toBe('2026-09-08T21:00:00.000Z')
      expect(range.days).toBe(1)
    }
  })

  it('covers every day between the two, inclusive', () => {
    const range = resolveRevealRange('2026-09-01', '2026-09-07')
    expect(range.ok).toBe(true)
    if (range.ok) expect(range.days).toBe(7)
  })

  it('accepts the widest range it offers and refuses the next day', () => {
    const wide = resolveRevealRange('2026-09-01', '2026-10-01')
    expect(wide.ok).toBe(true)
    if (wide.ok) expect(wide.days).toBe(MAX_REVEAL_RANGE_DAYS)

    const wider = resolveRevealRange('2026-09-01', '2026-10-02')
    expect(wider.ok).toBe(false)
    if (!wider.ok) expect(wider.issue).toBe('too_wide')
  })

  it('refuses a range that runs backwards rather than silently swapping it', () => {
    const range = resolveRevealRange('2026-09-08', '2026-09-01')
    expect(range.ok).toBe(false)
    if (!range.ok) expect(range.issue).toBe('backwards')
  })

  it('refuses anything that is not a day', () => {
    for (const [from, to] of [
      ['', '2026-09-08'],
      ['2026-09-08', ''],
      ['2026-02-30', '2026-03-01'],
      ['08.09.2026', '09.09.2026'],
      ['2026-09-08T12:00:00Z', '2026-09-09'],
    ]) {
      const range = resolveRevealRange(from ?? '', to ?? '')
      expect(range.ok, `${from} → ${to}`).toBe(false)
      if (!range.ok) expect(range.issue).toBe('invalid')
    }
  })
})

describe('the reveal route addresses a grant and a scope, and nothing else', () => {
  it('hangs off the grant it will spend', () => {
    expect(revealHref(GRANT)).toBe(`${grantHref(GRANT)}/reveal`)
  })

  it('carries a chosen scope as a closed-set token', () => {
    expect(revealHref(GRANT, 'email_body')).toBe(
      `${grantHref(GRANT)}/reveal?${REVEAL_SCOPE_PARAM}=email_body`,
    )
  })

  it('never carries a record id or anything a record could be read from', () => {
    // Content and the identifiers of content stay in the POST body: a query
    // string reaches the history, the access log and the referrer header.
    for (const scope of SUPPORT_ACCESS_SCOPES) {
      const href = revealHref(GRANT, scope)
      expect(href.split('?')[1] ?? '').toBe(`${REVEAL_SCOPE_PARAM}=${scope}`)
    }
  })
})
