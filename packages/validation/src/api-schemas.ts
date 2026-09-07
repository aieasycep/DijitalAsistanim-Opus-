import {
  ACCOUNT_KINDS,
  APPROVAL_ACTION_TYPES,
  BRIEFING_KINDS,
  CAPTURE_KINDS,
  COMMITMENT_DIRECTIONS,
  FEEDBACK_SIGNALS,
  LOCALES,
  LOCK_SCREEN_PRIVACY,
  NOTIFICATION_CATEGORIES,
  PRIORITY_RULE_KINDS,
  PROVIDERS,
  REMINDER_PRESETS,
  REPLY_TONES,
  RETENTION_WINDOWS,
} from '@da/domain'
import { z } from 'zod'
import {
  confidenceSchema,
  emailSchema,
  isoDateSchema,
  isoInstantSchema,
  localTimeSchema,
  paginationSchema,
  safeUrlSchema,
  timeZoneSchema,
  uuidSchema,
} from './primitives.ts'

/**
 * Request and response shapes for every edge function. Both sides import
 * these, so a client and a server can never disagree about a payload — and
 * every function validates its body before touching the database.
 */

export const apiErrorSchema = z.object({
  code: z.string(),
  retryable: z.boolean(),
  values: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
})

export type ApiError = z.infer<typeof apiErrorSchema>

// ── OAuth ───────────────────────────────────────────────────────────────────

export const oauthStartRequestSchema = z.object({
  provider: z.enum(['google', 'microsoft']),
  kinds: z.array(z.enum(ACCOUNT_KINDS)).min(1),
  /** Extra scope groups for progressive authorization. */
  additionalScopeGroups: z
    .array(z.enum(['mailSend', 'calendarWrite', 'tasksWrite', 'contactsRead', 'tasksRead']))
    .default([]),
  /** Where the app should land after the browser round trip. */
  redirectTo: z.string().max(500),
})

export const oauthStartResponseSchema = z.object({
  authorizeUrl: z.string().url(),
  state: z.string(),
})

export const oauthCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1),
  error: z.string().optional(),
  error_description: z.string().optional(),
})

export const disconnectAccountRequestSchema = z.object({
  connectedAccountId: uuidSchema,
  /** Attempt provider-side revocation as well as local deletion. */
  revoke: z.boolean().default(true),
})

// ── Sync ────────────────────────────────────────────────────────────────────

export const syncRequestSchema = z.object({
  connectedAccountId: uuidSchema.optional(),
  resources: z.array(z.enum(ACCOUNT_KINDS)).default(['mail', 'calendar']),
  /** Force a full re-read rather than following the stored delta cursor. */
  full: z.boolean().default(false),
})

export const syncResponseSchema = z.object({
  started: z.boolean(),
  jobIds: z.array(z.string()).default([]),
})

export const initialAnalysisRequestSchema = z.object({
  /** The onboarding pass reads back this far; the rest is backfilled later. */
  hours: z.number().int().min(1).max(168).default(72),
})

export const initialAnalysisProgressSchema = z.object({
  phase: z.enum(['queued', 'mail', 'analysis', 'calendar', 'follow_ups', 'briefing', 'done', 'failed']),
  emailsFound: z.number().int().min(0),
  importantFound: z.number().int().min(0),
  meetingsFound: z.number().int().min(0),
  followUpsFound: z.number().int().min(0),
  /** 0..1 */
  progress: z.number().min(0).max(1),
  briefingId: uuidSchema.nullable(),
  errorCode: z.string().nullable(),
})

export type InitialAnalysisProgress = z.infer<typeof initialAnalysisProgressSchema>

// ── Briefings ───────────────────────────────────────────────────────────────

export const generateBriefingRequestSchema = z.object({
  kind: z.enum(BRIEFING_KINDS),
  forDate: isoDateSchema.optional(),
  /** Regenerate even if one already exists for the date. */
  force: z.boolean().default(false),
})

export const briefingAudioRequestSchema = z.object({
  briefingId: uuidSchema,
  voice: z.string().max(60).nullish(),
  speed: z.number().min(0.5).max(2).default(1),
})

