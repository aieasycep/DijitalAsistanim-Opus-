import { AppError, fixedClock, toIsoDate } from '@da/domain'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ApiClient } from '../index'
import { createApiClient } from '../index'

/**
 * The demo client, method by method.
 *
 * This is the whole backend for a build with no credentials — the APK a
 * reviewer installs runs entirely on it — so "does it resolve" is only half the
 * question. Every read here also asserts what came back, because a demo that
 * answers `[]` to everything passes a weak test and fails the person holding
 * the phone; and every write asserts the change is visible in the next read,
 * because an approval that stays pending after you approve it looks broken.
 *
 * Referential integrity has its own file — `demo-integrity.test.ts` — and the
 * wire contracts theirs, in `demo-contracts.test.ts`.
 */

/**
 * A Tuesday morning in Istanbul, 12:20 local.
 *
 * Fixed so the fixtures' clock-derived schedule is the same on every run, and
 * mid-morning so the demo day still has meetings ahead of it.
 */
const NOW = '2026-09-08T09:20:00.000Z'
const ISTANBUL = 'Europe/Istanbul'

function demoClient(instant: string = NOW): ApiClient {
  return createApiClient({
    supabaseUrl: 'https://demo.invalid',
    supabaseAnonKey: 'demo-anon-key',
    getAccessToken: async () => null,
    clock: fixedClock(instant),
    mode: 'demo',
  })
}

/** The value, with a failure that names what was missing. */
function required<T>(value: T | undefined | null, what: string): T {
  expect(value, what).not.toBeUndefined()
  expect(value, what).not.toBeNull()
  if (value === undefined || value === null) throw new Error(what)
  return value
}

const today = (instant: string = NOW) => toIsoDate(new Date(instant), ISTANBUL)

let api: ApiClient

beforeEach(() => {
  api = demoClient()
})

describe('the client itself', () => {
  it('reports demo mode and exposes every sub-API as an object of functions', () => {
    expect(api.mode).toBe('demo')
    const groups = [
      'accounts',
      'sync',
      'today',
      'briefings',
      'threads',
      'reply',
      'followUps',
      'commitments',
      'events',
      'plan',
      'meetings',
      'assistant',
      'search',
      'captures',
      'approvals',
      'reminders',
      'people',
      'rules',
      'settings',
      'subscription',
      'referral',
      'privacy',
      'notifications',
    ] as const
    expect(groups).toHaveLength(23)
    for (const group of groups) {
      const methods = Object.values(api[group])
      expect(methods.length, group).toBeGreaterThan(0)
      for (const method of methods) expect(typeof method, group).toBe('function')
    }
  })
})

describe('accounts', () => {
  it('lists two connected mailboxes, both usable', async () => {
    const accounts = await api.accounts.list()
    expect(accounts).toHaveLength(2)
    expect(accounts.map((account) => account.provider)).toEqual(['google', 'microsoft'])
    for (const account of accounts) {
      expect(account.status).toBe('connected')
      expect(account.kinds.length).toBeGreaterThan(0)
      expect(account.grantedScopes.length).toBeGreaterThan(0)
      expect(account.email).toBeTruthy()
    }
    expect(accounts.filter((account) => account.isPrimary)).toHaveLength(1)
  })

  it('starts and completes an OAuth round trip', async () => {
    const start = await api.accounts.startOAuth({
      provider: 'google',
      kinds: ['mail', 'calendar'],
      redirectTo: 'dijitalasistan://oauth',
    })
    expect(start.authorizeUrl).toContain('google')
    expect(start.state).toBeTruthy()

    const account = await api.accounts.completeOAuth({ code: 'demo-code', state: start.state })
    expect(account.status).toBe('connected')
    expect(account.lastSyncedAt).toBe(new Date(NOW).toISOString())
  })

  it('asks for one more scope group against an account it already holds', async () => {
    const accounts = await api.accounts.list()
    const account = required(accounts[0], 'first connected account')
    const step = await api.accounts.requestScopes({
      connectedAccountId: account.id,
      provider: 'google',
      kinds: ['mail'],
      scopeGroups: ['mailSend'],
      redirectTo: 'dijitalasistan://oauth',
    })
    expect(step.authorizeUrl).toContain('scopes')
  })

  it('marks a disconnected account disconnected on the next read', async () => {
    const before = await api.accounts.list()
    const account = required(before[1], 'second connected account')
    await api.accounts.disconnect({ connectedAccountId: account.id })

    const after = await api.accounts.list()
    const disconnected = required(
      after.find((candidate) => candidate.id === account.id),
      'the disconnected account',
    )
    expect(disconnected.status).toBe('disconnected')
    expect(after.filter((candidate) => candidate.status === 'connected')).toHaveLength(1)
  })
})

describe('sync', () => {
  it('reports a per-resource outcome for every syncable state', async () => {
    const result = await api.sync.start()
    expect(result.started).toBe(true)
    expect(result.failures).toEqual([])
    expect(result.outcomes.map((outcome) => outcome.resource)).toEqual(['mail', 'calendar'])
    for (const outcome of result.outcomes) expect(outcome.complete).toBe(true)
  })

  it('stamps every sync state as run on the injected clock', async () => {
    await api.sync.start()
    const states = await api.sync.status()
    expect(states).toHaveLength(2)
    for (const state of states) {
      expect(state.status).toBe('idle')
      expect(state.lastRunAt).toBe(new Date(NOW).toISOString())
      expect(state.consecutiveFailures).toBe(0)
    }
  })

  it('answers the onboarding pass as finished, with counts drawn from the store', async () => {
    const analysis = await api.sync.initialAnalysis()
    const progress = await api.sync.initialAnalysisProgress()
    expect(analysis).toEqual(progress)
    expect(analysis.phase).toBe('done')
    expect(analysis.progress).toBe(1)
    expect(analysis.errorCode).toBeNull()

    const messageCount = (await api.threads.list()).reduce(
      (total, thread) => total + thread.messageCount,
      0,
    )
    expect(analysis.emailsFound).toBe(messageCount)
    expect(analysis.meetingsFound).toBeGreaterThan(0)
    expect(analysis.importantFound).toBeGreaterThan(0)
    expect(analysis.followUpsFound).toBe((await api.followUps.list()).length)
  })
})

