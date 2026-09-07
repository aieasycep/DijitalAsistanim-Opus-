import {
  type EmailCategory,
  type Importance,
  type Locale,
  type PriorityCandidate,
  type Provider,
  evaluatePriority,
  fingerprintInput,
  looksLikeReplyExpected,
  triage,
  verifyDateAgainstSource,
} from './domain.ts'
import {
  LOW_CONFIDENCE_THRESHOLD,
  REJECT_CONFIDENCE_THRESHOLD,
  emailAnalysisSchema,
  stripUnverifiedClaims,
} from '@da/validation'
import { completeJson, isAiConfigured, truncateForModel } from './ai.ts'
import { sha256Hex } from './crypto.ts'
import { dbError, serviceClient } from './db.ts'
import { emailAnalysisSystem, emailAnalysisUser } from './prompts.ts'
import { upsertMemoryChunk } from './memory.ts'

/**
 * The mail ingestion pipeline.
 *
 * Cost is the design constraint. Three stages, in increasing order of expense:
 *
 *   1. a content hash, so an identical message is never processed twice;
 *   2. `triage()`, which settles bulk mail with deterministic rules alone;
 *   3. the model, reached only by what survives — typically a small fraction of
 *      an inbox.
 *
 * The second constraint is truth. Nothing the model produces is written
 * unchanged: a deadline has to survive both a quote check and an independent
 * date extraction against the original text, and a commitment has to carry a
 * sentence that really appears in the source.
 */

export interface DecodedLike {
  externalMessageId: string
  externalThreadId: string
  fromEmail: string
  fromName: string | null
  to: string[]
  cc: string[]
  subject: string
  bodyText: string
  sentAt: string
  headers: Record<string, string>
  externalUrl: string | null
  hasAttachments: boolean
  attachments: Array<{ externalId: string; filename: string; mimeType: string; sizeBytes: number }>
  /** Provider labels (Gmail) or categories (Graph). */
  labels: string[]
}

export interface IngestContext {
  userId: string
  timeZone: string
  locale: Locale
  connectedAccountId: string
  provider: Provider
  /** The signed-in user's own addresses, so their sent mail is recognised. */
  ownEmails: ReadonlySet<string>
  vipEmails: ReadonlySet<string>
  rules: Array<{
    kind: PriorityRuleKindLike
    matchValue: string
    enabled: boolean
    matchCategory: EmailCategory | null
  }>
  learned: Array<{
    kind: PriorityRuleKindLike
    matchValue: string
    strength: number
    enabled: boolean
  }>
  useLearnedPreferences: boolean
  now: Date
}

type PriorityRuleKindLike =
  | 'sender_always_important'
  | 'domain_always_important'
  | 'keyword_high_priority'
  | 'vip_always_notify'
  | 'category_low_priority'
  | 'mute_sender'