export const briefingAudioResponseSchema = z.object({
  /** Null when no server-side TTS provider is configured — the client falls
   *  back to on-device speech synthesis and the feature still works. */
  audioUrl: z.string().url().nullable(),
  provider: z.string().nullable(),
  /** Text the device should speak when `audioUrl` is null. */
  ssmlOrText: z.string(),
  durationSeconds: z.number().int().min(0).nullable(),
})

// ── Approvals ───────────────────────────────────────────────────────────────

export const emailSendPayloadSchema = z.object({
  kind: z.literal('email_send'),
  connectedAccountId: uuidSchema,
  threadId: uuidSchema.nullable(),
  inReplyToMessageId: z.string().max(500).nullable(),
  to: z.array(emailSchema).min(1).max(25),
  cc: z.array(emailSchema).max(25).default([]),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(20000),
  tone: z.enum(REPLY_TONES),
})

export const calendarCreatePayloadSchema = z.object({
  kind: z.literal('calendar_create'),
  connectedAccountId: uuidSchema,
  title: z.string().min(1).max(300),
  description: z.string().max(4000).nullable(),
  location: z.string().max(300).nullable(),
  startsAt: isoInstantSchema,
  endsAt: isoInstantSchema,
  timeZone: timeZoneSchema,
  attendees: z.array(emailSchema).max(50).default([]),
})

export const calendarUpdatePayloadSchema = z.object({
  kind: z.literal('calendar_update'),
  connectedAccountId: uuidSchema,
  eventId: uuidSchema,
  externalEventId: z.string().min(1).max(500),
  changes: z.object({
    title: z.string().min(1).max(300).optional(),
    startsAt: isoInstantSchema.optional(),
    endsAt: isoInstantSchema.optional(),
    location: z.string().max(300).nullable().optional(),
  }),
  expectedProviderUpdatedAt: isoInstantSchema.nullable(),
})

export const taskCreatePayloadSchema = z.object({
  kind: z.literal('task_create'),
  connectedAccountId: uuidSchema.nullable(),
  title: z.string().min(1).max(300),
  notes: z.string().max(4000).nullable(),
  dueAt: isoInstantSchema.nullable(),
})

export const reminderCreatePayloadSchema = z.object({
  kind: z.literal('reminder_create'),
  title: z.string().min(1).max(300),
  body: z.string().max(1000).nullable(),
  remindAt: isoInstantSchema,
  preset: z.enum(REMINDER_PRESETS),
  relatedEntityType: z
    .enum(['email', 'calendar_event', 'task', 'capture', 'commitment', 'notification', 'contact'])
    .nullable(),
  relatedEntityId: z.string().max(100).nullable(),
})

export const commitmentCreatePayloadSchema = z.object({
  kind: z.literal('commitment_create'),
  text: z.string().min(3).max(500),
  direction: z.enum(COMMITMENT_DIRECTIONS),
  personName: z.string().max(120).nullable(),
  dueAt: isoInstantSchema.nullable(),
  quote: z.string().min(1).max(600),
})

export const approvalPayloadSchema = z.discriminatedUnion('kind', [
  emailSendPayloadSchema,
  calendarCreatePayloadSchema,
  calendarUpdatePayloadSchema,
  taskCreatePayloadSchema,
  reminderCreatePayloadSchema,
  commitmentCreatePayloadSchema,
])

export type ApprovalPayloadInput = z.infer<typeof approvalPayloadSchema>

export const createApprovalRequestSchema = z.object({
  type: z.enum(APPROVAL_ACTION_TYPES),
  what: z.string().min(1).max(200),
  why: z.string().min(1).max(300),
  payload: approvalPayloadSchema,
  sourceType: z
    .enum(['email', 'calendar_event', 'task', 'capture', 'commitment', 'notification', 'contact', 'user_input'])
    .nullable()
    .default(null),
  sourceId: z.string().max(100).nullable().default(null),
  /** Caller-supplied discriminator folded into the idempotency key. */
  discriminator: z.string().min(1).max(120),
})

export const decideApprovalRequestSchema = z.object({
  approvalId: uuidSchema,
  decision: z.enum(['approve', 'reject']),
  /** Present when the user edited the proposal before approving. */
  editedPayload: approvalPayloadSchema.optional(),
})

