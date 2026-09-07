/**
 * Closed vocabularies shared by the database, the edge functions, the AI
 * structured-output schemas and both clients. Adding a member here is a
 * migration-level change: the Postgres enums in
 * `supabase/migrations/0001_core_schema.sql` mirror these lists exactly, and
 * `supabase/tests/enum-parity.test.ts` fails the build if they drift.
 */

export const IMPORTANCE_LEVELS = ['critical', 'high', 'normal', 'low'] as const
export type Importance = (typeof IMPORTANCE_LEVELS)[number]

/** Ordered most- to least-urgent; index doubles as a sort key. */
export const IMPORTANCE_RANK: Record<Importance, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
}

export const EMAIL_CATEGORIES = [
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
] as const
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number]

export const PROVIDERS = ['google', 'microsoft', 'apple', 'device', 'demo'] as const
export type Provider = (typeof PROVIDERS)[number]

export const ACCOUNT_KINDS = ['mail', 'calendar', 'tasks', 'contacts'] as const
export type AccountKind = (typeof ACCOUNT_KINDS)[number]

export const CONNECTION_STATUSES = [
  'connected',
  'expired',
  'revoked',
  'error',
  'disconnected',
] as const
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number]

export const APPROVAL_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'executing',
  'executed',
  'failed',
  'expired',
] as const
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]

export const APPROVAL_ACTION_TYPES = [
  'email_send',
  'calendar_create',
  'calendar_update',
  'task_create',
  'reminder_create',
  'commitment_create',
] as const
export type ApprovalActionType = (typeof APPROVAL_ACTION_TYPES)[number]

export const LIFE_EVENT_TYPES = [
  'shipment',
  'flight',
  'reservation',
  'payment',
  'subscription',
  'security',
] as const
export type LifeEventType = (typeof LIFE_EVENT_TYPES)[number]

export const BRIEFING_KINDS = ['morning', 'midday', 'evening', 'weekly'] as const
export type BriefingKind = (typeof BRIEFING_KINDS)[number]

export const BRIEFING_STATUSES = ['queued', 'generating', 'ready', 'failed', 'skipped'] as const
export type BriefingStatus = (typeof BRIEFING_STATUSES)[number]

export const COMMITMENT_DIRECTIONS = ['user_owes', 'other_owes'] as const
/** `user_owes`: the user promised something. `other_owes`: someone promised the user. */
export type CommitmentDirection = (typeof COMMITMENT_DIRECTIONS)[number]

export const COMMITMENT_STATUSES = ['open', 'done', 'snoozed', 'cancelled', 'overdue'] as const
export type CommitmentStatus = (typeof COMMITMENT_STATUSES)[number]

export const TASK_STATUSES = ['open', 'done', 'cancelled'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const PRIORITY_RULE_KINDS = [
  'sender_always_important',
  'domain_always_important',
  'keyword_high_priority',
  'vip_always_notify',
  'category_low_priority',
  'mute_sender',
] as const
export type PriorityRuleKind = (typeof PRIORITY_RULE_KINDS)[number]

export const CAPTURE_KINDS = ['camera', 'photo', 'pdf', 'file', 'link', 'text'] as const
export type CaptureKind = (typeof CAPTURE_KINDS)[number]

export const CAPTURE_STATUSES = [
  'uploading',
  'queued',
  'analyzing',
  'ready',
  'failed',
] as const
export type CaptureStatus = (typeof CAPTURE_STATUSES)[number]

export const CAPTURE_INTENTS = [
  'event',
  'task',
  'deadline',
  'person',
  'note',
  'payment',
  'reservation',
  'travel',
  'product_info',
] as const
export type CaptureIntent = (typeof CAPTURE_INTENTS)[number]

export const NOTIFICATION_CATEGORIES = [
  'morning_briefing',
  'midday_pulse',
  'evening_close',
  'weekly_review',
  'critical_email',
  'meeting',
  'deadline',
  'follow_up',
  'life_event',
  'approval',
] as const
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]

export const LOCK_SCREEN_PRIVACY = ['full', 'title_only', 'generic'] as const
export type LockScreenPrivacy = (typeof LOCK_SCREEN_PRIVACY)[number]

export const RETENTION_WINDOWS = ['30d', '90d', '1y', 'forever'] as const
export type RetentionWindow = (typeof RETENTION_WINDOWS)[number]

export const SOURCE_TYPES = [
  'email',
  'calendar_event',
  'task',
  'capture',
  'commitment',
  'notification',
  'contact',
  'user_input',
] as const
export type SourceType = (typeof SOURCE_TYPES)[number]

export const REPLY_TONES = ['short', 'professional', 'friendly', 'detailed'] as const
export type ReplyTone = (typeof REPLY_TONES)[number]

export const SUBSCRIPTION_STATUSES = [
  'free',
  'trialing',
  'active',
  'grace_period',
  'expired',
  'billing_issue',
] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

export const EXPORT_STATUSES = [
  'requested',
  'processing',
  'ready',
  'failed',
  'expired',
] as const
export type ExportStatus = (typeof EXPORT_STATUSES)[number]

export const SYNC_STATUSES = ['idle', 'syncing', 'backfilling', 'error'] as const
export type SyncStatus = (typeof SYNC_STATUSES)[number]

export const LOCALES = ['tr', 'en'] as const
export type Locale = (typeof LOCALES)[number]

export const FEEDBACK_SIGNALS = [
  'not_important',
  'more_like_this',
  'mark_vip',
  'stop_following',
  'good_summary',
  'bad_summary',
] as const
export type FeedbackSignal = (typeof FEEDBACK_SIGNALS)[number]
