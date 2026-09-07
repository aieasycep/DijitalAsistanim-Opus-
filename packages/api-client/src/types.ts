import type {
  AccountKind,
  ApprovalAction,
  ApprovalActionType,
  ApprovalPayload,
  ApprovalStatus,
  Briefing,
  BriefingItem,
  BriefingKind,
  BriefingSection,
  CalendarEvent,
  CaptureIntent,
  CaptureKind,
  CaptureStatus,
  Commitment,
  CommitmentDirection,
  CommitmentStatus,
  ConnectionStatus,
  EmailCategory,
  EmailMessage,
  EmailThread,
  EventAttendee,
  ExportStatus,
  FollowUp,
  Importance,
  InsightAction,
  Insight,
  IsoDate,
  IsoInstant,
  LifeEvent,
  LifeEventType,
  Locale,
  LockScreenPrivacy,
  NotificationCategory,
  PriorityRuleKind,
  Provider,
  Reminder,
  ReminderPreset,
  ReplyTone,
  RetentionWindow,
  SourceType,
  SubscriptionStatus,
  SyncStatus,
  Task,
  TaskStatus,
} from '@da/domain'
import type { ApiClientConfig } from './config'
import type { Http } from './http'
import type { Db } from './supabase'

/** Handles every endpoint factory receives. */
export interface EndpointContext {
  http: Http
  db: Db
  config: ApiClientConfig
}

// ── Row shapes ──────────────────────────────────────────────────────────────
// Only the tables the client reads directly are described here, by hand: a
// generated Database type would drift and drag in tables the client never sees.

export interface OwnedRow {
  id: string
  user_id: string
  created_at: string
  updated_at: string
}

export interface MoneyRow {
  value: number
  currency: string
}

export interface SourceRefRow {
  type: SourceType
  id: string
  label: string
  provider: Provider | null
  person_name: string | null
  occurred_at: string | null
  external_url: string | null
}