describe('today', () => {
  it('fills every section of the home screen', async () => {
    const feed = await api.today.get()
    expect(feed.forDate).toBe(today())
    expect(feed.generatedAt).toBe(new Date(NOW).toISOString())
    expect(required(feed.briefing, 'the morning briefing').kind).toBe('morning')
    expect(feed.briefingItems.length).toBeGreaterThan(0)
    expect(feed.insights.length).toBeGreaterThan(0)
    expect(feed.events.length).toBeGreaterThan(0)
    expect(feed.commitments.length).toBeGreaterThan(0)
    expect(feed.followUps.length).toBeGreaterThan(0)
    expect(feed.lifeEvents.length).toBeGreaterThan(0)
    expect(feed.pendingApprovals.length).toBeGreaterThan(0)
  })

  it('orders the briefing items by position within the briefing they belong to', async () => {
    const feed = await api.today.get()
    const briefing = required(feed.briefing, 'the morning briefing')
    for (const item of feed.briefingItems) expect(item.briefingId).toBe(briefing.id)
    const positions = feed.briefingItems.map((item) => item.position)
    expect(positions).toEqual([...positions].sort((left, right) => left - right))
  })

  it('answers an empty day for a date the demo has nothing on', async () => {
    const feed = await api.today.get({ forDate: '2020-01-01' })
    expect(feed.forDate).toBe('2020-01-01')
    expect(feed.briefing).toBeNull()
    expect(feed.briefingItems).toEqual([])
    expect(feed.insights).toEqual([])
    expect(feed.events).toEqual([])
  })

  it('drops a dismissed insight from the next read', async () => {
    const before = await api.today.get()
    const insight = required(before.insights[0], 'the first insight')
    await api.today.dismissInsight(insight.id)

    const after = await api.today.get()
    expect(after.insights.map((item) => item.id)).not.toContain(insight.id)
    expect(after.insights).toHaveLength(before.insights.length - 1)
  })

  it('keeps a completed insight on the feed and stamps it, as the live feed does', async () => {
    const before = await api.today.get()
    const insight = required(before.insights[0], 'the first insight')
    await api.today.completeInsight(insight.id)

    const after = await api.today.get()
    const completed = required(
      after.insights.find((item) => item.id === insight.id),
      'the completed insight',
    )
    expect(completed.completedAt).toBe(new Date(NOW).toISOString())
  })
})

describe('briefings', () => {
  it('returns the morning briefing with its items in position order', async () => {
    const result = required(await api.briefings.get({ kind: 'morning' }), 'the morning briefing')
    expect(result.briefing.forDate).toBe(today())
    expect(result.briefing.status).toBe('ready')
    expect(result.briefing.headline).toBeTruthy()
    expect(result.briefing.narrative).toBeTruthy()
    expect(required(result.briefing.stats, 'briefing stats').emailsAnalyzed).toBeGreaterThan(0)
    expect(result.items.length).toBeGreaterThan(0)
    const positions = result.items.map((item) => `${item.section}:${item.position}`)
    expect(new Set(positions).size).toBe(positions.length)
  })

  it('has nothing to show for a kind the demo day never generated', async () => {
    expect(await api.briefings.get({ kind: 'weekly' })).toBeNull()
  })

  it('lists the briefings newest day first', async () => {
    const briefings = await api.briefings.list()
    expect(briefings.length).toBeGreaterThan(0)
    const dates = briefings.map((briefing) => briefing.forDate)
    expect(dates).toEqual([...dates].sort().reverse())
  })

  it('serves a cached briefing without writing a second one', async () => {
    const result = await api.briefings.generate({ kind: 'morning' })
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.reason).toBe('cached')
    expect(result.items.length).toBeGreaterThan(0)
    expect(await api.briefings.list()).toHaveLength(1)
  })

  it('replaces the day briefing when the user forces a regeneration', async () => {
    const before = required(await api.briefings.get({ kind: 'morning' }), 'the first briefing')
    const result = await api.briefings.generate({ kind: 'morning', force: true })
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.reason).toBe('generated')
    expect(result.briefing.id).not.toBe(before.briefing.id)
    expect(result.items.length).toBe(before.items.length)

    // The regenerated briefing is the one both readers now find; the old one is
    // gone rather than shadowing it.
    const morning = await api.briefings.list()
    expect(morning.filter((briefing) => briefing.forDate === today())).toHaveLength(1)
    const reread = required(await api.briefings.get({ kind: 'morning' }), 'the reread briefing')
    expect(reread.briefing.id).toBe(result.briefing.id)
    expect(reread.items.map((item) => item.id).sort()).toEqual(
      result.items.map((item) => item.id).sort(),
    )
    const feed = await api.today.get()
    expect(required(feed.briefing, 'the feed briefing').id).toBe(result.briefing.id)
    expect(feed.briefingItems).toHaveLength(result.items.length)
  })

  it('offers the narrative for on-device speech when no TTS provider exists', async () => {
    const briefing = required(await api.briefings.get({ kind: 'morning' }), 'the briefing')
    const audio = await api.briefings.requestAudio({ briefingId: briefing.briefing.id })
    expect(audio.audioUrl).toBeNull()
    expect(audio.provider).toBeNull()
    expect(audio.ssmlOrText).toBe(briefing.briefing.narrative)
    expect(audio.durationSeconds).toBe(briefing.briefing.durationSeconds)
  })

  it('stamps a briefing as opened, visibly on the next read', async () => {
    const briefing = required(await api.briefings.get({ kind: 'morning' }), 'the briefing')
    expect(briefing.briefing.openedAt).toBeNull()
    const opened = await api.briefings.markOpened(briefing.briefing.id)
    expect(opened.openedAt).toBe(new Date(NOW).toISOString())

    const reread = required(await api.briefings.get({ kind: 'morning' }), 'the reread briefing')
    expect(reread.briefing.openedAt).toBe(new Date(NOW).toISOString())
  })

  it('refuses an audio request for a briefing that does not exist', async () => {
    await expect(
      api.briefings.requestAudio({ briefingId: 'da000000-0000-4000-8000-000000009999' }),
    ).rejects.toBeInstanceOf(AppError)
  })
})

