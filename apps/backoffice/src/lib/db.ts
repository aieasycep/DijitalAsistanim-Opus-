import 'server-only'

import {
  AppError,
  isAppError,
  type ApprovalActionType,
  type ApprovalStatus,
  type CaptureKind,
  type CaptureStatus,
  type EmailCategory,
  type Importance,
  type Locale,
  type NotificationCategory,
} from '@da/domain'
import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js'
import { readEnv, readHashKey } from './env'
import { sha256Bytea, toHex } from './tokens'
import {
  buildKeysetPage,
  planKeyset,
  type KeysetCursor,
  type KeysetKey,
  type KeysetPage,
  type PageRequest,
} from './pagination'

/**
 * The only module in the backoffice that constructs a Supabase client, and the
 * only one that holds the service-role key.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE IS SHAPED THE WAY IT IS
 * ---------------------------------------------------------------------------
 *
 * The product promises publicly that nobody reads user mail and that support
 * cannot see message content. Migrations 0017 and 0019 make that true in the
 * database: the backoffice reads through `bo_*` views that do not contain a
 * content column at all, and `scripts/validate-supabase.mjs` re-derives every
 * view's column dependencies from `pg_depend` to prove it on each CI run.
 *
 * This module is the second half of the same guarantee, on the application
 * side. The service-role key bypasses row level security, so a query that named
 * `email_messages` would succeed. Four things stop that from ever being
 * written:
 *
 *   1. The Supabase client is module-private. It is never exported, never
 *      returned, and never passed to a caller, so no page can build its own
 *      query. Everything leaves this file as a plain typed row.
 *
 *   2. `queryView` accepts only `BoViewName`, a union derived from
 *      `BoViewRows`; `queryTable` accepts only `AdminTableName`, the operator-
 *      owned tables 0019 added. There is no overload, no `string` fallback and
 *      no generic escape hatch. Naming a base table that holds user content is
 *      a type error, not a code review finding — and the two compile-time
 *      assertions below prove neither union can grow to include one.
 *
 *   3. Every read passes a runtime check against a frozen registry. A cast
 *      through `as never` or a value arriving from `searchParams` still cannot
 *      reach a content table; it throws instead.
 *
 *   4. Columns holding a credential — `admin_invites.token_hash`,
 *      `admin_sessions.token_hash` — are refused on the way out. A session list
 *      that leaks the token hash is a session list that can be replayed
 *      offline, so those tables cannot be selected with `*` at all.
 *
 * The one deliberate exception is `sa_*`. Section 7 of the specification allows
 * a genuine support need to reach content through Support Access: authorised,
 * reasoned, time-limited, four-eyes, and logged. Those functions live in their
 * own section at the bottom of this file, take an `AdminActor` rather than a
 * bare id so a caller cannot borrow someone else's grant, and write a
 * `support_access_reveals` row inside the same database call that returns the
 * data. There is no other route to a message body from this application.
 */

// ===========================================================================
// Scalars
// ===========================================================================

export type IsoInstantString = string
export type IsoDateString = string

// ===========================================================================
// The admin vocabulary
//
// Mirrors the Postgres enums 0019 declares, in their declared order. These are
// local to the backoffice today because `@da/domain` does not carry the admin
// platform's enums yet; the moment it exports `ADMIN_ROLES` and friends, the
// arrays below become re-exports. They are plain string-literal unions, so a
// value typed against either definition assigns to the other.
// ===========================================================================

export const ADMIN_ROLES = [
  'super_admin',
  'operations',
  'support',
  'finance',
  'ai_ops',
  'analyst',
  'readonly',
] as const
export type AdminRole = (typeof ADMIN_ROLES)[number]

export const ADMIN_STATUSES = ['invited', 'active', 'disabled'] as const
export type AdminStatus = (typeof ADMIN_STATUSES)[number]

/**
 * The authorization vocabulary. Every server-side route guard names one of
 * these; a screen with no permission behind it is a screen nobody may open.
 */
export const ADMIN_PERMISSIONS = [
  'users.read',
  'users.export',
  'users.disable',
  'users.delete',
  'support.ticket.read',
  'support.ticket.write',
  'support.ticket.assign',
  'support.access.request',
  'support.access.approve',
  'support.access.reveal',
  'integration.read',
  'integration.resync',
  'integration.disconnect',
  'billing.read',
  'billing.grant',
  'billing.revoke',
  'flags.read',
  'flags.write',
  'announcement.read',
  'announcement.write',
  'prompt.read',
  'prompt.write',
  'prompt.activate',
  'ai.read',
  'ai.configure',
  'analytics.read',
  'audit.read',
  'audit.export',
  'privacy.read',
  'privacy.process',
  'admin.read',
  'admin.invite',
  'admin.role.write',
  'admin.disable',
  'system.health.read',
  'system.config.read',
] as const
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number]

export const SUPPORT_TICKET_STATUSES = [
  'open',
  'in_progress',
  'waiting_user',
  'resolved',
  'closed',
] as const
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number]

export const SUPPORT_TICKET_PRIORITIES = ['low', 'normal', 'high', 'critical'] as const
export type SupportTicketPriority = (typeof SUPPORT_TICKET_PRIORITIES)[number]

export const SUPPORT_TICKET_CATEGORIES = [
  'account',
  'integration',
  'sync',
  'billing',
  'ai_quality',
  'notification',
  'privacy',
  'other',
] as const
export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number]

export const SUPPORT_TICKET_CHANNELS = [
  'in_app',
  'email',
  'store_review',
  'internal',
  'phone',
] as const
export type SupportTicketChannel = (typeof SUPPORT_TICKET_CHANNELS)[number]

export const APP_PLATFORMS = ['ios', 'android', 'web'] as const
export type AppPlatform = (typeof APP_PLATFORMS)[number]

export const APP_PLANS = ['free', 'pro'] as const
export type AppPlan = (typeof APP_PLANS)[number]

export const ANNOUNCEMENT_AUDIENCES = ['all', 'free', 'pro', 'ios', 'android'] as const
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number]

export const PROMPT_STATUSES = ['draft', 'active', 'archived'] as const
export type PromptStatus = (typeof PROMPT_STATUSES)[number]

export const SYSTEM_HEALTH_STATUSES = ['operational', 'degraded', 'down', 'unknown'] as const
export type SystemHealthStatus = (typeof SYSTEM_HEALTH_STATUSES)[number]

export const ADMIN_GRANT_KINDS = [
  'trial_extension',
  'goodwill',
  'compensation',
  'beta_access',
] as const
export type AdminGrantKind = (typeof ADMIN_GRANT_KINDS)[number]

export const SUPPORT_ACCESS_SCOPES = [
  'identity',
  'email_subject',
  'email_body',
  'calendar_detail',
  'assistant_conversation',
  'capture_content',
  'approval_payload',
  'notification_content',
] as const
export type SupportAccessScope = (typeof SUPPORT_ACCESS_SCOPES)[number]

export const SUPPORT_ACCESS_STATUSES = [
  'pending_approval',
  'active',
  'denied',
  'expired',
  'revoked',
] as const
export type SupportAccessStatus = (typeof SUPPORT_ACCESS_STATUSES)[number]

export const HEALTH_OBSERVERS = ['cron', 'manual', 'webhook', 'probe'] as const
export type HealthObserver = (typeof HEALTH_OBSERVERS)[number]

/** The 0017 roster's three tiers. Superseded by `AdminRole`; still read. */
export type StaffRole = 'support' | 'ops' | 'admin'

// ===========================================================================
// Row shapes
//
// One interface per view, mirroring 0017/0019 column for column. `bigint`
// columns arrive from PostgREST as JSON numbers; every count and cost in the
// schema is far inside the safe integer range, so `number` is the honest type.
// `timestamptz` arrives as an ISO-8601 string and `date` as `YYYY-MM-DD`.
// ===========================================================================

export interface BoUserRow {
  user_id: string
  email_redacted: string | null
  email_domain: string | null
  locale: string
  time_zone: string
  is_onboarded: boolean
  onboarding_completed_at: IsoInstantString | null
  is_deleted: boolean
  deleted_at: IsoInstantString | null
  created_at: IsoInstantString
  updated_at: IsoInstantString
  subscription_status: string
  subscription_period_end: IsoInstantString | null
  trial_ends_at: IsoInstantString | null
  account_count: number
  account_connected_count: number
  account_error_count: number
  last_synced_at: IsoInstantString | null
  sync_error_count: number
  last_activity_at: IsoInstantString | null
}

export interface BoUserDetailRow {
  user_id: string
  email_redacted: string | null
  email_domain: string | null
  locale: string
  time_zone: string
  is_onboarded: boolean
  onboarding_completed_at: IsoInstantString | null
  is_deleted: boolean
  deleted_at: IsoInstantString | null
  created_at: IsoInstantString
  updated_at: IsoInstantString
  subscription_status: string
  subscription_store: string | null
  subscription_period_end: IsoInstantString | null
  trial_ends_at: IsoInstantString | null
  account_count: number
  account_connected_count: number
  account_error_count: number
  last_synced_at: IsoInstantString | null
  sync_resource_count: number
  sync_error_count: number
  sync_last_run_at: IsoInstantString | null
  approval_pending_count: number
  approval_executed_count: number
  approval_failed_count: number
  briefing_ready_count_30d: number
  briefing_failed_count_30d: number
  capture_count: number
  capture_failed_count: number
  export_open_count: number
  export_last_requested_at: IsoInstantString | null
  ai_cost_micros_30d: number
  ai_event_count_30d: number
  ai_last_event_at: IsoInstantString | null
  device_count: number
  device_platforms: string[]
  referral_code: string | null
  referral_redemption_count: number
  // ── Volume counters added by 0019's extension of 0017 ──────────────────
  // "743 emails processed, 2 failed" is the answer to most support questions,
  // and none of it requires reading a single message.
  email_thread_count: number
  email_thread_unread_count: number
  email_thread_action_required_count: number
  email_thread_suppressed_count: number
  email_last_message_at: IsoInstantString | null
  email_message_count: number
  email_message_count_30d: number
  calendar_event_count: number
  calendar_event_count_30d: number
  task_open_count: number
  commitment_open_count: number
  commitment_overdue_count: number
  follow_up_waiting_count: number
  contact_count: number
  vip_count: number
  priority_rule_count: number
  learned_preference_count: number
  assistant_thread_count: number
  assistant_message_count: number
  assistant_last_message_at: IsoInstantString | null
  memory_chunk_count: number
  notification_sent_count_30d: number
  notification_failed_count_30d: number
  // ── The settings that explain most "it is not working" reports ─────────
  retention_window: string | null
  history_days: number | null
  learn_from_interactions: boolean | null
  analyze_attachments: boolean | null
  /** `HH:mm:ss` in the user's own zone. */
  morning_briefing_time: string | null
  briefing_on_weekends: boolean | null
  notify_only_if_important: boolean | null
  lock_screen_privacy: string | null
}

