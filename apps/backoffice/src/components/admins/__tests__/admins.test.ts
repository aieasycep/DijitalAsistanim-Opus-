import { describe, expect, it } from 'vitest'
import {
  ADMIN_EMAIL_MAX,
  ADMIN_EMAIL_PATTERN,
  ADMIN_OUTCOMES,
  ADMIN_ROLES,
  ADMIN_STATUSES,
  DEFAULT_INVITE_TTL_DAYS,
  INVITE_PAGE_PARAM,
  INVITE_TTL_DAYS,
  LIST_PARAMS,
  MIN_NAME_SEARCH,
  RESULT_PARAMS,
  hrefWithQuery,
  isAdminOutcome,
  isAdminSortKey,
  isInviteTtl,
  isMfaFilter,
  isQueryableSearch,
  isRole,
  isStatus,
  isUuidParam,
  parseAdminListParams,
  parseAdminSearch,
  parsePageParam,
  toQueryRecord,
  withOutcome,
  withoutResultParams,
} from '../contract.ts'
import {
  MATRIX_GLYPH,
  adminRoleTone,
  adminStatusTone,
  isDrift,
  matrixCell,
  mfaTone,
  outcomeTone,
  permissionNamespace,
  sessionTone,
} from '../presentation.ts'
import { ADMIN_PERMISSIONS } from '../../../lib/permissions.ts'
import { expiresAfterDays } from '../../../lib/expiry.ts'

/**
 * Admin management: the roster, the invite, and the matrix nobody may misread.
 *
 * Two properties are load-bearing here and neither is obvious from the screen.
 *
 * The first is that **an admin is a person too**. `bo_admin_users` redacts a
 * colleague's address exactly as it redacts a user's, so the search box has to
 * refuse a full address rather than quietly trimming it into something that
 * would then travel in a URL an operator pastes into a ticket.
 *
 * The second is that the permission matrix distinguishes the two halves of a
 * drift. "Present only in the database" and "present only in the console" mean
 * opposite things operationally, and merging them into "mismatch" would lose
 * the only information a reviewer needs.
 */

describe("parseAdminSearch — a colleague's address never reaches a URL", () => {
  it('refuses a full address rather than trimming it into a domain', () => {
    const search = parseAdminSearch('yasemin@example.com')
    expect(search).toEqual({ kind: 'rejected', why: 'full_address' })
    expect(isQueryableSearch(search)).toBe(false)
  })

  it('accepts a bare domain, which is what the redacted column can match', () => {
    expect(parseAdminSearch('example.com')).toEqual({ kind: 'domain', domain: 'example.com' })
    expect(parseAdminSearch('@example.com')).toEqual({ kind: 'domain', domain: 'example.com' })
    expect(parseAdminSearch('EXAMPLE.CO.UK')).toEqual({ kind: 'domain', domain: 'example.co.uk' })
  })

  it('reads an id as an id', () => {
    expect(parseAdminSearch('3F2A1C44-0000-4000-8000-000000000001')).toEqual({
      kind: 'admin_id',
      adminUserId: '3f2a1c44-0000-4000-8000-000000000001',
    })
  })

  it('reads a name fragment as a name', () => {
    expect(parseAdminSearch('Yase')).toEqual({ kind: 'name', name: 'Yase' })
    expect(parseAdminSearch('  Yase  ')).toEqual({ kind: 'name', name: 'Yase' })
  })

  it('refuses a fragment too short to be worth an ilike over the roster', () => {
    expect(parseAdminSearch('y')).toEqual({ kind: 'rejected', why: 'too_short' })
    expect(MIN_NAME_SEARCH).toBeGreaterThan(1)
  })

  it('refuses a bare `@` rather than matching every address', () => {
    expect(parseAdminSearch('@')).toEqual({ kind: 'rejected', why: 'too_short' })
    expect(parseAdminSearch('@x')).toEqual({ kind: 'rejected', why: 'too_short' })
  })

  it('reads an empty box as no search at all', () => {
    expect(parseAdminSearch('')).toEqual({ kind: 'none' })
    expect(parseAdminSearch('   ')).toEqual({ kind: 'none' })
    expect(isQueryableSearch({ kind: 'none' })).toBe(true)
  })

  it('never returns a local part in any branch', () => {
    for (const typed of ['yasemin@example.com', 'a.b@example.com', 'Yasemin@Example.COM']) {
      const search = parseAdminSearch(typed)
      expect(JSON.stringify(search)).not.toContain('yasemin')
      expect(JSON.stringify(search)).not.toContain('Yasemin')
      expect(search.kind).toBe('rejected')
    }
  })
})

