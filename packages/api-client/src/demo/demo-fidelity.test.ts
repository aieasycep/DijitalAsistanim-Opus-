import { fixedClock, mutableClock, toIsoDate, DAY_MS } from '@da/domain'
import {
  approvalExecutionResult,
  approvalPayloadSchema,
  assistantAskResponse,
  briefingAudioResponse,
  briefingGenerateResponse,
  captureExtraction,
  captureUploadUrlResponse,
  dataExportSnapshot,
  deleteHistoryResponse,
  emailSchema,
  eventAttendees,
  followupNudgeDraft,
  initialAnalysisResponse,
  isoDateSchema,
  isoInstantSchema,
  localTimeSchema,
  meetingNoteResponse,
  meetingPrepResponse,
  moneySchema,
  oauthStartResponse,
  planDayResponse,
  planSuggestion,
  planWeekResponse,
  referralCodeResponse,
  referralRedeemResponse,
  reminderCreateResponse,
  replyDraftResponse,
  safeUrlSchema,
  searchResponse,
  syncStartResponse,
  todayFeedResponse,
  transcribeResponse,
} from '@da/validation'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../index'
import { createApiClient } from '../index'

/**
 * Demo mode as a faithful rehearsal of a live account.
 *
 * Two properties, and they are the ones that make the demo worth shipping in
 * the APK rather than a second app that merely looks similar:
 *
 *  1. **Every answer is one the live client could have parsed.** The demo
 *     stands in for the edge functions, so its answers are checked against the
 *     same `@da/validation` contracts the live client parses a real response
 *     with. A demo shape the contract would reject is a screen that works only
 *     in the demo.
 *
 *  2. **Nothing depends on the ambient clock.** Every instant is derived from
 *     the injected `Clock`, so the same store read at any hour still describes
 *     "today" and two runs of the same read agree exactly — which is what makes
 *     screenshots, end-to-end runs and an App Store review build reproducible.
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

function required<T>(value: T | undefined | null, what: string): T {
  expect(value, what).not.toBeUndefined()
  expect(value, what).not.toBeNull()
  if (value === undefined || value === null) throw new Error(what)
  return value
}

/**
 * Every timestamp in an answer, found by the naming convention the domain
 * holds to: `…At` is an instant and `…Date` a local date.
 *
 * Worth walking for because a malformed one does not throw — it renders as
 * "Invalid Date" in the middle of a card and nothing upstream notices.
 */
function timestamps(
  value: unknown,
  path: string,
  found: { path: string; value: string; kind: 'instant' | 'date' }[] = [],
): { path: string; value: string; kind: 'instant' | 'date' }[] {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => timestamps(entry, `${path}[${index}]`, found))
    return found
  }
  if (value === null || typeof value !== 'object') return found
  for (const [key, entry] of Object.entries(value)) {
    const at = `${path}.${key}`
    if (typeof entry === 'string') {
      if (key.endsWith('At')) found.push({ path: at, value: entry, kind: 'instant' })
      if (key.endsWith('Date')) found.push({ path: at, value: entry, kind: 'date' })
      continue
    }
    timestamps(entry, at, found)
  }
  return found
}

let api: ApiClient

beforeEach(() => {
  api = demoClient()
})

