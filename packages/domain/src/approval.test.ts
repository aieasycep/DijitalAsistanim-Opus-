import { describe, expect, it } from 'vitest'
import type { ApprovalPayload } from './entities.ts'
import { APPROVAL_STATUSES, APPROVAL_ACTION_TYPES } from './enums.ts'
import {
  APPROVAL_TTL_MS,
  ApprovalTransitionError,
  approvalExpiryFrom,
  assertTransition,
  buildIdempotencyKey,
  canTransition,
  diffPayload,
  EDITABLE_FIELDS,
  hasExternalSideEffect,
  isExpired,
  isTerminal,
  MAX_APPROVAL_ATTEMPTS,
  retryDelayMs,
  shouldRetry,
  validateEdit,
} from './approval.ts'

/**
 * The approval machine is the only path by which anything leaves the app, so
 * these tests are about what it must refuse, not what it allows.
 */

const emailPayload = (over: Partial<Record<string, unknown>> = {}): ApprovalPayload =>
  ({
    kind: 'email_send',
    to: ['ayse@example.com'],
    cc: [],
    subject: 'Teklif',
    body: 'Merhaba, ektedir.',
    threadId: 'thread-1',
    accountId: 'account-1',
    ...over,
  }) as unknown as ApprovalPayload

describe('state machine', () => {
  it('starts pending and can only be approved, rejected or expired', () => {
    expect(canTransition('pending', 'approved')).toBe(true)
    expect(canTransition('pending', 'rejected')).toBe(true)
    expect(canTransition('pending', 'expired')).toBe(true)
    expect(canTransition('pending', 'executed')).toBe(false)
    expect(canTransition('pending', 'executing')).toBe(false)
  })

  it('never lets a proposal execute without passing through approved', () => {
    // The single most important property: there is no path from a pending or
    // rejected proposal to a performed external write.
    for (const from of APPROVAL_STATUSES) {
      if (from === 'approved' || from === 'executing') continue
      expect(canTransition(from, 'executing')).toBe(false)
      expect(canTransition(from, 'executed')).toBe(false)
    }
  })

  it('lets a transient failure be retried through approved', () => {
    expect(canTransition('executing', 'failed')).toBe(true)
    expect(canTransition('failed', 'approved')).toBe(true)
    expect(canTransition('approved', 'executing')).toBe(true)
  })

  it('treats executed, rejected and expired as final', () => {
    for (const status of ['executed', 'rejected', 'expired'] as const) {
      expect(isTerminal(status)).toBe(true)
      for (const to of APPROVAL_STATUSES) {
        expect(canTransition(status, to)).toBe(false)
      }
    }
  })

  it('cannot resurrect a rejected proposal', () => {
    expect(canTransition('rejected', 'approved')).toBe(false)
    expect(canTransition('expired', 'approved')).toBe(false)
  })

  it('throws with both ends of an illegal transition named', () => {
    expect(() => assertTransition('rejected', 'executed')).toThrow(ApprovalTransitionError)
    try {
      assertTransition('rejected', 'executed')
    } catch (error) {
      const e = error as ApprovalTransitionError
      expect(e.from).toBe('rejected')
      expect(e.to).toBe('executed')
    }
  })

  it('allows every legal transition without throwing', () => {
    expect(() => assertTransition('pending', 'approved')).not.toThrow()
    expect(() => assertTransition('approved', 'executing')).not.toThrow()
    expect(() => assertTransition('executing', 'executed')).not.toThrow()
  })
})

describe('expiry', () => {
  const now = new Date('2026-03-01T09:00:00.000Z')

  it('expires two days out', () => {
    expect(new Date(approvalExpiryFrom(now)).getTime() - now.getTime()).toBe(APPROVAL_TTL_MS)
  })

  it('is not expired before the deadline and is on it', () => {
    const expiry = approvalExpiryFrom(now)
    expect(isExpired(expiry, now)).toBe(false)
    expect(isExpired(expiry, new Date(now.getTime() + APPROVAL_TTL_MS - 1))).toBe(false)
    expect(isExpired(expiry, new Date(now.getTime() + APPROVAL_TTL_MS))).toBe(true)
  })

  it('treats an unparseable timestamp as not expired rather than expiring everything', () => {
    expect(isExpired('not-a-date', now)).toBe(false)
  })
})