export const approvalResultSchema = z.object({
  approvalId: uuidSchema,
  status: z.enum(['pending', 'approved', 'rejected', 'executing', 'executed', 'failed', 'expired']),
  resultRef: z.string().nullable(),
  failureCode: z.string().nullable(),
  /** Set when the provider needs a scope the account has not granted yet. */
  missingScopes: z.array(z.string()).default([]),
})

export type ApprovalResult = z.infer<typeof approvalResultSchema>

// ── Assistant ───────────────────────────────────────────────────────────────

export const assistantAskRequestSchema = z.object({
  threadId: uuidSchema.nullable(),
  question: z.string().min(1).max(2000),
  /** Voice turns keep the transcript only; audio is never uploaded or stored. */
  wasVoice: z.boolean().default(false),
})

export const assistantAskResponseSchema = z.object({
  threadId: uuidSchema,
  messageId: uuidSchema,
  answer: z.string(),
  citations: z
    .array(
      z.object({
        sourceType: z.string(),
        sourceId: z.string(),
        label: z.string(),
        occurredAt: isoInstantSchema.nullable(),
      }),
    )
    .default([]),
  proposedApprovalId: uuidSchema.nullable(),
  grounded: z.boolean(),
})

export const transcribeRequestSchema = z.object({
  /** Base64 audio, capped well below the edge function body limit. */
  audioBase64: z.string().max(8_000_000),
  mimeType: z.string().max(100),
  locale: z.enum(LOCALES).default('tr'),
})

export const transcribeResponseSchema = z.object({
  text: z.string(),
  provider: z.string().nullable(),
  confidence: confidenceSchema.nullable(),
})

// ── Search / memory ─────────────────────────────────────────────────────────

export const searchRequestSchema = paginationSchema.extend({
  query: z.string().min(1).max(300),
  types: z
    .array(z.enum(['email', 'calendar_event', 'task', 'commitment', 'capture', 'contact', 'life_event']))
    .default([]),
})

export const searchResultSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  snippet: z.string(),
  occurredAt: isoInstantSchema.nullable(),
  /** Relevance in 0..1; vector when embeddings are configured, FTS rank otherwise. */
  score: z.number(),
  sourceLabel: z.string(),
})

export const searchResponseSchema = z.object({
  results: z.array(searchResultSchema),
  nextCursor: z.string().nullable(),
  /** Which retrieval path answered, so the UI can be honest about it. */
  mode: z.enum(['semantic', 'keyword']),
})

// ── Capture ─────────────────────────────────────────────────────────────────

export const createCaptureRequestSchema = z.object({
  kind: z.enum(CAPTURE_KINDS),
  /** Storage path for uploads; null for link/text captures. */
  storagePath: z.string().max(500).nullable(),
  sourceUrl: safeUrlSchema.nullable(),
  rawText: z.string().max(50_000).nullable(),
  mimeType: z.string().max(100).nullable(),
  sizeBytes: z.number().int().min(0).max(25 * 1024 * 1024).nullable(),
})

export const captureUploadUrlRequestSchema = z.object({
  filename: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().min(1).max(25 * 1024 * 1024),
})

export const captureUploadUrlResponseSchema = z.object({
  uploadUrl: z.string().url(),
  storagePath: z.string(),
  /** Seconds the signed URL stays valid. */
  expiresIn: z.number().int().positive(),
})

// ── Preferences & settings ──────────────────────────────────────────────────

export const updatePreferencesRequestSchema = z
  .object({
    colorScheme: z.enum(['system', 'light', 'dark']),
    language: z.union([z.enum(LOCALES), z.literal('system')]),
    timeZone: timeZoneSchema,
    morningBriefingTime: localTimeSchema,
    middayPulseEnabled: z.boolean(),
    middayPulseTime: localTimeSchema,
    eveningCloseEnabled: z.boolean(),
    eveningCloseTime: localTimeSchema,
    weeklyReviewEnabled: z.boolean(),
    weeklyReviewWeekday: z.number().int().min(0).max(6),
    weeklyReviewTime: localTimeSchema,
    briefingOnWeekends: z.boolean(),
    quietDays: z.array(z.number().int().min(0).max(6)).max(7),
    quietHoursStart: localTimeSchema.nullable(),
    quietHoursEnd: localTimeSchema.nullable(),
    learnFromInteractions: z.boolean(),
    analyzeAttachments: z.boolean(),
    retentionWindow: z.enum(RETENTION_WINDOWS),
    historyDays: z.number().int().min(7).max(3650),
    reduceMotion: z.boolean(),
    audioBriefingVoice: z.string().max(60).nullable(),
    audioBriefingSpeed: z.number().min(0.5).max(2),
  })
  .partial()