export async function loadIngestContext(
  userId: string,
  connectedAccountId: string,
  provider: Provider,
  now: Date,
): Promise<IngestContext> {
  const client = serviceClient()

  const [profile, prefs, account, contacts, rules, learned, accounts] = await Promise.all([
    client.from('profiles').select('time_zone, locale, email').eq('id', userId).maybeSingle(),
    client
      .from('user_preferences')
      .select('learn_from_interactions')
      .eq('user_id', userId)
      .maybeSingle(),
    client.from('connected_accounts').select('email').eq('id', connectedAccountId).maybeSingle(),
    client.from('contacts').select('email').eq('user_id', userId).eq('is_vip', true),
    client
      .from('priority_rules')
      .select('kind, match_value, enabled, match_category')
      .eq('user_id', userId)
      .eq('enabled', true)
      .is('deleted_at', null),
    client
      .from('learned_preferences')
      .select('kind, match_value, strength, enabled')
      .eq('user_id', userId)
      .eq('enabled', true),
    client.from('connected_accounts').select('email').eq('user_id', userId),
  ])

  if (profile.error) throw dbError(profile.error)

  const ownEmails = new Set<string>()
  const addOwn = (value: unknown) => {
    if (typeof value === 'string' && value.includes('@')) ownEmails.add(value.toLowerCase())
  }
  addOwn(profile.data?.email)
  addOwn(account.data?.email)
  for (const row of accounts.data ?? []) addOwn(row.email)

  return {
    userId,
    timeZone: (profile.data?.time_zone as string | null) ?? 'Europe/Istanbul',
    locale: ((profile.data?.locale as string | null) ?? 'tr') === 'en' ? 'en' : 'tr',
    connectedAccountId,
    provider,
    ownEmails,
    vipEmails: new Set(
      (contacts.data ?? [])
        .map((row) => String(row.email ?? '').toLowerCase())
        .filter((email) => email.includes('@')),
    ),
    rules: (rules.data ?? []).map((row) => ({
      kind: row.kind as PriorityRuleKindLike,
      matchValue: String(row.match_value ?? ''),
      enabled: true,
      matchCategory: (row.match_category as EmailCategory | null) ?? null,
    })),
    learned: (learned.data ?? []).map((row) => ({
      kind: row.kind as PriorityRuleKindLike,
      matchValue: String(row.match_value ?? ''),
      strength: Number(row.strength ?? 0),
      enabled: true,
    })),
    useLearnedPreferences: prefs.data?.learn_from_interactions !== false,
    now,
  }
}

export interface IngestResult {
  inserted: number
  analyzed: number
  skipped: number
  failed: number
}

/** Model calls run three at a time: enough to hide latency, few enough to stay
 *  inside both the provider's rate limit and the function's memory budget. */
const MODEL_CONCURRENCY = 3

