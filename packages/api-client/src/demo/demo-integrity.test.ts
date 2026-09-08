import {
  fixedClock,
  toIsoDate,
  type InsightAction,
  type SourceRef,
  type SourceType,
} from '@da/domain'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ApiClient } from '../index'
import { createApiClient } from '../index'

/**
 * Every hop the app can make through the demo, walked.
 *
 * The failure this file exists to catch is not a crash. It is a fixture that
 * names an id no other fixture defines: the card renders, the person taps it,
 * and the screen behind it is empty or in its error state. Nothing in the type
 * system can see that — every id is a `string` — so it has to be walked.
 *
 * Every reference is followed through the API the app calls, with an id taken
 * from a previous answer rather than written down here, because an id written
 * down here would still resolve on the day the fixture stops defining it.
 */

const NOW = '2026-09-08T09:20:00.000Z'
const ISTANBUL = 'Europe/Istanbul'

function demoClient(): ApiClient {
  return createApiClient({
    supabaseUrl: 'https://demo.invalid',
    supabaseAnonKey: 'demo-anon-key',
    getAccessToken: async () => null,
    clock: fixedClock(NOW),
    mode: 'demo',
  })
}

function required<T>(value: T | undefined | null, what: string): T {
  expect(value, what).not.toBeUndefined()
  expect(value, what).not.toBeNull()
  if (value === undefined || value === null) throw new Error(what)
  return value
}

const today = () => toIsoDate(new Date(NOW), ISTANBUL)

/**
 * The record a reference names, fetched the way the screen behind the link
 * would fetch it.
 *
 * `notification` has no read on `ApiClient` at all, so a reference of that type
 * can only ever be a dead link — it resolves to null here deliberately, and the
 * assertion below fails if the demo ever hands one out.
 */
async function resolveRef(api: ApiClient, type: SourceType, id: string): Promise<unknown> {
  switch (type) {
    case 'email':
      return api.threads.get(id)
    case 'calendar_event':
      return api.events.get(id)
    case 'contact':
      return api.people.get(id)
    case 'capture':
      return api.captures.get(id)
    case 'commitment':
      return (await api.commitments.list({ limit: 100 })).find((item) => item.id === id) ?? null
    case 'task':
      return (
        (await api.plan.week()).days.flatMap((day) => day.tasks).find((item) => item.id === id) ??
        null
      )
    case 'notification':
    case 'user_input':
      return null
  }
}

/** Whichever kind of record `id` turns out to be, or null when it is none. */
async function resolveAny(api: ApiClient, id: string): Promise<SourceType | null> {
  const kinds: SourceType[] = [
    'email',
    'calendar_event',
    'commitment',
    'contact',
    'capture',
    'task',
  ]
  for (const kind of kinds) {
    if ((await resolveRef(api, kind, id)) !== null) return kind
  }
  return null
}

async function expectRefResolves(api: ApiClient, ref: SourceRef, where: string): Promise<void> {
  if (ref.type === 'user_input') {
    // Nothing to open: the user typed it, so the id names an origin rather than
    // a record. It still has to be labelled, because the chip renders the label.
    expect(ref.id, `${where}: user_input id`).toBeTruthy()
    expect(ref.label, `${where}: user_input label`).toBeTruthy()
    return
  }
  const record = await resolveRef(api, ref.type, ref.id)
  expect(record, `${where}: ${ref.type} ${ref.id}`).not.toBeNull()
  expect(ref.label, `${where}: label`).toBeTruthy()
}

/**
 * The records an offered action would open.
 *
 * Keyed by parameter name rather than by action kind: the app dispatches on the
 * kind but routes on the parameter, and it is the parameter that has to name
 * something real.
 */