describe('threads', () => {
  it('lists the mail newest first, with a summary and a score on every thread', async () => {
    const threads = await api.threads.list()
    expect(threads.length).toBeGreaterThanOrEqual(5)
    const instants = threads.map((thread) => thread.lastMessageAt)
    expect(instants).toEqual([...instants].sort().reverse())
    for (const thread of threads) {
      expect(thread.subject).toBeTruthy()
      expect(thread.summary).toBeTruthy()
      expect(thread.participantEmails.length).toBeGreaterThan(0)
      expect(thread.priorityScore).toBeGreaterThan(0)
    }
  })

  it('cuts the feed the way each Akış chip promises', async () => {
    const all = await api.threads.list()
    const important = await api.threads.list({ flow: 'important' })
    expect(important.length).toBeGreaterThan(0)
    for (const thread of important) expect(['critical', 'high']).toContain(thread.importance)

    const action = await api.threads.list({ flow: 'action_required' })
    expect(action.length).toBeGreaterThan(0)
    for (const thread of action) expect(thread.requiresUserAction).toBe(true)

    const personal = await api.threads.list({ flow: 'personal' })
    expect(personal.length).toBeGreaterThan(0)
    for (const thread of personal) {
      expect(['shipment', 'travel', 'payment', 'subscription', 'security']).toContain(
        thread.category,
      )
    }

    const waiting = await api.threads.list({ flow: 'waiting' })
    expect(waiting.length).toBeGreaterThan(0)
    for (const thread of waiting) {
      expect(['waiting_for_user', 'waiting_for_other']).toContain(thread.category)
    }

    expect(await api.threads.list({ flow: 'deadlines' })).not.toHaveLength(0)
    expect(await api.threads.list({ flow: 'meetings' })).not.toHaveLength(0)
    expect(all.length).toBeGreaterThan(important.length)
  })

  it('honours the unread, account and limit filters', async () => {
    const unread = await api.threads.list({ unreadOnly: true })
    expect(unread.length).toBeGreaterThan(0)
    for (const thread of unread) expect(thread.isRead).toBe(false)

    const accounts = await api.accounts.list()
    const microsoft = required(
      accounts.find((account) => account.provider === 'microsoft'),
      'the Microsoft account',
    )
    const scoped = await api.threads.list({ accountId: microsoft.id })
    expect(scoped.length).toBeGreaterThan(0)
    for (const thread of scoped) expect(thread.connectedAccountId).toBe(microsoft.id)

    expect(await api.threads.list({ limit: 2 })).toHaveLength(2)
  })

  it('opens a thread, its messages and its detail from an id the list handed over', async () => {
    const threads = await api.threads.list()
    const listed = required(threads[0], 'the first thread')
    const thread = required(await api.threads.get(listed.id), 'the thread by id')
    expect(thread.id).toBe(listed.id)

    const messages = await api.threads.messages(thread.id)
    expect(messages.length).toBeGreaterThan(0)
    const sent = messages.map((message) => message.sentAt)
    expect(sent).toEqual([...sent].sort())

    const detail = required(await api.threads.detail(thread.id), 'the thread detail')
    expect(detail.thread.id).toBe(thread.id)
    expect(detail.messages).toEqual(messages)
  })

  it('answers null for a thread id nothing in the store defines', async () => {
    const missing = 'da000000-0000-4000-8000-000000009999'
    expect(await api.threads.get(missing)).toBeNull()
    expect(await api.threads.detail(missing)).toBeNull()
    expect(await api.threads.messages(missing)).toEqual([])
  })

  it('flips read state and keeps it', async () => {
    const unread = await api.threads.list({ unreadOnly: true })
    const thread = required(unread[0], 'an unread thread')
    const marked = await api.threads.markRead(thread.id, true)
    expect(marked.isRead).toBe(true)
    expect(required(await api.threads.get(thread.id), 'the reread thread').isRead).toBe(true)
    expect(await api.threads.list({ unreadOnly: true })).toHaveLength(unread.length - 1)
  })

  it('hides a suppressed thread from the feed but still opens it by id', async () => {
    const before = await api.threads.list()
    const thread = required(before[0], 'the first thread')
    const suppressed = await api.threads.suppress(thread.id)
    expect(suppressed.suppressedAt).toBe(new Date(NOW).toISOString())

    const after = await api.threads.list()
    expect(after.map((candidate) => candidate.id)).not.toContain(thread.id)
    expect(await api.threads.list({ includeSuppressed: true })).toHaveLength(before.length)
    expect(required(await api.threads.get(thread.id), 'the suppressed thread').id).toBe(thread.id)
  })

  it('acts on the two feedback signals that have an immediate meaning', async () => {
    const threads = await api.threads.list()
    const thread = required(threads[0], 'the first thread')
    await api.threads.feedback({
      signal: 'not_important',
      entityType: 'email',
      entityId: thread.id,
    })
    expect((await api.threads.list()).map((candidate) => candidate.id)).not.toContain(thread.id)

    const people = await api.people.list()
    const contact = required(
      people.find((candidate) => !candidate.isVip),
      'a contact who is not VIP',
    )
    await api.threads.feedback({
      signal: 'mark_vip',
      entityType: 'contact',
      entityId: contact.id,
    })
    expect(required(await api.people.get(contact.id), 'the promoted contact').isVip).toBe(true)

    const followUps = await api.followUps.list()
    const followUp = required(followUps[0], 'the waiting follow-up')
    await api.threads.feedback({
      signal: 'stop_following',
      entityType: 'email',
      entityId: followUp.threadId,
    })
    expect(await api.followUps.list()).toHaveLength(followUps.length - 1)
  })
})

describe('reply', () => {
  it('drafts a reply addressed to whoever wrote last, in the thread it continues', async () => {
    const threads = await api.threads.list({ flow: 'deadlines' })
    const thread = required(threads[0], 'the deadline thread')
    const messages = await api.threads.messages(thread.id)
    const lastInbound = required(
      messages.filter((message) => !message.isFromUser).at(-1),
      'the last inbound message',
    )

    const draft = await api.reply.draft({ threadId: thread.id, tone: 'professional' })
    expect(draft.threadId).toBe(thread.id)
    expect(draft.connectedAccountId).toBe(thread.connectedAccountId)
    expect(draft.subject).toBe(`Re: ${thread.subject}`)
    expect(draft.to).toEqual([lastInbound.fromEmail])
    expect(draft.to).not.toContain((await api.settings.profile())?.email)
    expect(draft.inReplyToMessageId).toBe(
      required(messages.at(-1), 'the last message').externalMessageId,
    )
    expect(draft.body.length).toBeGreaterThan(20)
    expect(draft.tone).toBe('professional')
  })

  it('writes a different body for each tone and falls back to professional', async () => {
    const threads = await api.threads.list()
    const thread = required(threads[0], 'the first thread')
    const bodies = new Set<string>()
    for (const tone of ['short', 'professional', 'friendly', 'detailed'] as const) {
      const draft = await api.reply.draft({ threadId: thread.id, tone })
      expect(draft.tone).toBe(tone)
      bodies.add(draft.body)
    }
    expect(bodies.size).toBe(4)

    const defaulted = await api.reply.draft({ threadId: thread.id })
    expect(defaulted.tone).toBe('professional')
  })

  it('refuses to draft against a thread that does not exist', async () => {
    await expect(
      api.reply.draft({ threadId: 'da000000-0000-4000-8000-000000009999' }),
    ).rejects.toBeInstanceOf(AppError)
  })
})

describe('follow-ups', () => {
  it('lists what is still waiting, soonest due first', async () => {
    const followUps = await api.followUps.list()
    expect(followUps.length).toBeGreaterThan(0)
    for (const followUp of followUps) {
      expect(followUp.status).toBe('waiting')
      expect(followUp.recipientEmail).toBeTruthy()
    }
    const due = followUps.map((followUp) => followUp.dueAt)
    expect(due).toEqual([...due].sort())
  })

  it('drafts a nudge that names the thread it is chasing', async () => {
    const followUp = required((await api.followUps.list())[0], 'the waiting follow-up')
    const thread = required(await api.threads.get(followUp.threadId), 'its thread')
    const draft = await api.followUps.nudgeDraft(followUp.id)
    expect(draft.followUpId).toBe(followUp.id)
    expect(draft.subject).toContain(thread.subject)
    expect(draft.body).toContain(required(followUp.recipientName, 'the recipient name'))
    expect(draft.approvalId).toBeNull()
  })

  it('pushes a snooze out and counts the dismissal the engine backs off with', async () => {
    const followUp = required((await api.followUps.list())[0], 'the waiting follow-up')
    const dismissals = followUp.dismissCount
    const until = '2026-09-11T07:00:00.000Z'
    const snoozed = await api.followUps.snooze(followUp.id, until)
    expect(snoozed.dueAt).toBe(until)
    expect(snoozed.dismissCount).toBe(dismissals + 1)

    const reread = required((await api.followUps.list())[0], 'the snoozed follow-up')
    expect(reread.dueAt).toBe(until)
  })

  it('takes a closed follow-up off the waiting list', async () => {
    const followUps = await api.followUps.list()
    const followUp = required(followUps[0], 'the waiting follow-up')
    const closed = await api.followUps.close(followUp.id)
    expect(closed.status).toBe('closed')
    expect(closed.closedAt).toBe(new Date(NOW).toISOString())
    expect(await api.followUps.list()).toHaveLength(followUps.length - 1)
    expect(await api.followUps.list({ status: 'closed' })).toHaveLength(1)
  })

  it('refuses to act on a follow-up that does not exist', async () => {
    const missing = 'da000000-0000-4000-8000-000000009999'
    await expect(api.followUps.nudgeDraft(missing)).rejects.toBeInstanceOf(AppError)
    await expect(api.followUps.close(missing)).rejects.toBeInstanceOf(AppError)
  })
})