export async function ingestMessages(
  context: IngestContext,
  messages: DecodedLike[],
): Promise<IngestResult> {
  const client = serviceClient()
  const result: IngestResult = { inserted: 0, analyzed: 0, skipped: 0, failed: 0 }

  const ruleSenders = new Set(
    context.rules
      .filter((r) => r.kind === 'sender_always_important')
      .map((r) => r.matchValue.toLowerCase()),
  )
  const ruleDomains = new Set(
    context.rules
      .filter((r) => r.kind === 'domain_always_important')
      .map((r) => r.matchValue.toLowerCase().replace(/^@/, '')),
  )
  const ruleKeywords = context.rules
    .filter((r) => r.kind === 'keyword_high_priority')
    .map((r) => r.matchValue.toLowerCase())

  // Persist first, decide second: an interrupted run must still leave the
  // messages stored so the next pass only has to redo the analysis.
  const pending: Array<{ message: DecodedLike; threadId: string; contentHash: string }> = []

  for (const message of messages) {
    try {
      const contentHash = await sha256Hex(
        fingerprintInput({
          fromEmail: message.fromEmail,
          subject: message.subject,
          bodyText: message.bodyText,
        }),
      )

      const existing = await client
        .from('email_messages')
        .select('id')
        .eq('user_id', context.userId)
        .eq('content_hash', contentHash)
        .maybeSingle()

      if (existing.data) {
        result.skipped++
        continue
      }

      const isFromUser = context.ownEmails.has(message.fromEmail.toLowerCase())

      const thread = await client
        .from('email_threads')
        .upsert(
          {
            user_id: context.userId,
            connected_account_id: context.connectedAccountId,
            external_thread_id: message.externalThreadId,
            subject: message.subject,
            participant_emails: [
              message.fromEmail,
              ...message.to,
              ...message.cc,
            ].filter(Boolean),
            last_message_at: message.sentAt,
            message_count: 1,
            is_read: isFromUser,
          },
          { onConflict: 'user_id,connected_account_id,external_thread_id', ignoreDuplicates: false },
        )
        .select('id')
        .single()

      if (thread.error || !thread.data) {
        result.failed++
        continue
      }

      const inserted = await client
        .from('email_messages')
        .insert({
          user_id: context.userId,
          thread_id: thread.data.id,
          connected_account_id: context.connectedAccountId,
          external_message_id: message.externalMessageId,
          from_email: message.fromEmail,
          from_name: message.fromName,
          to_emails: message.to,
          cc_emails: message.cc,
          subject: message.subject,
          snippet: message.bodyText.slice(0, 500),
          body_text: message.bodyText.slice(0, 100_000),
          sent_at: message.sentAt,
          is_from_user: isFromUser,
          has_attachments: message.hasAttachments,
          attachment_meta: message.attachments,
          content_hash: contentHash,
          external_url: message.externalUrl,
        })
        .select('id')
        .maybeSingle()

      if (inserted.error) {
        // A unique-violation here means a concurrent run already stored it.
        if (inserted.error.code !== '23505') result.failed++
        else result.skipped++
        continue
      }

      result.inserted++

      // Mail the user sent themselves is not triaged — it feeds the follow-up
      // engine instead, which is handled by its own pass.
      if (isFromUser) continue

      pending.push({ message, threadId: thread.data.id, contentHash })
    } catch {
      result.failed++
    }
  }

  // ── Triage, then model, then priority ──────────────────────────────────────
  const needsModel: Array<{
    message: DecodedLike
    threadId: string
    presumedCategory: EmailCategory | null
  }> = []

  for (const item of pending) {
    const decision = triage({
      fromEmail: item.message.fromEmail,
      fromName: item.message.fromName,
      subject: item.message.subject,
      snippet: item.message.bodyText.slice(0, 800),
      providerLabels: item.message.labels,
      headers: item.message.headers,
      isDirectlyAddressed: item.message.to.some((address) =>
        context.ownEmails.has(address.toLowerCase()),
      ),
      vipEmails: context.vipEmails,
      ruleImportantSenders: ruleSenders,
      ruleImportantDomains: ruleDomains,
      ruleKeywords,
    })

    if (!decision.sendToModel) {
      // Settled deterministically: write the classification and skip the model.
      await writeThreadAnalysis(context, item.threadId, item.message, {
        summary: null,
        importance: decision.importance,
        category: decision.category,
        reasonImportant: null,
        requiresUserAction: false,
        deadline: null,
        deadlineQuote: null,
        confidence: 1,
      })
      continue
    }

    if (!isAiConfigured()) {
      // Without a model the deterministic signal is still worth recording —
      // the feed ranks by rules and VIPs, just without a summary.
      await writeThreadAnalysis(context, item.threadId, item.message, {
        summary: null,
        importance: decision.presumedCategory === 'security' ? 'critical' : 'normal',
        category: decision.presumedCategory ?? 'information',
        reasonImportant: null,
        requiresUserAction: true,
        deadline: null,
        deadlineQuote: null,
        confidence: 0.4,
      })
      continue
    }

    needsModel.push({
      message: item.message,
      threadId: item.threadId,
      presumedCategory: decision.presumedCategory,
    })
  }

  for (let i = 0; i < needsModel.length; i += MODEL_CONCURRENCY) {
    const batch = needsModel.slice(i, i + MODEL_CONCURRENCY)
    const outcomes = await Promise.allSettled(
      batch.map((item) => analyzeOne(context, item.threadId, item.message)),
    )
    for (const outcome of outcomes) {
      if (outcome.status === 'fulfilled') result.analyzed++
      else result.failed++
    }
  }

  return result
}

interface ThreadAnalysis {
  summary: string | null
  importance: Importance
  category: EmailCategory
  reasonImportant: string | null
  requiresUserAction: boolean
  deadline: string | null
  deadlineQuote: string | null
  confidence: number
}

