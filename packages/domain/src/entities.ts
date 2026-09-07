import type { IsoDate, IsoInstant, LocalTime } from './clock.ts'
import type {
  AccountKind,
  ApprovalActionType,
  ApprovalStatus,
  BriefingKind,
  BriefingStatus,
  CaptureIntent,
  CaptureKind,
  CaptureStatus,
  CommitmentDirection,
  CommitmentStatus,
  ConnectionStatus,
  EmailCategory,
  ExportStatus,
  FeedbackSignal,
  Importance,
  LifeEventType,
  Locale,
  LockScreenPrivacy,
  NotificationCategory,
  PriorityRuleKind,
  Provider,
  ReplyTone,
  RetentionWindow,
  SourceType,
  SubscriptionStatus,
  SyncStatus,
  TaskStatus,
} from './enums.ts'

/** Every user-owned row carries these. Timestamps are UTC ISO-8601. */
export interface OwnedRecord {
  id: string
  userId: string
  createdAt: IsoInstant
  updatedAt: IsoInstant
}

export interface Profile {
  id: string
  email: string
  displayName: string | null
  givenName: string | null
  avatarUrl: string | null
  /** IANA zone, e.g. `Europe/Istanbul`. All scheduling resolves through this. */
  timeZone: string
  locale: Locale
  onboardingCompletedAt: IsoInstant | null
  createdAt: IsoInstant
  updatedAt: IsoInstant
  deletedAt: IsoInstant | null
}

export interface UserPreferences {
  userId: string
  colorScheme: 'system' | 'light' | 'dark'
  /** `system` follows the OS language when it is one of the supported locales. */
  language: Locale | 'system'
  morningBriefingTime: LocalTime
  middayPulseEnabled: boolean
  middayPulseTime: LocalTime
  eveningCloseEnabled: boolean
  eveningCloseTime: LocalTime
  weeklyReviewEnabled: boolean
  /** 0 = Sunday … 6 = Saturday. */
  weeklyReviewWeekday: number
  weeklyReviewTime: LocalTime
  briefingOnWeekends: boolean
  /** Local weekday indices on which no briefing is generated. */
  quietDays: number[]
  quietHoursStart: LocalTime | null
  quietHoursEnd: LocalTime | null
  /** When false the personalisation engine stops recording new learned preferences. */
  learnFromInteractions: boolean
  analyzeAttachments: boolean
  retentionWindow: RetentionWindow
  /** How far back the first sync reaches, in days. */
  historyDays: number
  reduceMotion: boolean
  audioBriefingVoice: string | null
  audioBriefingSpeed: number
  updatedAt: IsoInstant
}

export interface ConnectedAccount extends OwnedRecord {
  provider: Provider
  kinds: AccountKind[]
  /** The provider-side account identifier, e.g. the Google email address. */
  externalAccountId: string
  displayName: string | null
  email: string | null
  status: ConnectionStatus
  /** Scopes actually granted, so progressive authorization knows what to ask for. */
  grantedScopes: string[]
  lastSyncedAt: IsoInstant | null
  lastErrorCode: string | null
  lastErrorAt: IsoInstant | null
  isPrimary: boolean
}

export interface SyncState extends OwnedRecord {
  connectedAccountId: string
  resource: AccountKind
  status: SyncStatus
  /** Provider delta cursor: Gmail historyId, Graph deltaLink, etc. */
  cursor: string | null
  /** Oldest instant the backfill has reached; null once the window is complete. */
  backfillCursor: IsoInstant | null
  backfillCompletedAt: IsoInstant | null
  lastRunAt: IsoInstant | null
  nextRunAt: IsoInstant | null
  consecutiveFailures: number
  lastError: string | null
}

export interface SourceRef {
  type: SourceType
  /** Row id of the source record inside our own database. */
  id: string
  /** Human label rendered on the source chip, e.g. `Gmail · Ahmet Yılmaz · 08:42`. */
  label: string
  provider: Provider | null
  personName: string | null
  occurredAt: IsoInstant | null
  /** Deep link back into the provider's own app, when one exists. */
  externalUrl: string | null
}

