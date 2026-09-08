import { describe, expect, it } from 'vitest'
import {
  ADMIN_PERMISSIONS,
  ADMIN_ROLES,
  ADMIN_STATUSES,
  DENIAL_MESSAGES_TR,
  NO_PERMISSIONS,
  PERMISSION_LABELS_TR,
  ROLE_DESCRIPTIONS_TR,
  ROLE_DISPLAY_RANK,
  ROLE_LABELS_TR,
  ROLE_PERMISSIONS,
  decideAccess,
  describeRequirement,
  isAdminPermission,
  isAdminRole,
  isAdminStatus,
  isAccessDenialReason,
  isRecoverableBySigningIn,
  permissionsForRole,
  requirementPermissions,
  roleHasPermission,
  satisfiesRequirement,
  toPermissionSet,
  type AccessSubject,
  type AdminPermission,
  type AdminRole,
} from '../permissions.ts'

/**
 * The permission matrix, role by role.
 *
 * These are not spot checks. For each of the seven roles the test states the
 * complete set it holds and then asserts, for all 36 permissions, that the role
 * holds exactly those and is refused every other one. A permission quietly
 * added to a role fails here; so does one quietly removed.
 *
 * `permission-matrix.test.ts` proves the same table against the migration, so
 * between the two files the console, the database and the specification are
 * pinned to each other.
 */

const ALL: readonly AdminPermission[] = ADMIN_PERMISSIONS

/** The specification's matrix, written out again independently of the module. */
const EXPECTED: Readonly<Record<AdminRole, readonly AdminPermission[]>> = {
  // super_admin: everything.
  super_admin: ALL,

  // operations: users read + disable, integrations, sync, flags, announcements,
  // privacy processing, system health. No billing writes, no admin management.
  operations: [
    'users.read',
    'users.disable',
    'support.ticket.read',
    'support.ticket.write',
    'support.ticket.assign',
    'support.access.request',
    'support.access.approve',
    'integration.read',
    'integration.resync',
    'integration.disconnect',
    'billing.read',
    'flags.read',
    'flags.write',
    'announcement.read',
    'announcement.write',
    'prompt.read',
    'ai.read',
    'analytics.read',
    'audit.read',
    'privacy.read',
    'privacy.process',
    'admin.read',
    'system.health.read',
    'system.config.read',
  ],

  // support: basic profile, connection status, tickets, safe troubleshooting.
  // May request and perform a reveal; may NOT approve one.
  support: [
    'users.read',
    'support.ticket.read',
    'support.ticket.write',
    'support.ticket.assign',
    'support.access.request',
    'support.access.reveal',
    'integration.read',
    'integration.resync',
    'billing.read',
    'flags.read',
    'announcement.read',
    'privacy.read',
    'audit.read',
    'system.health.read',
  ],

  // finance: subscriptions, credits, revenue analytics. Money only.
  finance: [
    'users.read',
    'billing.read',
    'billing.grant',
    'billing.revoke',
    'support.ticket.read',
    'analytics.read',
    'audit.read',
    'audit.export',
    'system.health.read',
  ],

  // ai_ops: usage, providers, prompt versions, model configuration, AI errors.
  ai_ops: [
    'users.read',
    'prompt.read',
    'prompt.write',
    'prompt.activate',
    'ai.read',
    'ai.configure',
    'analytics.read',
    'flags.read',
    'flags.write',
    'audit.read',
    'system.health.read',
  ],

  // analyst: aggregated analytics only. Reads everything measurable, writes
  // nothing. (PII hiding is enforced separately, in `redact.ts`.)
  analyst: [
    'users.read',
    'analytics.read',
    'ai.read',
    'prompt.read',
    'billing.read',
    'support.ticket.read',
    'audit.read',
    'audit.export',
    'system.health.read',
  ],

  // readonly: the minimum useful view, for a new hire or an auditor.
  readonly: [
    'users.read',
    'support.ticket.read',
    'flags.read',
    'announcement.read',
    'system.health.read',
  ],
}