describe('commitments', () => {
  it('lists the open promises with the sentence each was read from', async () => {
    const commitments = await api.commitments.list()
    expect(commitments.length).toBeGreaterThan(0)
    for (const commitment of commitments) {
      expect(commitment.text).toBeTruthy()
      expect(commitment.quote).toBeTruthy()
      expect(commitment.confidence).toBeGreaterThan(0)
    }
    const open = await api.commitments.list({ status: 'open' })
    expect(open.length).toBeGreaterThan(0)
    for (const commitment of open) expect(commitment.status).toBe('open')
    const owed = await api.commitments.list({ direction: 'user_owes' })
    for (const commitment of owed) expect(commitment.direction).toBe('user_owes')
  })

  it('moves a completed commitment out of the open list and into the done one', async () => {
    const open = await api.commitments.list({ status: 'open' })
    const commitment = required(open[0], 'the open commitment')
    const done = await api.commitments.complete(commitment.id)
    expect(done.status).toBe('done')
    expect(done.completedAt).toBe(new Date(NOW).toISOString())

    expect((await api.commitments.list({ status: 'open' })).map((item) => item.id)).not.toContain(
      commitment.id,
    )
    expect((await api.commitments.list({ status: 'done' })).map((item) => item.id)).toContain(
      commitment.id,
    )
    const feed = await api.today.get()
    expect(feed.commitments.map((item) => item.id)).not.toContain(commitment.id)
  })

  it('snoozes a commitment to the instant it was given', async () => {
    const commitment = required(
      (await api.commitments.list({ status: 'open' }))[0],
      'the open commitment',
    )
    const until = '2026-09-10T14:00:00.000Z'
    const snoozed = await api.commitments.snooze(commitment.id, until)
    expect(snoozed.status).toBe('snoozed')
    expect(snoozed.snoozedUntil).toBe(until)
    expect((await api.commitments.list({ status: 'snoozed' })).map((item) => item.id)).toContain(
      commitment.id,
    )
  })

  it('records a commitment the user typed, sourced to the user', async () => {
    const before = await api.commitments.list()
    const created = await api.commitments.create({
      text: 'Zeynep’e sözleşme özetini göndereceksin',
      direction: 'user_owes',
      personName: 'Zeynep Demir',
      quote: 'Özeti bugün çıkarayım.',
      dueAt: '2026-09-09T14:00:00.000Z',
    })
    expect(created.source.type).toBe('user_input')
    expect(created.confirmedByUser).toBe(true)
    expect(created.status).toBe('open')

    const after = await api.commitments.list()
    expect(after).toHaveLength(before.length + 1)
    expect(after.map((commitment) => commitment.id)).toContain(created.id)
  })

  it('refuses to complete a commitment that does not exist', async () => {
    await expect(
      api.commitments.complete('da000000-0000-4000-8000-000000009999'),
    ).rejects.toBeInstanceOf(AppError)
  })
})

describe('events', () => {
  it('lists the meetings inside a local window, ordered by start', async () => {
    const events = await api.events.list({ from: today(), to: '2026-09-14' })
    expect(events.length).toBeGreaterThan(0)
    const starts = events.map((event) => event.startsAt)
    expect(starts).toEqual([...starts].sort())
    for (const event of events) {
      expect(event.status).not.toBe('cancelled')
      expect(event.endsAt > event.startsAt).toBe(true)
      expect(event.title).toBeTruthy()
    }
  })

  it('has nothing on a window the demo calendar does not reach', async () => {
    expect(await api.events.list({ from: '2020-01-01', to: '2020-01-07' })).toEqual([])
  })

  it('opens an event by an id the list handed over, and nothing else', async () => {
    const events = await api.events.list({ from: today(), to: today() })
    const listed = required(events[0], 'the first event today')
    const opened = required(await api.events.get(listed.id), 'the event by id')
    expect(opened.id).toBe(listed.id)
    expect(opened.title).toBe(listed.title)
    expect(opened.startsAt).toBe(listed.startsAt)
    expect(await api.events.get('da000000-0000-4000-8000-000000009999')).toBeNull()
  })
})

describe('plan', () => {
  it('builds the day from the same domain functions the edge functions use', async () => {
    const plan = await api.plan.day()
    expect(plan.date).toBe(today())
    expect(plan.events.length).toBeGreaterThan(0)
    expect(plan.freeBlocks.length).toBeGreaterThan(0)
    for (const block of plan.freeBlocks) {
      expect(block.minutes).toBeGreaterThanOrEqual(15)
      expect(block.endsAt > block.startsAt).toBe(true)
    }
    expect(plan.load.meetingCount).toBe(plan.events.length)
    expect(plan.load.bookedMinutes).toBeGreaterThan(0)
    expect(['light', 'moderate', 'heavy']).toContain(plan.load.level)
  })

  it('contains a real clash, so the conflicts entry point has something to open', async () => {
    const plan = await api.plan.day()
    expect(plan.conflicts.length).toBeGreaterThan(0)
    const overlap = required(
      plan.conflicts.find((conflict) => conflict.kind === 'overlap'),
      'an overlapping pair',
    )
    expect(overlap.eventIds.length).toBeGreaterThanOrEqual(2)
    expect(overlap.minutes).toBeGreaterThan(0)
    expect(overlap.messageKey).toBeTruthy()
  })

  it('spans seven inclusive days and keeps the day shape in both ranges', async () => {
    const week = await api.plan.week()
    expect(week.startDate).toBe(today())
    expect(week.endDate).toBe('2026-09-14')
    expect(week.days).toHaveLength(7)
    expect(week.days.map((day) => day.date)).toEqual([
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
      '2026-09-14',
    ])
    const first = required(week.days[0], 'the first day of the week')
    expect(first).toEqual(await api.plan.day())
    expect(week.days.reduce((total, day) => total + day.events.length, 0)).toBeGreaterThan(
      first.events.length,
    )
  })

  it('suggests a focus block and a preparation slot, each anchored to real minutes', async () => {
    const suggestions = await api.plan.suggestions()
    expect(suggestions.length).toBeGreaterThan(0)
    const kinds = suggestions.map((suggestion) => suggestion.kind)
    expect(kinds).toContain('focus_block')
    expect(kinds).toContain('prepare')
    for (const suggestion of suggestions) {
      expect(suggestion.id).toBeTruthy()
      // A sentence would not survive the language switch; a key plus values does.
      expect(suggestion.messageKey).toMatch(/^plan\.suggestion\./)
      expect(required(suggestion.minutes, 'the suggestion length')).toBeGreaterThan(0)
      expect(required(suggestion.endsAt, 'the suggestion end')).toBeTruthy()
    }
  })
})