describe('retry policy', () => {
  it('stops after the third attempt', () => {
    expect(shouldRetry(0)).toBe(true)
    expect(shouldRetry(MAX_APPROVAL_ATTEMPTS - 1)).toBe(true)
    expect(shouldRetry(MAX_APPROVAL_ATTEMPTS)).toBe(false)
    expect(shouldRetry(99)).toBe(false)
  })

  it('backs off geometrically and caps at a minute', () => {
    expect(retryDelayMs(0)).toBe(2_000)
    expect(retryDelayMs(1)).toBe(4_000)
    expect(retryDelayMs(2)).toBe(8_000)
    expect(retryDelayMs(20)).toBe(60_000)
    expect(retryDelayMs(-5)).toBe(2_000)
  })
})

describe('idempotency keys', () => {
  it('is stable for the same action and differs across users and targets', () => {
    const a = buildIdempotencyKey('user-1', 'email_send', 'thread-1')
    expect(buildIdempotencyKey('user-1', 'email_send', 'thread-1')).toBe(a)
    expect(buildIdempotencyKey('user-2', 'email_send', 'thread-1')).not.toBe(a)
    expect(buildIdempotencyKey('user-1', 'task_create', 'thread-1')).not.toBe(a)
    expect(buildIdempotencyKey('user-1', 'email_send', 'thread-2')).not.toBe(a)
  })

  it('stays within the column width', () => {
    expect(buildIdempotencyKey('u'.repeat(300), 'email_send', 'x').length).toBe(200)
  })
})

describe('edit validation', () => {
  it('reports the fields that changed', () => {
    const diff = diffPayload(emailPayload(), emailPayload({ subject: 'Yeni teklif' }))
    expect(diff).toEqual([{ field: 'subject', before: 'Teklif', after: 'Yeni teklif' }])
  })

  it('ignores the discriminant', () => {
    expect(diffPayload(emailPayload(), emailPayload())).toEqual([])
  })

  it('accepts an edit to the body and the recipients', () => {
    const edited = emailPayload({ body: 'Yarın gönderiyorum.', to: ['ayse@example.com', 'b@x.co'] })
    expect(validateEdit('email_send', emailPayload(), edited)).toEqual({ valid: true })
  })

  it('rejects an edit that retargets the thread or the account', () => {
    // Without this, "edit" is a way to make the card say one thing and the
    // send do another.
    const tampered = emailPayload({ threadId: 'thread-99', accountId: 'account-99' })
    const result = validateEdit('email_send', emailPayload(), tampered)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.illegalFields.sort()).toEqual(['accountId', 'threadId'])
    }
  })

  it('rejects a field that is editable on a different action type', () => {
    // `location` is editable on a calendar event, never on a mail send.
    const tampered = emailPayload({ location: 'Ofis' })
    const result = validateEdit('email_send', emailPayload(), tampered)
    expect(result.valid).toBe(false)
  })

  it('names an editable-field set for every action type', () => {
    for (const type of APPROVAL_ACTION_TYPES) {
      expect(EDITABLE_FIELDS[type].length).toBeGreaterThan(0)
    }
  })
})

describe('side effects', () => {
  it('marks every provider-touching action as external', () => {
    expect(hasExternalSideEffect('email_send')).toBe(true)
    expect(hasExternalSideEffect('calendar_create')).toBe(true)
    expect(hasExternalSideEffect('calendar_update')).toBe(true)
    expect(hasExternalSideEffect('task_create')).toBe(true)
  })

  it('treats the app’s own records as internal', () => {
    expect(hasExternalSideEffect('reminder_create')).toBe(false)
    expect(hasExternalSideEffect('commitment_create')).toBe(false)
  })
})