export interface BoAccountRow {
  account_id: string
  user_id: string
  provider: string
  kinds: string[]
  status: string
  is_primary: boolean
  email_redacted: string | null
  email_domain: string | null
  granted_scope_count: number
  granted_scopes: string[]
  last_synced_at: IsoInstantString | null
  last_error_code: string | null
  last_error_at: IsoInstantString | null
  has_stored_credentials: boolean
  credential_key_version: number | null
  access_token_expires_at: IsoInstantString | null
  credential_rotated_at: IsoInstantString | null
  sync_resource_count: number
  sync_error_count: number
  sync_last_run_at: IsoInstantString | null
  sync_next_run_at: IsoInstantString | null
  created_at: IsoInstantString
  updated_at: IsoInstantString
}

export interface BoSyncHealthRow {
  sync_state_id: string
  user_id: string
  connected_account_id: string
  provider: string
  account_status: string
  resource: string
  status: string
  consecutive_failures: number
  last_error_code: string | null
  last_run_at: IsoInstantString | null
  next_run_at: IsoInstantString | null
  backfill_cursor: IsoInstantString | null
  backfill_completed_at: IsoInstantString | null
  is_backfilling: boolean
  minutes_since_last_run: number | null
  is_stalled: boolean
  created_at: IsoInstantString
  updated_at: IsoInstantString
}

export interface BoApprovalRow {
  approval_id: string
  user_id: string
  type: string
  status: string
  source_type: string | null
  attempt_count: number
  failure_code: string | null
  expires_at: IsoInstantString
  is_overdue: boolean
  approved_at: IsoInstantString | null
  rejected_at: IsoInstantString | null
  executed_at: IsoInstantString | null
  next_attempt_at: IsoInstantString | null
  decision_seconds: number | null
  execution_seconds: number | null
  created_at: IsoInstantString
  updated_at: IsoInstantString
}

export interface BoAiSpendRow {
  user_id: string
  email_redacted: string | null
  event_count: number
  tokens_in: number
  tokens_out: number
  cost_micros: number
  cost_micros_24h: number
  cost_micros_7d: number
  cost_micros_30d: number
  event_count_30d: number
  model_count: number
  first_event_at: IsoInstantString | null
  last_event_at: IsoInstantString | null
}

export interface BoAiSpendDailyRow {
  usage_date: IsoDateString
  model: string
  operation: string
  event_count: number
  user_count: number
  tokens_in: number
  tokens_out: number
  cost_micros: number
}

export interface BoPrivacyRequestRow {
  request_id: string
  user_id: string
  email_redacted: string | null
  status: string
  size_bytes: number | null
  has_artifact: boolean
  failure_code: string | null
  requested_at: IsoInstantString
  ready_at: IsoInstantString | null
  expires_at: IsoInstantString | null
  is_expired: boolean
  age_hours: number
  fulfilment_minutes: number | null
  updated_at: IsoInstantString
}

export interface BoReferralRow {
  referral_id: string
  user_id: string
  email_redacted: string | null
  code: string
  redemption_count: number
  credit_count: number
  credit_active_count: number
  credit_revoked_count: number
  bonus_days_total: number
  last_credit_at: IsoInstantString | null
  created_at: IsoInstantString
  updated_at: IsoInstantString
}

/**
 * The forensic trail. 0019 redefined this view: every 0017 column is kept, in
 * its original order, plus the five that were promoted out of `metadata` so the
 * 400-day retention sweep can no longer erase who acted and why.
 */
export interface BoAuditRow {
  audit_id: string
  subject_user_id: string | null
  action: string | null
  entity_type: string | null
  entity_id: string | null
  actor: string | null
  staff_user_id: string | null
  staff_role: string | null
  outcome: string | null
  /** Staff-authored justification from the 0017 roster. `actor = 'staff'`. */
  staff_reason: string | null
  metadata_keys: string[] | null
  created_at: IsoInstantString
  /** The acting admin, as a real column rather than a metadata key. */
  actor_admin_user_id: string | null
  admin_role: AdminRole | null
  /** Set by trigger for every `admin.` / `support_access.` action. */
  is_sensitive: boolean
  /** The reason an operator typed before a destructive action. */
  admin_reason: string | null
  support_access_grant_id: string | null
}

export interface BoStaffRow {
  staff_user_id: string
  role: StaffRole
  email_redacted: string | null
  created_at: IsoInstantString
  disabled_at: IsoInstantString | null
  is_active: boolean
  action_count_30d: number
  last_action_at: IsoInstantString | null
}

export interface BoBriefingHealthRow {
  for_date: IsoDateString
  kind: string
  total_count: number
  user_count: number
  ready_count: number
  failed_count: number
  queued_count: number
  generating_count: number
  skipped_count: number
  opened_count: number
  avg_generation_seconds: number | null
}

export interface BoNotificationHealthRow {
  delivery_date: IsoDateString
  category: string
  total_count: number
  user_count: number
  sent_count: number
  delivered_count: number
  failed_count: number
  avg_attempt_count: number | null
}

export interface BoCaptureHealthRow {
  capture_date: IsoDateString
  kind: string
  total_count: number
  user_count: number
  ready_count: number
  failed_count: number
  analyzing_count: number
  uploading_count: number
  classified_count: number
  avg_size_bytes: number | null
  avg_analysis_seconds: number | null
}

export interface BoSignupDailyRow {
  signup_date: IsoDateString
  signup_count: number
  onboarded_count: number
  deleted_count: number
  avg_onboarding_minutes: number | null
}

export interface BoPlatformOverviewRow {
  generated_at: IsoInstantString
  user_total: number
  user_deleted_total: number
  user_new_24h: number
  user_new_7d: number
  user_active_7d: number
  subscription_active: number
  subscription_billing_issue: number
  account_total: number
  account_error: number
  sync_error: number
  sync_stalled: number
  approval_pending: number
  approval_overdue: number
  approval_failed_24h: number
  export_open: number
  export_failed_7d: number
  ai_cost_micros_24h: number
  ai_cost_micros_30d: number
  briefing_failed_24h: number
  notification_failed_24h: number
  staff_active: number
}

// ── 0019 views ─────────────────────────────────────────────────────────────

/** `admin_name`, not `display_name`: the blindness regex reserves the latter. */
export interface BoAdminUserRow {
  admin_user_id: string
  auth_user_id: string | null
  email_redacted: string | null
  email_domain: string | null
  admin_name: string | null
  role: AdminRole
  role_rank: number
  role_label: string
  status: AdminStatus
  is_active: boolean
  is_mfa_enrolled: boolean
  mfa_enrolled_at: IsoInstantString | null
  last_login_at: IsoInstantString | null
  invited_by_admin_user_id: string | null
  invited_at: IsoInstantString
  disabled_at: IsoInstantString | null
  permission_count: number
  active_session_count: number
  session_last_seen_at: IsoInstantString | null
  action_count_30d: number
  sensitive_count_30d: number
  last_action_at: IsoInstantString | null
  support_access_active_count: number
  created_at: IsoInstantString
  updated_at: IsoInstantString
}

export interface BoAdminPermissionRow {
  admin_user_id: string
  role: AdminRole
  permission: AdminPermission
}

export interface BoAdminSessionRow {
  session_id: string
  admin_user_id: string
  admin_role: AdminRole
  issued_at: IsoInstantString
  last_seen_at: IsoInstantString
  expires_at: IsoInstantString
  absolute_expires_at: IsoInstantString
  revoked_at: IsoInstantString | null
  is_active: boolean
  idle_minutes: number
  minutes_remaining: number
  created_at: IsoInstantString
}

export interface BoSupportTicketStatsRow {
  ticket_date: IsoDateString
  category: SupportTicketCategory
  priority: SupportTicketPriority
  total_count: number
  open_count: number
  in_progress_count: number
  waiting_user_count: number
  resolved_count: number
  closed_count: number
  overdue_count: number
  avg_first_response_minutes: number | null
  avg_resolution_hours: number | null
}

export interface BoSupportAccessGrantRow {
  grant_id: string
  admin_user_id: string
  admin_email_redacted: string | null
  admin_role: AdminRole
  subject_user_id: string
  subject_email_redacted: string | null
  scopes: SupportAccessScope[]
  scope_count: number
  reason: string
  ticket_id: string | null
  status: SupportAccessStatus
  requested_at: IsoInstantString
  approved_by_admin_user_id: string | null
  approved_at: IsoInstantString | null
  granted_at: IsoInstantString | null
  expires_at: IsoInstantString
  denied_at: IsoInstantString | null
  revoked_at: IsoInstantString | null
  /** The only column that decides whether a reveal will be allowed. */
  is_live: boolean
  minutes_remaining: number
  window_minutes: number
  has_recorded_consent: boolean
  user_consent_at: IsoInstantString | null
  reveal_count: number
  last_reveal_at: IsoInstantString | null
  created_at: IsoInstantString
  updated_at: IsoInstantString
}

export interface BoSupportAccessRevealRow {
  reveal_id: string
  grant_id: string
  admin_user_id: string
  admin_email_redacted: string | null
  admin_role: AdminRole
  subject_user_id: string
  scope: SupportAccessScope
  entity_type: string | null
  entity_id: string | null
  item_count: number
  request_id: string | null
  revealed_at: IsoInstantString
  grant_reason: string
  grant_expires_at: IsoInstantString
}

export interface BoFeatureFlagRow {
  flag_id: string
  key: string
  description: string
  enabled: boolean
  kill_switch: boolean
  rollout_percentage: number
  platforms: AppPlatform[]
  plans: AppPlan[]
  min_app_version: string | null
  max_app_version: string | null
  /** Computed the same way the evaluator computes it, so the list cannot lie. */
  effective_state: 'killed' | 'off' | 'on' | 'partial'
  override_count: number
  override_on_count: number
  override_off_count: number
  last_override_at: IsoInstantString | null
  created_by_admin_user_id: string | null
  updated_by_admin_user_id: string | null
  created_at: IsoInstantString
  updated_at: IsoInstantString
}

export interface BoFeatureFlagOverrideRow {
  override_id: string
  flag_id: string
  flag_key: string
  user_id: string
  user_email_redacted: string | null
  enabled: boolean
  reason: string
  created_by_admin_user_id: string
  expires_at: IsoInstantString | null
  is_expired: boolean
  created_at: IsoInstantString
  updated_at: IsoInstantString
}