describe('the wire contracts', () => {
  it('answers Today in the envelope `today-feed` promises', async () => {
    const feed = await api.today.get()
    const parsed = todayFeedResponse.parse(feed)
    expect(parsed.forDate).toBe(feed.forDate)
    expect(parsed.insights).toHaveLength(feed.insights.length)
    expect(parsed.pendingApprovals).toHaveLength(feed.pendingApprovals.length)
  })

  it('answers a plan in the shape the domain analysis produces', async () => {
    const day = planDayResponse.parse(await api.plan.day())
    expect(day.freeBlocks.length).toBeGreaterThan(0)
    expect(day.conflicts.length).toBeGreaterThan(0)
    expect(day.load.meetingCount).toBeGreaterThan(0)

    const week = planWeekResponse.parse(await api.plan.week())
    expect(week.days).toHaveLength(7)

    for (const suggestion of await api.plan.suggestions()) {
      expect(planSuggestion.parse(suggestion).id).toBe(suggestion.id)
    }
  })

  it('answers a reply draft the composer and the approval can both consume', async () => {
    const thread = required((await api.threads.list())[0], 'a thread')
    for (const tone of ['short', 'professional', 'friendly', 'detailed'] as const) {
      const draft = replyDraftResponse.parse(await api.reply.draft({ threadId: thread.id, tone }))
      expect(draft.tone).toBe(tone)
      expect(draft.to.length).toBeGreaterThan(0)
    }
  })

  it('stores approval payloads the executor would accept, before and after an edit', async () => {
    const approvals = await api.approvals.list()
    expect(approvals.length).toBeGreaterThan(0)
    for (const approval of approvals) {
      expect(approvalPayloadSchema.parse(approval.payload).kind).toBe(approval.payload.kind)
      expect(approvalPayloadSchema.parse(approval.originalPayload).kind).toBe(
        approval.originalPayload.kind,
      )
    }
  })

  it('answers a decision and a retry with the execution result contract', async () => {
    const pending = await api.approvals.list({ status: 'pending' })
    const first = required(pending[0], 'a pending approval')
    const second = required(pending[1], 'a second pending approval')
    expect(
      approvalExecutionResult.parse(
        await api.approvals.decide({ approvalId: first.id, decision: 'approve' }),
      ).status,
    ).toBe('executed')
    expect(
      approvalExecutionResult.parse(
        await api.approvals.decide({ approvalId: second.id, decision: 'reject' }),
      ).status,
    ).toBe('rejected')
    expect(approvalExecutionResult.parse(await api.approvals.retry(second.id)).status).toBe(
      'executed',
    )
  })

  it('answers the briefing endpoints in their own contracts', async () => {
    const cached = briefingGenerateResponse.parse(await api.briefings.generate({ kind: 'morning' }))
    expect(cached.status).toBe('ready')
    const forced = briefingGenerateResponse.parse(
      await api.briefings.generate({ kind: 'morning', force: true }),
    )
    expect(forced.status).toBe('ready')
    if (forced.status !== 'ready') return

    const audio = briefingAudioResponse.parse(
      await api.briefings.requestAudio({ briefingId: forced.briefing['id'] as string }),
    )
    expect(audio.ssmlOrText.length).toBeGreaterThan(0)
  })

  it('answers a meeting brief and a meeting note in their contracts', async () => {
    const event = required((await api.plan.day()).events[0], 'a meeting today')
    const prep = meetingPrepResponse.parse(await api.meetings.prep(event.id))
    expect(prep.eventId).toBe(event.id)
    expect(prep.attendees.length).toBeGreaterThan(0)

    const note = meetingNoteResponse.parse(
      await api.meetings.postMeetingNote({ eventId: event.id, note: 'Tabloyu göndereceğim.' }),
    )
    expect(note.commitments).toHaveLength(1)
  })

  it('answers the assistant, search and transcription contracts', async () => {
    const answer = assistantAskResponse.parse(
      await api.assistant.ask({ question: 'Bugün toplantım var mı?' }),
    )
    expect(answer.citations.length).toBeGreaterThan(0)
    expect(
      searchResponse.parse(await api.search.query({ query: 'teklif' })).results.length,
    ).toBeGreaterThan(0)
    expect(
      transcribeResponse.parse(
        await api.assistant.transcribe({ audioBase64: 'ZGVtbw==', mimeType: 'audio/m4a' }),
      ).text.length,
    ).toBeGreaterThan(0)
  })

  it('answers the sync and OAuth contracts', async () => {
    expect(syncStartResponse.parse(await api.sync.start()).outcomes.length).toBeGreaterThan(0)
    const analysis = initialAnalysisResponse.parse(await api.sync.initialAnalysis())
    expect(analysis.phase).toBe('done')
    expect(initialAnalysisResponse.parse(await api.sync.initialAnalysisProgress())).toEqual(
      analysis,
    )
    expect(
      oauthStartResponse.parse(
        await api.accounts.startOAuth({
          provider: 'microsoft',
          kinds: ['mail'],
          redirectTo: 'dijitalasistan://oauth',
        }),
      ).state.length,
    ).toBeGreaterThan(0)
  })

  it('answers the reminder, capture, follow-up, referral and privacy contracts', async () => {
    const created = await api.reminders.create({ title: 'Kontrol', preset: 'tomorrow_morning' })
    expect(
      reminderCreateResponse.parse({
        reminder: created.reminder,
        resolution: created.resolution,
      }).resolution.remindAt,
    ).toBe(created.reminder.remindAt)

    expect(
      captureUploadUrlResponse.parse(
        await api.captures.uploadUrl({
          filename: 'fis.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 90_000,
        }),
      ).expiresIn,
    ).toBeGreaterThan(0)

    const followUp = required((await api.followUps.list())[0], 'a waiting follow-up')
    expect(followupNudgeDraft.parse(await api.followUps.nudgeDraft(followUp.id)).followUpId).toBe(
      followUp.id,
    )

    const summary = referralCodeResponse.parse(await api.referral.getCode())
    expect(referralRedeemResponse.parse(await api.referral.redeem(summary.code)).granted).toBe(
      false,
    )
    expect(referralRedeemResponse.parse(await api.referral.redeem('FRIEND01')).granted).toBe(true)

    expect(dataExportSnapshot.parse(await api.privacy.requestExport()).status).toBe('processing')
    expect(dataExportSnapshot.parse(await api.privacy.exportStatus())).toBeTruthy()
    expect(
      deleteHistoryResponse.parse(await api.privacy.deleteHistory({ scope: 'captures' }))
        .deletedCount,
    ).toBeGreaterThan(0)
  })

  it('stores calendar attendees in the camelCase shape every writer uses', async () => {
    const events = await api.events.list({ from: '2026-09-01', to: '2026-09-30' })
    expect(events.length).toBeGreaterThan(0)
    for (const event of events) {
      // The live client replaces the mapper's guess with this parse, so an
      // attendee the contract drops is an attendee the app never shows.
      const parsed = eventAttendees.parse(event.attendees)
      expect(parsed, event.title).toEqual(event.attendees)
      expect(
        parsed.filter((attendee) => attendee.isSelf),
        event.title,
      ).toHaveLength(1)
    }
  })

  it('keeps every capture extraction whole through the contract the live client reads it with', async () => {
    const captures = await api.captures.list()
    expect(captures.length).toBeGreaterThan(0)
    for (const capture of captures) {
      const extracted = required(capture.extracted, `capture ${capture.id}`)
      const parsed = captureExtraction.parse(extracted)
      // Not merely "it parses": the transform drops any claim whose verbatim
      // quote is missing, so a fixture that shows a date it cannot quote would
      // present one thing in demo mode and nothing in a live account.
      expect(parsed.startsAt, `capture ${capture.id}: startsAt`).toBe(extracted.startsAt)
      expect(parsed.endsAt, `capture ${capture.id}: endsAt`).toBe(extracted.endsAt)
      expect(parsed.amount, `capture ${capture.id}: amount`).toEqual(extracted.amount)
      expect(parsed.reference, `capture ${capture.id}: reference`).toBe(extracted.reference)
      if (parsed.startsAt !== null) {
        const quote = required(parsed.dateQuote, `capture ${capture.id}: dateQuote`)
        expect(required(capture.rawText, `capture ${capture.id}: rawText`)).toContain(quote)
      }
    }
  })

  it('hands out only addresses, URLs, money and clock times the primitives accept', async () => {
    const profile = required(await api.settings.profile(), 'the profile')
    expect(emailSchema.parse(profile.email)).toBe(profile.email)

    for (const contact of await api.people.list()) {
      expect(emailSchema.parse(contact.email), contact.email).toBe(contact.email)
    }
    for (const thread of await api.threads.list({ includeSuppressed: true })) {
      for (const participant of thread.participantEmails) {
        expect(emailSchema.parse(participant), participant).toBe(participant)
      }
    }
    for (const event of await api.events.list({ from: '2026-09-01', to: '2026-09-30' })) {
      if (event.conferenceUrl !== null)
        expect(safeUrlSchema.parse(event.conferenceUrl)).toBeTruthy()
    }
    for (const lifeEvent of (await api.today.get()).lifeEvents) {
      if (lifeEvent.trackingUrl !== null) {
        expect(safeUrlSchema.parse(lifeEvent.trackingUrl)).toBeTruthy()
      }
      if (lifeEvent.amount !== null) {
        expect(moneySchema.parse(lifeEvent.amount).currency).toBe(lifeEvent.amount.currency)
      }
    }

    const preferences = required(await api.settings.preferences(), 'the preferences')
    for (const time of [
      preferences.morningBriefingTime,
      preferences.middayPulseTime,
      preferences.eveningCloseTime,
      preferences.weeklyReviewTime,
    ]) {
      expect(localTimeSchema.parse(time), time).toBe(time)
    }
  })

  it('never hands out a timestamp that renders as an invalid date', async () => {
    const answers: Record<string, unknown> = {
      today: await api.today.get(),
      week: await api.plan.week(),
      threads: await api.threads.list({ includeSuppressed: true }),
      approvals: await api.approvals.list(),
      commitments: await api.commitments.list({ limit: 100 }),
      reminders: await api.reminders.list(),
      captures: await api.captures.list(),
      people: await api.people.list(),
      accounts: await api.accounts.list(),
      syncStates: await api.sync.status(),
      assistant: await api.assistant.threads(),
      rules: await api.rules.list(),
      learned: await api.rules.learnedList(),
      briefings: await api.briefings.list(),
    }
    const found = timestamps(answers, 'demo')
    expect(found.length).toBeGreaterThan(100)
    for (const entry of found) {
      const schema = entry.kind === 'instant' ? isoInstantSchema : isoDateSchema
      expect(schema.safeParse(entry.value).success, `${entry.path} = ${entry.value}`).toBe(true)
    }
  })
})