export const updateNotificationPreferencesRequestSchema = z
  .object({
    categories: z.record(z.enum(NOTIFICATION_CATEGORIES), z.boolean()),
    onlyIfImportant: z.boolean(),
    lockScreenPrivacy: z.enum(LOCK_SCREEN_PRIVACY),
    quietHoursStart: localTimeSchema.nullable(),
    quietHoursEnd: localTimeSchema.nullable(),
  })
  .partial()

export const priorityRuleInputSchema = z.object({
  kind: z.enum(PRIORITY_RULE_KINDS),
  matchValue: z.string().min(1).max(320),
  matchCategory: z
    .enum([
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
    ])
    .nullable()
    .default(null),
  enabled: z.boolean().default(true),
  note: z.string().max(200).nullable().default(null),
})

export const registerPushTokenRequestSchema = z.object({
  token: z.string().min(10).max(500),
  platform: z.enum(['ios', 'android']),
  deviceId: z.string().min(1).max(200),
  deviceName: z.string().max(120).nullable(),
  appVersion: z.string().max(40).nullable(),
})

export const feedbackRequestSchema = z.object({
  signal: z.enum(FEEDBACK_SIGNALS),
  entityType: z.enum([
    'email',
    'calendar_event',
    'task',
    'capture',
    'commitment',
    'notification',
    'contact',
    'user_input',
  ]),
  entityId: z.string().min(1).max(100),
  note: z.string().max(1000).nullable().default(null),
})

// ── Subscriptions & referral ────────────────────────────────────────────────

export const revenueCatWebhookSchema = z.object({
  api_version: z.string().optional(),
  event: z.object({
    type: z.string(),
    app_user_id: z.string(),
    /** RevenueCat sends epoch milliseconds. */
    event_timestamp_ms: z.number().optional(),
    expiration_at_ms: z.number().nullish(),
    product_id: z.string().nullish(),
    entitlement_ids: z.array(z.string()).nullish(),
    store: z.string().nullish(),
    period_type: z.string().nullish(),
    original_app_user_id: z.string().nullish(),
  }),
})

export const redeemReferralRequestSchema = z.object({
  code: z.string().min(4).max(20),
})

export const redeemReferralResponseSchema = z.object({
  granted: z.boolean(),
  bonusDays: z.number().int().min(0),
  expiresAt: isoInstantSchema.nullable(),
  reason: z.string().nullable(),
})

// ── Privacy ─────────────────────────────────────────────────────────────────

export const dataExportResponseSchema = z.object({
  requestId: uuidSchema,
  status: z.enum(['requested', 'processing', 'ready', 'failed', 'expired']),
  downloadUrl: z.string().url().nullable(),
  expiresAt: isoInstantSchema.nullable(),
})

export const deleteAccountRequestSchema = z.object({
  /** The user types their email to confirm; the server checks it matches. */
  confirmationEmail: emailSchema,
  /** Second gate so a mis-tap in a sheet cannot delete an account. */
  acknowledgedIrreversible: z.literal(true),
})

export const deleteHistoryRequestSchema = z.object({
  scope: z.enum(['emails', 'briefings', 'assistant', 'captures', 'memory', 'all']),
  /** Optional cut-off; without it the whole scope goes. */
  before: isoInstantSchema.nullable().default(null),
})

// ── Device notifications (Android only) ─────────────────────────────────────

export const deviceNotificationBatchSchema = z.object({
  notifications: z
    .array(
      z.object({
        packageName: z.string().min(1).max(200),
        appName: z.string().min(1).max(120),
        title: z.string().max(300).nullable(),
        text: z.string().max(1000).nullable(),
        postedAt: isoInstantSchema,
      }),
    )
    .max(50),
})

export const providerSchema = z.enum(PROVIDERS)