describe('the list query string', () => {
  it('keeps only values from its own vocabularies', () => {
    const parsed = parseAdminListParams({
      [LIST_PARAMS.role]: 'support',
      [LIST_PARAMS.status]: 'active',
      [LIST_PARAMS.mfa]: 'var',
      [LIST_PARAMS.q]: 'example.com',
      [LIST_PARAMS.page]: '3',
      [INVITE_PAGE_PARAM]: '2',
    })
    expect(parsed.role).toBe('support')
    expect(parsed.status).toBe('active')
    expect(parsed.mfa).toBe('var')
    expect(parsed.search).toEqual({ kind: 'domain', domain: 'example.com' })
    expect(parsed.page).toBe(3)
    expect(parsed.invitePage).toBe(2)
  })

  it('drops a filter it does not recognise', () => {
    const parsed = parseAdminListParams({ role: 'root', status: 'pending', mfa: 'maybe' })
    expect(parsed.role).toBeNull()
    expect(parsed.status).toBeNull()
    expect(parsed.mfa).toBeNull()
  })

  it('gives the two tables their own pagers, so they cannot fight', () => {
    const parsed = parseAdminListParams({ page: '4', [INVITE_PAGE_PARAM]: '9' })
    expect(parsed.page).toBe(4)
    expect(parsed.invitePage).toBe(9)
  })

  it('clamps a page that is not a positive integer', () => {
    for (const raw of ['0', '-1', 'abc', '', '1.5', '99999', ' 2']) {
      expect(parsePageParam(raw)).toBeGreaterThanOrEqual(1)
    }
    expect(parsePageParam('12')).toBe(12)
    // Five digits is past what the roster can page to; it reads as 1 rather
    // than as an unbounded offset.
    expect(parsePageParam('99999')).toBe(1)
  })

  it('knows its own vocabularies', () => {
    for (const role of ADMIN_ROLES) expect(isRole(role)).toBe(true)
    for (const status of ADMIN_STATUSES) expect(isStatus(status)).toBe(true)
    expect(isRole('root')).toBe(false)
    expect(isStatus('deleted')).toBe(false)
    expect(isMfaFilter('var')).toBe(true)
    expect(isMfaFilter('bilinmiyor')).toBe(false)
  })

  it('orders only by a real, NOT NULL-safe column', () => {
    expect(isAdminSortKey('role_rank')).toBe(true)
    expect(isAdminSortKey('email')).toBe(false)
  })
})

describe('invite bounds and the expiry they produce', () => {
  it('offers only durations the form declared', () => {
    for (const days of INVITE_TTL_DAYS) expect(isInviteTtl(days)).toBe(true)
    expect(isInviteTtl(0)).toBe(false)
    expect(isInviteTtl(30)).toBe(false)
    expect(isInviteTtl(7.5)).toBe(false)
    expect(isInviteTtl(Number.NaN)).toBe(false)
  })

  it('never offers an invite that does not expire', () => {
    for (const days of INVITE_TTL_DAYS) expect(days).toBeGreaterThan(0)
    expect(isInviteTtl(DEFAULT_INVITE_TTL_DAYS)).toBe(true)
  })

  it('computes the expiry from the injected instant, not from a posted date', () => {
    const now = new Date('2026-09-08T12:00:00.000Z')
    expect(expiresAfterDays(now, DEFAULT_INVITE_TTL_DAYS).toISOString()).toBe(
      '2026-09-15T12:00:00.000Z',
    )
    for (const days of INVITE_TTL_DAYS) {
      expect(expiresAfterDays(now, days).getTime()).toBeGreaterThan(now.getTime())
    }
  })

  it('mirrors the address shape the column constrains', () => {
    expect(ADMIN_EMAIL_PATTERN.test('yasemin@example.com')).toBe(true)
    expect(ADMIN_EMAIL_PATTERN.test('yasemin@example')).toBe(false)
    expect(ADMIN_EMAIL_PATTERN.test('yasemin example.com')).toBe(false)
    expect(ADMIN_EMAIL_PATTERN.test('a@b@example.com')).toBe(false)
    expect(ADMIN_EMAIL_MAX).toBe(320)
  })
})