describe('meetings', () => {
  it('prepares a brief from the invite, the contacts and the open promises', async () => {
    const plan = await api.plan.day()
    const meeting = required(
      plan.events.find((event) => event.attendees.length > 1),
      'a meeting with other people on it',
    )
    const prep = await api.meetings.prep(meeting.id)
    expect(prep.eventId).toBe(meeting.id)
    expect(prep.event.id).toBe(meeting.id)
    expect(prep.summary).toContain(meeting.title)
    expect(prep.agenda.length).toBeGreaterThan(0)
    expect(prep.suggestedQuestions.length).toBeGreaterThan(0)
    expect(prep.attendees.length).toBe(meeting.attendees.length - 1)
    for (const attendee of prep.attendees) {
      expect(meeting.attendees.map((invitee) => invitee.email)).toContain(attendee.email)
    }
  })

  it('turns a meeting note into a stored commitment the screen can open', async () => {
    const plan = await api.plan.day()
    const meeting = required(plan.events[0], 'a meeting today')
    const before = await api.commitments.list()
    const result = await api.meetings.postMeetingNote({
      eventId: meeting.id,
      note: 'Fiyatlandırma tablosunu güncelleyip ekibe göndereceğim.',
    })
    expect(result.commitments).toHaveLength(1)
    expect(result.createdApprovalIds).toEqual([])
    const commitment = required(result.commitments[0], 'the stored commitment')
    expect(commitment.source.type).toBe('calendar_event')
    expect(commitment.source.id).toBe(meeting.id)

    const after = await api.commitments.list()
    expect(after).toHaveLength(before.length + 1)
    expect(after.map((item) => item.id)).toContain(commitment.id)
  })

  it('refuses to prepare for an event that does not exist', async () => {
    await expect(api.meetings.prep('da000000-0000-4000-8000-000000009999')).rejects.toBeInstanceOf(
      AppError,
    )
  })
})

describe('assistant', () => {
  it('answers the seeded question with the commitment it is grounded in', async () => {
    const answer = await api.assistant.ask({ question: 'Ahmet’e ne söz vermiştim?' })
    const commitment = required((await api.commitments.list())[0], 'the open commitment')
    expect(answer.answer).toContain(commitment.text)
    expect(answer.grounded).toBe(true)
    expect(answer.citations.length).toBeGreaterThan(0)
    expect(answer.proposedApprovalId).toBeNull()
  })

  it('answers a calendar question by counting the day, not by reciting an hour', async () => {
    const answer = await api.assistant.ask({ question: 'Bugün toplantım var mı?' })
    const plan = await api.plan.day()
    expect(answer.answer).toContain(String(plan.events.length))
    expect(answer.citations).toHaveLength(plan.events.length)
    for (const citation of answer.citations) expect(citation.sourceType).toBe('calendar_event')
  })

  it('stores both turns on a thread the history then lists', async () => {
    const before = await api.assistant.threads()
    const answer = await api.assistant.ask({ question: 'Kimden yanıt bekliyorum?' })
    const after = await api.assistant.threads()
    expect(after).toHaveLength(before.length + 1)

    const messages = await api.assistant.messages(answer.threadId)
    expect(messages).toHaveLength(2)
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(required(messages[1], 'the answer turn').id).toBe(answer.messageId)
    expect(required(messages[1], 'the answer turn').content).toBe(answer.answer)
  })

  it('continues an existing thread rather than starting a second one', async () => {
    const thread = required((await api.assistant.threads())[0], 'the seeded assistant thread')
    const before = await api.assistant.messages(thread.id)
    const answer = await api.assistant.ask({ threadId: thread.id, question: 'Peki ya Zeynep?' })
    expect(answer.threadId).toBe(thread.id)
    expect(await api.assistant.messages(thread.id)).toHaveLength(before.length + 2)
    expect(await api.assistant.threads()).toHaveLength(1)
  })

  it('transcribes voice to a Turkish question the demo can answer', async () => {
    const transcription = await api.assistant.transcribe({
      audioBase64: 'ZGVtbw==',
      mimeType: 'audio/m4a',
    })
    expect(transcription.text).toBeTruthy()
    expect(required(transcription.confidence, 'the confidence')).toBeGreaterThan(0)
  })
})

describe('search', () => {
  it('finds the mail, the meeting and the promise behind one Turkish word', async () => {
    const page = await api.search.query({ query: 'teklif' })
    expect(page.mode).toBe('keyword')
    expect(page.nextCursor).toBeNull()
    expect(page.results.length).toBeGreaterThan(2)
    const types = new Set(page.results.map((hit) => hit.type))
    expect(types.has('email')).toBe(true)
    expect(types.has('calendar_event')).toBe(true)
    expect(types.has('commitment')).toBe(true)
    for (const hit of page.results) {
      expect(hit.title).toBeTruthy()
      expect(hit.score).toBeGreaterThan(0)
      expect(hit.sourceLabel).toBeTruthy()
    }
  })

  it('matches a person by name, case- and locale-insensitively', async () => {
    const page = await api.search.query({ query: 'AHMET' })
    const contact = page.results.find((hit) => hit.type === 'contact')
    expect(required(contact, 'the contact hit').title).toContain('Ahmet')
  })

  it('answers nothing for a word the demo day never uses', async () => {
    expect((await api.search.query({ query: 'zzzzzz' })).results).toEqual([])
  })

  it('honours the limit', async () => {
    expect((await api.search.query({ query: 'teklif', limit: 1 })).results).toHaveLength(1)
  })
})

describe('captures', () => {
  it('lists the seeded capture with an extraction the screen can render', async () => {
    const captures = await api.captures.list()
    expect(captures.length).toBeGreaterThan(0)
    const capture = required(captures[0], 'the seeded capture')
    expect(capture.status).toBe('ready')
    const extracted = required(capture.extracted, 'the extraction')
    expect(extracted.title).toBeTruthy()
    expect(extracted.keyPoints.length).toBeGreaterThan(0)
    expect(extracted.suggestedActions.length).toBeGreaterThan(0)
    // The capture screen offers "Takvime ekle" against this instant, so a
    // poster whose extraction has no date is a card with nothing to add.
    // `demo-fidelity.test.ts` is where the date is checked against the line it
    // was quoted from.
    expect(required(extracted.startsAt, 'the extracted start')).toBeTruthy()
    expect(required(extracted.location, 'the extracted location')).toBeTruthy()
    expect(required(capture.rawText, 'the captured text')).toContain(extracted.title)
  })

  it('signs an upload target under the demo user', async () => {
    const target = await api.captures.uploadUrl({
      filename: 'afis.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 120_000,
    })
    expect(target.uploadUrl).toContain(encodeURIComponent(target.storagePath))
    expect(target.storagePath).toContain('afis.jpg')
    expect(target.expiresIn).toBeGreaterThan(0)
  })

  it('analyses a new note and reads it back by id', async () => {
    const before = await api.captures.list()
    const capture = await api.captures.create({
      kind: 'text',
      rawText: 'Salı 10:00 diş randevusu\nAdres: Kadıköy',
    })
    expect(capture.status).toBe('ready')
    expect(capture.detectedIntent).toBe('note')
    expect(required(capture.extracted, 'the extraction').title).toBe('Salı 10:00 diş randevusu')

    const opened = required(await api.captures.get(capture.id), 'the capture by id')
    expect(opened.id).toBe(capture.id)
    expect(opened.rawText).toBe(capture.rawText)
    const after = await api.captures.list()
    expect(after).toHaveLength(before.length + 1)
    // Newest first, so the capture the user just made is the one on top.
    expect(required(after[0], 'the newest capture').id).toBe(capture.id)
    expect(await api.captures.list({ status: 'failed' })).toEqual([])
  })

  it('answers null for a capture id nothing defines', async () => {
    expect(await api.captures.get('da000000-0000-4000-8000-000000009999')).toBeNull()
  })
})