export interface EmailThread extends OwnedRecord {
  connectedAccountId: string
  externalThreadId: string
  subject: string
  /** Denormalised for list rendering without a join. */
  participantEmails: string[]
  lastMessageAt: IsoInstant
  messageCount: number
  isRead: boolean
  importance: Importance
  category: EmailCategory
  summary: string | null
  reasonImportant: string | null
  requiresUserAction: boolean
  deadline: IsoInstant | null
  confidence: number | null
  /** Score produced by the priority engine; higher sorts first. */
  priorityScore: number
  /** Set when the user says "not important" so the feed stops surfacing it. */
  suppressedAt: IsoInstant | null
  archivedAt: IsoInstant | null
}

export interface EmailMessage extends OwnedRecord {
  threadId: string
  connectedAccountId: string
  externalMessageId: string
  fromEmail: string
  fromName: string | null
  toEmails: string[]
  ccEmails: string[]
  subject: string
  /** First ~500 chars, enough for a list preview without storing the body. */
  snippet: string
  /** Full text is only retained while the retention window allows it. */
  bodyText: string | null
  sentAt: IsoInstant
  isFromUser: boolean
  hasAttachments: boolean
  attachmentMeta: AttachmentMeta[]
  /** SHA-256 over the normalised content; skips re-classifying identical mail. */
  contentHash: string
  externalUrl: string | null
}

export interface AttachmentMeta {
  externalId: string
  filename: string
  mimeType: string
  sizeBytes: number
  /** Only set once the user opted into attachment analysis and it succeeded. */
  extractedTextRef: string | null
}

export interface CalendarEvent extends OwnedRecord {
  connectedAccountId: string | null
  externalEventId: string
  provider: Provider
  title: string
  description: string | null
  location: string | null
  startsAt: IsoInstant
  endsAt: IsoInstant
  isAllDay: boolean
  timeZone: string
  attendees: EventAttendee[]
  organizerEmail: string | null
  /** Meet / Teams / Zoom join URL when the provider supplies one. */
  conferenceUrl: string | null
  status: 'confirmed' | 'tentative' | 'cancelled'
  /** Provider's own change marker, for last-writer detection on sync. */
  providerUpdatedAt: IsoInstant | null
  externalUrl: string | null
}

export interface EventAttendee {
  email: string
  name: string | null
  responseStatus: 'accepted' | 'declined' | 'tentative' | 'needs_action'
  isOrganizer: boolean
  isSelf: boolean
}

export interface Task extends OwnedRecord {
  connectedAccountId: string | null
  externalTaskId: string | null
  provider: Provider
  title: string
  notes: string | null
  dueAt: IsoInstant | null
  status: TaskStatus
  completedAt: IsoInstant | null
  source: SourceRef | null
  providerUpdatedAt: IsoInstant | null
}

export interface Commitment extends OwnedRecord {
  text: string
  direction: CommitmentDirection
  /** Contact id of the counterparty, when we could resolve one. */
  personId: string | null
  personName: string | null
  dueAt: IsoInstant | null
  status: CommitmentStatus
  /** Commitments are never invented: extraction requires a quotable source. */
  source: SourceRef
  /** Verbatim sentence the commitment was read from. */
  quote: string
  confidence: number
  confirmedByUser: boolean
  completedAt: IsoInstant | null
  snoozedUntil: IsoInstant | null
}

export interface Reminder extends OwnedRecord {
  title: string
  body: string | null
  remindAt: IsoInstant
  /** Which preset produced `remindAt`; `custom` when the user picked a time. */
  preset: ReminderPreset
  source: SourceRef | null
  relatedEntityType: SourceType | null
  relatedEntityId: string | null
  status: 'scheduled' | 'fired' | 'cancelled' | 'completed'
  firedAt: IsoInstant | null
  category: NotificationCategory
}