describe('the permission matrix keeps the two halves of a drift apart', () => {
  it('reports a permission both sides agree on as granted', () => {
    expect(matrixCell(true, true, true)).toBe('granted')
    expect(isDrift('granted')).toBe(false)
  })

  it('names a row present only in the database, which is an unreviewed write', () => {
    expect(matrixCell(true, true, false)).toBe('database_only')
    expect(isDrift('database_only')).toBe(true)
  })

  it('names a row present only in the console, which is a migration not landed', () => {
    expect(matrixCell(true, false, true)).toBe('console_only')
    expect(isDrift('console_only')).toBe(true)
  })

  it('reports an unreadable matrix as unknown rather than as "no permission"', () => {
    // A blank cell would read as "this role does not hold it", which is a claim
    // the console cannot make when it could not read the table.
    for (const inDatabase of [true, false]) {
      for (const inConsole of [true, false]) {
        expect(matrixCell(false, inDatabase, inConsole)).toBe('unknown')
      }
    }
    expect(isDrift('unknown')).toBe(false)
  })

  it('reports an agreed absence as none', () => {
    expect(matrixCell(true, false, false)).toBe('none')
  })

  it('renders every cell as copy-pasteable text', () => {
    for (const cell of ['granted', 'database_only', 'console_only', 'none', 'unknown'] as const) {
      expect(MATRIX_GLYPH[cell].length).toBeGreaterThan(0)
    }
    // The two drifts share a glyph because they read the same on the screen and
    // are told apart by the column, but neither is a tick.
    expect(MATRIX_GLYPH.database_only).not.toBe(MATRIX_GLYPH.granted)
    expect(MATRIX_GLYPH.console_only).not.toBe(MATRIX_GLYPH.granted)
    expect(MATRIX_GLYPH.unknown).not.toBe(MATRIX_GLYPH.none)
  })

  it('groups every permission by the token before its first dot', () => {
    expect(permissionNamespace('support.access.approve')).toBe('support')
    expect(permissionNamespace('audit')).toBe('audit')
    for (const permission of ADMIN_PERMISSIONS) {
      expect(permissionNamespace(permission).length).toBeGreaterThan(0)
    }
  })
})

describe('tones', () => {
  it('does not paint a completed offboarding as an incident', () => {
    expect(adminStatusTone('disabled')).toBe('neutral')
    expect(adminStatusTone('invited')).toBe('info')
    expect(adminStatusTone('active')).toBe('success')
  })

  it('gives only the role that can change who else may act a colour', () => {
    expect(adminRoleTone('super_admin')).toBe('primary')
    for (const role of ADMIN_ROLES) {
      if (role !== 'super_admin') expect(adminRoleTone(role)).toBe('neutral')
    }
  })

  it('treats a missing MFA enrolment as a warning rather than a dash', () => {
    expect(mfaTone(false)).toBe('warning')
    expect(mfaTone(true)).toBe('success')
  })

  it('does not colour a revoked session as if it were still live', () => {
    expect(sessionTone(true, true)).toBe('neutral')
    expect(sessionTone(true, false)).toBe('success')
    expect(sessionTone(false, false)).toBe('neutral')
  })

  it('reserves green for a success that is also good news', () => {
    expect(outcomeTone('invited')).toBe('success')
    expect(outcomeTone('reenabled')).toBe('success')
    // Closing an account and evicting sessions both worked and neither is good
    // news to be reassured by.
    expect(outcomeTone('disabled')).toBe('warning')
    expect(outcomeTone('sessionsRevoked')).toBe('warning')
    expect(outcomeTone('auditMissing')).toBe('critical')
  })

  it('has a tone for every outcome the actions can report', () => {
    for (const outcome of ADMIN_OUTCOMES) {
      expect(outcomeTone(outcome)).toBeDefined()
      expect(isAdminOutcome(outcome)).toBe(true)
    }
    expect(isAdminOutcome('davet edildi')).toBe(false)
  })
})

describe('links an action lands on', () => {
  it('carries an outcome token and a bounded subject', () => {
    expect(withOutcome('/system/admins', 'invited', 'abc')).toBe(
      '/system/admins?result=invited&kim=abc',
    )
    expect(withOutcome('/system/admins', 'noop', null)).toBe('/system/admins?result=noop')
    expect(withOutcome('/system/admins', 'noop', '')).toBe('/system/admins?result=noop')

    const long = withOutcome('/system/admins', 'invited', 'x'.repeat(200))
    expect(new URLSearchParams(long.split('?')[1] ?? '').get(RESULT_PARAMS.subject)).toHaveLength(
      64,
    )
  })

  it('drops the last answer from a paging link', () => {
    const query = toQueryRecord({ result: 'invited', kim: 'abc', role: 'support' })
    expect(withoutResultParams(query)).toEqual({ role: 'support' })
  })

  it('builds a query and omits an empty one', () => {
    expect(hrefWithQuery('/system/admins', { role: 'support' })).toBe('/system/admins?role=support')
    expect(hrefWithQuery('/system/admins', {})).toBe('/system/admins')
  })

  it('recognises a uuid route parameter and refuses anything else', () => {
    expect(isUuidParam('3f2a1c44-0000-4000-8000-000000000001')).toBe(true)
    expect(isUuidParam('3f2a1c44-0000-4000-8000')).toBe(false)
  })
})