/** `prompt_notes`, not `notes`: the blindness regex reserves the latter. */
export interface BoPromptVersionRow {
  prompt_version_id: string
  feature: string
  version: number
  status: PromptStatus
  model: string | null
  body_length: number
  body_fingerprint: string
  prompt_notes: string | null
  created_by_admin_user_id: string | null
  activated_by_admin_user_id: string | null
  activated_at: IsoInstantString | null
  archived_at: IsoInstantString | null
  event_count_30d: number
  cost_micros_30d: number
  last_used_at: IsoInstantString | null
  created_at: IsoInstantString
  updated_at: IsoInstantString
}

export interface BoSystemHealthRow {
  target: string
  status: SystemHealthStatus
  checked_at: IsoInstantString
  latency_ms: number | null
  error_code: string | null
  observed_by: HealthObserver
  minutes_since_check: number
  /** A probe that stopped running is unobserved, never its last green answer. */
  is_stale: boolean
  sample_count_24h: number
  degraded_count_24h: number
  down_count_24h: number
  avg_latency_ms_24h: number | null
  max_latency_ms_24h: number | null
}

export interface BoEntitlementGrantRow {
  grant_id: string
  user_id: string
  user_email_redacted: string | null
  kind: AdminGrantKind
  days: number
  reason: string
  granted_by_admin_user_id: string
  granted_by_email_redacted: string | null
  granted_at: IsoInstantString
  expires_at: IsoInstantString
  revoked_at: IsoInstantString | null
  revoked_by_admin_user_id: string | null
  is_live: boolean
  days_remaining: number
  ticket_id: string | null
  created_at: IsoInstantString
  updated_at: IsoInstantString
}

/** Store purchase, referral bonus or operator grant, in one shape. */
export interface BoEntitlementSourceRow {
  user_id: string
  source: 'store' | 'referral' | 'admin_grant'
  detail_status: string
  store: string | null
  grant_kind: AdminGrantKind | null
  days: number | null
  ends_at: IsoInstantString | null
  revoked_at: IsoInstantString | null
  source_id: string | null
}

/**
 * The complete map of what the backoffice can read. Adding a page means adding
 * a view to 0017/0019 and an entry here; there is no other way in.
 */
export interface BoViewRows {
  bo_users: BoUserRow
  bo_user_detail: BoUserDetailRow
  bo_accounts: BoAccountRow
  bo_sync_health: BoSyncHealthRow
  bo_approvals: BoApprovalRow
  bo_ai_spend: BoAiSpendRow
  bo_ai_spend_daily: BoAiSpendDailyRow
  bo_privacy_requests: BoPrivacyRequestRow
  bo_referrals: BoReferralRow
  bo_audit: BoAuditRow
  bo_staff: BoStaffRow
  bo_briefing_health: BoBriefingHealthRow
  bo_notification_health: BoNotificationHealthRow
  bo_capture_health: BoCaptureHealthRow
  bo_signup_daily: BoSignupDailyRow
  bo_platform_overview: BoPlatformOverviewRow
  bo_admin_users: BoAdminUserRow
  bo_admin_permissions: BoAdminPermissionRow
  bo_admin_sessions: BoAdminSessionRow
  bo_support_ticket_stats: BoSupportTicketStatsRow
  bo_support_access_grants: BoSupportAccessGrantRow
  bo_support_access_reveals: BoSupportAccessRevealRow
  bo_feature_flags: BoFeatureFlagRow
  bo_feature_flag_overrides: BoFeatureFlagOverrideRow
  bo_prompt_versions: BoPromptVersionRow
  bo_system_health: BoSystemHealthRow
  bo_entitlement_grants: BoEntitlementGrantRow
  bo_entitlement_sources: BoEntitlementSourceRow
}

export type BoViewName = keyof BoViewRows

// ===========================================================================
// Operator-owned tables
//
// 0019 added tables that hold no user content at all: the console's own roster,
// the support queue's triage fields, company-authored announcements and prompt
// bodies. Those are read and written directly, because there is nothing to
// blind — a `bo_*` view over `announcements` would only hide the text the
// company itself wrote and is about to publish.
//
// The boundary is drawn by `AdminTableName` and enforced twice: by the union
// itself, and by the compile-time assertion below proving it shares no member
// with `ContentTable`.
// ===========================================================================

export interface AdminUserTableRow {
  id: string
  user_id: string | null
  email: string
  display_name: string | null
  role: AdminRole
  status: AdminStatus
  last_login_at: IsoInstantString | null
  mfa_enrolled_at: IsoInstantString | null
  invited_by: string | null
  invited_at: IsoInstantString
  disabled_at: IsoInstantString | null
  disabled_reason: string | null
  created_at: IsoInstantString
  updated_at: IsoInstantString
}

export interface AdminInviteTableRow {
  id: string
  email: string
  role: AdminRole
  /** Never selectable. `assertSelectable` refuses any read naming it. */
  token_hash: string
  invited_by: string
  expires_at: IsoInstantString
  consumed_at: IsoInstantString | null
  consumed_by: string | null
  revoked_at: IsoInstantString | null
  revoked_reason: string | null
  revoked_by: string | null
  created_at: IsoInstantString
}

export interface AdminSessionTableRow {
  id: string
  admin_user_id: string
  /** Never selectable. */
  token_hash: string
  issued_at: IsoInstantString
  last_seen_at: IsoInstantString
  expires_at: IsoInstantString
  absolute_expires_at: IsoInstantString
  revoked_at: IsoInstantString | null
  revoked_reason: string | null
  /** Never selectable: 64 hex of sha256(ip + key). */
  ip_hash: string | null
  user_agent: string | null
  created_at: IsoInstantString
}

export interface AdminRoleTableRow {
  role: AdminRole
  rank: number
  label_tr: string
  description_tr: string
  is_assignable: boolean
  created_at: IsoInstantString
}

export interface AdminSensitiveActionTableRow {
  action: string
  description_tr: string
  requires_reason: boolean
  created_at: IsoInstantString
}

export interface SupportTicketTableRow {
  id: string
  reference: string
  subject_user_id: string | null
  status: SupportTicketStatus
  priority: SupportTicketPriority
  category: SupportTicketCategory
  channel: SupportTicketChannel
  subject: string
  body: string | null
  external_ref: string | null
  assigned_admin_user_id: string | null
  opened_by_admin_user_id: string | null
  due_at: IsoInstantString | null
  first_response_at: IsoInstantString | null
  resolved_at: IsoInstantString | null
  closed_at: IsoInstantString | null
  resolution_note: string | null
  created_at: IsoInstantString
  updated_at: IsoInstantString
}

export interface SupportNoteTableRow {
  id: string
  ticket_id: string
  admin_user_id: string
  body: string
  is_internal: boolean
  created_at: IsoInstantString
  updated_at: IsoInstantString
}

export interface FeatureFlagTableRow {
  id: string
  key: string
  description: string
  enabled: boolean
  kill_switch: boolean
  rollout_percentage: number
  platforms: AppPlatform[]
  plans: AppPlan[]
  min_app_version: string | null
  max_app_version: string | null
  created_by: string | null
  updated_by: string | null
  created_at: IsoInstantString
  updated_at: IsoInstantString
}

export interface FeatureFlagOverrideTableRow {
  id: string
  flag_id: string
  user_id: string
  enabled: boolean
  reason: string
  created_by: string
  expires_at: IsoInstantString | null
  created_at: IsoInstantString
  updated_at: IsoInstantString
}

export interface AnnouncementTableRow {
  id: string
  title: string
  body: string
  audience: AnnouncementAudience
  platforms: AppPlatform[]
  min_app_version: string | null
  locale: string
  starts_at: IsoInstantString
  ends_at: IsoInstantString | null
  dismissible: boolean
  /** Null is a draft, and a draft is never served whatever its window says. */
  published_at: IsoInstantString | null
  published_by: string | null
  created_by: string | null
  created_at: IsoInstantString
  updated_at: IsoInstantString
}

export interface PromptVersionTableRow {
  id: string
  feature: string
  version: number
  status: PromptStatus
  /** Company IP, not user content. The prompt editor reads it from here. */
  body: string
  /** Generated always: present on read, refused on write. */
  body_length: number
  /** Generated always: present on read, refused on write. */
  body_fingerprint: string
  notes: string | null
  model: string | null
  created_by: string | null
  activated_by: string | null
  activated_at: IsoInstantString | null
  archived_at: IsoInstantString | null
  created_at: IsoInstantString
  updated_at: IsoInstantString
}

export interface AdminEntitlementGrantTableRow {
  id: string
  user_id: string
  kind: AdminGrantKind
  days: number
  reason: string
  granted_by: string
  granted_at: IsoInstantString
  expires_at: IsoInstantString
  revoked_at: IsoInstantString | null
  revoked_by: string | null
  revoked_reason: string | null
  ticket_id: string | null
  created_at: IsoInstantString
  updated_at: IsoInstantString
}

export interface SupportAccessGrantTableRow {
  id: string
  admin_user_id: string
  subject_user_id: string
  scopes: SupportAccessScope[]
  reason: string
  ticket_id: string | null
  status: SupportAccessStatus
  requested_at: IsoInstantString
  approved_by: string | null
  approved_at: IsoInstantString | null
  granted_at: IsoInstantString | null
  expires_at: IsoInstantString
  denied_by: string | null
  denied_at: IsoInstantString | null
  denied_reason: string | null
  revoked_by: string | null
  revoked_at: IsoInstantString | null
  revoked_reason: string | null
  user_consent_ref: string | null
  user_consent_at: IsoInstantString | null
  reveal_count: number
  created_at: IsoInstantString
  updated_at: IsoInstantString
}

export interface AdminTableRows {
  admin_users: AdminUserTableRow
  admin_invites: AdminInviteTableRow
  admin_sessions: AdminSessionTableRow
  admin_roles: AdminRoleTableRow
  admin_sensitive_actions: AdminSensitiveActionTableRow
  support_tickets: SupportTicketTableRow
  support_notes: SupportNoteTableRow
  feature_flags: FeatureFlagTableRow
  feature_flag_overrides: FeatureFlagOverrideTableRow
  announcements: AnnouncementTableRow
  prompt_versions: PromptVersionTableRow
  admin_entitlement_grants: AdminEntitlementGrantTableRow
  support_access_grants: SupportAccessGrantTableRow
}

export type AdminTableName = keyof AdminTableRows

/**
 * The only table a console action may delete a row from.
 *
 * Everything else in the admin platform is disabled, revoked or expired rather
 * than deleted, because the audit trail has to keep resolving: `admin_users`
 * carries `on delete restrict` on its audit-bearing foreign keys precisely so a
 * DELETE fails loudly instead of orphaning a year of accountability. A stale
 * per-user flag pin has no such history, and removing it is the documented
 * remedy for a rollout that quietly became something else.
 */
export type DeletableTable = 'feature_flag_overrides'