export const REMINDER_PRESETS = [
  'in_30_minutes',
  'in_1_hour',
  'this_evening',
  'tomorrow_morning',
  'smart',
  'custom',
] as const
export type ReminderPreset = (typeof REMINDER_PRESETS)[number]

export interface Contact extends OwnedRecord {
  email: string
  name: string | null
  /** Extra addresses that resolve to the same human. */
  alternateEmails: string[]
  company: string | null
  role: string | null
  avatarUrl: string | null
  lastContactAt: IsoInstant | null
  /** Denormalised counter used to rank people in search. */
  interactionCount: number
  isVip: boolean
  /** Set when the user pinned this person manually rather than by interaction. */
  vipSetAt: IsoInstant | null
}

export interface PriorityRule extends OwnedRecord {
  kind: PriorityRuleKind
  /** Sender address, domain, or keyword depending on `kind`. */
  matchValue: string
  /** Only meaningful for `category_low_priority`. */
  matchCategory: EmailCategory | null
  enabled: boolean
  /** Free-text note the user typed when creating the rule. */
  note: string | null
}

export interface LearnedPreference extends OwnedRecord {
  /** Human-readable statement shown in AI Personalisation, e.g. "Mehmet yüksek öncelikli." */
  statement: string
  kind: PriorityRuleKind
  matchValue: string
  /** 0..1 — how strongly the observed behaviour supports the statement. */
  strength: number
  observationCount: number
  enabled: boolean
  lastObservedAt: IsoInstant
}

export interface Insight extends OwnedRecord {
  title: string
  detail: string | null
  importance: Importance
  category: EmailCategory | 'schedule' | 'follow_up' | 'commitment'
  source: SourceRef | null
  /** Why the assistant surfaced this, in the user's language. */
  reasonImportant: string | null
  actions: InsightAction[]
  dueAt: IsoInstant | null
  priorityScore: number
  completedAt: IsoInstant | null
  dismissedAt: IsoInstant | null
  /** The day this insight belongs to, in the user's zone. */
  forDate: IsoDate
}

export interface InsightAction {
  /** Stable action key the client maps to a handler; never a free-text label. */
  kind:
    | 'open_source'
    | 'draft_reply'
    | 'create_task'
    | 'add_to_calendar'
    | 'set_reminder'
    | 'prepare_meeting'
    | 'mark_done'
    | 'track_shipment'
    | 'open_person'
    | 'dismiss'
  label: string
  /** Payload the handler needs, e.g. `{ threadId }` or `{ url }`. */
  params: Record<string, string>
}

export interface LifeEvent extends OwnedRecord {
  type: LifeEventType
  title: string
  detail: string | null
  occursAt: IsoInstant | null
  /** Only populated when the source states it explicitly — never inferred. */
  amount: { value: number; currency: string } | null
  reference: string | null
  trackingUrl: string | null
  source: SourceRef
  confidence: number
  status: 'active' | 'completed' | 'dismissed'
}

export interface Briefing extends OwnedRecord {
  kind: BriefingKind
  status: BriefingStatus
  /** Local date the briefing covers. */
  forDate: IsoDate
  /** Narrative body — Lora editorial prose, already localised. */
  narrative: string | null
  headline: string | null
  /** Estimated read/listen time in seconds. */
  durationSeconds: number | null
  audioUrl: string | null
  audioProvider: string | null
  generatedAt: IsoInstant | null
  openedAt: IsoInstant | null
  /** Deterministic hash of the inputs; a midday pulse with no delta is skipped. */
  contentHash: string | null
  stats: BriefingStats | null
}

export interface BriefingStats {
  emailsAnalyzed: number
  importantCount: number
  meetingCount: number
  deadlineCount: number
  followUpCount: number
  /** Deterministic estimate; the formula lives in `time-saved.ts`. */
  estimatedMinutesSaved: number
}

