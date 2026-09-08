import { describe, expect, it } from 'vitest'
import {
  ACTIVE_TICKET_STATUSES,
  ASSIGNEE_ME,
  ASSIGNEE_NONE,
  ASSIGNEE_UNASSIGNED,
  NOTE_MAX_LENGTH,
  NOTE_MIN_LENGTH,
  NOTE_VISIBILITIES,
  QUEUE_TICKET_STATUSES,
  REOPENABLE_TICKET_STATUSES,
  RESOLUTION_MAX_LENGTH,
  RESOLUTION_MIN_LENGTH,
  STATUS_FILTER_ACTIVE,
  STATUS_FILTER_ALL,
  SUPPORT_PATH,
  TICKET_AUDIT_ACTIONS,
  TICKET_CATEGORIES,
  TICKET_CHANNELS,
  TICKET_ENTITY_TYPE,
  TICKET_OUTCOMES,
  TICKET_PRIORITIES,
  TICKET_REASON_MAX,
  TICKET_REASON_MIN,
  TICKET_RETURN_PREFIX,
  TICKET_SORT_KEYS,
  TICKET_STATUSES,
  TICKET_STATUS_FILTERS,
  WORKING_TICKET_STATUSES,
  isActiveStatus,
  isAppliedOutcome,
  isNoteVisibility,
  isReopenable,
  isTicketCategory,
  isTicketOutcome,
  isTicketPriority,
  isTicketStatus,
  isTicketStatusFilter,
  ticketPath,
} from '../contract.ts'
import {
  adminLabel,
  firstResponseDisplay,
  formatMinutes,
  panelError,
  priorityTone,
  statusTone,
} from '../presentation.ts'
import { messages } from '../../../lib/messages.ts'
import { ticketMessages } from '../../../lib/messages/tickets.ts'

/**
 * The support queue: whose problem a ticket still is.
 *
 * The one finding this area exists to surface is a ticket that was closed
 * without anybody ever answering it. Collapsing "answered in 12 minutes",
 * "waiting, unanswered, for three days" and "closed unanswered" into one em
 * dash is how that finding disappears, so `firstResponseDisplay` keeps the
 * three apart and this file holds it to that.
 */

describe('the status vocabulary and the sets built from it', () => {
  it('recognises its own members and refuses anything else', () => {
    for (const status of TICKET_STATUSES) expect(isTicketStatus(status)).toBe(true)
    for (const priority of TICKET_PRIORITIES) expect(isTicketPriority(priority)).toBe(true)
    for (const category of TICKET_CATEGORIES) expect(isTicketCategory(category)).toBe(true)

    expect(isTicketStatus('pending')).toBe(false)
    expect(isTicketPriority('urgent')).toBe(false)
    expect(isTicketCategory('misc')).toBe(false)
  })

  it('draws every derived set from the status list itself', () => {
    for (const set of [
      ACTIVE_TICKET_STATUSES,
      QUEUE_TICKET_STATUSES,
      WORKING_TICKET_STATUSES,
      REOPENABLE_TICKET_STATUSES,
    ]) {
      for (const status of set) expect(TICKET_STATUSES).toContain(status)
    }
  })

  it('counts the three statuses that still need somebody as active', () => {
    // The same three `support_tickets_open_due_idx` and the view's
    // `overdue_count` use, so "overdue" means the same thing on the screen as
    // it does in the database's own aggregate.
    expect([...ACTIVE_TICKET_STATUSES]).toEqual(['open', 'in_progress', 'waiting_user'])
    for (const status of TICKET_STATUSES) {
      expect(isActiveStatus(status)).toBe(status !== 'resolved' && status !== 'closed')
    }
  })

  it('reopens only from a finished state', () => {
    for (const status of TICKET_STATUSES) {
      expect(isReopenable(status)).toBe(status === 'resolved' || status === 'closed')
    }
  })

  it('never lets a status be both active and reopenable', () => {
    for (const status of TICKET_STATUSES) {
      expect(isActiveStatus(status) && isReopenable(status)).toBe(false)
    }
  })

  it('keeps `resolved` out of the statuses a form may move a ticket to directly', () => {
    // Resolving demands a resolution note, so it goes through its own action.
    expect(WORKING_TICKET_STATUSES).not.toContain('resolved')
    expect(WORKING_TICKET_STATUSES).not.toContain('closed')
  })
})