// ---------------------------------------------------------------------------
// The refusal, in the type system
//
// `ContentTable` names the base tables that hold — or key — something a person
// wrote, received or was told. The assertions below fail to compile the moment
// `BoViewRows` or `AdminTableRows` gains a key that is one of them, so a future
// contributor cannot widen the query surface by adding a row type and
// forgetting why they must not. Checked at build time by `tsc --noEmit`, on
// every CI run.
// ---------------------------------------------------------------------------

export type ContentTable =
  | 'email_threads'
  | 'email_messages'
  | 'calendar_events'
  | 'assistant_threads'
  | 'assistant_messages'
  | 'memory_chunks'
  | 'captures'
  | 'briefings'
  | 'briefing_items'
  | 'insights'
  | 'life_events'
  | 'commitments'
  | 'contacts'
  | 'vip_people'
  | 'approval_actions'
  | 'notification_deliveries'
  | 'device_notifications'
  | 'tasks'
  | 'reminders'
  | 'follow_ups'
  | 'priority_rules'
  | 'learned_preferences'
  | 'ai_feedback'
  | 'profiles'
  | 'push_tokens'
  | 'oauth_credentials'
  | 'oauth_states'
  | 'sync_states'
  | 'connected_accounts'
  | 'data_export_requests'
  | 'referrals'
  | 'referral_credits'
  | 'subscriptions'
  | 'audit_logs'
  | 'support_access_reveals'

type Assert<T extends true> = T
type _ContentTablesAreUnreadable = Assert<
  Extract<BoViewName, ContentTable> extends never ? true : false
>
type _ContentTablesAreUnwritable = Assert<
  Extract<AdminTableName, ContentTable> extends never ? true : false
>

/**
 * The runtime half of the same refusal, for values that did not come from the
 * type checker — a query string, a cast, a JSON body. Frozen so it cannot be
 * mutated at runtime either.
 */
const READABLE_VIEWS: ReadonlySet<string> = Object.freeze(
  new Set<BoViewName>([
    'bo_users',
    'bo_user_detail',
    'bo_accounts',
    'bo_sync_health',
    'bo_approvals',
    'bo_ai_spend',
    'bo_ai_spend_daily',
    'bo_privacy_requests',
    'bo_referrals',
    'bo_audit',
    'bo_staff',
    'bo_briefing_health',
    'bo_notification_health',
    'bo_capture_health',
    'bo_signup_daily',
    'bo_platform_overview',
    'bo_admin_users',
    'bo_admin_permissions',
    'bo_admin_sessions',
    'bo_support_ticket_stats',
    'bo_support_access_grants',
    'bo_support_access_reveals',
    'bo_feature_flags',
    'bo_feature_flag_overrides',
    'bo_prompt_versions',
    'bo_system_health',
    'bo_entitlement_grants',
    'bo_entitlement_sources',
  ]),
)

const ADMIN_TABLES: ReadonlySet<string> = Object.freeze(
  new Set<AdminTableName>([
    'admin_users',
    'admin_invites',
    'admin_sessions',
    'admin_roles',
    'admin_sensitive_actions',
    'support_tickets',
    'support_notes',
    'feature_flags',
    'feature_flag_overrides',
    'announcements',
    'prompt_versions',
    'admin_entitlement_grants',
    'support_access_grants',
  ]),
)

const DELETABLE_TABLES: ReadonlySet<string> = Object.freeze(
  new Set<DeletableTable>(['feature_flag_overrides']),
)

/**
 * Columns that may be written but never read back.
 *
 * A token hash is a credential: anyone holding it can mount an offline attack
 * against the token it came from, and it is the one value in the admin platform
 * whose whole purpose is that it never leaves the database. `ip_hash` is here
 * for a different reason — it is a fact about a person's location, and no
 * console screen needs it.
 *
 * A table listed here cannot be selected with `*` at all: the caller must name
 * its columns, which is what makes the omission deliberate rather than lucky.
 */
const UNREADABLE_COLUMNS: Readonly<Partial<Record<AdminTableName, readonly string[]>>> =
  Object.freeze({
    admin_invites: ['token_hash'],
    admin_sessions: ['token_hash', 'ip_hash'],
  })

function assertReadableView(view: string): asserts view is BoViewName {
  if (!READABLE_VIEWS.has(view)) {
    throw new AppError('forbidden', {
      detail: `backoffice may only read the bo_* views; refused "${view}"`,
      status: 403,
    })
  }
}

function assertAdminTable(table: string): asserts table is AdminTableName {
  if (!ADMIN_TABLES.has(table)) {
    throw new AppError('forbidden', {
      detail: `backoffice may only reach operator-owned tables; refused "${table}"`,
      status: 403,
    })
  }
}

function assertSelectable(table: AdminTableName, columns: readonly string[] | undefined): void {
  const secret = UNREADABLE_COLUMNS[table]
  if (secret === undefined) return
  if (columns === undefined || columns.length === 0) {
    throw new AppError('forbidden', {
      detail: `${table} holds credential columns (${secret.join(', ')}); name the columns you need`,
      status: 403,
    })
  }
  for (const column of columns) {
    if (secret.includes(column)) {
      throw new AppError('forbidden', {
        detail: `${table}.${column} is never readable`,
        status: 403,
      })
    }
  }
}

/** The registry, for tests and for a page that wants to enumerate its sources. */
export function readableViews(): readonly BoViewName[] {
  return [...READABLE_VIEWS] as BoViewName[]
}

export function writableTables(): readonly AdminTableName[] {
  return [...ADMIN_TABLES] as AdminTableName[]
}

// ===========================================================================
// Query surface
// ===========================================================================

/**
 * The comparisons a filter may make.
 *
 * `is` is for null and boolean, as PostgREST spells it; `is_not` is the negation
 * — `neq` against null would compare against the four-letter string "null" and
 * silently match nothing, which is the kind of filter that makes a screen look
 * empty rather than broken. `ilike` is a case-insensitive pattern for the few
 * genuinely textual lookups the console has (a ticket reference, a flag key, a
 * mail domain); a pattern that opens with `%` cannot use an index, so anchor it.
 */
export type FilterOperator =
  'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'is' | 'is_not' | 'contains' | 'ilike'

export type FilterValue = string | number | boolean | null | readonly string[]

/** A filter is typed against the row, so a misspelled column will not compile. */
export interface ViewFilter<Row> {
  column: keyof Row & string
  op: FilterOperator
  value: FilterValue
}

export interface ViewOrder<Row> {
  column: keyof Row & string
  ascending?: boolean
  nullsFirst?: boolean
}

export interface ViewQuery<Row> {
  columns?: readonly (keyof Row & string)[]
  filters?: readonly ViewFilter<Row>[]
  order?: ViewOrder<Row> | readonly ViewOrder<Row>[]
  limit?: number
  offset?: number
  /**
   * A raw PostgREST `or=` expression. Built only by `pagination.ts`, which is
   * pure and has no other way to reach the database; it exists because a keyset
   * comparison is `(sort, id) < (a, b)` and PostgREST has no row-constructor
   * syntax. Nothing else should set it.
   */
  orPredicate?: string
}

export interface ViewPage<Row> {
  rows: readonly Row[]
  /** Exact row count matching the filters, from PostgREST — not a JS count. */
  total: number
}

// ===========================================================================
// The client
//
// Module-private. Two clients, both created lazily so a page that never touches
// the database (the sign-in screen, the 404) boots without configuration.
// ===========================================================================

let serviceClient: SupabaseClient | null = null
let authClient: SupabaseClient | null = null

function service(): SupabaseClient {
  if (serviceClient) return serviceClient
  const env = readEnv()
  serviceClient = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-client-info': 'da-backoffice' } },
  })
  return serviceClient
}

function auth(): SupabaseClient {
  if (authClient) return authClient
  const env = readEnv()
  authClient = createClient(env.supabaseUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-client-info': 'da-backoffice-auth' } },
  })
  return authClient
}

// ---------------------------------------------------------------------------
// Errors
//
// 0019 raises named refusals — the last super_admin, an overlapping grant, a
// reveal outside its scope — with a `hint` naming the rule. The hint is carried
// through on the `AppError` so a Server Action can render the specific Turkish
// sentence for that rule instead of a generic failure, without any caller ever
// seeing the raw Postgres message.
// ---------------------------------------------------------------------------

/** Hints 0019 raises. Anything else arrives as null. */
export const DATABASE_HINTS = [
  'admin_last_super_admin',
  'admin_reason_required',
  'admin_grant_overlap',
  'audit_actor_required',
  'audit_reason_required',
  'audit_detail_shape',
  'support_access_unknown_grant',
  'support_access_wrong_admin',
  'support_access_wrong_subject',
  'support_access_grant_not_live',
  'support_access_scope_denied',
  'support_access_permission_lost',
] as const
export type DatabaseHint = (typeof DATABASE_HINTS)[number]

function isDatabaseHint(value: string): value is DatabaseHint {
  return (DATABASE_HINTS as readonly string[]).includes(value)
}

/** The rule a failure broke, when the database named one. */
export function databaseHint(error: unknown): DatabaseHint | null {
  if (!isAppError(error)) return null
  const hint = error.values?.hint
  return typeof hint === 'string' && isDatabaseHint(hint) ? hint : null
}

function mapPostgrestError(error: PostgrestError): AppError {
  const detail = `${error.code ?? 'unknown'}: ${error.message}`
  const rawHint = typeof error.hint === 'string' ? error.hint : ''
  const values = isDatabaseHint(rawHint) ? { hint: rawHint } : undefined

  switch (error.code) {
    case 'PGRST116':
      return new AppError('not_found', { detail })
    case 'PGRST301':
    case '42501':
      return new AppError('forbidden', { detail, status: 403 })
    case '42P01':
      // The view is missing: migration 0017/0019 has not been applied here.
      return new AppError('server_unavailable', { detail, retryable: false })
    case '57014':
      return new AppError('network_timeout', { detail })
    case '23505':
      // A unique index refused a second row. Almost always a real race the
      // schema was built to lose on purpose: two prompt activations, two live
      // Support Access grants for the same pair.
      return new AppError('sync_conflict', { detail, ...(values ? { values } : {}) })
    case '23503':
    case '23514':
    case '22P02':
      return new AppError('validation_failed', { detail, ...(values ? { values } : {}) })
    case 'P0001': {
      if (rawHint.startsWith('support_access_')) {
        return new AppError('forbidden', { detail, status: 403, ...(values ? { values } : {}) })
      }
      return new AppError('validation_failed', { detail, ...(values ? { values } : {}) })
    }
    default:
      return new AppError('server_unavailable', { detail, retryable: true })
  }
}

function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error
  return new AppError('server_unavailable', {
    detail: error instanceof Error ? error.message : 'backoffice query failed',
    cause: error,
    retryable: true,
  })
}