async function analyzeOne(
  context: IngestContext,
  threadId: string,
  message: DecodedLike,
): Promise<void> {
  const body = truncateForModel(message.bodyText)

  const analysis = await completeJson({
    userId: context.userId,
    operation: 'email_analysis',
    parse: (value) => emailAnalysisSchema.safeParse(value),
    request: {
      tier: 'fast',
      schemaName: 'email_analysis',
      jsonSchema: EMAIL_ANALYSIS_JSON_SCHEMA,
      system: emailAnalysisSystem(context.locale, context.now.toISOString(), context.timeZone),
      messages: [
        {
          role: 'user',
          content: emailAnalysisUser({
            subject: message.subject,
            from: `${message.fromName ?? ''} <${message.fromEmail}>`.trim(),
            to: message.to.join(', '),
            sentAt: message.sentAt,
            body,
            isThread: false,
          }),
        },
      ],
      maxOutputTokens: 1500,
    },
  })

  // Drop anything the model could not quote from the source.
  const { analysis: verified } = stripUnverifiedClaims(analysis, message.bodyText)

  // A quote can be genuine while the *date* it was read as is wrong, so the
  // deadline is independently re-derived from the text and discarded when the
  // extractor cannot find it.
  let deadline = verified.deadline
  if (deadline) {
    const found = verifyDateAgainstSource(
      deadline,
      message.bodyText,
      context.now,
      context.timeZone,
    )
    if (!found) deadline = null
  }

  if (verified.confidence < REJECT_CONFIDENCE_THRESHOLD) {
    // Too uncertain to assert anything: keep the message, drop the reading.
    await writeThreadAnalysis(context, threadId, message, {
      summary: null,
      importance: 'normal',
      category: 'information',
      reasonImportant: null,
      requiresUserAction: false,
      deadline: null,
      deadlineQuote: null,
      confidence: verified.confidence,
    })
    return
  }

  await writeThreadAnalysis(context, threadId, message, {
    summary: verified.summary,
    importance: verified.importance,
    category: verified.category,
    reasonImportant: verified.reasonImportant,
    requiresUserAction: verified.requiresUserAction,
    deadline,
    deadlineQuote: deadline ? verified.deadlineQuote : null,
    confidence: verified.confidence,
  })

  const client = serviceClient()

  for (const commitment of verified.commitments) {
    if (commitment.confidence < REJECT_CONFIDENCE_THRESHOLD) continue
    await client.from('commitments').insert({
      user_id: context.userId,
      text: commitment.text,
      direction: commitment.direction,
      person_name: commitment.personName,
      due_at: commitment.dueAt,
      status: 'open',
      source_type: 'email',
      source_id: threadId,
      source_quote: commitment.sourceQuote,
      confidence: commitment.confidence,
      // Below the confidence bar the UI asks the user to confirm before the
      // commitment starts counting against them.
      confirmed_by_user: commitment.confidence >= LOW_CONFIDENCE_THRESHOLD,
    })
  }

  if (verified.summary) {
    await upsertMemoryChunk({
      userId: context.userId,
      content: `${message.subject}\n${verified.summary}`,
      sourceType: 'email',
      sourceId: threadId,
      sourceLabel: `${message.fromName ?? message.fromEmail}`,
      occurredAt: message.sentAt,
      topic: verified.category,
    })
  }
}

async function writeThreadAnalysis(
  context: IngestContext,
  threadId: string,
  message: DecodedLike,
  analysis: ThreadAnalysis,
): Promise<void> {
  const candidate = toPriorityCandidate(context, message, analysis)
  const priority = evaluatePriority(candidate, {
    now: context.now,
    rules: context.rules,
    learned: context.learned,
    vipEmails: context.vipEmails,
    useLearnedPreferences: context.useLearnedPreferences,
  })

  const { error } = await serviceClient()
    .from('email_threads')
    .update({
      summary: analysis.summary,
      importance: priority.importance,
      category: analysis.category,
      reason_important: analysis.reasonImportant,
      requires_user_action: analysis.requiresUserAction,
      deadline: analysis.deadline,
      deadline_quote: analysis.deadlineQuote,
      confidence: analysis.confidence,
      priority_score: priority.score,
      // A muted sender is hidden from the feed rather than merely ranked last.
      suppressed_at: priority.muted ? context.now.toISOString() : null,
    })
    .eq('id', threadId)
    .eq('user_id', context.userId)

  if (error) throw dbError(error)
}