describe('the status filter distinguishes "no choice" from "every status"', () => {
  it('offers each status, plus the active set, plus everything', () => {
    for (const status of TICKET_STATUSES) expect(isTicketStatusFilter(status)).toBe(true)
    expect(isTicketStatusFilter(STATUS_FILTER_ACTIVE)).toBe(true)
    expect(isTicketStatusFilter(STATUS_FILTER_ALL)).toBe(true)
    expect(TICKET_STATUS_FILTERS).toHaveLength(TICKET_STATUSES.length + 2)
  })

  it('does not make the absent parameter a member', () => {
    // The shift default is "no choice"; if it were a value, an operator who
    // cleared the filter would be choosing something.
    expect(isTicketStatusFilter('')).toBe(false)
    expect(STATUS_FILTER_ALL).not.toBe(STATUS_FILTER_ACTIVE)
  })

  it('keeps the assignee sentinels apart from an id', () => {
    expect(ASSIGNEE_ME).not.toBe(ASSIGNEE_UNASSIGNED)
    expect(ASSIGNEE_NONE).toBe(ASSIGNEE_UNASSIGNED)
    expect(isTicketStatusFilter(ASSIGNEE_ME)).toBe(false)
  })
})

describe('firstResponseDisplay — a ticket closed unanswered is a finding', () => {
  it('reports a measured duration plainly', () => {
    expect(firstResponseDisplay({ minutes: 12, ageMinutes: 900, isActive: false })).toEqual({
      label: '12 dk',
      tone: 'neutral',
    })
  })

  it('reports how long a live, unanswered ticket has been waiting', () => {
    const display = firstResponseDisplay({ minutes: null, ageMinutes: 180, isActive: true })
    expect(display.tone).toBe('warning')
    expect(display.label).toContain(ticketMessages.values.awaitingResponse)
    expect(display.label).toContain('3 sa')
  })

  it('says in words that a closed ticket was never answered', () => {
    expect(firstResponseDisplay({ minutes: null, ageMinutes: 4_000, isActive: false })).toEqual({
      label: ticketMessages.values.closedWithoutResponse,
      tone: 'critical',
    })
  })

  it('never collapses the three situations into the same cell', () => {
    const answered = firstResponseDisplay({ minutes: 12, ageMinutes: 900, isActive: false })
    const waiting = firstResponseDisplay({ minutes: null, ageMinutes: 900, isActive: true })
    const abandoned = firstResponseDisplay({ minutes: null, ageMinutes: 900, isActive: false })
    const labels = new Set([answered.label, waiting.label, abandoned.label])
    expect(labels.size).toBe(3)
    expect(labels.has('—')).toBe(false)
  })

  it('treats a first response at minute zero as answered, not as unanswered', () => {
    const display = firstResponseDisplay({ minutes: 0, ageMinutes: 900, isActive: true })
    expect(display.tone).toBe('neutral')
    expect(display.label).not.toContain(ticketMessages.values.awaitingResponse)
  })
})

describe('formatMinutes', () => {
  it("renders in the console's own units, scaling with the duration", () => {
    expect(formatMinutes(0)).toBe('0 sn')
    expect(formatMinutes(1)).toBe('1 dk')
    expect(formatMinutes(90)).toBe('2 sa')
    expect(formatMinutes(2_880)).toBe('2 gün')
  })

  it('renders an absent measurement as an em dash rather than as zero', () => {
    expect(formatMinutes(null)).toBe('—')
    expect(formatMinutes(undefined)).toBe('—')
  })
})

describe('tones', () => {
  it('does not claim the clock is ours while the ball is with the user', () => {
    expect(statusTone.waiting_user).toBe('neutral')
    expect(statusTone.open).toBe('warning')
    expect(statusTone.in_progress).toBe('info')
    expect(statusTone.resolved).toBe('success')
    expect(statusTone.closed).toBe('neutral')
  })

  it('colours only the two priorities somebody must act on', () => {
    expect(priorityTone.critical).toBe('critical')
    expect(priorityTone.high).toBe('warning')
    expect(priorityTone.normal).toBe('neutral')
    expect(priorityTone.low).toBe('neutral')
  })

  it('has a tone for every status and every priority', () => {
    for (const status of TICKET_STATUSES) expect(statusTone[status]).toBeDefined()
    for (const priority of TICKET_PRIORITIES) expect(priorityTone[priority]).toBeDefined()
  })
})