describe('approvals', () => {
  it('lists what is pending, newest first, each with what and why', async () => {
    const approvals = await api.approvals.list({ status: 'pending' })
    expect(approvals.length).toBeGreaterThan(1)
    for (const approval of approvals) {
      expect(approval.status).toBe('pending')
      expect(approval.what).toBeTruthy()
      expect(approval.why).toBeTruthy()
      expect(approval.payload.kind).toBeTruthy()
      expect(approval.expiresAt > new Date(NOW).toISOString()).toBe(true)
      expect(await api.approvals.get(approval.id)).toEqual(approval)
    }
  })

  it('sends the mail an approved email_send describes and closes the thread out', async () => {
    const approvals = await api.approvals.list({ status: 'pending' })
    const approval = required(
      approvals.find((candidate) => candidate.payload.kind === 'email_send'),
      'the pending reply',
    )
    if (approval.payload.kind !== 'email_send') return
    const threadId = required(approval.payload.threadId, 'the thread it answers')
    const before = await api.threads.messages(threadId)

    const result = await api.approvals.decide({ approvalId: approval.id, decision: 'approve' })
    expect(result.status).toBe('executed')
    expect(result.failureCode).toBeNull()
    expect(result.missingScopes).toEqual([])
    expect(required(result.resultRef, 'the provider reference')).toBeTruthy()

    const after = await api.threads.messages(threadId)
    expect(after).toHaveLength(before.length + 1)
    const sent = required(after.at(-1), 'the sent message')
    expect(sent.isFromUser).toBe(true)
    expect(sent.bodyText).toBe(approval.payload.body)
    expect(sent.toEmails).toEqual(approval.payload.to)

    const thread = required(await api.threads.get(threadId), 'the thread')
    expect(thread.isRead).toBe(true)
    expect(thread.requiresUserAction).toBe(false)
    expect(thread.messageCount).toBe(after.length)

    const stored = required(await api.approvals.get(approval.id), 'the decided approval')
    expect(stored.status).toBe('executed')
    expect(stored.executedAt).toBe(new Date(NOW).toISOString())
    expect(stored.attemptCount).toBe(1)
    expect((await api.approvals.list({ status: 'pending' })).map((item) => item.id)).not.toContain(
      approval.id,
    )
  })

  it('puts an approved calendar_create on the calendar the plan reads', async () => {
    const approvals = await api.approvals.list({ status: 'pending' })
    const approval = required(
      approvals.find((candidate) => candidate.payload.kind === 'calendar_create'),
      'the pending calendar block',
    )
    if (approval.payload.kind !== 'calendar_create') return

    const result = await api.approvals.decide({ approvalId: approval.id, decision: 'approve' })
    const eventId = required(result.resultRef, 'the created event id')
    const event = required(await api.events.get(eventId), 'the created event')
    expect(event.title).toBe(approval.payload.title)
    expect(event.startsAt).toBe(approval.payload.startsAt)

    const day = await api.plan.day({ date: '2026-09-09' })
    expect(day.events.map((item) => item.id)).toContain(eventId)
  })

  it('records a rejection without acting on it', async () => {
    const approval = required(
      (await api.approvals.list({ status: 'pending' }))[0],
      'a pending approval',
    )
    const result = await api.approvals.decide({ approvalId: approval.id, decision: 'reject' })
    expect(result.status).toBe('rejected')
    expect(result.resultRef).toBeNull()

    const stored = required(await api.approvals.get(approval.id), 'the rejected approval')
    expect(stored.status).toBe('rejected')
    expect(stored.rejectedAt).toBe(new Date(NOW).toISOString())
    expect(stored.executedAt).toBeNull()
    expect((await api.approvals.list({ status: 'rejected' })).map((item) => item.id)).toContain(
      approval.id,
    )
  })

  it('refuses a second decision on an approval that has already been acted on', async () => {
    const approval = required(
      (await api.approvals.list({ status: 'pending' }))[0],
      'a pending approval',
    )
    await api.approvals.decide({ approvalId: approval.id, decision: 'approve' })
    await expect(
      api.approvals.decide({ approvalId: approval.id, decision: 'approve' }),
    ).rejects.toBeInstanceOf(AppError)
  })

  it('executes the payload the user edited, not the one that was proposed', async () => {
    const approvals = await api.approvals.list({ status: 'pending' })
    const approval = required(
      approvals.find((candidate) => candidate.payload.kind === 'email_send'),
      'the pending reply',
    )
    if (approval.payload.kind !== 'email_send') return
    const proposedBody = approval.payload.body
    const threadId = required(approval.payload.threadId, 'the thread it answers')
    const edited = { ...approval.payload, body: 'Kısa bir onay: cuma günü elinde olacak.' }
    await api.approvals.decide({
      approvalId: approval.id,
      decision: 'approve',
      editedPayload: edited,
    })

    const sent = required((await api.threads.messages(threadId)).at(-1), 'the sent message')
    expect(sent.bodyText).toBe(edited.body)
    const stored = required(await api.approvals.get(approval.id), 'the decided approval')
    expect(stored.payload).toEqual(edited)
    // The proposal is kept beside the edit, so the card can still show both.
    expect(stored.originalPayload.kind).toBe('email_send')
    if (stored.originalPayload.kind !== 'email_send') return
    expect(stored.originalPayload.body).toBe(proposedBody)
  })

  it('proposes an approval of its own and executes it', async () => {
    const before = await api.approvals.list({ status: 'pending' })
    const created = await api.approvals.create({
      type: 'reminder_create',
      what: 'Cuma 16:00 için hatırlatıcı kur',
      why: 'Teslimden bir saat önce son kontrol.',
      sourceType: 'commitment',
      sourceId: required((await api.commitments.list())[0], 'the open commitment').id,
      discriminator: 'demo-test-reminder',
      payload: {
        kind: 'reminder_create',
        title: 'Teklif son kontrol',
        body: null,
        remindAt: '2026-09-10T13:00:00.000Z',
        preset: 'custom',
        relatedEntityType: 'commitment',
        relatedEntityId: required((await api.commitments.list())[0], 'the open commitment').id,
      },
    })
    expect(created.status).toBe('pending')
    expect(await api.approvals.list({ status: 'pending' })).toHaveLength(before.length + 1)

    const result = await api.approvals.decide({ approvalId: created.id, decision: 'approve' })
    const reminderId = required(result.resultRef, 'the created reminder id')
    expect((await api.reminders.list()).map((reminder) => reminder.id)).toContain(reminderId)
  })

  it('retries a failed execution and reports the result of the new attempt', async () => {
    const approval = required(
      (await api.approvals.list({ status: 'pending' }))[0],
      'a pending approval',
    )
    const result = await api.approvals.retry(approval.id)
    expect(result.approvalId).toBe(approval.id)
    expect(result.status).toBe('executed')
    const stored = required(await api.approvals.get(approval.id), 'the retried approval')
    expect(stored.attemptCount).toBe(1)
    expect(stored.failureReason).toBeNull()
  })

  it('answers null for an approval id nothing defines', async () => {
    expect(await api.approvals.get('da000000-0000-4000-8000-000000009999')).toBeNull()
    await expect(
      api.approvals.decide({
        approvalId: 'da000000-0000-4000-8000-000000009999',
        decision: 'approve',
      }),
    ).rejects.toBeInstanceOf(AppError)
  })
})