async function expectActionResolves(
  api: ApiClient,
  action: InsightAction,
  where: string,
): Promise<void> {
  expect(action.label, `${where}: ${action.kind} label`).toBeTruthy()
  for (const [name, value] of Object.entries(action.params)) {
    const at = `${where}: ${action.kind}.${name}`
    switch (name) {
      case 'threadId':
        expect(await api.threads.get(value), at).not.toBeNull()
        break
      case 'eventId':
        expect(await api.events.get(value), at).not.toBeNull()
        break
      case 'captureId':
        expect(await api.captures.get(value), at).not.toBeNull()
        break
      case 'contactId':
      case 'personId':
        expect(await api.people.get(value), at).not.toBeNull()
        break
      case 'entityId':
        // The generic one: whatever kind of record it is, the app has to find it.
        expect(await resolveAny(api, value), at).not.toBeNull()
        break
      case 'url':
        expect(value, at).toMatch(/^https:\/\//)
        break
      default:
        expect(value, at).toBeTruthy()
    }
  }
}

let api: ApiClient

beforeEach(() => {
  api = demoClient()
})

describe('today, hop by hop', () => {
  it('resolves the source and every offered action behind each insight', async () => {
    const feed = await api.today.get()
    expect(feed.insights.length).toBeGreaterThan(0)
    for (const insight of feed.insights) {
      const where = `insight ${insight.title}`
      const source = required(insight.source, `${where}: source`)
      await expectRefResolves(api, source, where)
      expect(insight.actions.length, `${where}: actions`).toBeGreaterThan(0)
      for (const action of insight.actions) await expectActionResolves(api, action, where)
      expect(insight.forDate).toBe(feed.forDate)
    }
  })

  it('opens every event on the feed through events.get', async () => {
    const feed = await api.today.get()
    expect(feed.events.length).toBeGreaterThan(0)
    for (const event of feed.events) {
      const opened = required(await api.events.get(event.id), `event ${event.title}`)
      expect(opened.startsAt).toBe(event.startsAt)
      expect(toIsoDate(new Date(event.startsAt), ISTANBUL)).toBe(feed.forDate)
    }
  })

  it('finds every commitment on the feed in the commitments list, sourced to a real record', async () => {
    const feed = await api.today.get()
    const listed = await api.commitments.list({ limit: 100 })
    expect(feed.commitments.length).toBeGreaterThan(0)
    for (const commitment of feed.commitments) {
      expect(listed.map((item) => item.id)).toContain(commitment.id)
      await expectRefResolves(api, commitment.source, `commitment ${commitment.text}`)
      if (commitment.personId !== null) {
        expect(
          await api.people.get(commitment.personId),
          `commitment ${commitment.text}: person`,
        ).not.toBeNull()
      }
    }
  })

  it('lands every follow-up on a thread and on the message it is waiting for', async () => {
    const feed = await api.today.get()
    expect(feed.followUps.length).toBeGreaterThan(0)
    for (const followUp of feed.followUps) {
      const thread = required(
        await api.threads.get(followUp.threadId),
        `follow-up ${followUp.recipientEmail}: thread`,
      )
      const messages = await api.threads.messages(thread.id)
      expect(
        messages.map((message) => message.id),
        `follow-up ${followUp.recipientEmail}: message`,
      ).toContain(followUp.messageId)
      // The mail being chased is one the user sent, to the person being chased.
      const message = required(
        messages.find((candidate) => candidate.id === followUp.messageId),
        'the chased message',
      )
      expect(message.isFromUser).toBe(true)
      expect(message.toEmails).toContain(followUp.recipientEmail)
      expect(thread.participantEmails).toContain(followUp.recipientEmail)
    }
  })

  it('sources every life event to a thread that opens', async () => {
    const feed = await api.today.get()
    expect(feed.lifeEvents.length).toBeGreaterThan(0)
    for (const lifeEvent of feed.lifeEvents) {
      await expectRefResolves(api, lifeEvent.source, `life event ${lifeEvent.title}`)
      if (lifeEvent.trackingUrl !== null) expect(lifeEvent.trackingUrl).toMatch(/^https:\/\//)
    }
  })

  it('opens every pending approval on the feed through approvals.get', async () => {
    const feed = await api.today.get()
    expect(feed.pendingApprovals.length).toBeGreaterThan(0)
    for (const approval of feed.pendingApprovals) {
      const opened = required(await api.approvals.get(approval.id), `approval ${approval.what}`)
      expect(opened.status).toBe('pending')
    }
  })
})

describe('the briefing, item by item', () => {
  it('cites nothing it cannot open', async () => {
    const result = required(await api.briefings.get({ kind: 'morning' }), 'the morning briefing')
    expect(result.items.length).toBeGreaterThan(0)
    for (const item of result.items) {
      const where = `briefing item ${item.title}`
      expect(item.briefingId).toBe(result.briefing.id)
      const source = required(item.source, `${where}: source`)
      await expectRefResolves(api, source, where)
      // `relatedEntityType`/`relatedEntityId` is what the row is routed on, so
      // it has to agree with the source chip rather than merely exist.
      expect(item.relatedEntityType, `${where}: relatedEntityType`).toBe(source.type)
      expect(item.relatedEntityId, `${where}: relatedEntityId`).toBe(source.id)
    }
  })

  it('cites the same items Today shows', async () => {
    const feed = await api.today.get()
    const result = required(await api.briefings.get({ kind: 'morning' }), 'the morning briefing')
    expect(feed.briefingItems.map((item) => item.id)).toEqual(result.items.map((item) => item.id))
  })

  it('covers a schedule item for a meeting that is genuinely on the day', async () => {
    const result = required(await api.briefings.get({ kind: 'morning' }), 'the morning briefing')
    const schedule = result.items.filter((item) => item.section === 'schedule')
    expect(schedule.length).toBeGreaterThan(0)
    const day = await api.plan.day()
    for (const item of schedule) {
      expect(day.events.map((event) => event.id)).toContain(item.relatedEntityId)
    }
  })
})

describe('approvals, payload by payload', () => {
  it('names a real mailbox, a real thread and a real message on every payload', async () => {
    const approvals = await api.approvals.list()
    expect(approvals.length).toBeGreaterThan(0)
    const accountIds = (await api.accounts.list()).map((account) => account.id)

    for (const approval of approvals) {
      const where = `approval ${approval.what}`
      expect(await api.approvals.get(approval.id), where).not.toBeNull()
      if (approval.source !== null) await expectRefResolves(api, approval.source, where)

      const payload = approval.payload
      switch (payload.kind) {
        case 'email_send': {
          expect(accountIds, `${where}: account`).toContain(payload.connectedAccountId)
          const threadId = required(payload.threadId, `${where}: threadId`)
          const thread = required(await api.threads.get(threadId), `${where}: thread`)
          expect(payload.connectedAccountId, `${where}: mailbox`).toBe(thread.connectedAccountId)
          const messages = await api.threads.messages(threadId)
          // Replying to a message the thread does not hold starts a new
          // conversation on the provider instead of continuing this one.
          expect(
            messages.map((message) => message.externalMessageId),
            `${where}: inReplyToMessageId`,
          ).toContain(payload.inReplyToMessageId)
          for (const recipient of payload.to) {
            expect(thread.participantEmails, `${where}: recipient`).toContain(recipient)
          }
          break
        }
        case 'calendar_create':
          expect(accountIds, `${where}: account`).toContain(payload.connectedAccountId)
          expect(payload.endsAt > payload.startsAt, `${where}: window`).toBe(true)
          break
        case 'calendar_update':
          expect(accountIds, `${where}: account`).toContain(payload.connectedAccountId)
          expect(await api.events.get(payload.eventId), `${where}: event`).not.toBeNull()
          break
        case 'task_create':
          if (payload.connectedAccountId !== null) {
            expect(accountIds, `${where}: account`).toContain(payload.connectedAccountId)
          }
          break
        case 'reminder_create':
          if (payload.relatedEntityType !== null && payload.relatedEntityId !== null) {
            expect(
              await resolveRef(api, payload.relatedEntityType, payload.relatedEntityId),
              `${where}: related entity`,
            ).not.toBeNull()
          }
          break
        case 'commitment_create':
          expect(payload.quote, `${where}: quote`).toBeTruthy()
          break
      }
    }
  })

  it('sources a commitment the user approved to the user, not to a thread that does not exist', async () => {
    // An approval with no source of its own: the path that used to point the
    // stored promise at the approval's own id, labelled as an e-mail.
    const approval = await api.approvals.create({
      type: 'commitment_create',
      what: 'Taahhüdü kaydet',
      why: 'Toplantıda söz verdin.',
      discriminator: 'demo-integrity-commitment',
      payload: {
        kind: 'commitment_create',
        text: 'Ekibe fiyat tablosunu göndereceksin',
        direction: 'user_owes',
        personName: 'Elif Şahin',
        dueAt: null,
        quote: 'Tabloyu bugün gönderirim.',
      },
    })
    expect(approval.source).toBeNull()

    const result = await api.approvals.decide({ approvalId: approval.id, decision: 'approve' })
    const commitmentId = required(result.resultRef, 'the stored commitment id')
    const commitment = required(
      (await api.commitments.list({ limit: 100 })).find((item) => item.id === commitmentId),
      'the stored commitment',
    )
    expect(commitment.source.type).toBe('user_input')
    await expectRefResolves(api, commitment.source, 'approved commitment')
  })
})

describe('mail, thread by thread', () => {
  it('opens every listed thread onto messages that belong to it', async () => {
    const threads = await api.threads.list({ includeSuppressed: true })
    expect(threads.length).toBeGreaterThan(0)
    const accountIds = (await api.accounts.list()).map((account) => account.id)

    for (const thread of threads) {
      const where = `thread ${thread.subject}`
      expect(accountIds, `${where}: account`).toContain(thread.connectedAccountId)
      const opened = required(await api.threads.get(thread.id), where)
      expect(opened.id).toBe(thread.id)

      const messages = await api.threads.messages(thread.id)
      // A thread the feed lists and the detail cannot fill is the exact failure
      // this file exists for: the card renders and the screen behind it is empty.
      expect(messages.length, `${where}: messages`).toBeGreaterThan(0)
      expect(thread.messageCount, `${where}: messageCount`).toBe(messages.length)

      for (const message of messages) {
        expect(message.threadId, `${where}: message thread`).toBe(thread.id)
        expect(message.connectedAccountId, `${where}: message mailbox`).toBe(
          thread.connectedAccountId,
        )
        expect(message.subject, `${where}: message subject`).toBe(thread.subject)
        expect(thread.participantEmails, `${where}: sender`).toContain(message.fromEmail)
        expect(message.toEmails.length, `${where}: recipients`).toBeGreaterThan(0)
        for (const recipient of message.toEmails) {
          expect(thread.participantEmails, `${where}: recipient`).toContain(recipient)
        }
        expect(message.toEmails, `${where}: self-addressed`).not.toContain(message.fromEmail)
      }

      const latest = required(messages.at(-1), `${where}: latest message`)
      expect(latest.sentAt, `${where}: lastMessageAt`).toBe(thread.lastMessageAt)
    }
  })

  it('fills the detail screen for every thread the list offers', async () => {
    const threads = await api.threads.list()
    for (const thread of threads) {
      const detail = required(await api.threads.detail(thread.id), `detail ${thread.subject}`)
      expect(detail.messages.length).toBeGreaterThan(0)
      for (const commitment of detail.commitments) {
        expect(commitment.source.id).toBe(thread.id)
        expect(commitment.source.type).toBe('email')
      }
      for (const followUp of detail.followUps) expect(followUp.threadId).toBe(thread.id)
    }
  })

  it('drafts a reply for every thread, addressed inside the thread', async () => {
    const threads = await api.threads.list()
    const profile = required(await api.settings.profile(), 'the profile')
    for (const thread of threads) {
      const draft = await api.reply.draft({ threadId: thread.id })
      const where = `draft ${thread.subject}`
      expect(draft.to.length, `${where}: recipients`).toBeGreaterThan(0)
      for (const recipient of draft.to) {
        expect(thread.participantEmails, `${where}: recipient`).toContain(recipient)
      }
      expect(draft.to, `${where}: self`).not.toContain(profile.email)
      if (draft.inReplyToMessageId !== null) {
        const messages = await api.threads.messages(thread.id)
        expect(
          messages.map((message) => message.externalMessageId),
          `${where}: inReplyToMessageId`,
        ).toContain(draft.inReplyToMessageId)
      }
    }
  })
})

describe('the plan', () => {
  it('opens every event on the day and every event a conflict names', async () => {
    const day = await api.plan.day()
    expect(day.events.length).toBeGreaterThan(0)
    for (const event of day.events) {
      expect(await api.events.get(event.id), `event ${event.title}`).not.toBeNull()
    }
    expect(day.conflicts.length).toBeGreaterThan(0)
    for (const conflict of day.conflicts) {
      expect(conflict.eventIds.length).toBeGreaterThanOrEqual(2)
      for (const eventId of conflict.eventIds) {
        // The conflicts screen renders the clash by opening both meetings, so
        // an id it names that is not on the day it was found is a dead card.
        expect(
          day.events.map((event) => event.id),
          `conflict ${conflict.kind}`,
        ).toContain(eventId)
        expect(await api.events.get(eventId), `conflict ${conflict.kind}`).not.toBeNull()
      }
    }
  })

  it('dates every task, commitment and reminder on the day it files them under', async () => {
    const week = await api.plan.week()
    const dayOf = (instant: string) => toIsoDate(new Date(instant), ISTANBUL)
    let tasks = 0
    let reminders = 0
    for (const day of week.days) {
      for (const event of day.events) {
        expect(await api.events.get(event.id), `week event ${event.title}`).not.toBeNull()
      }
      for (const task of day.tasks) {
        tasks += 1
        expect(dayOf(required(task.dueAt, 'task due date')), `task ${task.title}`).toBe(day.date)
        const source = required(task.source, `task ${task.title}: source`)
        await expectRefResolves(api, source, `task ${task.title}`)
      }
      for (const commitment of day.commitments) {
        expect(
          dayOf(required(commitment.dueAt, 'commitment due date')),
          `commitment ${commitment.text}`,
        ).toBe(day.date)
      }
      for (const reminder of day.reminders) {
        reminders += 1
        expect(dayOf(reminder.remindAt), `reminder ${reminder.title}`).toBe(day.date)
      }
    }
    // The week has to hold something on each of the three, or none of these
    // assertions has looked at anything.
    expect(tasks).toBeGreaterThan(0)
    expect(reminders).toBeGreaterThan(0)
    expect(week.days.some((day) => day.commitments.length > 0)).toBe(true)
  })

  it('anchors every suggestion to a free block or a meeting that exists', async () => {
    const day = await api.plan.day()
    const suggestions = await api.plan.suggestions()
    expect(suggestions.length).toBeGreaterThan(0)
    for (const suggestion of suggestions) {
      const where = `suggestion ${suggestion.id}`
      if (suggestion.relatedEventId !== null) {
        expect(await api.events.get(suggestion.relatedEventId), where).not.toBeNull()
        expect(
          day.events.map((event) => event.id),
          where,
        ).toContain(suggestion.relatedEventId)
      }
      if (suggestion.kind === 'focus_block') {
        const block = day.freeBlocks.find((candidate) => candidate.startsAt === suggestion.startsAt)
        expect(required(block, `${where}: free block`).minutes).toBe(suggestion.minutes)
      }
    }
  })
})

describe('the standalone lists', () => {
  it('opens every contact the directory offers', async () => {
    const people = await api.people.list()
    expect(people.length).toBeGreaterThan(0)
    for (const contact of people) {
      const opened = required(await api.people.get(contact.id), `contact ${contact.email}`)
      expect(opened.email).toBe(contact.email)
    }
  })

  it('points every priority rule and learned preference at a person the demo knows', async () => {
    const people = await api.people.list()
    const addresses = people.map((contact) => contact.email)
    const rules = await api.rules.list()
    expect(rules.length).toBeGreaterThan(0)
    for (const rule of rules) {
      // Only the sender-shaped kinds name an address; a category rule names a
      // category, and matching it against the directory would prove nothing.
      if (rule.matchValue.includes('@')) {
        expect(addresses, `rule ${rule.kind}`).toContain(rule.matchValue)
      }
    }
    const learned = await api.rules.learnedList()
    expect(learned.length).toBeGreaterThan(0)
    for (const preference of learned) {
      if (preference.matchValue.includes('@')) {
        expect(addresses, `learned ${preference.kind}`).toContain(preference.matchValue)
      }
    }
  })

  it('opens every capture and every action it offers', async () => {
    const captures = await api.captures.list()
    expect(captures.length).toBeGreaterThan(0)
    for (const capture of captures) {
      const opened = required(await api.captures.get(capture.id), `capture ${capture.id}`)
      expect(opened.id).toBe(capture.id)
      const extracted = required(capture.extracted, `capture ${capture.id}: extraction`)
      for (const action of extracted.suggestedActions) {
        await expectActionResolves(api, action, `capture ${capture.id}`)
      }
    }
  })

  it('points every reminder at the record it was set from', async () => {
    const reminders = await api.reminders.list()
    expect(reminders.length).toBeGreaterThan(0)
    for (const reminder of reminders) {
      const where = `reminder ${reminder.title}`
      if (reminder.source !== null) await expectRefResolves(api, reminder.source, where)
      if (reminder.relatedEntityType !== null && reminder.relatedEntityId !== null) {
        expect(
          await resolveRef(api, reminder.relatedEntityType, reminder.relatedEntityId),
          `${where}: related entity`,
        ).not.toBeNull()
      }
    }
  })

  it('sources every commitment on the list, and links the person it names', async () => {
    const commitments = await api.commitments.list({ limit: 100 })
    expect(commitments.length).toBeGreaterThan(0)
    for (const commitment of commitments) {
      await expectRefResolves(api, commitment.source, `commitment ${commitment.text}`)
      if (commitment.personId !== null) {
        const contact = required(
          await api.people.get(commitment.personId),
          `commitment ${commitment.text}: person`,
        )
        expect(contact.name).toBe(commitment.personName)
      }
    }
  })

  it('lands every follow-up the list offers on a thread with a nudge to send', async () => {
    const followUps = await api.followUps.list()
    expect(followUps.length).toBeGreaterThan(0)
    for (const followUp of followUps) {
      const thread = required(
        await api.threads.get(followUp.threadId),
        `follow-up ${followUp.recipientEmail}`,
      )
      const draft = await api.followUps.nudgeDraft(followUp.id)
      expect(draft.subject).toContain(thread.subject)
    }
  })
})

describe('assistant, search and sync', () => {
  it('cites only records that open, in the seeded history and in a fresh answer', async () => {
    const threads = await api.assistant.threads()
    expect(threads.length).toBeGreaterThan(0)
    for (const thread of threads) {
      const messages = await api.assistant.messages(thread.id)
      expect(messages.length, `assistant thread ${thread.title}`).toBeGreaterThan(0)
      expect(thread.messageCount).toBe(messages.length)
      for (const message of messages) {
        expect(message.threadId).toBe(thread.id)
        for (const citation of message.citations) {
          await expectRefResolves(api, citation, `assistant ${thread.title}`)
        }
      }
    }

    const answer = await api.assistant.ask({ question: 'Bugün toplantım var mı?' })
    expect(answer.citations.length).toBeGreaterThan(0)
    for (const citation of answer.citations) {
      expect(
        await resolveRef(api, citation.sourceType as SourceType, citation.sourceId),
        `answer citation ${citation.label}`,
      ).not.toBeNull()
    }
  })

  it('returns search hits that open as the kind they claim to be', async () => {
    const page = await api.search.query({ query: 'teklif' })
    expect(page.results.length).toBeGreaterThan(0)
    for (const hit of page.results) {
      expect(
        await resolveRef(api, hit.type as SourceType, hit.id),
        `hit ${hit.type} ${hit.title}`,
      ).not.toBeNull()
    }
  })

  it('links every meeting brief to threads and people the app can open', async () => {
    const day = await api.plan.day()
    expect(day.events.length).toBeGreaterThan(0)
    for (const event of day.events) {
      const prep = await api.meetings.prep(event.id)
      const where = `prep ${event.title}`
      for (const threadId of prep.relatedThreadIds) {
        expect(await api.threads.get(threadId), `${where}: thread`).not.toBeNull()
      }
      for (const commitment of prep.openCommitments) {
        expect(
          (await api.commitments.list({ limit: 100 })).map((item) => item.id),
          `${where}: commitment`,
        ).toContain(commitment.id)
      }
      for (const attendee of prep.attendees) {
        expect(
          event.attendees.map((invitee) => invitee.email),
          `${where}: attendee`,
        ).toContain(attendee.email)
      }
    }
  })

  it('ties every sync state to a connected account, and the pass to a real briefing', async () => {
    const accountIds = (await api.accounts.list()).map((account) => account.id)
    const states = await api.sync.status()
    expect(states.length).toBeGreaterThan(0)
    for (const state of states) {
      expect(accountIds, `sync state ${state.resource}`).toContain(state.connectedAccountId)
    }

    const analysis = await api.sync.initialAnalysis()
    const briefingId = required(analysis.briefingId, 'the briefing the pass produced')
    expect((await api.briefings.list()).map((briefing) => briefing.id)).toContain(briefingId)
  })
})

describe('the ids themselves', () => {
  it('are uuid-shaped everywhere, so a row survives schema validation anywhere', async () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const feed = await api.today.get()
    const ids = [
      ...(await api.threads.list({ includeSuppressed: true })).map((thread) => thread.id),
      ...(await api.accounts.list()).map((account) => account.id),
      ...(await api.people.list()).map((contact) => contact.id),
      ...(await api.commitments.list({ limit: 100 })).map((item) => item.id),
      ...(await api.approvals.list()).map((item) => item.id),
      ...(await api.reminders.list()).map((item) => item.id),
      ...(await api.captures.list()).map((item) => item.id),
      ...(await api.rules.list()).map((item) => item.id),
      ...(await api.briefings.list()).map((item) => item.id),
      ...feed.insights.map((item) => item.id),
      ...feed.lifeEvents.map((item) => item.id),
      ...feed.briefingItems.map((item) => item.id),
    ]
    expect(ids.length).toBeGreaterThan(30)
    for (const id of ids) expect(id, id).toMatch(uuid)
    expect(new Set(ids).size, 'every demo id is distinct').toBe(ids.length)
  })

  it('are stable across a reload, so a deep link written yesterday still lands', async () => {
    const first = await demoClient().threads.list()
    const second = await demoClient().threads.list()
    expect(second.map((thread) => thread.id)).toEqual(first.map((thread) => thread.id))

    const threadId = required(first[0], 'the first thread').id
    expect(await demoClient().threads.get(threadId)).not.toBeNull()
    expect(today()).toBe('2026-09-08')
  })
})