describe('determinism', () => {
  it('answers the same read twice with the same values', async () => {
    expect(await api.today.get()).toEqual(await api.today.get())
    expect(await api.plan.week()).toEqual(await api.plan.week())
    expect(await api.threads.list()).toEqual(await api.threads.list())
    expect(await api.search.query({ query: 'teklif' })).toEqual(
      await api.search.query({ query: 'teklif' }),
    )
  })

  it('answers two independently created clients identically on the same clock', async () => {
    const one = demoClient()
    const two = demoClient()
    expect(await one.today.get()).toEqual(await two.today.get())
    expect(await one.plan.week()).toEqual(await two.plan.week())
    expect(await one.briefings.get({ kind: 'morning' })).toEqual(
      await two.briefings.get({ kind: 'morning' }),
    )
    expect(await one.approvals.list()).toEqual(await two.approvals.list())
  })

  it('mints the same ids for the same sequence of writes', async () => {
    const write = async (client: ApiClient) => {
      const created = await client.rules.create({
        kind: 'keyword_high_priority',
        matchValue: 'teklif',
      })
      const capture = await client.captures.create({ kind: 'text', rawText: 'Not' })
      return [created.id, capture.id]
    }
    expect(await write(demoClient())).toEqual(await write(demoClient()))
  })
})