export function toPriorityCandidate(
  context: IngestContext,
  message: DecodedLike,
  analysis: ThreadAnalysis,
): PriorityCandidate {
  return {
    senderEmail: message.fromEmail,
    senderName: message.fromName,
    subject: message.subject,
    snippet: message.bodyText.slice(0, 800),
    category: analysis.category,
    aiImportance: analysis.importance,
    aiConfidence: analysis.confidence,
    requiresUserAction: analysis.requiresUserAction,
    deadline: analysis.deadline,
    awaitingUserReply:
      analysis.requiresUserAction || looksLikeReplyExpected(message.bodyText.slice(0, 2000)),
    hasUserCommitment: false,
    relatedMeetingWithinHours: null,
    receivedAt: message.sentAt,
  }
}

/**
 * JSON Schema mirroring `emailAnalysisSchema`.
 *
 * The two are kept in step by `supabase/tests/ai-schema-parity.test.ts`: the
 * provider needs JSON Schema to constrain generation, and Zod validates what
 * comes back, so a drift between them would silently stop constraining output.
 */
export const EMAIL_ANALYSIS_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary',
    'importance',
    'category',
    'reasonImportant',
    'requiresUserAction',
    'deadline',
    'deadlineQuote',
    'people',
    'commitments',
    'followUp',
    'suggestedActions',
    'confidence',
  ],
  properties: {
    summary: { type: 'string', maxLength: 600 },
    importance: { type: 'string', enum: ['critical', 'high', 'normal', 'low'] },
    category: {
      type: 'string',
      enum: [
        'action_required',
        'waiting_for_user',
        'waiting_for_other',
        'deadline',
        'meeting',
        'travel',
        'shipment',
        'payment',
        'subscription',
        'security',
        'information',
        'promotion',
      ],
    },
    reasonImportant: { type: ['string', 'null'], maxLength: 300 },
    requiresUserAction: { type: 'boolean' },
    deadline: { type: ['string', 'null'] },
    deadlineQuote: { type: ['string', 'null'], maxLength: 600 },
    people: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'email', 'role'],
        properties: {
          name: { type: 'string', maxLength: 120 },
          email: { type: ['string', 'null'] },
          role: { type: 'string', enum: ['sender', 'recipient', 'mentioned'] },
        },
      },
    },
    commitments: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'direction', 'personName', 'dueAt', 'sourceQuote', 'confidence'],
        properties: {
          text: { type: 'string', maxLength: 500 },
          direction: { type: 'string', enum: ['user_owes', 'other_owes'] },
          personName: { type: ['string', 'null'], maxLength: 120 },
          dueAt: { type: ['string', 'null'] },
          sourceQuote: { type: 'string', maxLength: 600 },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
    followUp: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['expectsReply', 'awaiting'],
      properties: {
        expectsReply: { type: 'boolean' },
        awaiting: { type: 'string', enum: ['user', 'other', 'nobody'] },
      },
    },
    suggestedActions: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'label', 'params'],
        properties: {
          kind: {
            type: 'string',
            enum: [
              'open_source',
              'draft_reply',
              'create_task',
              'add_to_calendar',
              'set_reminder',
              'prepare_meeting',
              'mark_done',
              'track_shipment',
              'open_person',
              'dismiss',
            ],
          },
          label: { type: 'string', maxLength: 60 },
          params: { type: 'object', additionalProperties: { type: 'string' } },
        },
      },
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
}