describe('the vocabulary', () => {
  it('declares 36 permissions, 7 roles and 3 statuses with no duplicates', () => {
    expect(ADMIN_PERMISSIONS).toHaveLength(36)
    expect(new Set(ADMIN_PERMISSIONS).size).toBe(36)
    expect(ADMIN_ROLES).toHaveLength(7)
    expect(new Set(ADMIN_ROLES).size).toBe(7)
    expect(ADMIN_STATUSES).toEqual(['invited', 'active', 'disabled'])
  })

  it('labels every role and every permission in Turkish', () => {
    for (const role of ADMIN_ROLES) {
      expect(ROLE_LABELS_TR[role].length).toBeGreaterThan(0)
      expect(ROLE_DESCRIPTIONS_TR[role].length).toBeGreaterThan(0)
      expect(ROLE_DISPLAY_RANK[role]).toBeGreaterThan(0)
    }
    for (const permission of ADMIN_PERMISSIONS) {
      expect(PERMISSION_LABELS_TR[permission].length).toBeGreaterThan(0)
    }
  })

  it('gives every role a distinct display rank', () => {
    const ranks = ADMIN_ROLES.map((role) => ROLE_DISPLAY_RANK[role])
    expect(new Set(ranks).size).toBe(ranks.length)
  })

  it('narrows unknown values instead of coercing them', () => {
    expect(isAdminRole('support')).toBe(true)
    expect(isAdminRole('Support')).toBe(false)
    expect(isAdminRole('root')).toBe(false)
    expect(isAdminRole(null)).toBe(false)
    expect(isAdminPermission('users.read')).toBe(true)
    expect(isAdminPermission('users.readAll')).toBe(false)
    expect(isAdminPermission(42)).toBe(false)
    expect(isAdminStatus('active')).toBe(true)
    expect(isAdminStatus('enabled')).toBe(false)
  })
})

describe('the matrix, role by role', () => {
  for (const role of ADMIN_ROLES) {
    const expected = EXPECTED[role]

    it(`${role} holds exactly its ${expected.length} permissions`, () => {
      expect([...ROLE_PERMISSIONS[role]].sort()).toEqual([...expected].sort())
      expect(permissionsForRole(role).size).toBe(expected.length)
    })

    it(`${role} is refused every permission outside that set`, () => {
      const granted = new Set<string>(expected)
      for (const permission of ALL) {
        expect(roleHasPermission(role, permission)).toBe(granted.has(permission))
      }
    })
  }

  it('gives super_admin every permission and nobody else all of them', () => {
    expect(ROLE_PERMISSIONS.super_admin).toHaveLength(ADMIN_PERMISSIONS.length)
    for (const role of ADMIN_ROLES) {
      if (role === 'super_admin') continue
      expect(ROLE_PERMISSIONS[role].length).toBeLessThan(ADMIN_PERMISSIONS.length)
    }
  })

  it('keeps four eyes possible: support may reveal but never approve', () => {
    expect(roleHasPermission('support', 'support.access.request')).toBe(true)
    expect(roleHasPermission('support', 'support.access.reveal')).toBe(true)
    expect(roleHasPermission('support', 'support.access.approve')).toBe(false)
    expect(roleHasPermission('operations', 'support.access.approve')).toBe(true)
    expect(roleHasPermission('operations', 'support.access.reveal')).toBe(false)
  })

  it('lets nobody but super_admin manage admins or delete users', () => {
    for (const role of ADMIN_ROLES) {
      if (role === 'super_admin') continue
      expect(roleHasPermission(role, 'admin.invite')).toBe(false)
      expect(roleHasPermission(role, 'admin.role.write')).toBe(false)
      expect(roleHasPermission(role, 'admin.disable')).toBe(false)
      expect(roleHasPermission(role, 'users.delete')).toBe(false)
    }
  })

  it('keeps money away from support and content away from finance', () => {
    expect(roleHasPermission('support', 'billing.grant')).toBe(false)
    expect(roleHasPermission('support', 'billing.revoke')).toBe(false)
    expect(roleHasPermission('finance', 'support.access.reveal')).toBe(false)
    expect(roleHasPermission('finance', 'integration.disconnect')).toBe(false)
  })

  it('lets no role but ai_ops and super_admin change the model or a prompt', () => {
    for (const role of ADMIN_ROLES) {
      const allowed = role === 'super_admin' || role === 'ai_ops'
      expect(roleHasPermission(role, 'ai.configure')).toBe(allowed)
      expect(roleHasPermission(role, 'prompt.activate')).toBe(allowed)
    }
  })

  it('gives the analyst nothing that writes', () => {
    const writes: readonly AdminPermission[] = [
      'users.disable',
      'users.delete',
      'support.ticket.write',
      'support.access.reveal',
      'integration.resync',
      'integration.disconnect',
      'billing.grant',
      'billing.revoke',
      'flags.write',
      'announcement.write',
      'prompt.write',
      'prompt.activate',
      'ai.configure',
      'privacy.process',
    ]
    for (const permission of writes) {
      expect(roleHasPermission('analyst', permission)).toBe(false)
      expect(roleHasPermission('readonly', permission)).toBe(false)
    }
  })
})