describe('reminders', () => {
  it('lists the scheduled reminders soonest first', async () => {
    const reminders = await api.reminders.list()
    expect(reminders.length).toBeGreaterThan(0)
    for (const reminder of reminders) {
      expect(reminder.status).toBe('scheduled')
      expect(reminder.title).toBeTruthy()
      expect(reminder.firedAt).toBeNull()
    }
    const instants = reminders.map((reminder) => reminder.remindAt)
    expect(instants).toEqual([...instants].sort())
  })

  it('resolves a preset through the domain calculator and explains the choice', async () => {
    const before = await api.reminders.list()
    const created = await api.reminders.create({ title: 'Teklifi gözden geçir', preset: 'smart' })
    expect(created.reminder.remindAt).toBe(created.resolution.remindAt)
    expect(created.resolution.explanationKey).toBeTruthy()
    expect(created.reminder.remindAt > new Date(NOW).toISOString()).toBe(true)

    const after = await api.reminders.list()
    expect(after).toHaveLength(before.length + 1)
    expect(after.map((reminder) => reminder.id)).toContain(created.reminder.id)
  })

  it('honours a custom instant the user picked', async () => {
    const customAt = '2026-09-09T06:30:00.000Z'
    const created = await api.reminders.create({
      title: 'Check-in',
      preset: 'custom',
      customAt,
      relatedEntityType: 'email',
      relatedEntityId: required((await api.threads.list())[0], 'a thread').id,
    })
    expect(created.reminder.remindAt).toBe(customAt)
    expect(created.reminder.relatedEntityType).toBe('email')
  })

  it('takes a cancelled reminder off the scheduled list', async () => {
    const reminders = await api.reminders.list()
    const reminder = required(reminders[0], 'the scheduled reminder')
    const cancelled = await api.reminders.cancel(reminder.id)
    expect(cancelled.status).toBe('cancelled')
    expect(await api.reminders.list()).toHaveLength(reminders.length - 1)
    expect((await api.reminders.list({ status: 'cancelled' })).map((item) => item.id)).toContain(
      reminder.id,
    )
  })

  it('refuses to cancel a reminder that does not exist', async () => {
    await expect(
      api.reminders.cancel('da000000-0000-4000-8000-000000009999'),
    ).rejects.toBeInstanceOf(AppError)
  })
})

describe('people', () => {
  it('ranks the directory by how much the user actually writes to each person', async () => {
    const people = await api.people.list()
    expect(people.length).toBeGreaterThan(2)
    const counts = people.map((contact) => contact.interactionCount)
    expect(counts).toEqual([...counts].sort((left, right) => right - left))
    for (const contact of people) expect(contact.email).toBeTruthy()
  })

  it('filters to VIPs and matches a search on name or address', async () => {
    const vips = await api.people.list({ vipOnly: true })
    expect(vips.length).toBeGreaterThan(0)
    for (const contact of vips) expect(contact.isVip).toBe(true)

    const byName = await api.people.list({ search: 'zeynep' })
    expect(byName).toHaveLength(1)
    const byAddress = await api.people.list({ search: 'arkasinsaat' })
    expect(byAddress).toHaveLength(1)
    expect(await api.people.list({ search: 'zzzzzz' })).toEqual([])
  })

  it('promotes and demotes a contact, visibly on the next read', async () => {
    const contact = required(
      (await api.people.list()).find((candidate) => !candidate.isVip),
      'a contact who is not VIP',
    )
    const promoted = await api.people.setVip(contact.id, true)
    expect(promoted.isVip).toBe(true)
    expect(promoted.vipSetAt).toBe(new Date(NOW).toISOString())
    expect((await api.people.list({ vipOnly: true })).map((item) => item.id)).toContain(contact.id)

    const demoted = await api.people.setVip(contact.id, false)
    expect(demoted.isVip).toBe(false)
    expect(demoted.vipSetAt).toBeNull()
    expect((await api.people.list({ vipOnly: true })).map((item) => item.id)).not.toContain(
      contact.id,
    )
  })

  it('answers null for a contact id nothing defines', async () => {
    expect(await api.people.get('da000000-0000-4000-8000-000000009999')).toBeNull()
  })
})

describe('rules', () => {
  it('lists the seeded priority rules', async () => {
    const rules = await api.rules.list()
    expect(rules.length).toBeGreaterThan(0)
    for (const rule of rules) {
      expect(rule.matchValue).toBeTruthy()
      expect(rule.enabled).toBe(true)
    }
  })

  it('creates, updates and retires a rule, each visible in the next list', async () => {
    const before = await api.rules.list()
    const created = await api.rules.create({
      kind: 'sender_always_important',
      matchValue: 'ahmet.yilmaz@arkasinsaat.com.tr',
      note: 'Teklif yazışmaları',
    })
    expect(created.enabled).toBe(true)
    expect((await api.rules.list()).map((rule) => rule.id)).toContain(created.id)

    const updated = await api.rules.update(created.id, { enabled: false, note: 'Şimdilik kapalı' })
    expect(updated.enabled).toBe(false)
    expect(updated.note).toBe('Şimdilik kapalı')
    const listed = required(
      (await api.rules.list()).find((rule) => rule.id === created.id),
      'the updated rule',
    )
    expect(listed.enabled).toBe(false)

    await api.rules.delete(created.id)
    const after = await api.rules.list()
    expect(after).toHaveLength(before.length)
    expect(after.map((rule) => rule.id)).not.toContain(created.id)
  })

  it('lists what the assistant taught itself, strongest inference first', async () => {
    const learned = await api.rules.learnedList()
    expect(learned.length).toBeGreaterThan(0)
    const strengths = learned.map((preference) => preference.strength)
    expect(strengths).toEqual([...strengths].sort((left, right) => right - left))
    for (const preference of learned) {
      expect(preference.statement).toBeTruthy()
      expect(preference.observationCount).toBeGreaterThan(0)
    }
  })

  it('lets the user switch an inference off and forget it entirely', async () => {
    const before = await api.rules.learnedList()
    const preference = required(before[0], 'the strongest inference')
    const off = await api.rules.learnedToggle(preference.id, false)
    expect(off.enabled).toBe(false)
    const reread = required(
      (await api.rules.learnedList()).find((item) => item.id === preference.id),
      'the toggled inference',
    )
    expect(reread.enabled).toBe(false)

    await api.rules.learnedDelete(preference.id)
    const after = await api.rules.learnedList()
    expect(after).toHaveLength(before.length - 1)
    expect(after.map((item) => item.id)).not.toContain(preference.id)
  })

  it('refuses to toggle an inference that does not exist', async () => {
    await expect(
      api.rules.learnedToggle('da000000-0000-4000-8000-000000009999', false),
    ).rejects.toBeInstanceOf(AppError)
  })
})

