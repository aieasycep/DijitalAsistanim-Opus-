import {
  type BriefingKind,
  type BriefingSection,
  type Importance,
  type Locale,
  addLocalDays,
  endOfLocalDay,
  estimateTimeSaved,
  startOfLocalDay,
  startOfLocalWeek,
  toIsoDate,
} from './domain.ts'
import { briefingGenerationSchema } from '@da/validation'
import { completeJson, isAiConfigured } from './ai.ts'
import { sha256Hex } from './crypto.ts'
import { dbError, serviceClient } from './db.ts'
import { briefingSystem } from './prompts.ts'

/**
 * Briefing construction.
 *
 * Two properties matter more than the prose:
 *
 *  - a briefing is only worth sending when something changed. The content hash
 *    over the input ids is what lets the midday pulse skip itself instead of
 *    repeating the morning, which is the difference between a useful nudge and
 *    a notification people turn off.
 *  - it works without an AI key. The narrative is composed deterministically in
 *    that case, so the product's core loop is never gated on a credential.
 */

export interface BriefingInputs {
  insights: Array<{ id: string; title: string; detail: string | null; importance: Importance }>
  events: Array<{ id: string; title: string; startsAt: string; location: string | null }>
  commitments: Array<{ id: string; text: string; personName: string | null; dueAt: string | null }>
  followUps: Array<{ id: string; recipient: string; sentAt: string }>
  deadlines: Array<{ id: string; title: string; deadline: string }>
  lifeEvents: Array<{ id: string; title: string; type: string; occursAt: string | null }>
  stats: {
    emailsAnalyzed: number
    importantCount: number
    threadsSummarized: number
    draftsUsed: number
    meetingPreps: number
  }
}

export interface CollectedBriefing {
  inputs: BriefingInputs
  contentHash: string
  isEmpty: boolean
}

