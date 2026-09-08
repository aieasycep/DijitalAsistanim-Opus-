import 'server-only'

import { AppError, isAppError } from '@da/domain'
import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js'
import { readEnv } from './env'

/**
 * The only module in the backoffice that constructs a Supabase client, and the
 * only one that holds the service-role key.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE IS SHAPED THE WAY IT IS
 * ---------------------------------------------------------------------------
 *
 * The product promises publicly that nobody reads user mail and that support
 * cannot see message content. Migration 0017 makes that true in the database:
 * the backoffice reads through `bo_*` views that do not contain a content
 * column at all, and `scripts/validate-supabase.mjs` re-derives every view's
 * column dependencies from `pg_depend` to prove it on each CI run.
 *
 * This module is the second half of the same guarantee, on the application
 * side. The service-role key bypasses row level security, so a query that named
 * `email_messages` would succeed. Three things stop that from ever being
 * written:
 *
 *   1. The Supabase client is module-private. It is never exported, never
 *      returned, and never passed to a caller, so no page can build its own
 *      query. Everything leaves this file as a plain typed row.
 *
 *   2. `queryView` accepts only `BoViewName`, a union derived from
 *      `BoViewRows`. There is no overload, no `string` fallback and no generic
 *      escape hatch. Naming a base table is a type error, not a code review
 *      finding — and `ContentTablesAreUnreadable` below is a compile-time
 *      assertion that the union can never grow to include one.
 *
 *   3. Every read passes `assertReadableView()`, a runtime check against a
 *      frozen registry. A cast through `as never` or a value arriving from
 *      `searchParams` still cannot reach a content table; it throws instead.
 *
 * The three privileged operations that are not view reads — verifying a staff
 * session, reading the roster, and appending to `audit_logs` — are each a
 * separate named export with a narrow signature. They are the complete list of
 * things this application can do outside the views.
 */

// ===========================================================================
// Row shapes
//
// One interface per view, mirroring 0017 column for column. `bigint` columns
// arrive from PostgREST as JSON numbers; every count and cost in the schema is
// far inside the safe integer range, so `number` is the honest type.
// `timestamptz` arrives as an ISO-8601 string and `date` as `YYYY-MM-DD`.
// ===========================================================================

export type IsoInstantString = string
export type IsoDateString = string

export type StaffRole = 'support' | 'ops' | 'admin'

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
  referral_code: string | null
  referral_redemption_count: number
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
  /** Staff-authored justification. Present only when `actor` is `staff`. */
  staff_reason: string | null
  metadata_keys: string[] | null
  created_at: IsoInstantString
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

/**
 * The complete map of what the backoffice can read. Adding a page means adding
 * a view to 0017 and an entry here; there is no other way in.
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
}

export type BoViewName = keyof BoViewRows

// ---------------------------------------------------------------------------
// The refusal, in the type system
//
// `ContentTable` names the base tables that hold — or key — something a person
// wrote, received or was told. The assertion below fails to compile the moment
// `BoViewRows` gains a key that is one of them, so a future contributor cannot
// widen the query surface by adding a row type and forgetting why they must
// not. It is checked at build time by `tsc --noEmit`, on every CI run.
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

type Assert<T extends true> = T
type _ContentTablesAreUnreadable = Assert<
  Extract<BoViewName, ContentTable> extends never ? true : false
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
  ]),
)

function assertReadableView(view: string): asserts view is BoViewName {
  if (!READABLE_VIEWS.has(view)) {
    throw new AppError('forbidden', {
      detail: `backoffice may only read the bo_* views; refused "${view}"`,
      status: 403,
    })
  }
}

/** The registry, for tests and for a page that wants to enumerate its sources. */
export function readableViews(): readonly BoViewName[] {
  return [...READABLE_VIEWS] as BoViewName[]
}

// ===========================================================================
// Query surface
// ===========================================================================

export type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'is' | 'contains'

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

function mapPostgrestError(error: PostgrestError): AppError {
  const detail = `${error.code ?? 'unknown'}: ${error.message}`
  switch (error.code) {
    case 'PGRST116':
      return new AppError('not_found', { detail })
    case 'PGRST301':
    case '42501':
      return new AppError('forbidden', { detail, status: 403 })
    case '42P01':
      // The view is missing: migration 0017 has not been applied here.
      return new AppError('server_unavailable', { detail, retryable: false })
    case '57014':
      return new AppError('network_timeout', { detail })
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
 * typed row on the way out of this function, and the four lines below are the
 * only untyped surface in the app. */
type QueryBuilder = any

function applyQuery<Row>(builder: QueryBuilder, query: ViewQuery<Row>): QueryBuilder {
  let next: QueryBuilder = builder
  for (const filter of query.filters ?? []) {
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
      case 'contains':
        next = next.contains(filter.column, Array.isArray(filter.value) ? [...filter.value] : [])
        break
      default:
        break
    }
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
/* eslint-enable @typescript-eslint/no-explicit-any */

function toArray<T>(value: T | readonly T[]): readonly T[] {
  return Array.isArray(value) ? value : [value as T]
}

function selectList<Row>(columns: readonly (keyof Row & string)[] | undefined): string {
  // `*` is safe here in a way it is nowhere else in this codebase: 0017
  // guarantees the view has no content column to widen onto.
  return columns && columns.length > 0 ? columns.join(',') : '*'
}

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
    const { data, error } = await applyQuery(builder, query)
    if (error) throw mapPostgrestError(error)
    return (data ?? []) as BoViewRows[V][]
  } catch (error) {
    throw toAppError(error)
  }
}

/** As `queryView`, plus the exact total matching the filters, for pagination. */
export async function queryViewPage<V extends BoViewName>(
  view: V,
  query: ViewQuery<BoViewRows[V]> = {},
): Promise<ViewPage<BoViewRows[V]>> {
  assertReadableView(view)
  try {
    const builder = service().from(view).select(selectList(query.columns), { count: 'exact' })
    const { data, error, count } = await applyQuery(builder, query)
    if (error) throw mapPostgrestError(error)
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
    const { error, count } = await applyQuery(builder, { filters })
    if (error) throw mapPostgrestError(error)
    return count ?? 0
  } catch (error) {
    throw toAppError(error)
  }
}

// ===========================================================================
// The three privileged operations that are not view reads.
//
// This is the complete list. Each has a narrow signature and none of them
// accepts a table name.
// ===========================================================================

export interface AuthenticatedUser {
  id: string
  /** Full address. Used to identify the operator to themselves, never stored. */
  email: string | null
}

export interface StaffMemberRecord {
  userId: string
  role: StaffRole
  createdAt: IsoInstantString
  disabledAt: IsoInstantString | null
}

export interface StaffSessionTokens {
  accessToken: string
  refreshToken: string
  /** Unix seconds at which the access token stops being accepted. */
  expiresAt: number
}

/** Verifies a staff access token against GoTrue. Null when it is not valid. */
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

/**
 * The staff grant for a user, or null when there is none.
 *
 * `staff_members` is not a `bo_*` view because it is not user data: it holds a
 * user id, a role and two timestamps, and nothing else. It is read here rather
 * than through a view so that `disabled_at` is visible — the roster view hides
 * nothing, but authorisation must see the raw revocation timestamp.
 */
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

/** One append-only audit row. Metadata is identifiers and outcome codes only. */
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