export interface ProfileRow {
  id: string
  email: string
  display_name: string | null
  given_name: string | null
  avatar_url: string | null
  time_zone: string
  locale: Locale
  onboarding_completed_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface UserPreferencesRow {
  user_id: string
  color_scheme: 'system' | 'light' | 'dark'
  language: Locale | 'system'
  morning_briefing_time: string
  midday_pulse_enabled: boolean
  midday_pulse_time: string
  evening_close_enabled: boolean
  evening_close_time: string
  weekly_review_enabled: boolean
  weekly_review_weekday: number
  weekly_review_time: string
  briefing_on_weekends: boolean
  quiet_days: number[] | null
  quiet_hours_start: string | null
  quiet_hours_end: string | null
  learn_from_interactions: boolean
  analyze_attachments: boolean
  retention_window: RetentionWindow
  history_days: number
  reduce_motion: boolean
  audio_briefing_voice: string | null
  audio_briefing_speed: number
  updated_at: string
}

export interface NotificationPreferencesRow {
  user_id: string
  categories: Partial<Record<NotificationCategory, boolean>> | null
  only_if_important: boolean
  lock_screen_privacy: LockScreenPrivacy
  quiet_hours_start: string | null
  quiet_hours_end: string | null
  updated_at: string
}

export interface ConnectedAccountRow extends OwnedRow {
  provider: Provider
  kinds: AccountKind[] | null
  external_account_id: string
  display_name: string | null
  email: string | null
  status: ConnectionStatus
  granted_scopes: string[] | null
  last_synced_at: string | null
  last_error_code: string | null
  last_error_at: string | null
  is_primary: boolean
}

export interface SyncStateRow extends OwnedRow {
  connected_account_id: string
  resource: AccountKind
  status: SyncStatus
  cursor: string | null
  backfill_cursor: string | null
  backfill_completed_at: string | null
  last_run_at: string | null
  next_run_at: string | null
  consecutive_failures: number
  last_error: string | null
}

export interface EmailThreadRow extends OwnedRow {
  connected_account_id: string
  external_thread_id: string
  subject: string
  participant_emails: string[] | null
  last_message_at: string
  message_count: number
  is_read: boolean
  importance: Importance
  category: EmailCategory
  summary: string | null
  reason_important: string | null
  requires_user_action: boolean
  deadline: string | null
  confidence: number | null
  priority_score: number
  suppressed_at: string | null
  archived_at: string | null
}

export interface AttachmentMetaRow {
  external_id: string
  filename: string
  mime_type: string
  size_bytes: number
  extracted_text_ref: string | null
}

export interface EmailMessageRow extends OwnedRow {
  thread_id: string
  connected_account_id: string
  external_message_id: string
  from_email: string
  from_name: string | null
  to_emails: string[] | null
  cc_emails: string[] | null
  subject: string
  snippet: string
  body_text: string | null
  sent_at: string
  is_from_user: boolean
  has_attachments: boolean
  attachment_meta: AttachmentMetaRow[] | null
  content_hash: string
  external_url: string | null
}

export interface EventAttendeeRow {
  email: string
  name: string | null
  response_status: EventAttendee['responseStatus']
  is_organizer: boolean
  is_self: boolean
}

export interface CalendarEventRow extends OwnedRow {
  connected_account_id: string | null
  external_event_id: string
  provider: Provider
  title: string
  description: string | null
  location: string | null
  starts_at: string
  ends_at: string
  is_all_day: boolean
  time_zone: string
  attendees: EventAttendeeRow[] | null
  organizer_email: string | null
  conference_url: string | null
  status: CalendarEvent['status']
  provider_updated_at: string | null
  external_url: string | null
}

export interface TaskRow extends OwnedRow {
  connected_account_id: string | null
  external_task_id: string | null
  provider: Provider
  title: string
  notes: string | null
  due_at: string | null
  status: TaskStatus
  completed_at: string | null
  source: SourceRefRow | null
  provider_updated_at: string | null
}

export interface CommitmentRow extends OwnedRow {
  text: string
  direction: CommitmentDirection
  person_id: string | null
  person_name: string | null
  due_at: string | null
  status: CommitmentStatus
  source: SourceRefRow
  quote: string
  confidence: number
  confirmed_by_user: boolean
  completed_at: string | null
  snoozed_until: string | null
}

export interface ReminderRow extends OwnedRow {
  title: string
  body: string | null
  remind_at: string
  preset: ReminderPreset
  source: SourceRefRow | null
  related_entity_type: SourceType | null
  related_entity_id: string | null
  status: Reminder['status']
  fired_at: string | null
  category: NotificationCategory
}

export interface ContactRow extends OwnedRow {
  email: string
  name: string | null
  alternate_emails: string[] | null
  company: string | null
  role: string | null
  avatar_url: string | null
  last_contact_at: string | null
  interaction_count: number
  is_vip: boolean
  vip_set_at: string | null
}

export interface PriorityRuleRow extends OwnedRow {
  kind: PriorityRuleKind
  match_value: string
  match_category: EmailCategory | null
  enabled: boolean
  note: string | null
}

export interface LearnedPreferenceRow extends OwnedRow {
  statement: string
  kind: PriorityRuleKind
  match_value: string
  strength: number
  observation_count: number
  enabled: boolean
  last_observed_at: string
}

export interface InsightRow extends OwnedRow {
  title: string
  detail: string | null
  importance: Importance
  category: Insight['category']
  source: SourceRefRow | null
  reason_important: string | null
  actions: InsightAction[] | null
  due_at: string | null
  priority_score: number
  completed_at: string | null
  dismissed_at: string | null
  for_date: string
}

export interface LifeEventRow extends OwnedRow {
  type: LifeEventType
  title: string
  detail: string | null
  occurs_at: string | null
  amount: MoneyRow | null
  reference: string | null
  tracking_url: string | null
  source: SourceRefRow
  confidence: number
  status: LifeEvent['status']
}

export interface BriefingStatsRow {
  emails_analyzed: number
  important_count: number
  meeting_count: number
  deadline_count: number
  follow_up_count: number
  estimated_minutes_saved: number
}

export interface BriefingRow extends OwnedRow {
  kind: BriefingKind
  status: Briefing['status']
  for_date: string
  narrative: string | null
  headline: string | null
  duration_seconds: number | null
  audio_url: string | null
  audio_provider: string | null
  generated_at: string | null
  opened_at: string | null
  content_hash: string | null
  stats: BriefingStatsRow | null
}

export interface BriefingItemRow extends OwnedRow {
  briefing_id: string
  section: BriefingSection
  position: number
  title: string
  detail: string | null
  source: SourceRefRow | null
  related_entity_type: SourceType | null
  related_entity_id: string | null
  importance: Importance
}

export interface ApprovalActionRow extends OwnedRow {
  type: ApprovalActionType
  status: ApprovalStatus
  what: string
  why: string
  source: SourceRefRow | null
  payload: ApprovalPayload
  original_payload: ApprovalPayload
  idempotency_key: string
  expires_at: string
  approved_at: string | null
  executed_at: string | null
  rejected_at: string | null
  failure_reason: string | null
  attempt_count: number
  result_ref: string | null
}

export interface AssistantThreadRow extends OwnedRow {
  title: string
  last_message_at: string
  message_count: number
}

export interface AssistantMessageRow extends OwnedRow {
  thread_id: string
  role: 'user' | 'assistant'
  content: string
  citations: SourceRefRow[] | null
  proposed_approval_id: string | null
  tokens_in: number | null
  tokens_out: number | null
  model: string | null
  was_voice: boolean
}

export interface CaptureExtractionRow {
  title: string
  summary: string
  starts_at: string | null
  ends_at: string | null
  location: string | null
  people: string[] | null
  amount: MoneyRow | null
  reference: string | null
  key_points: string[] | null
  confidence: number
  suggested_actions: InsightAction[] | null
}

export interface CaptureRow extends OwnedRow {
  kind: CaptureKind
  status: CaptureStatus
  storage_path: string | null
  source_url: string | null
  raw_text: string | null
  mime_type: string | null
  size_bytes: number | null
  detected_intent: CaptureIntent | null
  extracted: CaptureExtractionRow | null
  failure_reason: string | null
  analyzed_at: string | null
}

export interface FollowUpRow extends OwnedRow {
  thread_id: string
  message_id: string
  recipient_email: string
  recipient_name: string | null
  sent_at: string
  due_at: string
  status: FollowUp['status']
  replied_at: string | null
  closed_at: string | null
  dismiss_count: number
}

export interface SubscriptionRow {
  user_id: string
  status: SubscriptionStatus
  entitlement: string | null
  product_id: string | null
  store: 'app_store' | 'play_store' | 'promotional' | null
  current_period_end: string | null
  trial_ends_at: string | null
  revenuecat_customer_id: string | null
  updated_at: string
}

export interface PushTokenRow extends OwnedRow {
  token: string
  platform: 'ios' | 'android'
  device_id: string
  device_name: string | null
  app_version: string | null
  last_seen_at: string
  disabled_at: string | null
}

export interface DataExportRequestRow extends OwnedRow {
  status: ExportStatus
  storage_path: string | null
  size_bytes: number | null
  ready_at: string | null
  expires_at: string | null
  failure_reason: string | null
}

export interface ReferralRow extends OwnedRow {
  code: string
  redemption_count: number
}

// ── Client-facing shapes ────────────────────────────────────────────────────

export type ScopeGroup = 'mailSend' | 'calendarWrite' | 'tasksWrite' | 'contactsRead' | 'tasksRead'

export interface OAuthStartResult {
  authorizeUrl: string
  state: string
}

/** The single payload behind the Today screen. */
export interface TodayFeed {
  forDate: IsoDate
  generatedAt: IsoInstant
  briefing: Briefing | null
  briefingItems: BriefingItem[]
  insights: Insight[]
  events: CalendarEvent[]
  commitments: Commitment[]
  followUps: FollowUp[]
  lifeEvents: LifeEvent[]
  pendingApprovals: ApprovalAction[]
}

export interface BriefingWithItems {
  briefing: Briefing
  items: BriefingItem[]
}

export type FlowFilter =
  'all' | 'important' | 'action_required' | 'waiting' | 'deadlines' | 'meetings' | 'personal'

export interface ThreadFilter {
  flow?: FlowFilter
  category?: EmailCategory
  importance?: Importance
  accountId?: string
  unreadOnly?: boolean
  requiresAction?: boolean
  includeSuppressed?: boolean
  limit?: number
}

export interface ThreadDetail {
  thread: EmailThread
  messages: EmailMessage[]
  commitments: Commitment[]
  followUps: FollowUp[]
}

export interface ReplyDraftInput {
  threadId: string
  tone: ReplyTone
  /** Free-text steer from the user, e.g. "cumaya kadar erteleyelim". */
  instruction?: string
  /** When true the draft is stored as a pending approval right away. */
  asApproval?: boolean
}

export interface ReplyDraft {
  threadId: string
  subject: string
  body: string
  tone: ReplyTone
  approvalId: string | null
  alternatives: { tone: ReplyTone; body: string }[]
  grounded: boolean
}

export interface NudgeDraft {
  followUpId: string
  subject: string
  body: string
  approvalId: string | null
}

export type PlanRange = 'day' | 'week'

export interface PlanFreeBlock {
  startsAt: IsoInstant
  endsAt: IsoInstant
  minutes: number
}

export interface PlanConflict {
  eventIds: string[]
  startsAt: IsoInstant
  endsAt: IsoInstant
}

export interface DayLoadSummary {
  meetingCount: number
  meetingMinutes: number
  longestFreeMinutes: number
  level: 'light' | 'moderate' | 'heavy'
}

export interface DayPlan {
  date: IsoDate
  events: CalendarEvent[]
  tasks: Task[]
  commitments: Commitment[]
  reminders: Reminder[]
  freeBlocks: PlanFreeBlock[]
  conflicts: PlanConflict[]
  load: DayLoadSummary
}

export interface WeekPlan {
  startDate: IsoDate
  endDate: IsoDate
  days: DayPlan[]
}

export interface PlanSuggestion {
  id: string
  kind: 'focus_block' | 'reschedule' | 'buffer' | 'prepare' | 'decline'
  title: string
  detail: string
  startsAt: IsoInstant | null
  endsAt: IsoInstant | null
  relatedEventId: string | null
}

export interface MeetingAttendeeBrief {
  email: string
  name: string | null
  company: string | null
  role: string | null
  isVip: boolean
  lastContactAt: IsoInstant | null
  recentContext: string | null
}

export interface MeetingPrepBrief {
  eventId: string
  event: CalendarEvent
  summary: string
  agenda: string[]
  attendees: MeetingAttendeeBrief[]
  openCommitments: Commitment[]
  relatedThreadIds: string[]
  suggestedQuestions: string[]
}

export interface PostMeetingNoteInput {
  eventId: string
  note: string
}

export interface PostMeetingNoteResult {
  commitments: Commitment[]
  createdApprovalIds: string[]
}

export interface AssistantAnswer {
  threadId: string
  messageId: string
  answer: string
  citations: {
    sourceType: string
    sourceId: string
    label: string
    occurredAt: IsoInstant | null
  }[]
  proposedApprovalId: string | null
  grounded: boolean
}

export interface SearchHit {
  id: string
  type: string
  title: string
  snippet: string
  occurredAt: IsoInstant | null
  score: number
  sourceLabel: string
}

export interface SearchPage {
  results: SearchHit[]
  nextCursor: string | null
  mode: 'semantic' | 'keyword'
}

export interface CaptureUploadTarget {
  uploadUrl: string
  storagePath: string
  expiresIn: number
}

export interface ReferralSummary {
  code: string
  redemptionCount: number
  /** Latest expiry across the user's unrevoked bonuses; null when none is active. */
  bonusExpiresAt: IsoInstant | null
  activeBonuses: number
}

export interface ExportStatusView {
  requestId: string
  status: ExportStatus
  downloadUrl: string | null
  expiresAt: IsoInstant | null
}

export interface DeleteHistoryResult {
  deletedCount: number
}