export interface BriefingItem extends OwnedRecord {
  briefingId: string
  section: BriefingSection
  position: number
  title: string
  detail: string | null
  source: SourceRef | null
  relatedEntityType: SourceType | null
  relatedEntityId: string | null
  importance: Importance
}

export const BRIEFING_SECTIONS = [
  'priorities',
  'schedule',
  'expected_from_you',
  'waiting_on_others',
  'deadlines',
  'personal',
] as const
export type BriefingSection = (typeof BRIEFING_SECTIONS)[number]

export interface ApprovalAction extends OwnedRecord {
  type: ApprovalActionType
  status: ApprovalStatus
  /** One-line statement of the change, e.g. "Ahmet Yılmaz'a yanıt gönder". */
  what: string
  /** Why the assistant proposed it. */
  why: string
  source: SourceRef | null
  /** The exact request that will be sent to the provider once approved. */
  payload: ApprovalPayload
  /** Snapshot of `payload` as first proposed, so edits are auditable. */
  originalPayload: ApprovalPayload
  /** Guards against double execution across retries and devices. */
  idempotencyKey: string
  expiresAt: IsoInstant
  approvedAt: IsoInstant | null
  executedAt: IsoInstant | null
  rejectedAt: IsoInstant | null
  failureReason: string | null
  attemptCount: number
  /** Provider-side id of whatever was created, once executed. */
  resultRef: string | null
}

export type ApprovalPayload =
  | EmailSendPayload
  | CalendarCreatePayload
  | CalendarUpdatePayload
  | TaskCreatePayload
  | ReminderCreatePayload
  | CommitmentCreatePayload

export interface EmailSendPayload {
  kind: 'email_send'
  connectedAccountId: string
  threadId: string | null
  inReplyToMessageId: string | null
  to: string[]
  cc: string[]
  subject: string
  body: string
  tone: ReplyTone
}

export interface CalendarCreatePayload {
  kind: 'calendar_create'
  connectedAccountId: string
  title: string
  description: string | null
  location: string | null
  startsAt: IsoInstant
  endsAt: IsoInstant
  timeZone: string
  attendees: string[]
}

export interface CalendarUpdatePayload {
  kind: 'calendar_update'
  connectedAccountId: string
  eventId: string
  externalEventId: string
  changes: {
    title?: string
    startsAt?: IsoInstant
    endsAt?: IsoInstant
    location?: string | null
  }
  /** Provider change marker observed when the proposal was made. */
  expectedProviderUpdatedAt: IsoInstant | null
}

export interface TaskCreatePayload {
  kind: 'task_create'
  connectedAccountId: string | null
  title: string
  notes: string | null
  dueAt: IsoInstant | null
}

export interface ReminderCreatePayload {
  kind: 'reminder_create'
  title: string
  body: string | null
  remindAt: IsoInstant
  preset: ReminderPreset
  relatedEntityType: SourceType | null
  relatedEntityId: string | null
}

export interface CommitmentCreatePayload {
  kind: 'commitment_create'
  text: string
  direction: CommitmentDirection
  personName: string | null
  dueAt: IsoInstant | null
  quote: string
}

export interface AssistantThread extends OwnedRecord {
  title: string
  lastMessageAt: IsoInstant
  messageCount: number
}

export interface AssistantMessage extends OwnedRecord {
  threadId: string
  role: 'user' | 'assistant'
  content: string
  /** Grounding for the answer; an assistant message asserting facts must cite. */
  citations: SourceRef[]
  /** Set when the turn proposed a write action instead of answering. */
  proposedApprovalId: string | null
  tokensIn: number | null
  tokensOut: number | null
  model: string | null
  /** Voice turns keep the transcript, never the audio. */
  wasVoice: boolean
}

export interface MemoryChunk extends OwnedRecord {
  /** Normalised summary text — never a raw message body. */
  content: string
  source: SourceRef
  personIds: string[]
  topic: string | null
  occurredAt: IsoInstant
  /** Null when no embedding provider is configured; FTS still covers search. */
  embedding: number[] | null
  tokenCount: number
}