describe('toPermissionSet — deny by default at the parsing layer', () => {
  it('drops values that are not members of the enum', () => {
    const set = toPermissionSet(['users.read', 'users.readAll', '', null, 7, 'admin.*'])
    expect([...set]).toEqual(['users.read'])
  })

  it('intersects with the role, so a hand-inserted grant is inert', () => {
    // `admin_role_permissions` says support may delete users. The mirror does
    // not, so the permission is discarded rather than honoured.
    const set = toPermissionSet(['users.read', 'users.delete'], 'support')
    expect(set.has('users.delete')).toBe(false)
    expect(set.has('users.read')).toBe(true)
  })

  it('returns nothing at all for an empty input', () => {
    expect(toPermissionSet([]).size).toBe(0)
    expect(NO_PERMISSIONS.size).toBe(0)
  })
})

describe('requirements', () => {
  const support = permissionsForRole('support')

  it('satisfies a single permission only when it is held', () => {
    expect(satisfiesRequirement(support, 'users.read')).toBe(true)
    expect(satisfiesRequirement(support, 'users.delete')).toBe(false)
  })

  it('satisfies anyOf when one is held and allOf only when all are', () => {
    expect(satisfiesRequirement(support, { anyOf: ['users.delete', 'users.read'] })).toBe(true)
    expect(satisfiesRequirement(support, { allOf: ['users.delete', 'users.read'] })).toBe(false)
    expect(satisfiesRequirement(support, { allOf: ['users.read', 'audit.read'] })).toBe(true)
  })

  it('refuses an empty requirement rather than treating it as public', () => {
    expect(satisfiesRequirement(support, { anyOf: [] })).toBe(false)
    expect(satisfiesRequirement(support, { allOf: [] })).toBe(false)
  })

  it('refuses everything for an empty permission set', () => {
    for (const permission of ADMIN_PERMISSIONS) {
      expect(satisfiesRequirement(NO_PERMISSIONS, permission)).toBe(false)
    }
    expect(satisfiesRequirement(NO_PERMISSIONS, { anyOf: [...ADMIN_PERMISSIONS] })).toBe(false)
  })

  it('names its permissions and describes itself in Turkish', () => {
    expect(requirementPermissions('users.read')).toEqual(['users.read'])
    expect(requirementPermissions({ anyOf: ['users.read', 'audit.read'] })).toHaveLength(2)
    expect(describeRequirement('users.read')).toBe(PERMISSION_LABELS_TR['users.read'])
    expect(describeRequirement({ anyOf: ['users.read', 'audit.read'] })).toContain(' veya ')
    expect(describeRequirement({ allOf: ['users.read', 'audit.read'] })).toContain(' ve ')
  })
})