export async function collectBriefingInputs(
  userId: string,
  kind: BriefingKind,
  forDate: string,
  timeZone: string,
  now: Date,
): Promise<CollectedBriefing> {
  const client = serviceClient()
  const anchor = new Date(`${forDate}T12:00:00Z`)

  const windowStart =
    kind === 'weekly' ? startOfLocalWeek(anchor, timeZone) : startOfLocalDay(anchor, timeZone)
  const windowEnd =
    kind === 'weekly'
      ? addLocalDays(windowStart, 7, timeZone)
      : // The evening close has to reach into tomorrow to name the first thing
        // on it; the morning briefing stops at today's end.
        kind === 'evening'
        ? addLocalDays(endOfLocalDay(anchor, timeZone), 1, timeZone)
        : endOfLocalDay(anchor, timeZone)

  const [insights, events, commitments, followUps, threads, lifeEvents, usage] = await Promise.all([
    client
      .from('insights')
      .select('id, title, detail, importance, priority_score')
      .eq('user_id', userId)
      .eq('for_date', forDate)
      .is('dismissed_at', null)
      .is('completed_at', null)
      .order('priority_score', { ascending: false })
      .limit(8),
    client
      .from('calendar_events')
      .select('id, title, starts_at, location')
      .eq('user_id', userId)
      .neq('status', 'cancelled')
      .gte('ends_at', (kind === 'evening' ? endOfLocalDay(anchor, timeZone) : windowStart).toISOString())
      .lte('starts_at', windowEnd.toISOString())
      .order('starts_at', { ascending: true })
      .limit(10),
    client
      .from('commitments')
      .select('id, text, person_name, due_at')
      .eq('user_id', userId)
      .in('status', ['open', 'overdue'])
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(8),
    client
      .from('follow_ups')
      .select('id, recipient_email, recipient_name, sent_at')
      .eq('user_id', userId)
      .eq('status', 'waiting')
      .lte('due_at', now.toISOString())
      .limit(6),
    client
      .from('email_threads')
      .select('id, subject, deadline')
      .eq('user_id', userId)
      .not('deadline', 'is', null)
      .gte('deadline', windowStart.toISOString())
      .is('suppressed_at', null)
      .order('deadline', { ascending: true })
      .limit(6),
    client
      .from('life_events')
      .select('id, title, type, occurs_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('occurs_at', { ascending: true, nullsFirst: false })
      .limit(6),
    client
      .from('email_threads')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('last_message_at', windowStart.toISOString()),
  ])

  for (const result of [insights, events, commitments, followUps, threads, lifeEvents]) {
    if (result.error) throw dbError(result.error)
  }

  const summarized = (insights.data ?? []).length

  const inputs: BriefingInputs = {
    insights: (insights.data ?? []).map((row) => ({
      id: row.id as string,
      title: (row.title as string | null) ?? '',
      detail: (row.detail as string | null) ?? null,
      importance: (row.importance as Importance | null) ?? 'normal',
    })),
    events: (events.data ?? []).map((row) => ({
      id: row.id as string,
      title: (row.title as string | null) ?? '',
      startsAt: row.starts_at as string,
      location: (row.location as string | null) ?? null,
    })),
    commitments: (commitments.data ?? []).map((row) => ({
      id: row.id as string,
      text: (row.text as string | null) ?? '',
      personName: (row.person_name as string | null) ?? null,
      dueAt: (row.due_at as string | null) ?? null,
    })),
    followUps: (followUps.data ?? []).map((row) => ({
      id: row.id as string,
      recipient: (row.recipient_name as string | null) ?? (row.recipient_email as string),
      sentAt: row.sent_at as string,
    })),
    deadlines: (threads.data ?? []).map((row) => ({
      id: row.id as string,
      title: (row.subject as string | null) ?? '',
      deadline: row.deadline as string,
    })),
    lifeEvents: (lifeEvents.data ?? []).map((row) => ({
      id: row.id as string,
      title: (row.title as string | null) ?? '',
      type: row.type as string,
      occursAt: (row.occurs_at as string | null) ?? null,
    })),
    stats: {
      emailsAnalyzed: usage.count ?? 0,
      importantCount: (insights.data ?? []).length,
      threadsSummarized: summarized,
      draftsUsed: 0,
      meetingPreps: 0,
    },
  }

  // The hash covers what the briefing would *say*, not when it was built, so
  // an unchanged day produces an identical hash and the pulse is skipped.
  const fingerprint = [
    ...inputs.insights.map((i) => `i:${i.id}:${i.importance}`),
    ...inputs.events.map((e) => `e:${e.id}:${e.startsAt}`),
    ...inputs.commitments.map((c) => `c:${c.id}:${c.dueAt ?? ''}`),
    ...inputs.followUps.map((f) => `f:${f.id}`),
    ...inputs.deadlines.map((d) => `d:${d.id}:${d.deadline}`),
    ...inputs.lifeEvents.map((l) => `l:${l.id}`),
  ]
    .sort()
    .join('|')

  const isEmpty =
    inputs.insights.length === 0 &&
    inputs.events.length === 0 &&
    inputs.commitments.length === 0 &&
    inputs.followUps.length === 0 &&
    inputs.deadlines.length === 0 &&
    inputs.lifeEvents.length === 0

  return { inputs, contentHash: await sha256Hex(fingerprint), isEmpty }
}

export interface BuiltBriefing {
  headline: string
  narrative: string
  items: Array<{
    section: BriefingSection
    title: string
    detail: string | null
    importance: Importance
    sourceId: string | null
    sourceType: string | null
  }>
  durationSeconds: number
}

/** Roughly 190 words a minute read aloud, which matches the TTS pacing. */
function readingSeconds(text: string): number {
  const words = text.trim().split(/\s+/).length
  return Math.max(20, Math.round((words / 190) * 60))
}

export async function buildBriefing(
  userId: string,
  kind: BriefingKind,
  locale: Locale,
  userName: string | null,
  timeZone: string,
  now: Date,
  inputs: BriefingInputs,
): Promise<BuiltBriefing> {
  const knownIds = new Set([
    ...inputs.insights.map((i) => i.id),
    ...inputs.events.map((e) => e.id),
    ...inputs.commitments.map((c) => c.id),
    ...inputs.followUps.map((f) => f.id),
    ...inputs.deadlines.map((d) => d.id),
    ...inputs.lifeEvents.map((l) => l.id),
  ])

  if (isAiConfigured()) {
    try {
      const generated = await completeJson({
        userId,
        operation: `briefing_${kind}`,
        parse: (value) => briefingGenerationSchema.safeParse(value),
        request: {
          tier: 'reasoning',
          schemaName: 'briefing',
          jsonSchema: BRIEFING_JSON_SCHEMA,
          system: briefingSystem({ locale, kind, userName, nowIso: now.toISOString(), timeZone }),
          messages: [{ role: 'user', content: JSON.stringify(inputs, null, 2) }],
          maxOutputTokens: 2000,
          temperature: 0.4,
        },
      })

      // Anything the model attached to an id that was not in the input set is
      // dropped: a briefing item must point at a record the user can open.
      const items = generated.items
        .filter((item) => item.sourceId === null || knownIds.has(item.sourceId))
        .map((item) => ({
          section: item.section,
          title: item.title,
          detail: item.detail,
          importance: item.importance,
          sourceId: item.sourceId,
          sourceType: item.sourceType,
        }))

      return {
        headline: generated.headline,
        narrative: generated.narrative,
        items,
        durationSeconds: readingSeconds(generated.narrative),
      }
    } catch {
      // Fall through to the deterministic builder: a model outage degrades the
      // prose, it does not remove the briefing.
    }
  }

  return buildDeterministicBriefing(kind, locale, userName, inputs, timeZone)
}

const SECTION_FOR = {
  priorities: 'priorities',
  schedule: 'schedule',
  expected: 'expected_from_you',
  waiting: 'waiting_on_others',
  deadlines: 'deadlines',
  personal: 'personal',
} as const satisfies Record<string, BriefingSection>

/**
 * The no-AI briefing.
 *
 * Plain, accurate and assembled from the same inputs. It reads as a summary
 * rather than as an essay, which is the honest thing for a build with no model
 * behind it.
 */
function buildDeterministicBriefing(
  kind: BriefingKind,
  locale: Locale,
  userName: string | null,
  inputs: BriefingInputs,
  timeZone: string,
): BuiltBriefing {
  const tr = locale === 'tr'
  const count = inputs.insights.length

  const headline = tr
    ? count === 0
      ? 'Bugün acil bir şey yok.'
      : `Bugün bilmen gereken ${count} şey var.`
    : count === 0
      ? 'Nothing urgent today.'
      : `There ${count === 1 ? 'is' : 'are'} ${count} thing${count === 1 ? '' : 's'} to know today.`

  const lines: string[] = []
  if (userName) lines.push(tr ? `Merhaba ${userName}.` : `Hello ${userName}.`)

  if (inputs.insights.length > 0) {
    lines.push(
      tr
        ? `Öne çıkan ${inputs.insights.length} konu var: ${inputs.insights
            .slice(0, 3)
            .map((i) => i.title)
            .join('; ')}.`
        : `${inputs.insights.length} things stand out: ${inputs.insights
            .slice(0, 3)
            .map((i) => i.title)
            .join('; ')}.`,
    )
  }

  if (inputs.events.length > 0) {
    const first = inputs.events[0]
    const time = first
      ? new Intl.DateTimeFormat(tr ? 'tr-TR' : 'en-GB', {
          timeZone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(new Date(first.startsAt))
      : ''
    lines.push(
      tr
        ? `Takviminde ${inputs.events.length} etkinlik var; ilki ${time}'de "${first?.title ?? ''}".`
        : `You have ${inputs.events.length} events; the first is "${first?.title ?? ''}" at ${time}.`,
    )
  } else {
    lines.push(tr ? 'Takvimin bugün oldukça sakin.' : 'Your calendar is quiet today.')
  }

  if (inputs.commitments.length > 0) {
    lines.push(
      tr
        ? `Senden beklenen ${inputs.commitments.length} şey açık duruyor.`
        : `${inputs.commitments.length} commitments are still open on your side.`,
    )
  }
  if (inputs.followUps.length > 0) {
    lines.push(
      tr
        ? `${inputs.followUps.length} konuşmada hâlâ dönüş bekliyorsun.`
        : `You are still waiting on ${inputs.followUps.length} conversations.`,
    )
  }
  if (inputs.deadlines.length > 0) {
    lines.push(
      tr
        ? `${inputs.deadlines.length} son tarih yaklaşıyor.`
        : `${inputs.deadlines.length} deadlines are approaching.`,
    )
  }

  const narrative = lines.join(' ')

  const items: BuiltBriefing['items'] = [
    ...inputs.insights.map((i) => ({
      section: SECTION_FOR.priorities,
      title: i.title,
      detail: i.detail,
      importance: i.importance,
      sourceId: i.id,
      sourceType: 'email' as const,
    })),
    ...inputs.events.map((e) => ({
      section: SECTION_FOR.schedule,
      title: e.title,
      detail: e.location,
      importance: 'normal' as Importance,
      sourceId: e.id,
      sourceType: 'calendar_event' as const,
    })),
    ...inputs.commitments.map((c) => ({
      section: SECTION_FOR.expected,
      title: c.text,
      detail: c.personName,
      importance: 'high' as Importance,
      sourceId: c.id,
      sourceType: 'commitment' as const,
    })),
    ...inputs.followUps.map((f) => ({
      section: SECTION_FOR.waiting,
      title: f.recipient,
      detail: null,
      importance: 'normal' as Importance,
      sourceId: f.id,
      sourceType: 'email' as const,
    })),
    ...inputs.deadlines.map((d) => ({
      section: SECTION_FOR.deadlines,
      title: d.title,
      detail: null,
      importance: 'high' as Importance,
      sourceId: d.id,
      sourceType: 'email' as const,
    })),
    ...inputs.lifeEvents.map((l) => ({
      section: SECTION_FOR.personal,
      title: l.title,
      detail: l.type,
      importance: 'normal' as Importance,
      sourceId: l.id,
      sourceType: 'email' as const,
    })),
  ]

  return { headline, narrative, items, durationSeconds: readingSeconds(narrative) }
}

export function briefingStats(inputs: BriefingInputs): Record<string, number> {
  const saved = estimateTimeSaved({
    emailsTriagedWithoutOpening: Math.max(0, inputs.stats.emailsAnalyzed - inputs.stats.importantCount),
    threadsReadAsSummary: inputs.stats.threadsSummarized,
    draftsUsed: inputs.stats.draftsUsed,
    meetingPrepsOpened: inputs.stats.meetingPreps,
    followUpsSurfaced: inputs.followUps.length,
    commitmentsCaptured: inputs.commitments.length,
  })

  return {
    emailsAnalyzed: inputs.stats.emailsAnalyzed,
    importantCount: inputs.stats.importantCount,
    meetingCount: inputs.events.length,
    deadlineCount: inputs.deadlines.length,
    followUpCount: inputs.followUps.length,
    estimatedMinutesSaved: saved.totalMinutes,
  }
}

/** Date helper the briefing functions share. */
export function briefingDateFor(kind: BriefingKind, now: Date, timeZone: string): string {
  return toIsoDate(kind === 'weekly' ? startOfLocalWeek(now, timeZone) : now, timeZone)
}

export const BRIEFING_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'narrative', 'items'],
  properties: {
    headline: { type: 'string', maxLength: 160 },
    narrative: { type: 'string', maxLength: 4000 },
    items: {
      type: 'array',
      maxItems: 30,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['section', 'title', 'detail', 'importance', 'sourceId', 'sourceType'],
        properties: {
          section: {
            type: 'string',
            enum: [
              'priorities',
              'schedule',
              'expected_from_you',
              'waiting_on_others',
              'deadlines',
              'personal',
            ],
          },
          title: { type: 'string', maxLength: 200 },
          detail: { type: ['string', 'null'], maxLength: 500 },
          importance: { type: 'string', enum: ['critical', 'high', 'normal', 'low'] },
          sourceId: { type: ['string', 'null'], maxLength: 100 },
          sourceType: {
            type: ['string', 'null'],
            enum: ['email', 'calendar_event', 'task', 'commitment', 'capture', 'notification', null],
          },
        },
      },
    },
  },
}