export interface Capture extends OwnedRecord {
  kind: CaptureKind
  status: CaptureStatus
  /** Storage path inside the private `captures` bucket, scoped by user id. */
  storagePath: string | null
  sourceUrl: string | null
  rawText: string | null
  mimeType: string | null
  sizeBytes: number | null
  detectedIntent: CaptureIntent | null
  extracted: CaptureExtraction | null
  failureReason: string | null
  analyzedAt: IsoInstant | null
}

export interface CaptureExtraction {
  title: string
  summary: string
  /** Only present when the capture literally shows one. */
  startsAt: IsoInstant | null
  endsAt: IsoInstant | null
  location: string | null
  people: string[]
  amount: { value: number; currency: string } | null
  reference: string | null
  keyPoints: string[]
  confidence: number
  suggestedActions: InsightAction[]
}

export interface NotificationPreferences {
  userId: string
  /** Per-category on/off. Absent key means enabled. */
  categories: Partial<Record<NotificationCategory, boolean>>
  onlyIfImportant: boolean
  lockScreenPrivacy: LockScreenPrivacy
  quietHoursStart: LocalTime | null
  quietHoursEnd: LocalTime | null
  updatedAt: IsoInstant
}

export interface PushToken extends OwnedRecord {
  token: string
  platform: 'ios' | 'android'
  deviceId: string
  deviceName: string | null
  appVersion: string | null
  lastSeenAt: IsoInstant
  disabledAt: IsoInstant | null
}

export interface Subscription {
  userId: string
  status: SubscriptionStatus
  /** RevenueCat entitlement identifier that grants Pro. */
  entitlement: string | null
  productId: string | null
  store: 'app_store' | 'play_store' | 'promotional' | null
  currentPeriodEnd: IsoInstant | null
  trialEndsAt: IsoInstant | null
  revenueCatCustomerId: string | null
  updatedAt: IsoInstant
}

export interface Referral extends OwnedRecord {
  code: string
  /** Number of completed, non-abusive redemptions. */
  redemptionCount: number
}

export interface ReferralCredit extends OwnedRecord {
  /** The referral code that was redeemed. */
  code: string
  referrerUserId: string
  refereeUserId: string
  bonusDays: number
  grantedAt: IsoInstant
  expiresAt: IsoInstant
  revokedAt: IsoInstant | null
  revokedReason: string | null
}

export interface AiFeedback extends OwnedRecord {
  signal: FeedbackSignal
  entityType: SourceType
  entityId: string
  /** Optional free-text note from the feedback screen. */
  note: string | null
}

export interface AuditLog {
  id: string
  userId: string | null
  action: string
  entityType: string | null
  entityId: string | null
  /** Never contains message bodies, tokens or addresses. */
  metadata: Record<string, string | number | boolean | null>
  createdAt: IsoInstant
}

export interface DataExportRequest extends OwnedRecord {
  status: ExportStatus
  storagePath: string | null
  sizeBytes: number | null
  readyAt: IsoInstant | null
  expiresAt: IsoInstant | null
  failureReason: string | null
}

export interface FollowUp extends OwnedRecord {
  threadId: string
  /** The message we sent and are waiting on. */
  messageId: string
  recipientEmail: string
  recipientName: string | null
  sentAt: IsoInstant
  /** When the engine decided silence had become notable. */
  dueAt: IsoInstant
  status: 'waiting' | 'replied' | 'nudged' | 'closed'
  repliedAt: IsoInstant | null
  closedAt: IsoInstant | null
  /** Bumped each time the user dismisses, so the engine backs off. */
  dismissCount: number
}

export interface DeviceNotification extends OwnedRecord {
  packageName: string
  appName: string
  title: string | null
  text: string | null
  postedAt: IsoInstant
  importance: Importance | null
  category: EmailCategory | null
  /** Notifications matching the sensitive-app blocklist are never persisted. */
  processedAt: IsoInstant | null
}