describe('decideAccess — deny by default at the decision layer', () => {
  const live = (over: Partial<AccessSubject> = {}): AccessSubject => ({
    status: 'active',
    role: 'support',
    permissions: permissionsForRole('support'),
    sessionLive: true,
    assuranceMet: true,
    ...over,
  })

  it('refuses when there is no session at all', () => {
    expect(decideAccess(null, 'users.read')).toEqual({ allowed: false, reason: 'no_session' })
  })

  it('refuses a dead session before it looks at permissions', () => {
    // The subject holds the permission; the session does not survive.
    expect(decideAccess(live({ sessionLive: false }), 'users.read')).toEqual({
      allowed: false,
      reason: 'session_expired',
    })
  })

  it('refuses a disabled admin, and says so rather than blaming the permission', () => {
    expect(
      decideAccess(
        live({ status: 'disabled', permissions: permissionsForRole('super_admin') }),
        'users.read',
      ),
    ).toEqual({ allowed: false, reason: 'admin_disabled' })
  })

  it('refuses an invited admin who has not become active', () => {
    expect(decideAccess(live({ status: 'invited' }), 'users.read')).toEqual({
      allowed: false,
      reason: 'not_admin',
    })
  })

  it('refuses an unmet MFA policy even for a super_admin', () => {
    expect(
      decideAccess(
        live({
          role: 'super_admin',
          permissions: permissionsForRole('super_admin'),
          assuranceMet: false,
        }),
        'users.read',
      ),
    ).toEqual({ allowed: false, reason: 'mfa_required' })
  })

  it('refuses a permission the role does not hold', () => {
    expect(decideAccess(live(), 'users.delete')).toEqual({
      allowed: false,
      reason: 'permission_denied',
    })
  })

  it('allows only when every condition holds', () => {
    expect(decideAccess(live(), 'users.read')).toEqual({ allowed: true })
  })

  it('allows nothing at all to a subject with no permissions', () => {
    const stripped = live({ permissions: NO_PERMISSIONS })
    for (const permission of ADMIN_PERMISSIONS) {
      expect(decideAccess(stripped, permission).allowed).toBe(false)
    }
  })

  it('gives every denial a Turkish message and a routing decision', () => {
    const reasons = [
      'no_session',
      'session_expired',
      'not_admin',
      'admin_disabled',
      'mfa_required',
      'permission_denied',
    ] as const
    for (const reason of reasons) {
      expect(DENIAL_MESSAGES_TR[reason].length).toBeGreaterThan(0)
    }
    expect(isRecoverableBySigningIn('no_session')).toBe(true)
    expect(isRecoverableBySigningIn('session_expired')).toBe(true)
    expect(isRecoverableBySigningIn('mfa_required')).toBe(true)
    expect(isRecoverableBySigningIn('permission_denied')).toBe(false)
    expect(isRecoverableBySigningIn('admin_disabled')).toBe(false)
  })

  it('recognises every denial reason, and none of the names the 403 page used to expect', () => {
    for (const reason of Object.keys(DENIAL_MESSAGES_TR)) {
      expect(isAccessDenialReason(reason)).toBe(true)
    }

    // The 403 page compared the incoming reason against 'rol' and 'askida' —
    // Turkish values from an earlier pass that `refuse()` never sent. Nothing
    // failed: the comparison simply never matched, so every denial rendered the
    // generic body and named neither the reason nor the missing permission.
    // These are asserted as *not* reasons so a future rename cannot quietly
    // reintroduce a vocabulary only one side of the redirect believes in.
    for (const stale of ['rol', 'askida', 'admin', 'ops', 'support', '']) {
      expect(isAccessDenialReason(stale)).toBe(false)
    }

    expect(isAccessDenialReason('__proto__')).toBe(false)
  })

  it('decides the same way for every role against every permission', () => {
    // The exhaustive cross-product: 7 roles x 36 permissions, decided through
    // the real guard rather than by reading the table it consults.
    for (const role of ADMIN_ROLES) {
      const subject = live({ role, permissions: permissionsForRole(role) })
      for (const permission of ADMIN_PERMISSIONS) {
        expect(decideAccess(subject, permission).allowed).toBe(EXPECTED[role].includes(permission))
      }
    }
  })
})
