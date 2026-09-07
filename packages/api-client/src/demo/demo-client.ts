import {
  AppError,
  DAY_MS,
  HOUR_MS,
  MINUTE_MS,
  REFERRAL_BONUS_DAYS,
  addLocalDays,
  startOfLocalDay,
  toIsoDate,
  type ApprovalAction,
  type CalendarEvent,
  type Capture,
  type Commitment,
  type IsoDate,
  type IsoInstant,
  type SourceRef,
} from '@da/domain'
import type { ApiClientConfig } from '../config'
import type { ApiClient } from '../index'
import type {
  DayLoadSummary,
  DayPlan,
  PlanFreeBlock,
  PlanSuggestion,
  SearchHit,
  ThreadDetail,
  TodayFeed,
} from '../types'
import { createDemoStore, demoId } from './fixtures'

const WORK_START_HOUR = 9
const WORK_END_HOUR = 18

/**
 * A complete, mutating in-memory backend. Everything the app can do, it can do
 * here — approvals execute, commitments close, reminders appear — so the
 * product is usable end to end with no credentials and no network.
 */
export function createDemoClient(config: ApiClientConfig): ApiClient {
  let store = createDemoStore(config.clock)
  let sequence = 5000

  const nextId = (): string => {
    sequence += 1
    return demoId(sequence)
  }
  const now = (): Date => config.clock.now()
  const nowIso = (): IsoInstant => now().toISOString()
  const timeZone = (): string => store.timeZone
  const todayDate = (): IsoDate => toIsoDate(now(), timeZone())

  const owned = (): { userId: string; createdAt: IsoInstant; updatedAt: IsoInstant } => ({
    userId: store.userId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  })

  function found<T>(value: T | undefined | null, detail: string): T {
    if (value === undefined || value === null) throw new AppError('not_found', { detail })
    return value
  }

  const dayOf = (instant: IsoInstant): IsoDate => toIsoDate(new Date(instant), timeZone())

  const eventsOn = (date: IsoDate): CalendarEvent[] =>
    store.events
      .filter((event) => dayOf(event.startsAt) === date && event.status !== 'cancelled')
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))

  function planFor(date: IsoDate): DayPlan {
    const events = eventsOn(date)
    const anchor = new Date(`${date}T12:00:00.000Z`)
    const dayStart = startOfLocalDay(anchor, timeZone()).getTime()
    const windowStart = dayStart + WORK_START_HOUR * HOUR_MS
    const windowEnd = dayStart + WORK_END_HOUR * HOUR_MS

    const busy = events
      .map((event) => ({
        start: new Date(event.startsAt).getTime(),
        end: new Date(event.endsAt).getTime(),
      }))
      .sort((a, b) => a.start - b.start)

    const freeBlocks: PlanFreeBlock[] = []
    let cursor = windowStart
    for (const block of busy) {
      if (block.start > cursor) {
        const end = Math.min(block.start, windowEnd)
        if (end - cursor >= 15 * MINUTE_MS) {
          freeBlocks.push({
            startsAt: new Date(cursor).toISOString(),
            endsAt: new Date(end).toISOString(),
            minutes: Math.round((end - cursor) / MINUTE_MS),
          })
        }
      }
      cursor = Math.max(cursor, block.end)
    }
    if (windowEnd - cursor >= 15 * MINUTE_MS) {
      freeBlocks.push({
        startsAt: new Date(cursor).toISOString(),
        endsAt: new Date(windowEnd).toISOString(),
        minutes: Math.round((windowEnd - cursor) / MINUTE_MS),
      })
    }

    const conflicts = events
      .flatMap((event, index) => events.slice(index + 1).map((other) => ({ event, other })))
      .filter(
        ({ event, other }) =>
          new Date(other.startsAt).getTime() < new Date(event.endsAt).getTime() &&
          new Date(event.startsAt).getTime() < new Date(other.endsAt).getTime(),
      )
      .map(({ event, other }) => ({
        eventIds: [event.id, other.id],
        startsAt: event.startsAt > other.startsAt ? event.startsAt : other.startsAt,
        endsAt: event.endsAt < other.endsAt ? event.endsAt : other.endsAt,
      }))

    const meetingMinutes = busy.reduce(
      (total, block) => total + Math.round((block.end - block.start) / MINUTE_MS),
      0,
    )
    const longestFreeMinutes = freeBlocks.reduce((max, block) => Math.max(max, block.minutes), 0)
    const load: DayLoadSummary = {
      meetingCount: events.length,
      meetingMinutes,
      longestFreeMinutes,
      level: meetingMinutes >= 300 ? 'heavy' : meetingMinutes >= 120 ? 'moderate' : 'light',
    }

    return {
      date,
      events,
      tasks: store.tasks.filter((task) => task.dueAt !== null && dayOf(task.dueAt) === date),
      commitments: store.commitments.filter(
        (commitment) => commitment.dueAt !== null && dayOf(commitment.dueAt) === date,
      ),
      reminders: store.reminders.filter((reminder) => dayOf(reminder.remindAt) === date),
      freeBlocks,
      conflicts,
      load,
    }
  }

  function sourceForThread(threadId: string): SourceRef {
    const thread = store.threads.find((candidate) => candidate.id === threadId)
    return {
      type: 'email',
      id: threadId,
      label: thread ? `Gmail · ${thread.subject}` : 'Gmail',
      provider: 'google',
      personName: null,
      occurredAt: thread?.lastMessageAt ?? null,
      externalUrl: null,
    }
  }

  function applyApproval(approval: ApprovalAction): string {
    const payload = approval.payload
    switch (payload.kind) {
      case 'email_send': {
        const thread = store.threads.find((candidate) => candidate.id === payload.threadId)
        if (thread) {
          thread.isRead = true
          thread.requiresUserAction = false
          thread.lastMessageAt = nowIso()
          thread.messageCount += 1
          store.messages.push({
            id: nextId(),
            ...owned(),
            threadId: thread.id,
            connectedAccountId: payload.connectedAccountId,
            externalMessageId: `demo-${nextId().slice(-6)}`,
            fromEmail: store.profile.email,
            fromName: store.profile.displayName,
            toEmails: payload.to,
            ccEmails: payload.cc,
            subject: payload.subject,
            snippet: payload.body.slice(0, 140),
            bodyText: payload.body,
            sentAt: nowIso(),
            isFromUser: true,
            hasAttachments: false,
            attachmentMeta: [],
            contentHash: `demo-${thread.id.slice(-6)}`,
            externalUrl: null,
          })
        }
        return `demo-message-${approval.id.slice(-6)}`
      }
      case 'calendar_create': {
        const event: CalendarEvent = {
          id: nextId(),
          ...owned(),
          connectedAccountId: payload.connectedAccountId,
          externalEventId: `demo-${approval.id.slice(-6)}`,
          provider: 'google',
          title: payload.title,
          description: payload.description,
          location: payload.location,
          startsAt: payload.startsAt,
          endsAt: payload.endsAt,
          isAllDay: false,
          timeZone: payload.timeZone,
          attendees: payload.attendees.map((email) => ({
            email,
            name: null,
            responseStatus: 'needs_action',
            isOrganizer: false,
            isSelf: false,
          })),
          organizerEmail: store.profile.email,
          conferenceUrl: null,
          status: 'confirmed',
          providerUpdatedAt: nowIso(),
          externalUrl: null,
        }
        store.events.push(event)
        return event.id
      }
      case 'calendar_update': {
        const event = store.events.find((candidate) => candidate.id === payload.eventId)
        if (event) {
          if (payload.changes.title !== undefined) event.title = payload.changes.title
          if (payload.changes.startsAt !== undefined) event.startsAt = payload.changes.startsAt
          if (payload.changes.endsAt !== undefined) event.endsAt = payload.changes.endsAt
          if (payload.changes.location !== undefined) event.location = payload.changes.location
          event.providerUpdatedAt = nowIso()
        }
        return payload.eventId
      }
      case 'task_create': {
        const id = nextId()
        store.tasks.push({
          id,
          ...owned(),
          connectedAccountId: payload.connectedAccountId,
          externalTaskId: `demo-${id.slice(-6)}`,
          provider: 'google',
          title: payload.title,
          notes: payload.notes,
          dueAt: payload.dueAt,
          status: 'open',
          completedAt: null,
          source: approval.source,
          providerUpdatedAt: nowIso(),
        })
        return id
      }
      case 'reminder_create': {
        const id = nextId()
        store.reminders.push({
          id,
          ...owned(),
          title: payload.title,
          body: payload.body,
          remindAt: payload.remindAt,
          preset: payload.preset,
          source: approval.source,
          relatedEntityType: payload.relatedEntityType,
          relatedEntityId: payload.relatedEntityId,
          status: 'scheduled',
          firedAt: null,
          category: 'follow_up',
        })
        return id
      }
      case 'commitment_create': {
        const id = nextId()
        store.commitments.push({
          id,
          ...owned(),
          text: payload.text,
          direction: payload.direction,
          personId: null,
          personName: payload.personName,
          dueAt: payload.dueAt,
          status: 'open',
          source: approval.source ?? sourceForThread(approval.id),
          quote: payload.quote,
          confidence: 0.9,
          confirmedByUser: true,
          completedAt: null,
          snoozedUntil: null,
        })
        return id
      }
      default:
        return approval.id
    }
  }

  function extractionFor(text: string): Capture['extracted'] {
    return {
      title: text.split('\n')[0]?.slice(0, 80) ?? 'Not',
      summary: text.slice(0, 200),
      startsAt: null,
      endsAt: null,
      location: null,
      people: [],
      amount: null,
      reference: null,
      keyPoints: [],
      confidence: 0.72,
      suggestedActions: [],
    }
  }

  const normalize = (value: string): string => value.toLocaleLowerCase('tr')

  return {
    mode: 'demo',

    accounts: {
      async list() {
        return [...store.accounts]
      },
      async startOAuth(input) {
        return {
          authorizeUrl: `https://demo.dijitalasistan.app/oauth/${input.provider}`,
          state: `demo-${input.provider}`,
        }
      },
      async completeOAuth() {
        const account = found(store.accounts[0], 'demo account')
        account.status = 'connected'
        account.lastSyncedAt = nowIso()
        return account
      },
      async disconnect(input) {
        const account = store.accounts.find(
          (candidate) => candidate.id === input.connectedAccountId,
        )
        if (account) {
          account.status = 'disconnected'
          account.updatedAt = nowIso()
        }
      },
      async requestScopes(input) {
        return {
          authorizeUrl: `https://demo.dijitalasistan.app/oauth/${input.provider}/scopes`,
          state: `demo-${input.connectedAccountId.slice(-6)}`,
        }
      },
    },

    sync: {
      async start() {
        for (const state of store.syncStates) {
          state.lastRunAt = nowIso()
          state.status = 'idle'
        }
        return { started: true, jobIds: ['demo-sync'] }
      },
      async initialAnalysis() {
        const briefing = store.briefings[0]
        return {
          phase: 'done',
          emailsFound: 34,
          importantFound: store.threads.filter(
            (thread) => thread.importance === 'critical' || thread.importance === 'high',
          ).length,
          meetingsFound: store.events.length,
          followUpsFound: store.followUps.length,
          progress: 1,
          briefingId: briefing?.id ?? null,
          errorCode: null,
        }
      },
      async initialAnalysisProgress() {
        const briefing = store.briefings[0]
        return {
          phase: 'done',
          emailsFound: 34,
          importantFound: 4,
          meetingsFound: store.events.length,
          followUpsFound: store.followUps.length,
          progress: 1,
          briefingId: briefing?.id ?? null,
          errorCode: null,
        }
      },
      async status() {
        return [...store.syncStates]
      },
    },

    today: {
      async get(input = {}) {
        const forDate = input.forDate ?? todayDate()
        const briefing =
          store.briefings.find((item) => item.forDate === forDate && item.kind === 'morning') ??
          null
        const feed: TodayFeed = {
          forDate,
          generatedAt: nowIso(),
          briefing,
          briefingItems: briefing
            ? store.briefingItems
                .filter((item) => item.briefingId === briefing.id)
                .sort((a, b) => a.position - b.position)
            : [],
          insights: store.insights.filter(
            (insight) => insight.forDate === forDate && insight.dismissedAt === null,
          ),
          events: eventsOn(forDate),
          commitments: store.commitments.filter((commitment) => commitment.status === 'open'),
          followUps: store.followUps.filter((followUp) => followUp.status === 'waiting'),
          lifeEvents: store.lifeEvents.filter((event) => event.status === 'active'),
          pendingApprovals: store.approvals.filter((approval) => approval.status === 'pending'),
        }
        return feed
      },

      // Demo mutations mutate the in-memory store, so the whole loop is
      // genuinely exercisable without a backend.
      async completeInsight(insightId) {
        const insight = store.insights.find((item) => item.id === insightId)
        if (insight) insight.completedAt = nowIso()
      },

      async dismissInsight(insightId) {
        const insight = store.insights.find((item) => item.id === insightId)
        if (insight) insight.dismissedAt = nowIso()
      },
    },

    briefings: {
      async get(input) {
        const forDate = input.forDate ?? todayDate()
        const briefing = store.briefings.find(
          (item) => item.kind === input.kind && item.forDate === forDate,
        )
        if (!briefing) return null
        return {
          briefing,
          items: store.briefingItems
            .filter((item) => item.briefingId === briefing.id)
            .sort((a, b) => a.position - b.position),
        }
      },
      async list() {
        return [...store.briefings].sort((a, b) => b.forDate.localeCompare(a.forDate))
      },
      async generate(input) {
        const forDate = input.forDate ?? todayDate()
        const existing = store.briefings.find(
          (item) => item.kind === input.kind && item.forDate === forDate,
        )
        if (existing && input.force !== true) {
          return {
            briefing: existing,
            items: store.briefingItems.filter((item) => item.briefingId === existing.id),
          }
        }
        const template = found(store.briefings[0], 'demo briefing')
        const id = nextId()
        const briefing = {
          ...template,
          id,
          ...owned(),
          kind: input.kind,
          forDate,
          status: 'ready' as const,
          generatedAt: nowIso(),
          openedAt: null,
          contentHash: `demo-${input.kind}-${forDate}`,
        }
        store.briefings.push(briefing)
        const items = store.briefingItems
          .filter((item) => item.briefingId === template.id)
          .map((item) => ({ ...item, id: nextId(), briefingId: id, ...owned() }))
        store.briefingItems.push(...items)
        return { briefing, items }
      },
      async requestAudio(input) {
        const briefing = found(
          store.briefings.find((item) => item.id === input.briefingId),
          'demo briefing',
        )
        return {
          audioUrl: null,
          provider: null,
          ssmlOrText: briefing.narrative ?? briefing.headline ?? '',
          durationSeconds: briefing.durationSeconds,
        }
      },
      async markOpened(briefingId) {
        const briefing = found(
          store.briefings.find((item) => item.id === briefingId),
          'demo briefing',
        )
        briefing.openedAt = nowIso()
        briefing.updatedAt = nowIso()
        return briefing
      },
    },

    threads: {
      async list(filter = {}) {
        const flow = filter.flow ?? 'all'
        return store.threads
          .filter((thread) => (filter.includeSuppressed ? true : thread.suppressedAt === null))
          .filter((thread) => {
            switch (flow) {
              case 'important':
                return thread.importance === 'critical' || thread.importance === 'high'
              case 'action_required':
                return thread.requiresUserAction
              case 'waiting':
                return (
                  thread.category === 'waiting_for_user' || thread.category === 'waiting_for_other'
                )
              case 'deadlines':
                return thread.category === 'deadline'
              case 'meetings':
                return thread.category === 'meeting'
              case 'personal':
                return ['shipment', 'travel', 'payment', 'subscription', 'security'].includes(
                  thread.category,
                )
              default:
                return true
            }
          })
          .filter((thread) => (filter.category ? thread.category === filter.category : true))
          .filter((thread) => (filter.importance ? thread.importance === filter.importance : true))
          .filter((thread) => (filter.unreadOnly ? !thread.isRead : true))
          .filter((thread) => (filter.requiresAction ? thread.requiresUserAction : true))
          .filter((thread) =>
            filter.accountId ? thread.connectedAccountId === filter.accountId : true,
          )
          .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
          .slice(0, filter.limit ?? 100)
      },
      async get(threadId) {
        return store.threads.find((thread) => thread.id === threadId) ?? null
      },
      async messages(threadId) {
        return store.messages
          .filter((message) => message.threadId === threadId)
          .sort((a, b) => a.sentAt.localeCompare(b.sentAt))
      },
      async feedback(input) {
        if (input.signal === 'not_important' && input.entityType === 'email') {
          const thread = store.threads.find((candidate) => candidate.id === input.entityId)
          if (thread) thread.suppressedAt = nowIso()
        }
        if (input.signal === 'mark_vip' && input.entityType === 'contact') {
          const contact = store.contacts.find((candidate) => candidate.id === input.entityId)
          if (contact) {
            contact.isVip = true
            contact.vipSetAt = nowIso()
          }
        }
        if (input.signal === 'stop_following' && input.entityType === 'email') {
          for (const followUp of store.followUps) {
            if (followUp.threadId === input.entityId) {
              followUp.status = 'closed'
              followUp.closedAt = nowIso()
            }
          }
        }
      },
      async suppress(threadId) {
        const thread = found(
          store.threads.find((candidate) => candidate.id === threadId),
          'demo thread',
        )
        thread.suppressedAt = nowIso()
        thread.updatedAt = nowIso()
        return thread
      },
      async markRead(threadId, isRead) {
        const thread = found(
          store.threads.find((candidate) => candidate.id === threadId),
          'demo thread',
        )
        thread.isRead = isRead
        thread.updatedAt = nowIso()
        return thread
      },
      async detail(threadId) {
        const thread = store.threads.find((candidate) => candidate.id === threadId)
        if (!thread) return null
        const detail: ThreadDetail = {
          thread,
          messages: store.messages
            .filter((message) => message.threadId === threadId)
            .sort((a, b) => a.sentAt.localeCompare(b.sentAt)),
          commitments: store.commitments.filter((commitment) => commitment.source.id === threadId),
          followUps: store.followUps.filter((followUp) => followUp.threadId === threadId),
        }
        return detail
      },
    },

    reply: {
      async draft(input) {
        const thread = found(
          store.threads.find((candidate) => candidate.id === input.threadId),
          'demo thread',
        )
        const bodies: Record<string, string> = {
          short: 'Merhaba,\n\nEn geç cuma 17:00’a kadar dönüş yapacağım.\n\nDeniz',
          professional:
            'Merhaba,\n\nTalebini aldım. Gerekli güncellemeyi tamamlayıp cuma 17:00’dan önce ileteceğim.\n\nİyi çalışmalar,\nDeniz',
          friendly:
            'Merhaba,\n\nHallediyorum, cuma 17:00’dan önce elinde olacak. Bir eksik olursa haber ver.\n\nDeniz',
          detailed:
            'Merhaba,\n\nRevize teklif için birim fiyat tablosunu güncelliyorum; kalemleri son maliyetlerle yenileyip cuma 17:00’dan önce göndereceğim. Ek bir başlık eklememi istersen bugün içinde yazman yeterli.\n\nİyi çalışmalar,\nDeniz',
        }
        const body = bodies[input.tone] ?? bodies['professional'] ?? ''
        let approvalId: string | null = null
        if (input.asApproval === true) {
          const account = found(store.accounts[0], 'demo account')
          const id = nextId()
          const payload = {
            kind: 'email_send' as const,
            connectedAccountId: account.id,
            threadId: thread.id,
            inReplyToMessageId: null,
            to: thread.participantEmails.filter((email) => email !== store.profile.email),
            cc: [],
            subject: `Re: ${thread.subject}`,
            body,
            tone: input.tone,
          }
          store.approvals.push({
            id,
            ...owned(),
            type: 'email_send',
            status: 'pending',
            what: `${thread.subject} yanıtını gönder`,
            why: 'Yanıt senden bekleniyor.',
            source: sourceForThread(thread.id),
            payload,
            originalPayload: payload,
            idempotencyKey: `demo-reply-${id.slice(-6)}`,
            expiresAt: new Date(now().getTime() + DAY_MS).toISOString(),
            approvedAt: null,
            executedAt: null,
            rejectedAt: null,
            failureReason: null,
            attemptCount: 0,
            resultRef: null,
          })
          approvalId = id
        }
        return {
          threadId: thread.id,
          subject: `Re: ${thread.subject}`,
          body,
          tone: input.tone,
          approvalId,
          alternatives: [
            { tone: 'short' as const, body: bodies['short'] ?? '' },
            { tone: 'detailed' as const, body: bodies['detailed'] ?? '' },
          ],
          grounded: true,
        }
      },
    },

    followUps: {
      async list(filter = {}) {
        const status = filter.status ?? 'waiting'
        return store.followUps
          .filter((followUp) => followUp.status === status)
          .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
          .slice(0, filter.limit ?? 50)
      },
      async nudgeDraft(followUpId) {
        const followUp = found(
          store.followUps.find((candidate) => candidate.id === followUpId),
          'demo follow-up',
        )
        const thread = store.threads.find((candidate) => candidate.id === followUp.threadId)
        return {
          followUpId,
          subject: `Hatırlatma: ${thread?.subject ?? 'yanıt bekleyen konu'}`,
          body: `Merhaba ${followUp.recipientName ?? ''},\n\nAşağıdaki konuda dönüşünü bekliyorum. Uygun olduğunda bakabilir misin?\n\nTeşekkürler,\nDeniz`,
          approvalId: null,
        }
      },
      async snooze(followUpId, until) {
        const followUp = found(
          store.followUps.find((candidate) => candidate.id === followUpId),
          'demo follow-up',
        )
        followUp.dueAt = until
        followUp.dismissCount += 1
        followUp.updatedAt = nowIso()
        return followUp
      },
      async close(followUpId) {
        const followUp = found(
          store.followUps.find((candidate) => candidate.id === followUpId),
          'demo follow-up',
        )
        followUp.status = 'closed'
        followUp.closedAt = nowIso()
        followUp.updatedAt = nowIso()
        return followUp
      },
    },

    commitments: {
      async list(filter = {}) {
        return store.commitments
          .filter((commitment) => (filter.status ? commitment.status === filter.status : true))
          .filter((commitment) =>
            filter.direction ? commitment.direction === filter.direction : true,
          )
          .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))
          .slice(0, filter.limit ?? 100)
      },
      async complete(commitmentId) {
        const commitment = found(
          store.commitments.find((candidate) => candidate.id === commitmentId),
          'demo commitment',
        )
        commitment.status = 'done'
        commitment.completedAt = nowIso()
        commitment.updatedAt = nowIso()
        return commitment
      },
      async snooze(commitmentId, until) {
        const commitment = found(
          store.commitments.find((candidate) => candidate.id === commitmentId),
          'demo commitment',
        )
        commitment.status = 'snoozed'
        commitment.snoozedUntil = until
        commitment.updatedAt = nowIso()
        return commitment
      },
      async create(input) {
        const commitment: Commitment = {
          id: nextId(),
          ...owned(),
          text: input.text,
          direction: input.direction,
          personId: null,
          personName: input.personName ?? null,
          dueAt: input.dueAt ?? null,
          status: 'open',
          source: {
            type: 'user_input',
            id: 'demo-user-input',
            label: 'Senin girdiğin not',
            provider: null,
            personName: input.personName ?? null,
            occurredAt: nowIso(),
            externalUrl: null,
          },
          quote: input.quote,
          confidence: 1,
          confirmedByUser: true,
          completedAt: null,
          snoozedUntil: null,
        }
        store.commitments.push(commitment)
        return commitment
      },
    },

    events: {
      async list(range) {
        return store.events
          .filter(
            (event) =>
              dayOf(event.endsAt) >= range.from &&
              dayOf(event.startsAt) <= range.to &&
              event.status !== 'cancelled',
          )
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      },
      async get(eventId) {
        return store.events.find((event) => event.id === eventId) ?? null
      },
    },

    plan: {
      async day(input = {}) {
        return planFor(input.date ?? todayDate())
      },
      async week(input = {}) {
        const startDate = input.startDate ?? todayDate()
        const anchor = new Date(`${startDate}T12:00:00.000Z`)
        const days = Array.from({ length: 7 }, (_, index) =>
          planFor(toIsoDate(addLocalDays(anchor, index, timeZone()), timeZone())),
        )
        return {
          startDate,
          endDate: toIsoDate(addLocalDays(anchor, 6, timeZone()), timeZone()),
          days,
        }
      },
      async suggestions(input = {}) {
        const date = input.date ?? todayDate()
        const plan = planFor(date)
        const longest = plan.freeBlocks.reduce<PlanFreeBlock | null>(
          (best, block) => (best === null || block.minutes > best.minutes ? block : best),
          null,
        )
        const suggestions: PlanSuggestion[] = []
        if (longest) {
          suggestions.push({
            id: `focus-${date}`,
            kind: 'focus_block' as const,
            title: 'Teklif için odak bloğu ayır',
            detail: `${longest.minutes} dakikalık boşluk revize teklifi bitirmeye yeter.`,
            startsAt: longest.startsAt,
            endsAt: longest.endsAt,
            relatedEventId: null,
          })
        }
        const meeting = plan.events.find((event) => event.attendees.length > 1)
        if (meeting) {
          suggestions.push({
            id: `prepare-${meeting.id}`,
            kind: 'prepare' as const,
            title: `${meeting.title} için hazırlan`,
            detail: 'Gündem maddelerini toplantı öncesi gözden geçir.',
            startsAt: meeting.startsAt,
            endsAt: meeting.endsAt,
            relatedEventId: meeting.id,
          })
        }
        return suggestions
      },
    },

    meetings: {
      async prep(eventId) {
        const event = found(
          store.events.find((candidate) => candidate.id === eventId),
          'demo event',
        )
        return {
          eventId,
          event,
          summary: `${event.title} toplantısında yol haritası, fiyatlandırma ve ekip planı konuşulacak.`,
          agenda: ['Yol haritası', 'Fiyatlandırma', 'Ekip planı', 'Dördüncü madde — senin eklemen'],
          attendees: event.attendees
            .filter((attendee) => !attendee.isSelf)
            .map((attendee) => {
              const contact = store.contacts.find((candidate) => candidate.email === attendee.email)
              return {
                email: attendee.email,
                name: contact?.name ?? attendee.name,
                company: contact?.company ?? null,
                role: contact?.role ?? null,
                isVip: contact?.isVip ?? false,
                lastContactAt: contact?.lastContactAt ?? null,
                recentContext:
                  contact?.name === 'Mehmet Yılmaz'
                    ? 'Komite sunumuna büyüme senaryosunu eklemeni istedi.'
                    : null,
              }
            }),
          openCommitments: store.commitments.filter((commitment) => commitment.status === 'open'),
          relatedThreadIds: store.threads
            .filter((thread) => thread.category === 'meeting')
            .map((thread) => thread.id),
          suggestedQuestions: [
            'Fiyatlandırmada hangi senaryoyu önceliklendiriyoruz?',
            'Ekip planı için işe alım takvimi net mi?',
          ],
        }
      },
      async postMeetingNote(input) {
        const commitment: Commitment = {
          id: nextId(),
          ...owned(),
          text: input.note.slice(0, 200),
          direction: 'user_owes',
          personId: null,
          personName: null,
          dueAt: null,
          status: 'open',
          source: {
            type: 'calendar_event',
            id: input.eventId,
            label: 'Toplantı notu',
            provider: 'google',
            personName: null,
            occurredAt: nowIso(),
            externalUrl: null,
          },
          quote: input.note.slice(0, 300),
          confidence: 0.8,
          confirmedByUser: true,
          completedAt: null,
          snoozedUntil: null,
        }
        store.commitments.push(commitment)
        return { commitments: [commitment], createdApprovalIds: [] }
      },
    },

    assistant: {
      async ask(input) {
        const threadId = input.threadId ?? nextId()
        let thread = store.assistantThreads.find((candidate) => candidate.id === threadId)
        if (!thread) {
          thread = {
            id: threadId,
            ...owned(),
            title: input.question.slice(0, 60),
            lastMessageAt: nowIso(),
            messageCount: 0,
          }
          store.assistantThreads.push(thread)
        }
        store.assistantMessages.push({
          id: nextId(),
          ...owned(),
          threadId,
          role: 'user',
          content: input.question,
          citations: [],
          proposedApprovalId: null,
          tokensIn: null,
          tokensOut: null,
          model: null,
          wasVoice: input.wasVoice ?? false,
        })

        const question = normalize(input.question)
        const openCommitment = store.commitments.find((commitment) => commitment.status === 'open')
        const waiting = store.followUps.find((followUp) => followUp.status === 'waiting')
        const todayEvents = eventsOn(todayDate())

        let answer: string
        let citations: SourceRef[] = []
        if (question.includes('teklif') || question.includes('ahmet')) {
          answer = openCommitment
            ? `${openCommitment.text}. Kaynak cümle: “${openCommitment.quote}”`
            : 'Açık bir teklif taahhüdün görünmüyor.'
          citations = openCommitment ? [openCommitment.source] : []
        } else if (question.includes('toplant') || question.includes('bugün')) {
          answer =
            todayEvents.length > 0
              ? `Bugün ${todayEvents.length} toplantın var. İlki ${todayEvents[0]?.title ?? ''}.`
              : 'Bugün takviminde toplantı yok.'
          citations = todayEvents.map((event) => ({
            type: 'calendar_event',
            id: event.id,
            label: `Takvim · ${event.title}`,
            provider: event.provider,
            personName: null,
            occurredAt: event.startsAt,
            externalUrl: null,
          }))
        } else if (question.includes('bekle')) {
          answer = waiting
            ? `${waiting.recipientName ?? waiting.recipientEmail} hâlâ yanıt vermedi.`
            : 'Yanıt beklediğin bir konu yok.'
          citations = waiting ? [sourceForThread(waiting.threadId)] : []
        } else {
          answer =
            'Bugünün tek kritik işi Ahmet’in revize teklifi. Saat 14:00’ta ürün stratejisi toplantın var.'
          citations = openCommitment ? [openCommitment.source] : []
        }

        const messageId = nextId()
        store.assistantMessages.push({
          id: messageId,
          ...owned(),
          threadId,
          role: 'assistant',
          content: answer,
          citations,
          proposedApprovalId: null,
          tokensIn: 300,
          tokensOut: 80,
          model: 'demo',
          wasVoice: false,
        })
        thread.messageCount += 2
        thread.lastMessageAt = nowIso()

        return {
          threadId,
          messageId,
          answer,
          citations: citations.map((citation) => ({
            sourceType: citation.type,
            sourceId: citation.id,
            label: citation.label,
            occurredAt: citation.occurredAt,
          })),
          proposedApprovalId: null,
          grounded: citations.length > 0,
        }
      },
      async threads() {
        return [...store.assistantThreads].sort((a, b) =>
          b.lastMessageAt.localeCompare(a.lastMessageAt),
        )
      },
      async messages(threadId) {
        return store.assistantMessages
          .filter((message) => message.threadId === threadId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      },
      async transcribe() {
        return {
          text: 'Ahmet’e ne söz vermiştim?',
          provider: null,
          confidence: 0.9,
        }
      },
    },

    search: {
      async query(input) {
        const needle = normalize(input.query)
        const hits: SearchHit[] = []
        for (const thread of store.threads) {
          if (normalize(`${thread.subject} ${thread.summary ?? ''}`).includes(needle)) {
            hits.push({
              id: thread.id,
              type: 'email',
              title: thread.subject,
              snippet: thread.summary ?? '',
              occurredAt: thread.lastMessageAt,
              score: thread.priorityScore / 100,
              sourceLabel: 'Gmail',
            })
          }
        }
        for (const event of store.events) {
          if (normalize(event.title).includes(needle)) {
            hits.push({
              id: event.id,
              type: 'calendar_event',
              title: event.title,
              snippet: event.description ?? '',
              occurredAt: event.startsAt,
              score: 0.7,
              sourceLabel: 'Takvim',
            })
          }
        }
        for (const contact of store.contacts) {
          if (normalize(contact.name ?? contact.email).includes(needle)) {
            hits.push({
              id: contact.id,
              type: 'contact',
              title: contact.name ?? contact.email,
              snippet: [contact.role, contact.company].filter(Boolean).join(' · '),
              occurredAt: contact.lastContactAt,
              score: 0.6,
              sourceLabel: 'Kişiler',
            })
          }
        }
        for (const commitment of store.commitments) {
          if (normalize(commitment.text).includes(needle)) {
            hits.push({
              id: commitment.id,
              type: 'commitment',
              title: commitment.text,
              snippet: commitment.quote,
              occurredAt: commitment.dueAt,
              score: 0.75,
              sourceLabel: 'Taahhüt',
            })
          }
        }
        const limited = hits.slice(0, input.limit ?? 20)
        return { results: limited, nextCursor: null, mode: 'keyword' }
      },
    },

    captures: {
      async uploadUrl(input) {
        const path = `${store.userId}/demo/${input.filename}`
        return {
          uploadUrl: `https://demo.dijitalasistan.app/upload/${encodeURIComponent(path)}`,
          storagePath: path,
          expiresIn: 900,
        }
      },
      async create(input) {
        const capture: Capture = {
          id: nextId(),
          ...owned(),
          kind: input.kind,
          status: 'ready',
          storagePath: input.storagePath ?? null,
          sourceUrl: input.sourceUrl ?? null,
          rawText: input.rawText ?? null,
          mimeType: input.mimeType ?? null,
          sizeBytes: input.sizeBytes ?? null,
          detectedIntent: 'note',
          extracted: extractionFor(input.rawText ?? 'Yeni kayıt'),
          failureReason: null,
          analyzedAt: nowIso(),
        }
        store.captures.push(capture)
        return capture
      },
      async get(captureId) {
        return store.captures.find((capture) => capture.id === captureId) ?? null
      },
      async list(input = {}) {
        return store.captures
          .filter((capture) => (input.status ? capture.status === input.status : true))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, input.limit ?? 50)
      },
    },

    approvals: {
      async list(input = {}) {
        return store.approvals
          .filter((approval) => (input.status ? approval.status === input.status : true))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, input.limit ?? 50)
      },
      async get(approvalId) {
        return store.approvals.find((approval) => approval.id === approvalId) ?? null
      },
      async create(input) {
        const approval: ApprovalAction = {
          id: nextId(),
          ...owned(),
          type: input.type,
          status: 'pending',
          what: input.what,
          why: input.why,
          source: input.sourceType
            ? {
                type: input.sourceType,
                id: input.sourceId ?? 'demo',
                label: 'Kaynak',
                provider: null,
                personName: null,
                occurredAt: nowIso(),
                externalUrl: null,
              }
            : null,
          payload: input.payload,
          originalPayload: input.payload,
          idempotencyKey: `demo-${input.discriminator}`,
          expiresAt: new Date(now().getTime() + DAY_MS).toISOString(),
          approvedAt: null,
          executedAt: null,
          rejectedAt: null,
          failureReason: null,
          attemptCount: 0,
          resultRef: null,
        }
        store.approvals.push(approval)
        return approval
      },
      async decide(input) {
        const approval = found(
          store.approvals.find((candidate) => candidate.id === input.approvalId),
          'demo approval',
        )
        if (approval.status !== 'pending') {
          throw new AppError('approval_already_executed', { detail: approval.status })
        }
        if (input.decision === 'reject') {
          approval.status = 'rejected'
          approval.rejectedAt = nowIso()
          approval.updatedAt = nowIso()
          return {
            approvalId: approval.id,
            status: 'rejected',
            resultRef: null,
            failureCode: null,
            missingScopes: [],
          }
        }
        if (input.editedPayload) approval.payload = input.editedPayload
        approval.approvedAt = nowIso()
        approval.attemptCount += 1
        const resultRef = applyApproval(approval)
        approval.status = 'executed'
        approval.executedAt = nowIso()
        approval.resultRef = resultRef
        approval.updatedAt = nowIso()
        return {
          approvalId: approval.id,
          status: 'executed',
          resultRef,
          failureCode: null,
          missingScopes: [],
        }
      },
      async retry(approvalId) {
        const approval = found(
          store.approvals.find((candidate) => candidate.id === approvalId),
          'demo approval',
        )
        approval.attemptCount += 1
        const resultRef = applyApproval(approval)
        approval.status = 'executed'
        approval.executedAt = nowIso()
        approval.failureReason = null
        approval.resultRef = resultRef
        approval.updatedAt = nowIso()
        return {
          approvalId,
          status: 'executed',
          resultRef,
          failureCode: null,
          missingScopes: [],
        }
      },
    },

    reminders: {
      async list(input = {}) {
        const status = input.status ?? 'scheduled'
        return store.reminders
          .filter((reminder) => reminder.status === status)
          .sort((a, b) => a.remindAt.localeCompare(b.remindAt))
          .slice(0, input.limit ?? 100)
      },
      async create(input) {
        const reminder = {
          id: nextId(),
          ...owned(),
          title: input.title,
          body: input.body ?? null,
          remindAt: input.remindAt,
          preset: input.preset,
          source: null,
          relatedEntityType: input.relatedEntityType ?? null,
          relatedEntityId: input.relatedEntityId ?? null,
          status: 'scheduled' as const,
          firedAt: null,
          category: 'follow_up' as const,
        }
        store.reminders.push(reminder)
        return reminder
      },
      async cancel(reminderId) {
        const reminder = found(
          store.reminders.find((candidate) => candidate.id === reminderId),
          'demo reminder',
        )
        reminder.status = 'cancelled'
        reminder.updatedAt = nowIso()
        return reminder
      },
    },

    people: {
      async list(filter = {}) {
        const needle = filter.search ? normalize(filter.search) : null
        return store.contacts
          .filter((contact) => (filter.vipOnly ? contact.isVip : true))
          .filter((contact) =>
            needle ? normalize(`${contact.name ?? ''} ${contact.email}`).includes(needle) : true,
          )
          .sort((a, b) => b.interactionCount - a.interactionCount)
          .slice(0, filter.limit ?? 100)
      },
      async get(contactId) {
        return store.contacts.find((contact) => contact.id === contactId) ?? null
      },
      async setVip(contactId, isVip) {
        const contact = found(
          store.contacts.find((candidate) => candidate.id === contactId),
          'demo contact',
        )
        contact.isVip = isVip
        contact.vipSetAt = isVip ? nowIso() : null
        contact.updatedAt = nowIso()
        return contact
      },
    },

    rules: {
      async list() {
        return [...store.priorityRules]
      },
      async create(input) {
        const rule = {
          id: nextId(),
          ...owned(),
          kind: input.kind,
          matchValue: input.matchValue,
          matchCategory: input.matchCategory ?? null,
          enabled: input.enabled ?? true,
          note: input.note ?? null,
        }
        store.priorityRules.push(rule)
        return rule
      },
      async update(ruleId, patch) {
        const rule = found(
          store.priorityRules.find((candidate) => candidate.id === ruleId),
          'demo rule',
        )
        if (patch.matchValue !== undefined) rule.matchValue = patch.matchValue
        if (patch.matchCategory !== undefined) rule.matchCategory = patch.matchCategory
        if (patch.enabled !== undefined) rule.enabled = patch.enabled
        if (patch.note !== undefined) rule.note = patch.note
        rule.updatedAt = nowIso()
        return rule
      },
      async delete(ruleId) {
        store.priorityRules = store.priorityRules.filter((rule) => rule.id !== ruleId)
      },
      async learnedList() {
        return [...store.learnedPreferences].sort((a, b) => b.strength - a.strength)
      },
      async learnedToggle(preferenceId, enabled) {
        const preference = found(
          store.learnedPreferences.find((candidate) => candidate.id === preferenceId),
          'demo learned preference',
        )
        preference.enabled = enabled
        preference.updatedAt = nowIso()
        return preference
      },
      async learnedDelete(preferenceId) {
        store.learnedPreferences = store.learnedPreferences.filter(
          (preference) => preference.id !== preferenceId,
        )
      },
    },

    settings: {
      async preferences() {
        return store.preferences
      },
      async updatePreferences(patch) {
        // The zone lives on the profile, not on preferences.
        const { timeZone: zone, ...rest } = patch
        store.preferences = { ...store.preferences, ...rest, updatedAt: nowIso() }
        if (zone) store.profile.timeZone = zone
        return store.preferences
      },
      async notificationPrefs() {
        return store.notificationPreferences
      },
      async updateNotificationPrefs(patch) {
        store.notificationPreferences = {
          ...store.notificationPreferences,
          ...patch,
          categories: patch.categories ?? store.notificationPreferences.categories,
          updatedAt: nowIso(),
        }
        return store.notificationPreferences
      },
      async profile() {
        return store.profile
      },
      async updateProfile(patch) {
        store.profile = { ...store.profile, ...patch, updatedAt: nowIso() }
        return store.profile
      },
    },

    subscription: {
      async get() {
        return store.subscription
      },
      async refresh() {
        store.subscription = { ...store.subscription, updatedAt: nowIso() }
        return store.subscription
      },
    },

    referral: {
      async getCode() {
        return { ...store.referral }
      },
      async redeem(code) {
        if (code.trim().toUpperCase() === store.referral.code) {
          return { granted: false, bonusDays: 0, expiresAt: null, reason: 'referral_self' }
        }
        store.subscription = {
          ...store.subscription,
          status: 'trialing',
          trialEndsAt: new Date(now().getTime() + REFERRAL_BONUS_DAYS * DAY_MS).toISOString(),
          updatedAt: nowIso(),
        }
        return {
          granted: true,
          bonusDays: REFERRAL_BONUS_DAYS,
          expiresAt: store.subscription.trialEndsAt,
          reason: null,
        }
      },
    },

    privacy: {
      async requestExport() {
        const id = nextId()
        store.exports.push({
          id,
          ...owned(),
          status: 'processing',
          storagePath: null,
          sizeBytes: null,
          readyAt: null,
          expiresAt: null,
          failureReason: null,
        })
        return { requestId: id, status: 'processing', downloadUrl: null, expiresAt: null }
      },
      async exportStatus() {
        const latest = store.exports[store.exports.length - 1]
        if (!latest) return null
        return {
          requestId: latest.id,
          status: latest.status,
          downloadUrl: null,
          expiresAt: latest.expiresAt,
        }
      },
      async deleteHistory(input) {
        let deletedCount = 0
        const scope = input.scope
        if (scope === 'emails' || scope === 'all') {
          deletedCount += store.threads.length + store.messages.length
          store.threads = []
          store.messages = []
        }
        if (scope === 'briefings' || scope === 'all') {
          deletedCount += store.briefings.length + store.briefingItems.length
          store.briefings = []
          store.briefingItems = []
        }
        if (scope === 'assistant' || scope === 'all') {
          deletedCount += store.assistantThreads.length + store.assistantMessages.length
          store.assistantThreads = []
          store.assistantMessages = []
        }
        if (scope === 'captures' || scope === 'all') {
          deletedCount += store.captures.length
          store.captures = []
        }
        if (scope === 'memory' || scope === 'all') {
          deletedCount += store.insights.length
          store.insights = []
        }
        return { deletedCount }
      },
      async deleteAccount(input) {
        if (input.confirmationEmail.toLowerCase() !== store.profile.email.toLowerCase()) {
          throw new AppError('validation_failed', { detail: 'confirmation email mismatch' })
        }
        // The demo account resets rather than disappearing, so the app stays usable.
        store = createDemoStore(config.clock)
      },
    },

    notifications: {
      async registerToken(input) {
        const existing = store.pushTokens.find((token) => token.deviceId === input.deviceId)
        if (existing) {
          existing.token = input.token
          existing.lastSeenAt = nowIso()
          existing.disabledAt = null
          existing.updatedAt = nowIso()
          return existing
        }
        const pushToken = {
          id: nextId(),
          ...owned(),
          token: input.token,
          platform: input.platform,
          deviceId: input.deviceId,
          deviceName: input.deviceName ?? null,
          appVersion: input.appVersion ?? null,
          lastSeenAt: nowIso(),
          disabledAt: null,
        }
        store.pushTokens.push(pushToken)
        return pushToken
      },
      async unregisterToken(input) {
        for (const token of store.pushTokens) {
          if (token.deviceId === input.deviceId) {
            token.disabledAt = nowIso()
            token.updatedAt = nowIso()
          }
        }
      },
    },
  }
}