/* eslint-disable @typescript-eslint/no-explicit-any --
 * PostgrestFilterBuilder is generic over a generated database type this app
 * deliberately does not have (generating it would pull every content column's
 * shape into the backoffice's type space). The builder is narrowed back to a
 * typed row on the way out of every function below, and this region is the only
 * untyped surface in the app. */
type QueryBuilder = any

function applyFilters(builder: QueryBuilder, filters: readonly ViewFilter<never>[]): QueryBuilder {
  let next: QueryBuilder = builder
  for (const filter of filters) {
    switch (filter.op) {
      case 'eq':
        next = next.eq(filter.column, filter.value)
        break
      case 'neq':
        next = next.neq(filter.column, filter.value)
        break
      case 'gt':
        next = next.gt(filter.column, filter.value)
        break
      case 'gte':
        next = next.gte(filter.column, filter.value)
        break
      case 'lt':
        next = next.lt(filter.column, filter.value)
        break
      case 'lte':
        next = next.lte(filter.column, filter.value)
        break
      case 'in':
        next = next.in(filter.column, Array.isArray(filter.value) ? [...filter.value] : [])
        break
      case 'is':
        next = next.is(filter.column, filter.value === null ? null : Boolean(filter.value))
        break
      case 'is_not':
        next = next.not(filter.column, 'is', filter.value === null ? null : Boolean(filter.value))
        break
      case 'ilike':
        next = next.ilike(filter.column, String(filter.value))
        break
      case 'contains':
        next = next.contains(filter.column, Array.isArray(filter.value) ? [...filter.value] : [])
        break
      default:
        break
    }
  }
  return next
}

function applyQuery<Row>(builder: QueryBuilder, query: ViewQuery<Row>): QueryBuilder {
  let next: QueryBuilder = applyFilters(
    builder,
    (query.filters ?? []) as readonly ViewFilter<never>[],
  )

  if (query.orPredicate !== undefined && query.orPredicate !== '') {
    next = next.or(query.orPredicate)
  }

  const orders = query.order === undefined ? [] : toArray(query.order)
  for (const order of orders) {
    next = next.order(order.column, {
      ascending: order.ascending ?? false,
      nullsFirst: order.nullsFirst ?? false,
    })
  }

  const limit = query.limit ?? 100
  const offset = query.offset ?? 0
  next = next.range(offset, offset + limit - 1)
  return next
}

async function runRows<Row>(builder: QueryBuilder): Promise<readonly Row[]> {
  const { data, error } = await builder
  if (error) throw mapPostgrestError(error as PostgrestError)
  return (data ?? []) as Row[]
}

async function runCount(builder: QueryBuilder): Promise<number> {
  const { error, count } = await builder
  if (error) throw mapPostgrestError(error as PostgrestError)
  return typeof count === 'number' ? count : 0
}

async function runSingle<Row>(builder: QueryBuilder): Promise<Row | null> {
  const rows = await runRows<Row>(builder)
  return rows[0] ?? null
}

/**
 * The write builder for an operator-owned table.
 *
 * `supabase-js` types `insert` and `update` against a generated database type
 * this app deliberately does not have; with a generic table name it collapses
 * the union of every row shape to `never`. The name has already passed
 * `assertAdminTable`, and the values are typed against `AdminTableRows[T]` at
 * every call site, so the narrowing happens above this line rather than inside
 * a library type that does not know the schema.
 */
function tableBuilder(table: AdminTableName): QueryBuilder {
  return service().from(table)
}