describe('settings', () => {
  it('reads the demo profile and its preferences', async () => {
    const profile = required(await api.settings.profile(), 'the profile')
    expect(profile.email).toBeTruthy()
    expect(profile.timeZone).toBe(ISTANBUL)
    expect(profile.locale).toBe('tr')
    expect(profile.onboardingCompletedAt).toBeTruthy()

    const preferences = required(await api.settings.preferences(), 'the preferences')
    expect(preferences.language).toBe('tr')
    expect(preferences.morningBriefingTime).toMatch(/^\d{2}:\d{2}$/)

    const notifications = required(await api.settings.notificationPrefs(), 'notification prefs')
    expect(notifications.lockScreenPrivacy).toBe('title_only')
  })

  it('keeps an updated preference and routes the zone onto the profile', async () => {
    const updated = await api.settings.updatePreferences({
      colorScheme: 'dark',
      morningBriefingTime: '06:45',
      timeZone: 'Europe/Berlin',
    })
    expect(updated.colorScheme).toBe('dark')
    expect(updated.morningBriefingTime).toBe('06:45')

    const reread = required(await api.settings.preferences(), 'the preferences')
    expect(reread.colorScheme).toBe('dark')
    expect(reread.morningBriefingTime).toBe('06:45')
    // The zone lives on the profile, so it must not have been written onto the
    // preferences row as a field nothing reads.
    expect(required(await api.settings.profile(), 'the profile').timeZone).toBe('Europe/Berlin')
  })

  it('merges a notification patch instead of replacing the category map', async () => {
    const before = required(await api.settings.notificationPrefs(), 'notification prefs')
    const updated = await api.settings.updateNotificationPrefs({ onlyIfImportant: true })
    expect(updated.onlyIfImportant).toBe(true)
    expect(updated.categories).toEqual(before.categories)

    const withCategories = await api.settings.updateNotificationPrefs({
      categories: { weekly_review: true },
    })
    expect(withCategories.categories.weekly_review).toBe(true)
    expect(withCategories.onlyIfImportant).toBe(true)
    expect(
      required(await api.settings.notificationPrefs(), 'notification prefs').categories
        .weekly_review,
    ).toBe(true)
  })

  it('keeps an updated profile field', async () => {
    const updated = await api.settings.updateProfile({ displayName: 'Deniz K.' })
    expect(updated.displayName).toBe('Deniz K.')
    expect(required(await api.settings.profile(), 'the profile').displayName).toBe('Deniz K.')
  })
})

describe('subscription and referral', () => {
  it('starts on free, so the paywall and the upgrade route are reachable', async () => {
    const subscription = required(await api.subscription.get(), 'the subscription')
    expect(subscription.status).toBe('free')
    expect(subscription.entitlement).toBeNull()
    expect(subscription.trialEndsAt).toBeNull()
  })

  it('re-reads entitlements without inventing a plan', async () => {
    const refreshed = required(await api.subscription.refresh(), 'the refreshed subscription')
    expect(refreshed.status).toBe('free')
    expect(refreshed.updatedAt).toBe(new Date(NOW).toISOString())
  })

  it('hands out a shareable code with no bonus running', async () => {
    const summary = await api.referral.getCode()
    expect(summary.code).toMatch(/^[A-Z0-9]{8}$/)
    expect(summary.redemptionCount).toBeGreaterThan(0)
    expect(summary.activeBonuses).toBe(0)
    expect(summary.bonusExpiresAt).toBeNull()
  })

  it('refuses the user their own code, with the decision the screen has copy for', async () => {
    const summary = await api.referral.getCode()
    const refusal = await api.referral.redeem(summary.code.toLowerCase())
    expect(refusal.granted).toBe(false)
    expect(refusal.reason).toBe('self_referral')
    expect(refusal.bonusDays).toBe(0)
    expect(await api.referral.getCode()).toEqual(summary)
  })

  it('grants a bonus for somebody else’s code and shows it on the card', async () => {
    const grant = await api.referral.redeem('FRIEND01')
    expect(grant.granted).toBe(true)
    expect(grant.reason).toBeNull()
    expect(grant.bonusDays).toBeGreaterThan(0)
    const expiresAt = required(grant.expiresAt, 'the bonus expiry')
    expect(expiresAt > new Date(NOW).toISOString()).toBe(true)

    const summary = await api.referral.getCode()
    expect(summary.activeBonuses).toBe(1)
    expect(summary.bonusExpiresAt).toBe(expiresAt)
    // A referral bonus is not a subscription: writing it onto the plan would
    // close the paywall the demo exists to show.
    expect(required(await api.subscription.get(), 'the subscription').status).toBe('free')
  })
})

describe('privacy', () => {
  it('reports no export until one is asked for, then reports that one', async () => {
    expect(await api.privacy.exportStatus()).toBeNull()
    const requested = await api.privacy.requestExport()
    expect(requested.status).toBe('processing')
    expect(requested.downloadUrl).toBeNull()

    const status = required(await api.privacy.exportStatus(), 'the export status')
    expect(status.requestId).toBe(requested.requestId)
    expect(status.status).toBe('processing')
  })

  it('clears one slice of history and counts what went', async () => {
    const threads = await api.threads.list()
    expect(threads.length).toBeGreaterThan(0)
    const result = await api.privacy.deleteHistory({ scope: 'emails' })
    expect(result.deletedCount).toBeGreaterThan(0)
    expect(await api.threads.list()).toEqual([])
    // Only that slice: the briefings and the assistant history are untouched.
    expect((await api.briefings.list()).length).toBeGreaterThan(0)
    expect((await api.assistant.threads()).length).toBeGreaterThan(0)
  })

  it('clears everything the "all" scope covers', async () => {
    const result = await api.privacy.deleteHistory({ scope: 'all' })
    expect(result.deletedCount).toBeGreaterThan(0)
    expect(await api.threads.list()).toEqual([])
    expect(await api.briefings.list()).toEqual([])
    expect(await api.assistant.threads()).toEqual([])
    expect(await api.captures.list()).toEqual([])
    expect((await api.today.get()).insights).toEqual([])
  })

  it('resets the demo account rather than leaving the app with nothing to show', async () => {
    const profile = required(await api.settings.profile(), 'the profile')
    await api.privacy.deleteHistory({ scope: 'all' })
    await api.privacy.deleteAccount({
      confirmationEmail: profile.email.toUpperCase(),
      acknowledgedIrreversible: true,
    })
    expect((await api.threads.list()).length).toBeGreaterThan(0)
    expect(required((await api.today.get()).briefing, 'the briefing after reset')).toBeTruthy()
  })

  it('refuses a deletion the user confirmed with the wrong address', async () => {
    await expect(
      api.privacy.deleteAccount({
        confirmationEmail: 'someone.else@example.com',
        acknowledgedIrreversible: true,
      }),
    ).rejects.toBeInstanceOf(AppError)
    expect((await api.threads.list()).length).toBeGreaterThan(0)
  })
})

describe('notifications', () => {
  it('registers a device token and re-registers the same device in place', async () => {
    const first = await api.notifications.registerToken({
      token: 'ExponentPushToken[demo-0001]',
      platform: 'android',
      deviceId: 'demo-device',
      deviceName: 'Pixel 8',
      appVersion: '1.0.0',
    })
    expect(first.disabledAt).toBeNull()
    expect(first.lastSeenAt).toBe(new Date(NOW).toISOString())

    const second = await api.notifications.registerToken({
      token: 'ExponentPushToken[demo-0002]',
      platform: 'android',
      deviceId: 'demo-device',
    })
    expect(second.id).toBe(first.id)
    expect(second.token).toBe('ExponentPushToken[demo-0002]')
  })

  it('disables a device rather than forgetting it', async () => {
    const registered = await api.notifications.registerToken({
      token: 'ExponentPushToken[demo-0001]',
      platform: 'ios',
      deviceId: 'demo-device',
    })
    await api.notifications.unregisterToken({ deviceId: 'demo-device' })
    const reregistered = await api.notifications.registerToken({
      token: 'ExponentPushToken[demo-0003]',
      platform: 'ios',
      deviceId: 'demo-device',
    })
    expect(reregistered.id).toBe(registered.id)
    expect(reregistered.disabledAt).toBeNull()
  })
})