describe('the injected clock', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is the only clock the answers are derived from', async () => {
    const before = await demoClient().today.get()
    const beforePlan = await demoClient().plan.week()

    // Everything the process could read the wall clock from now says it is a
    // year later. `new Date()` and `Date.now()` both move; the injected clock
    // does not, so nothing in the answers may move either.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2027-05-04T22:11:00.000Z'))
    expect(Date.now()).toBe(new Date('2027-05-04T22:11:00.000Z').getTime())

    expect(await demoClient().today.get()).toEqual(before)
    expect(await demoClient().plan.week()).toEqual(beforePlan)
  })

  it('anchors the day, the schedule and every stamp to the instant it reports', async () => {
    const feed = await api.today.get()
    expect(feed.generatedAt).toBe(new Date(NOW).toISOString())
    expect(feed.forDate).toBe(toIsoDate(new Date(NOW), ISTANBUL))

    // The demo day is anchored to the clock rather than to a wall-clock hour,
    // so there is always a meeting still ahead however late the app is opened.
    for (const event of feed.events) {
      expect(toIsoDate(new Date(event.startsAt), ISTANBUL)).toBe(feed.forDate)
    }
    expect(feed.events.some((event) => event.endsAt > NOW)).toBe(true)
  })

  it('moves the demo day when the clock moves', async () => {
    const tomorrow = new Date(new Date(NOW).getTime() + DAY_MS).toISOString()
    const later = demoClient(tomorrow)
    const feed = await later.today.get()
    expect(feed.forDate).toBe(toIsoDate(new Date(tomorrow), ISTANBUL))
    expect(feed.generatedAt).toBe(tomorrow)
    expect(required(feed.briefing, 'the briefing').forDate).toBe(feed.forDate)
    expect(feed.insights.length).toBeGreaterThan(0)
    expect(feed.events.length).toBeGreaterThan(0)
  })

  it('still has meetings ahead when the app is opened late in the evening', async () => {
    // 23:40 in Istanbul: the case the compressed schedule exists for, and the
    // hour a reviewer or a screenshot run is most likely to hit.
    const lateEvening = '2026-09-08T20:40:00.000Z'
    const late = demoClient(lateEvening)
    const feed = await late.today.get()
    expect(feed.events.length).toBeGreaterThan(0)
    for (const event of feed.events) {
      expect(toIsoDate(new Date(event.startsAt), ISTANBUL)).toBe(feed.forDate)
      expect(event.endsAt > lateEvening).toBe(true)
    }
    // The clash is what the conflicts screen exists to show, so it has to
    // survive the compression rather than collapse into a single block.
    expect((await late.plan.day()).conflicts.length).toBeGreaterThan(0)
  })

  it('follows an advancing clock without being rebuilt', async () => {
    const clock = mutableClock(NOW)
    const client = createApiClient({
      supabaseUrl: 'https://demo.invalid',
      supabaseAnonKey: 'demo-anon-key',
      getAccessToken: async () => null,
      clock,
      mode: 'demo',
    })
    expect((await client.today.get()).forDate).toBe(toIsoDate(new Date(NOW), ISTANBUL))
    clock.advance(2 * DAY_MS)
    const moved = await client.today.get()
    expect(moved.forDate).toBe(toIsoDate(new Date(new Date(NOW).getTime() + 2 * DAY_MS), ISTANBUL))
    expect(moved.generatedAt).toBe(clock.now().toISOString())
    // The store was seeded on the original instant, so the day it describes has
    // moved on: the demo does not silently re-seed itself underneath the user.
    expect(moved.briefing).toBeNull()
  })
})