async function callRpc<Result>(name: AdminRpcName, args: Record<string, unknown>): Promise<Result> {
  assertRpcName(name)
  const { data, error } = await service().rpc(name, args)
  if (error) throw mapPostgrestError(error as PostgrestError)
  return data as Result
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function toArray<T>(value: T | readonly T[]): readonly T[] {
  return Array.isArray(value) ? value : [value as T]
}

function selectList(columns: readonly string[] | undefined): string {
  // `*` is safe on a bo_* view in a way it is nowhere else in this codebase:
  // 0017 and 0019 guarantee the view has no content column to widen onto.
  return columns && columns.length > 0 ? columns.join(',') : '*'
}

// ===========================================================================
// Reading a content-blind view
// ===========================================================================

/**
 * Read rows from a content-blind view.
 *
 * `view` is constrained to `BoViewName`, so there is no spelling of this call
 * that reaches a base table, and `assertReadableView` re-checks at runtime for
 * values the type checker never saw.
 */
export async function queryView<V extends BoViewName>(
  view: V,
  query: ViewQuery<BoViewRows[V]> = {},
): Promise<readonly BoViewRows[V][]> {
  assertReadableView(view)
  try {
    const builder = service().from(view).select(selectList(query.columns))
    return await runRows<BoViewRows[V]>(applyQuery(builder, query))
  } catch (error) {
    throw toAppError(error)
  }
}

/**
 * As `queryView`, plus the exact total matching the filters.
 *
 * Use it only where the total is the answer — a reconciliation report, a
 * ranked top-ten. For walking a list, `queryViewKeyset` is both faster and
 * stable under concurrent writes.
 */
export async function queryViewPage<V extends BoViewName>(
  view: V,
  query: ViewQuery<BoViewRows[V]> = {},
): Promise<ViewPage<BoViewRows[V]>> {
  assertReadableView(view)
  try {
    const builder = service().from(view).select(selectList(query.columns), { count: 'exact' })
    const { data, error, count } = await applyQuery(builder, query)
    if (error) throw mapPostgrestError(error as PostgrestError)
    return { rows: (data ?? []) as BoViewRows[V][], total: count ?? 0 }
  } catch (error) {
    throw toAppError(error)
  }
}

/** The first matching row, or null. */
export async function queryViewOne<V extends BoViewName>(
  view: V,
  query: ViewQuery<BoViewRows[V]> = {},
): Promise<BoViewRows[V] | null> {
  const rows = await queryView(view, { ...query, limit: 1 })
  return rows[0] ?? null
}

/**
 * One keyset page of a view.
 *
 * The cursor is a position in the data, so paging cannot skip a row that
 * arrived while an operator was reading, and page 400 costs the same index seek
 * as page 1. `key.sortColumn` must be NOT NULL in the view: a null sorts
 * outside every comparison and would silently truncate the walk.
 */
export async function queryViewKeyset<V extends BoViewName>(
  view: V,
  options: {
    key: KeysetKey
    request: PageRequest
    cursorOf: (row: BoViewRows[V]) => KeysetCursor
    columns?: readonly (keyof BoViewRows[V] & string)[]
    filters?: readonly ViewFilter<BoViewRows[V]>[]
  },
): Promise<KeysetPage<BoViewRows[V]>> {
  const plan = planKeyset(options.key, options.request)
  const rows = await queryView(view, {
    ...(options.columns ? { columns: options.columns } : {}),
    ...(options.filters ? { filters: options.filters } : {}),
    ...(plan.predicate === null ? {} : { orPredicate: plan.predicate }),
    order: [
      { column: options.key.sortColumn as keyof BoViewRows[V] & string, ascending: plan.ascending },
      { column: options.key.idColumn as keyof BoViewRows[V] & string, ascending: plan.ascending },
    ],
    limit: plan.fetchSize,
  })
  return buildKeysetPage(rows, options.request, options.cursorOf, plan)
}

/**
 * A count computed by Postgres, not by fetching rows and measuring the array.
 * `head: true` means no row bodies cross the wire at all.
 */
export async function countView<V extends BoViewName>(
  view: V,
  filters: readonly ViewFilter<BoViewRows[V]>[] = [],
): Promise<number> {
  assertReadableView(view)
  try {
    const builder = service().from(view).select('*', { count: 'exact', head: true })
    return await runCount(applyQuery(builder, { filters }))
  } catch (error) {
    throw toAppError(error)
  }
}

/**
 * Several counts over one view, each computed in SQL.
 *
 * This is the shape almost every dashboard tile needs — "open, in progress,
 * waiting, overdue" — and the alternative is fetching the rows and counting
 * them in JavaScript, which means transferring a table to count it. The
 * requests run concurrently, so N buckets cost one round trip's latency rather
 * than N.
 */
export async function countBuckets<V extends BoViewName, K extends string>(
  view: V,
  buckets: Readonly<Record<K, readonly ViewFilter<BoViewRows[V]>[]>>,
): Promise<Record<K, number>> {
  const keys = Object.keys(buckets) as K[]
  const counts = await Promise.all(keys.map((key) => countView(view, buckets[key])))
  const result = {} as Record<K, number>
  keys.forEach((key, index) => {
    result[key] = counts[index] ?? 0
  })
  return result
}

/**
 * The single row at one end of an ordering — the newest audit entry, the
 * longest-running sync, the most expensive account.
 *
 * `order by … limit 1` is an index seek. The JavaScript alternative is fetching
 * every row to run `Math.max`, which is the exact thing server-side pagination
 * exists to prevent.
 */
export async function extremeOf<V extends BoViewName>(
  view: V,
  options: {
    column: keyof BoViewRows[V] & string
    ascending?: boolean
    filters?: readonly ViewFilter<BoViewRows[V]>[]
    columns?: readonly (keyof BoViewRows[V] & string)[]
  },
): Promise<BoViewRows[V] | null> {
  const rows = await queryView(view, {
    ...(options.columns ? { columns: options.columns } : {}),
    ...(options.filters ? { filters: options.filters } : {}),
    order: { column: options.column, ascending: options.ascending ?? false, nullsFirst: false },
    limit: 1,
  })
  return rows[0] ?? null
}

// ===========================================================================
// Reading and writing an operator-owned table
// ===========================================================================

export interface TableQuery<Row> {
  columns?: readonly (keyof Row & string)[]
  filters?: readonly ViewFilter<Row>[]
  order?: ViewOrder<Row> | readonly ViewOrder<Row>[]
  limit?: number
  offset?: number
  orPredicate?: string
}

export async function queryTable<T extends AdminTableName>(
  table: T,
  query: TableQuery<AdminTableRows[T]> = {},
): Promise<readonly AdminTableRows[T][]> {
  assertAdminTable(table)
  assertSelectable(table, query.columns)
  try {
    const builder = service().from(table).select(selectList(query.columns))
    return await runRows<AdminTableRows[T]>(applyQuery(builder, query))
  } catch (error) {
    throw toAppError(error)
  }
}

export async function queryTableOne<T extends AdminTableName>(
  table: T,
  query: TableQuery<AdminTableRows[T]> = {},
): Promise<AdminTableRows[T] | null> {
  const rows = await queryTable(table, { ...query, limit: 1 })
  return rows[0] ?? null
}

export async function countTable<T extends AdminTableName>(
  table: T,
  filters: readonly ViewFilter<AdminTableRows[T]>[] = [],
): Promise<number> {
  assertAdminTable(table)
  try {
    const builder = service().from(table).select('*', { count: 'exact', head: true })
    return await runCount(applyQuery(builder, { filters }))
  } catch (error) {
    throw toAppError(error)
  }
}

export async function queryTableKeyset<T extends AdminTableName>(
  table: T,
  options: {
    key: KeysetKey
    request: PageRequest
    cursorOf: (row: AdminTableRows[T]) => KeysetCursor
    columns?: readonly (keyof AdminTableRows[T] & string)[]
    filters?: readonly ViewFilter<AdminTableRows[T]>[]
  },
): Promise<KeysetPage<AdminTableRows[T]>> {
  const plan = planKeyset(options.key, options.request)
  const rows = await queryTable(table, {
    ...(options.columns ? { columns: options.columns } : {}),
    ...(options.filters ? { filters: options.filters } : {}),
    ...(plan.predicate === null ? {} : { orPredicate: plan.predicate }),
    order: [
      {
        column: options.key.sortColumn as keyof AdminTableRows[T] & string,
        ascending: plan.ascending,
      },
      {
        column: options.key.idColumn as keyof AdminTableRows[T] & string,
        ascending: plan.ascending,
      },
    ],
    limit: plan.fetchSize,
  })
  return buildKeysetPage(rows, options.request, options.cursorOf, plan)
}

/**
 * Values for an insert.
 *
 * `Partial` rather than a hand-maintained required/optional split: the database
 * already declares which columns are NOT NULL, which have defaults and which are
 * `generated always`, and duplicating that here would create a second source of
 * truth that drifts. A missing required column is a `23502` from Postgres, which
 * `mapPostgrestError` turns into a typed failure — the constraint is enforced
 * where it is declared.
 */
export type TableInsert<T extends AdminTableName> = Partial<AdminTableRows[T]>

export async function insertRow<T extends AdminTableName>(
  table: T,
  values: TableInsert<T>,
  returning?: readonly (keyof AdminTableRows[T] & string)[],
): Promise<AdminTableRows[T]> {
  assertAdminTable(table)
  assertSelectable(table, returning)
  try {
    const builder = tableBuilder(table).insert(values).select(selectList(returning)).limit(1)
    const row = await runSingle<AdminTableRows[T]>(builder)
    if (row === null) {
      throw new AppError('server_unavailable', {
        detail: `${table} insert returned no row`,
        retryable: false,
      })
    }
    return row
  } catch (error) {
    throw toAppError(error)
  }
}

/**
 * Update matching rows and return them.
 *
 * At least one filter is required. An unfiltered `update` on `admin_users` would
 * rewrite the whole roster in one statement, and the mistake that produces it is
 * a forgotten `.eq()` — so it is refused here rather than reviewed for.
 */
export async function updateRows<T extends AdminTableName>(
  table: T,
  patch: Partial<AdminTableRows[T]>,
  filters: readonly ViewFilter<AdminTableRows[T]>[],
  returning?: readonly (keyof AdminTableRows[T] & string)[],
): Promise<readonly AdminTableRows[T][]> {
  assertAdminTable(table)
  assertSelectable(table, returning)
  if (filters.length === 0) {
    throw new AppError('forbidden', {
      detail: `refusing an unfiltered update on ${table}`,
      status: 403,
    })
  }
  try {
    const builder = tableBuilder(table).update(patch)
    const filtered = applyFilters(builder, filters as readonly ViewFilter<never>[])
    return await runRows<AdminTableRows[T]>(filtered.select(selectList(returning)))
  } catch (error) {
    throw toAppError(error)
  }
}

/**
 * Delete matching rows from the one table that may be deleted from.
 *
 * See `DeletableTable`: everything else in the admin platform is disabled,
 * revoked or expired, because the audit trail has to keep resolving.
 */
export async function deleteRows<T extends DeletableTable>(
  table: T,
  filters: readonly ViewFilter<AdminTableRows[T]>[],
): Promise<number> {
  if (!DELETABLE_TABLES.has(table)) {
    throw new AppError('forbidden', {
      detail: `${table} rows are retained, never deleted`,
      status: 403,
    })
  }
  if (filters.length === 0) {
    throw new AppError('forbidden', {
      detail: `refusing an unfiltered delete on ${table}`,
      status: 403,
    })
  }
  try {
    const builder = tableBuilder(table).delete()
    const filtered = applyFilters(builder, filters as readonly ViewFilter<never>[])
    const rows = await runRows<{ id: string }>(filtered.select('id'))
    return rows.length
  } catch (error) {
    throw toAppError(error)
  }
}

// ===========================================================================
// Remote procedures
//
// A closed union, because a `string` here would be a way to call anything the
// service role can execute — including the `sa_reveal_*` family, which is the
// one path in this schema that returns a user's own words.
// ===========================================================================

const ADMIN_RPCS = [
  'admin_resolve_by_auth_user',
  'admin_has_permission',
  'admin_permissions_for',
  'admin_touch_session',
  'admin_revoke_sessions',
  'admin_enforce_rate_limit',
  'admin_write_audit',
  'admin_record_health_check',
  'admin_cleanup_expired',
  'feature_flag_is_enabled',
  'sa_reveal_identity',
  'sa_reveal_email_subjects',
  'sa_reveal_email_message',
  'sa_reveal_calendar_events',
  'sa_reveal_assistant_thread',
  'sa_reveal_capture',
  'sa_reveal_approval',
  'sa_reveal_notification',
] as const

export type AdminRpcName = (typeof ADMIN_RPCS)[number]

const RPC_NAMES: ReadonlySet<string> = Object.freeze(new Set<string>(ADMIN_RPCS))

function assertRpcName(name: string): asserts name is AdminRpcName {
  if (!RPC_NAMES.has(name)) {
    throw new AppError('forbidden', { detail: `unknown admin procedure "${name}"`, status: 403 })
  }
}

// ===========================================================================
// Admin identity
//
// `AdminActor` is the console's proof that a request belongs to a real, active
// administrator. It carries a brand only this module can produce: the symbol is
// never exported, so no page, action or component can fabricate one by writing
// an object literal. The only ways to obtain one are the three resolvers below,
// and every one of them asks the database — `admin_resolve_by_auth_user`
// returns no rows for a normal product account, `admin_touch_session` returns
// none for a session that has expired, been revoked, or belongs to a disabled
// admin, and `resolveAdminById` re-reads `admin_users` rather than trusting the
// id it was handed.
//
// That is the separation the specification asks for: authenticating as a
// Dijital Asistan user grants nothing here.
// ===========================================================================

const ADMIN_ACTOR_BRAND: unique symbol = Symbol('da.backoffice.admin-actor')

export interface AdminActor {
  /** Unforgeable outside this module. */
  readonly brand: typeof ADMIN_ACTOR_BRAND
  readonly adminUserId: string
  readonly role: AdminRole
  /**
   * The operator's own address, unredacted. This is the one full address the
   * backoffice ever renders, and it belongs to the person reading the screen.
   */
  readonly email: string
  readonly displayName: string | null
  readonly authUserId: string | null
  /** Present when the actor came from a server-side session. */
  readonly sessionId: string | null
  readonly mfaEnrolledAt: IsoInstantString | null
  readonly lastLoginAt: IsoInstantString | null
}

interface AdminResolveRow {
  admin_user_id: string
  role: AdminRole
  status: AdminStatus
  email: string
  display_name: string | null
  mfa_enrolled_at: IsoInstantString | null
  last_login_at: IsoInstantString | null
}

interface AdminTouchRow {
  session_id: string
  admin_user_id: string
  role: AdminRole
  expires_at: IsoInstantString
  absolute_expires_at: IsoInstantString
}

/**
 * Turn a verified GoTrue subject into an admin identity.
 *
 * Null for a normal product account, for an invited admin who has not been
 * activated, and for a disabled one — `admin_resolve_by_auth_user` filters on
 * `status = 'active' and disabled_at is null`, so the deny is in the database
 * rather than in a condition a caller might forget.
 */
export async function resolveAdminByAuthUser(authUserId: string): Promise<AdminActor | null> {
  try {
    const rows = await callRpc<AdminResolveRow[] | null>('admin_resolve_by_auth_user', {
      p_user_id: authUserId,
    })
    const row = (rows ?? [])[0]
    if (row === undefined) return null
    return {
      brand: ADMIN_ACTOR_BRAND,
      adminUserId: row.admin_user_id,
      role: row.role,
      email: row.email,
      displayName: row.display_name,
      authUserId,
      sessionId: null,
      mfaEnrolledAt: row.mfa_enrolled_at,
      lastLoginAt: row.last_login_at,
    }
  } catch (error) {
    throw toAppError(error)
  }
}

/**
 * Mint an actor from an admin id that some other session mechanism has already
 * established.
 *
 * The bridge for a sign-in flow that owns its own cookie and session table
 * handling: it hands over the `admin_users.id` it validated, and gets back an
 * actor that `runAdminAction` will accept. It is not a trust shortcut — the row
 * is re-read here with the same `status = 'active' and disabled_at is null`
 * filter the database's own resolvers apply, so an admin disabled between the
 * session check and this call resolves to null.
 */
export async function resolveAdminById(
  adminUserId: string,
  sessionId: string | null = null,
): Promise<AdminActor | null> {
  try {
    const row = await queryTableOne('admin_users', {
      columns: [
        'id',
        'user_id',
        'email',
        'display_name',
        'role',
        'status',
        'disabled_at',
        'mfa_enrolled_at',
        'last_login_at',
      ],
      filters: [
        { column: 'id', op: 'eq', value: adminUserId },
        { column: 'status', op: 'eq', value: 'active' },
        { column: 'disabled_at', op: 'is', value: null },
      ],
    })
    if (row === null) return null
    return {
      brand: ADMIN_ACTOR_BRAND,
      adminUserId: row.id,
      role: row.role,
      email: row.email,
      displayName: row.display_name,
      authUserId: row.user_id,
      sessionId,
      mfaEnrolledAt: row.mfa_enrolled_at,
      lastLoginAt: row.last_login_at,
    }
  } catch (error) {
    throw toAppError(error)
  }
}

export interface AdminSessionTouch {
  actor: AdminActor
  sessionId: string
  expiresAt: IsoInstantString
  absoluteExpiresAt: IsoInstantString
}

/**
 * Validate a session token and slide its idle deadline, in one statement.
 *
 * The cookie carries an opaque token; only its SHA-256 is stored, so this
 * hashes what was presented and looks that up. Expiry is decided by the
 * database on every request rather than trusted from the cookie, which is what
 * makes "log out all sessions" a fact rather than a suggestion.
 */
export async function touchAdminSession(
  rawToken: string,
  idleWindow = '2 hours',
): Promise<AdminSessionTouch | null> {
  try {
    const tokenHash = await sha256Bytea(rawToken)
    const rows = await callRpc<AdminTouchRow[] | null>('admin_touch_session', {
      p_token_hash: tokenHash,
      p_idle_window: idleWindow,
    })
    const row = (rows ?? [])[0]
    if (row === undefined) return null

    const profile = await queryTableOne('admin_users', {
      columns: ['id', 'user_id', 'email', 'display_name', 'mfa_enrolled_at', 'last_login_at'],
      filters: [{ column: 'id', op: 'eq', value: row.admin_user_id }],
    })
    if (profile === null) return null

    return {
      actor: {
        brand: ADMIN_ACTOR_BRAND,
        adminUserId: row.admin_user_id,
        role: row.role,
        email: profile.email,
        displayName: profile.display_name,
        authUserId: profile.user_id,
        sessionId: row.session_id,
        mfaEnrolledAt: profile.mfa_enrolled_at,
        lastLoginAt: profile.last_login_at,
      },
      sessionId: row.session_id,
      expiresAt: row.expires_at,
      absoluteExpiresAt: row.absolute_expires_at,
    }
  } catch (error) {
    throw toAppError(error)
  }
}

/**
 * Bind an actor to a session it was issued for.
 *
 * Used at sign-in, where the identity comes from GoTrue and the session row is
 * created immediately afterwards. It re-brands rather than mutating, so an
 * actor is still only ever produced inside this module.
 */
export function withSession(actor: AdminActor, sessionId: string): AdminActor {
  return { ...actor, sessionId }
}

/** The server-side authorization check. Hiding a menu item is not security. */
export async function adminHasPermission(
  actor: AdminActor,
  permission: AdminPermission,
): Promise<boolean> {
  try {
    return await callRpc<boolean>('admin_has_permission', {
      p_admin_user_id: actor.adminUserId,
      p_permission: permission,
    })
  } catch (error) {
    throw toAppError(error)
  }
}

/**
 * Every permission this admin currently holds.
 *
 * Empty for a disabled account — deny by default falls out of the function
 * rather than out of a filter someone might forget. Load it once per request
 * and pass the set around rather than asking per control.
 */
export async function adminPermissions(actor: AdminActor): Promise<ReadonlySet<AdminPermission>> {
  try {
    const rows = await callRpc<AdminPermission[] | null>('admin_permissions_for', {
      p_admin_user_id: actor.adminUserId,
    })
    return new Set(rows ?? [])
  } catch (error) {
    throw toAppError(error)
  }
}

/**
 * Revoke an admin's sessions. Returns how many were live.
 *
 * `exceptSessionId` keeps the caller's own session so an operator can evict a
 * cookie they do not recognise without locking themselves out.
 */
export async function revokeAdminSessions(
  adminUserId: string,
  reason: string,
  exceptSessionId: string | null = null,
): Promise<number> {
  try {
    return await callRpc<number>('admin_revoke_sessions', {
      p_admin_user_id: adminUserId,
      p_reason: reason,
      p_except_session_id: exceptSessionId,
    })
  } catch (error) {
    throw toAppError(error)
  }
}

// ---------------------------------------------------------------------------
// Hashing
//
// `admin_rate_limits.subject_key` and `admin_sessions.ip_hash` are constrained
// to 64 lowercase hex precisely so a raw address or IP cannot be written into
// them. An unkeyed SHA-256 of an email address is reversible with a word list,
// so the hash is keyed with server-side material that never leaves this process.
//
// The unkeyed token digest is not here: `sha256Bytea` in `./tokens` is what a
// session and an invite are stored as, and it lives in a module with no
// dependencies so that "only the digest is stored" is a property with a test
// rather than a line of prose.
// ---------------------------------------------------------------------------

const encoder = new TextEncoder()

/** 64 lowercase hex, keyed. The shape the schema's constraints require. */
export async function hashIdentifier(scope: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(readHashKey()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${scope}:${value}`))
  return toHex(signature)
}

/**
 * Atomic fixed-window rate limit. True when the call is inside the budget.
 *
 * The increment and the check are one statement in the database, so two
 * concurrent sign-in attempts cannot both read n and both write n + 1.
 */
const RATE_LIMIT_SCOPE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/

export async function enforceRateLimit(options: {
  scope: string
  /** Raw identifier — an admin id, an address, an IP. Hashed before it is stored. */
  subject: string
  limit: number
  window: string
}): Promise<boolean> {
  // The same shape `admin_rate_limits_scope_shape` enforces. Checked here so a
  // mistyped scope is a clear failure at the call site rather than a check
  // violation surfacing from a Server Action three layers away.
  if (!RATE_LIMIT_SCOPE.test(options.scope)) {
    throw new AppError('validation_failed', {
      detail: `rate limit scope "${options.scope}" must be lower_snake, dot separated`,
    })
  }
  try {
    const subjectKey = await hashIdentifier(options.scope, options.subject)
    return await callRpc<boolean>('admin_enforce_rate_limit', {
      p_scope: options.scope,
      p_subject_key: subjectKey,
      p_limit: options.limit,
      p_window: options.window,
    })
  } catch (error) {
    throw toAppError(error)
  }
}

// ===========================================================================
// Audit
// ===========================================================================

/**
 * The action names 0019 seeded into `admin_sensitive_actions`.
 *
 * A closed union rather than a string: the database's namespace rule makes any
 * `admin.*` or `support_access.*` action accountable, but it cannot catch
 * `user.disable` written where `user.disabled` was meant — that would silently
 * become a non-sensitive product event and skip the trigger entirely. Adding an
 * action means adding it here and to the seed in 0019, in the same change.
 */
export const ADMIN_AUDIT_ACTIONS = [
  'admin.signed_in',
  'admin.signed_out',
  'admin.invited',
  'admin.invite_revoked',
  'admin.role_changed',
  'admin.disabled',
  'admin.sessions_revoked',
  'user.disabled',
  'user.deleted',
  'integration.disconnected',
  'integration.force_resync',
  'entitlement.granted',
  'entitlement.revoked',
  'feature_flag.changed',
  'feature_flag.override_set',
  'feature_flag.override_removed',
  'announcement.published',
  'prompt.activated',
  'ai.model_changed',
  'deletion.retried',
  'privacy.export_reissued',
  'support_access.requested',
  'support_access.approved',
  'support_access.denied',
  'support_access.revoked',
  'support_access.revealed',
] as const

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number]

/** Identifiers and outcome codes only. Scalars by type, never a document. */
export type AuditDetail = Record<string, string | number | boolean | null>

export interface AdminAuditEntry {
  actor: AdminActor
  action: AdminAuditAction
  /** Required for every action except signing in and out. */
  reason?: string | null
  subjectUserId?: string | null
  entityType?: string | null
  entityId?: string | null
  outcome?: 'success' | 'failure'
  supportAccessGrantId?: string | null
  detail?: AuditDetail
}

/**
 * Append one admin audit row and return its id.
 *
 * `admin_write_audit` resolves the actor's role, writes the actor and the reason
 * to real columns — out of reach of the 400-day metadata sweep, which used to
 * erase exactly the accountability this table exists for — and mirrors the
 * identifiers into metadata so `bo_audit` still reads them.
 *
 * It throws when the write fails, and callers must let that surface: an action
 * whose audit row did not land must not report success, because the trail is
 * the only evidence the action happened.
 */
export async function writeAdminAudit(entry: AdminAuditEntry): Promise<string> {
  try {
    return await callRpc<string>('admin_write_audit', {
      p_actor_admin_user_id: entry.actor.adminUserId,
      p_action: entry.action,
      p_reason: entry.reason ?? null,
      p_subject_user_id: entry.subjectUserId ?? null,
      p_entity_type: entry.entityType ?? null,
      p_entity_id: entry.entityId ?? null,
      p_outcome: entry.outcome ?? 'success',
      p_support_access_grant_id: entry.supportAccessGrantId ?? null,
      p_detail: entry.detail ?? {},
    })
  } catch (error) {
    throw toAppError(error)
  }
}

/**
 * Which actions the database considers sensitive, and which of those demand a
 * written reason.
 *
 * Read from `admin_sensitive_actions` rather than copied into TypeScript, so
 * the console's pre-validation and the trigger's refusal can never disagree.
 * The table is 26 static rows; it is cached for a few minutes rather than
 * fetched per action.
 */
export async function loadSensitiveActions(): Promise<ReadonlyMap<string, boolean>> {
  const rows = await queryTable('admin_sensitive_actions', {
    columns: ['action', 'requires_reason'],
    order: { column: 'action', ascending: true },
    limit: 500,
  })
  return new Map(rows.map((row) => [row.action, row.requires_reason]))
}

// ===========================================================================
// Feature flags
// ===========================================================================

/**
 * The only correct read of a flag.
 *
 * Precedence — kill switch, per-user override, global `enabled`, platform/plan
 * /version targeting, deterministic bucket — lives in the database, so the
 * console and the app cannot apply it in two different orders and disagree
 * about what a user is seeing. Reading the columns and deciding here would
 * produce a screen that confidently contradicts the phone in the caller's hand.
 */
export async function evaluateFeatureFlag(options: {
  key: string
  userId?: string | null
  platform?: AppPlatform | null
  plan?: AppPlan | null
  appVersion?: string | null
}): Promise<boolean> {
  try {
    return await callRpc<boolean>('feature_flag_is_enabled', {
      p_key: options.key,
      p_user_id: options.userId ?? null,
      p_platform: options.platform ?? null,
      p_plan: options.plan ?? null,
      p_app_version: options.appVersion ?? null,
    })
  } catch (error) {
    throw toAppError(error)
  }
}

// ===========================================================================
// System health
// ===========================================================================

/**
 * Record a probe result.
 *
 * The schema refuses a verdict without a measurement — anything other than
 * `unknown` must carry the latency it observed, and `down` must carry the error
 * code it saw — which is why the console can render this as a status light
 * without lying. There is no way through this function to write a green tick
 * nobody observed.
 */
export async function recordHealthCheck(options: {
  target: string
  status: SystemHealthStatus
  latencyMs?: number | null
  errorCode?: string | null
  observedBy?: HealthObserver
}): Promise<string> {
  try {
    return await callRpc<string>('admin_record_health_check', {
      p_target: options.target,
      p_status: options.status,
      p_latency_ms: options.latencyMs ?? null,
      p_error_code: options.errorCode ?? null,
      p_observed_by: options.observedBy ?? 'manual',
    })
  } catch (error) {
    throw toAppError(error)
  }
}

/**
 * The admin platform's own sweep: dead sessions, unconsumed invites, stale
 * overrides, closed rate-limit windows, probe rows older than 90 days, and
 * lapsed Support Access grants moved to `expired`.
 *
 * Grants and reveals are never deleted — they are the audit. The cron job runs
 * this hourly; the console exposes it so an operator who has just revoked
 * something can see the listing catch up rather than wait for the hour. Returns
 * the sweep's own report, keyed by table.
 */
export async function runAdminCleanup(): Promise<Record<string, number | string>> {
  try {
    return await callRpc<Record<string, number | string>>('admin_cleanup_expired', {})
  } catch (error) {
    throw toAppError(error)
  }
}

// ===========================================================================
// Support Access — the only path to user content
//
// Every function below asks the database to prove six things before it returns
// anything: the grant exists, it belongs to this admin, it names this subject,
// it is live, the scope is in its list, and the admin's role still carries
// `support.access.reveal`. It then writes a `support_access_reveals` row in the
// same call that returns the data, and a trigger on that table re-validates the
// grant so the log cannot be forged even by a direct service-role insert.
//
// They take an `AdminActor` rather than an id, so a caller cannot pass someone
// else's admin id and read under their authority.
// ===========================================================================

export interface RevealIdentityRow {
  user_id: string
  email: string | null
  display_name: string | null
  given_name: string | null
  locale: Locale | null
  time_zone: string | null
  created_at: IsoInstantString | null
}

export interface RevealEmailSubjectRow {
  thread_id: string
  subject: string | null
  summary: string | null
  category: EmailCategory | null
  importance: Importance | null
  message_count: number | null
  last_message_at: IsoInstantString | null
}

export interface RevealEmailMessageRow {
  message_id: string
  thread_id: string
  subject: string | null
  from_email: string | null
  from_name: string | null
  to_emails: string[] | null
  sent_at: IsoInstantString | null
  snippet: string | null
  body_text: string | null
}

export interface RevealCalendarEventRow {
  event_id: string
  title: string | null
  description: string | null
  location: string | null
  organizer_email: string | null
  starts_at: IsoInstantString | null
  ends_at: IsoInstantString | null
}

export interface RevealAssistantMessageRow {
  message_id: string
  role: string | null
  content: string | null
  model: string | null
  created_at: IsoInstantString | null
}

export interface RevealCaptureRow {
  capture_id: string
  kind: CaptureKind | null
  status: CaptureStatus | null
  raw_text: string | null
  /** The model's structured reading of the capture. */
  extracted: unknown
  source_url: string | null
  storage_path: string | null
  created_at: IsoInstantString | null
}

export interface RevealApprovalRow {
  approval_id: string
  type: ApprovalActionType | null
  status: ApprovalStatus | null
  what: string | null
  why: string | null
  payload: unknown
  /** What the assistant proposed before the user edited it, when they did. */
  original_payload: unknown
  created_at: IsoInstantString | null
}

export interface RevealNotificationRow {
  delivery_id: string
  category: NotificationCategory | null
  title: string | null
  body: string | null
  scheduled_for: IsoInstantString | null
  sent_at: IsoInstantString | null
  failed_at: IsoInstantString | null
}

/** Shared arguments: the grant being exercised, and who is exercising it. */
export interface RevealArgs {
  actor: AdminActor
  grantId: string
  /** Correlates the reveal row with the console request that caused it. */
  requestId?: string | null
}

function revealBase(args: RevealArgs): Record<string, unknown> {
  return {
    p_grant_id: args.grantId,
    p_admin_user_id: args.actor.adminUserId,
    p_request_id: args.requestId ?? null,
  }
}

export async function revealIdentity(args: RevealArgs): Promise<readonly RevealIdentityRow[]> {
  try {
    return (await callRpc<RevealIdentityRow[] | null>('sa_reveal_identity', revealBase(args))) ?? []
  } catch (error) {
    throw toAppError(error)
  }
}

export async function revealEmailSubjects(
  args: RevealArgs & { limit?: number },
): Promise<readonly RevealEmailSubjectRow[]> {
  try {
    const rows = await callRpc<RevealEmailSubjectRow[] | null>('sa_reveal_email_subjects', {
      ...revealBase(args),
      p_limit: args.limit ?? 50,
    })
    return rows ?? []
  } catch (error) {
    throw toAppError(error)
  }
}

export async function revealEmailMessage(
  args: RevealArgs & { messageId: string },
): Promise<readonly RevealEmailMessageRow[]> {
  try {
    const rows = await callRpc<RevealEmailMessageRow[] | null>('sa_reveal_email_message', {
      ...revealBase(args),
      p_message_id: args.messageId,
    })
    return rows ?? []
  } catch (error) {
    throw toAppError(error)
  }
}

export async function revealCalendarEvents(
  args: RevealArgs & { from: IsoInstantString; to: IsoInstantString },
): Promise<readonly RevealCalendarEventRow[]> {
  try {
    const rows = await callRpc<RevealCalendarEventRow[] | null>('sa_reveal_calendar_events', {
      ...revealBase(args),
      p_from: args.from,
      p_to: args.to,
    })
    return rows ?? []
  } catch (error) {
    throw toAppError(error)
  }
}

export async function revealAssistantThread(
  args: RevealArgs & { threadId: string },
): Promise<readonly RevealAssistantMessageRow[]> {
  try {
    const rows = await callRpc<RevealAssistantMessageRow[] | null>('sa_reveal_assistant_thread', {
      ...revealBase(args),
      p_thread_id: args.threadId,
    })
    return rows ?? []
  } catch (error) {
    throw toAppError(error)
  }
}

export async function revealCapture(
  args: RevealArgs & { captureId: string },
): Promise<readonly RevealCaptureRow[]> {
  try {
    const rows = await callRpc<RevealCaptureRow[] | null>('sa_reveal_capture', {
      ...revealBase(args),
      p_capture_id: args.captureId,
    })
    return rows ?? []
  } catch (error) {
    throw toAppError(error)
  }
}

export async function revealApproval(
  args: RevealArgs & { approvalId: string },
): Promise<readonly RevealApprovalRow[]> {
  try {
    const rows = await callRpc<RevealApprovalRow[] | null>('sa_reveal_approval', {
      ...revealBase(args),
      p_approval_id: args.approvalId,
    })
    return rows ?? []
  } catch (error) {
    throw toAppError(error)
  }
}

export async function revealNotification(
  args: RevealArgs & { deliveryId: string },
): Promise<readonly RevealNotificationRow[]> {
  try {
    const rows = await callRpc<RevealNotificationRow[] | null>('sa_reveal_notification', {
      ...revealBase(args),
      p_delivery_id: args.deliveryId,
    })
    return rows ?? []
  } catch (error) {
    throw toAppError(error)
  }
}

// ===========================================================================
// GoTrue
//
// Authentication only. Everything about authorisation is above this line.
// ===========================================================================

export interface AuthenticatedUser {
  id: string
  /** Full address. Used to identify the operator to themselves, never stored. */
  email: string | null
}

export interface StaffSessionTokens {
  accessToken: string
  refreshToken: string
  /** Unix seconds at which the access token stops being accepted. */
  expiresAt: number
}

/** Verifies an access token against GoTrue. Null when it is not valid. */
export async function verifyAccessToken(accessToken: string): Promise<AuthenticatedUser | null> {
  try {
    const { data, error } = await auth().auth.getUser(accessToken)
    if (error || !data.user) return null
    return { id: data.user.id, email: data.user.email ?? null }
  } catch (error) {
    throw toAppError(error)
  }
}

/** Exchanges credentials for a session. Null when the credentials are wrong. */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ user: AuthenticatedUser; tokens: StaffSessionTokens } | null> {
  try {
    const { data, error } = await auth().auth.signInWithPassword({ email, password })
    if (error) {
      if (error.status === 429) {
        throw new AppError('rate_limited', { detail: error.message, status: 429 })
      }
      if (error.status !== undefined && error.status >= 500) {
        throw new AppError('server_unavailable', { detail: error.message, retryable: true })
      }
      return null
    }
    const session = data.session
    const user = data.user
    if (!session || !user) return null
    return {
      user: { id: user.id, email: user.email ?? null },
      tokens: {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: session.expires_at ?? 0,
      },
    }
  } catch (error) {
    throw toAppError(error)
  }
}

/** Invalidates a refresh token server-side so a stolen cookie stops working. */
export async function revokeSession(refreshToken: string): Promise<void> {
  try {
    const env = readEnv()
    const response = await fetch(`${env.supabaseUrl}/auth/v1/logout?scope=local`, {
      method: 'POST',
      headers: {
        apikey: env.anonKey,
        Authorization: `Bearer ${refreshToken}`,
        'Content-Type': 'application/json',
      },
    })
    // 401 means the token was already dead, which is the desired end state.
    if (!response.ok && response.status !== 401) {
      throw new AppError('server_unavailable', {
        detail: `logout returned ${response.status}`,
        retryable: true,
      })
    }
  } catch (error) {
    throw toAppError(error)
  }
}

// ===========================================================================
// The 0017 staff roster
//
// Superseded by `admin_users` and the six-role model, and retained because
// `bo_staff` and any session issued before 0019 landed still resolve through
// it. New code authorises with `resolveAdminByAuthUser` and
// `adminHasPermission`; nothing new should be built on these two.
// ===========================================================================

export interface StaffMemberRecord {
  userId: string
  role: StaffRole
  createdAt: IsoInstantString
  disabledAt: IsoInstantString | null
}

export async function findStaffMember(userId: string): Promise<StaffMemberRecord | null> {
  try {
    const { data, error } = await service()
      .from('staff_members')
      .select('user_id,role,created_at,disabled_at')
      .eq('user_id', userId)
      .limit(1)
    if (error) throw mapPostgrestError(error)
    const row = (data ?? [])[0] as
      | { user_id: string; role: StaffRole; created_at: string; disabled_at: string | null }
      | undefined
    if (!row) return null
    return {
      userId: row.user_id,
      role: row.role,
      createdAt: row.created_at,
      disabledAt: row.disabled_at,
    }
  } catch (error) {
    throw toAppError(error)
  }
}

/**
 * One append-only audit row, written without an admin actor.
 *
 * The remaining caller is a refused sign-in: the whole point is that the
 * account is not an administrator, so there is no `admin_users.id` to name and
 * `admin_write_audit` cannot be used. 0019's trigger lets it through because
 * `staff.sign_in_denied` is outside the `admin.` and `support_access.`
 * namespaces. Every action taken *by* an admin goes through `writeAdminAudit`.
 */
export interface AuditLogInsert {
  userId: string | null
  action: string
  entityType: string | null
  entityId: string | null
  metadata: Record<string, string | number | boolean | null>
}

export async function insertAuditLog(row: AuditLogInsert): Promise<void> {
  try {
    const { error } = await service().from('audit_logs').insert({
      user_id: row.userId,
      action: row.action,
      entity_type: row.entityType,
      entity_id: row.entityId,
      metadata: row.metadata,
    })
    if (error) throw mapPostgrestError(error)
  } catch (error) {
    throw toAppError(error)
  }
}