describe('naming an operator, and refusing to quote a database', () => {
  it('names a closed account rather than printing its uuid', () => {
    expect(adminLabel(undefined)).toBe(ticketMessages.values.deletedAdmin)
    expect(adminLabel({ name: '  ', emailRedacted: null })).toBe(ticketMessages.values.deletedAdmin)
    expect(adminLabel({ name: '  ', emailRedacted: 'y•••@example.com' })).toBe('y•••@example.com')
    expect(adminLabel({ name: 'Yasemin', emailRedacted: 'y•••@example.com' })).toBe('Yasemin')
  })

  it('renders a panel failure from the domain vocabulary, never from the throw', () => {
    expect(panelError({ ok: true })).toBeNull()
    expect(panelError({ ok: false, code: 'forbidden' })).toBe(messages.errors.forbidden)

    const generic = panelError({
      ok: false,
      code: 'PGRST301: column support_tickets.subject does not exist',
    })
    expect(generic).toBe(messages.errors.queryFailed)
    expect(generic).not.toContain('support_tickets')
    expect(generic).not.toContain('PGRST301')
  })
})

describe('outcomes', () => {
  it('separates the ones that changed the ticket from the ones that did not', () => {
    for (const outcome of TICKET_OUTCOMES) expect(isTicketOutcome(outcome)).toBe(true)
    for (const applied of [
      'assigned',
      'unassigned',
      'status_changed',
      'priority_changed',
      'note_added',
      'resolved',
      'reopened',
    ] as const) {
      expect(isAppliedOutcome(applied)).toBe(true)
    }
    for (const notApplied of [
      'noop',
      'ineligible',
      'invalid',
      'notfound',
      'forbidden',
      'rate_limited',
      'failed',
      'audit_failed',
    ] as const) {
      expect(isAppliedOutcome(notApplied)).toBe(false)
    }
  })

  it('does not count a change whose audit row failed as an ordinary success', () => {
    expect(isAppliedOutcome('audit_failed')).toBe(false)
    expect(TICKET_OUTCOMES).toContain('audit_failed')
  })

  it('refuses a token it did not declare', () => {
    expect(isTicketOutcome('atandı')).toBe(false)
    expect(isTicketOutcome('')).toBe(false)
  })
})

describe("the audit vocabulary is accountable by the database's own rule", () => {
  it('puts every ticket action in the `admin.` namespace', () => {
    // `audit_logs_enforce_accountability()` treats that namespace as sensitive
    // and refuses a row without an acting admin and a written reason.
    for (const action of Object.values(TICKET_AUDIT_ACTIONS)) {
      expect(action.startsWith('admin.')).toBe(true)
    }
    expect(Object.keys(TICKET_AUDIT_ACTIONS)).toHaveLength(6)
    expect(TICKET_ENTITY_TYPE).toBe('support_ticket')
  })

  it('asks for a reason long enough for the trail and short enough to store', () => {
    expect(TICKET_REASON_MIN).toBeLessThan(TICKET_REASON_MAX)
    expect(RESOLUTION_MIN_LENGTH).toBe(TICKET_REASON_MIN)
    expect(RESOLUTION_MAX_LENGTH).toBe(TICKET_REASON_MAX)
    expect(NOTE_MIN_LENGTH).toBeLessThan(NOTE_MAX_LENGTH)
  })

  it('knows the two audiences a note can have', () => {
    for (const visibility of NOTE_VISIBILITIES) expect(isNoteVisibility(visibility)).toBe(true)
    expect(isNoteVisibility('public')).toBe(false)
  })
})

describe('routes and ordering', () => {
  it('addresses a ticket by id under the queue it belongs to', () => {
    expect(ticketPath('3f2a1c44-0000-4000-8000-000000000001')).toBe(
      '/support/3f2a1c44-0000-4000-8000-000000000001',
    )
    expect(TICKET_RETURN_PREFIX).toBe(SUPPORT_PATH)
  })

  it('orders only by columns the table actually has', () => {
    expect(TICKET_SORT_KEYS).toContain('due_at')
    expect(TICKET_SORT_KEYS).not.toContain('subject')
    expect(TICKET_SORT_KEYS).not.toContain('body')
    expect(new Set(TICKET_SORT_KEYS).size).toBe(TICKET_SORT_KEYS.length)
  })

  it('knows every channel a ticket can arrive through', () => {
    expect([...TICKET_CHANNELS]).toEqual(['in_app', 'email', 'store_review', 'internal', 'phone'])
  })
})
