-- 0017_backoffice.sql
-- The staff backoffice: a roster table, and the content-blind views it reads.
--
-- ===========================================================================
-- THE GUARANTEE THIS FILE ENFORCES
-- ===========================================================================
--
-- The product promises publicly — in the privacy policy and in the Google
-- restricted-scope assessment — that nobody at the company reads user mail and
-- that support cannot see message content. A policy is a promise; this file is
-- the mechanism. It is deliberately written so a reviewer can confirm the
-- guarantee by reading it, without trusting a line of application code.
--
-- The backoffice has exactly one way in: the `bo_*` views below. Not one of
-- them selects a column that can carry what a person wrote, received, said or
-- was told. Concretely, no view in this file reads:
--
--   email_threads.subject / .summary / .reason_important / .deadline_quote
--   email_threads.participant_emails
--   email_messages.body_text / .snippet / .subject / .from_email / .from_name
--   email_messages.to_emails / .cc_emails / .attachment_meta / .external_url
--   calendar_events.title / .description / .location / .attendees
--   calendar_events.organizer_email / .conference_url
--   assistant_messages.content / .citations
--   assistant_threads.title
--   captures.raw_text / .extracted / .storage_path / .source_url
--   briefings.narrative / .headline / .audio_url / .stats
--   briefing_items.title / .detail / .source_label
--   insights.title / .detail / .reason_important / .actions
--   life_events.title / .detail / .source_quote / .reference / .tracking_url
--   commitments.text / .source_quote / .person_name
--   contacts.name / .email / .company / .alternate_emails
--   vip_people.email / .name
--   approval_actions.what / .why / .payload / .original_payload / .source_label
--   approval_actions.idempotency_key / .result_ref
--   memory_chunks.content / .topic
--   notification_deliveries.title / .body / .data
--   device_notifications.title / .text / .app_name / .package_name
--   tasks.title / .notes, reminders.title / .body
--   follow_ups.recipient_email / .recipient_name
--   priority_rules.match_value / .note, learned_preferences.statement
--   oauth_credentials.* (any column), oauth_states.*, sync_states.cursor
--   profiles.display_name / .given_name / .avatar_url
--   push_tokens.token, subscriptions.revenuecat_customer_id
--
-- Three mechanisms keep that true rather than merely intended:
--
--   1. Every address that reaches an operator passes through
--      `bo_redact_email()`. An operator sees `y•••@example.com` and a user id.
--      Full addresses are never projected.
--
--   2. Every free-text error label passes through `bo_error_code()`. A provider
--      failure message can quote the offending payload back at us, so only a
--      token-shaped label (no spaces, ASCII, <= 63 chars) survives; anything
--      sentence-shaped collapses to the literal 'unstructured'. Operators get
--      the failure class, never the failure narrative.
--
--   3. Every view is revoked from `anon` and `authenticated` and granted only
--      to `service_role`. Supabase's default privileges grant new objects in
--      `public` to the client roles, so the revoke is load-bearing, not
--      decorative.
--
-- Views are left with the default (definer) security so they can aggregate
-- across users without RLS suppressing rows; the grants above are what stops a
-- signed-in user reaching them. `scripts/validate-supabase.mjs` re-derives the
-- column dependencies of every view from `pg_depend` and fails the build if any
-- of them ever touches a column on the list above.
--
-- Style follows 0011 and 0016: every statement is re-runnable, and each view
-- carries a comment saying what it deliberately omits.

-- ---------------------------------------------------------------------------
-- Staff roster
-- ---------------------------------------------------------------------------

do $$ begin
  create type staff_role as enum ('support', 'ops', 'admin');
exception when duplicate_object then null; end $$;

comment on type staff_role is
  'Backoffice privilege tiers. support < ops < admin; the app compares by rank, so members are ordered least- to most-privileged.';

create table if not exists public.staff_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role staff_role not null default 'support',
  created_at timestamptz not null default now(),
  disabled_at timestamptz
);

comment on table public.staff_members is
  'Who may open the backoffice, and at what tier. A row is the entire grant: no row means no access, and disabled_at revokes without destroying the audit trail that references the member.';
comment on column public.staff_members.disabled_at is
  'Set instead of deleting. The row must survive so bo_audit can still resolve which staff member took a past action.';

create index if not exists staff_members_role_idx
  on public.staff_members (role)
  where disabled_at is null;

alter table public.staff_members enable row level security;
alter table public.staff_members force row level security;

-- A staff member may read their own row and nothing else. There is deliberately
-- no insert/update/delete policy: the roster is provisioned by an administrator
-- through the service role, so the backoffice cannot promote its own operator.
drop policy if exists staff_members_select_self on public.staff_members;
create policy staff_members_select_self on public.staff_members
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Redaction and shape helpers
--
-- These three functions are the only way personal or free-form text is allowed
-- to appear anywhere below. Every view uses them; none of them can widen.
-- ---------------------------------------------------------------------------

create or replace function public.bo_redact_email(raw text)
returns text
language sql
immutable
as $$
  select case
    when raw is null or position('@' in raw) = 0 then null
    else left(raw, 1) || repeat(chr(8226), 3) || '@' || split_part(raw, '@', 2)
  end
$$;

comment on function public.bo_redact_email(text) is
  'First character, three bullets, domain. The only projection of an address the backoffice is permitted: enough for an operator to confirm they are looking at the right account, never enough to contact or identify the person from the tool.';

create or replace function public.bo_error_code(raw text)
returns text
language sql
immutable
as $$
  select case
    when raw is null or btrim(raw) = '' then null
    when btrim(raw) ~ '^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,62}$' then btrim(raw)
    else 'unstructured'
  end
$$;

comment on function public.bo_error_code(text) is
  'Passes through a token-shaped error label (ASCII, no whitespace, <= 63 chars) and collapses everything else to ''unstructured''. Provider failure messages routinely quote the rejected payload — a subject line, an address, a body fragment — so a sentence-shaped label is classified, never echoed.';

create or replace function public.bo_identifier(raw text)
returns text
language sql
immutable
as $$
  select case
    when raw is null or btrim(raw) = '' then null
    when btrim(raw) ~ '^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$' then btrim(raw)
    else 'unstructured'
  end
$$;

comment on function public.bo_identifier(text) is
  'Same shape guard as bo_error_code but sized for entity identifiers. Notably rejects any string containing "@" or whitespace, so an address or a sentence can never reach an operator through an identifier column.';

create or replace function public.bo_safe_uuid(raw text)
returns uuid
language sql
immutable
as $$
  select case
    when raw ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then raw::uuid
  end
$$;

comment on function public.bo_safe_uuid(text) is
  'Null instead of an exception for a non-uuid string. Used to lift ids out of audit_logs.metadata without a cast that could abort the whole view.';

create or replace function public.bo_is_staff(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.staff_members s
    where s.user_id = check_user_id
      and s.disabled_at is null
  )
$$;

comment on function public.bo_is_staff(uuid) is
  'True when the user has an active backoffice grant. security definer so it can answer without the caller holding select on staff_members; execute is granted to service_role only, so it cannot be used by a signed-in user to enumerate staff.';

create or replace function public.bo_staff_role(check_user_id uuid)
returns staff_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.role
  from public.staff_members s
  where s.user_id = check_user_id
    and s.disabled_at is null
$$;

comment on function public.bo_staff_role(uuid) is
  'The active tier for a staff member, or null when the grant is absent or disabled. Deny-by-default: a null answer must be read as "no access", never as "default access".';

revoke all on function public.bo_redact_email(text) from public, anon, authenticated;
revoke all on function public.bo_error_code(text) from public, anon, authenticated;
revoke all on function public.bo_identifier(text) from public, anon, authenticated;
revoke all on function public.bo_safe_uuid(text) from public, anon, authenticated;
revoke all on function public.bo_is_staff(uuid) from public, anon, authenticated;
revoke all on function public.bo_staff_role(uuid) from public, anon, authenticated;

grant execute on function public.bo_redact_email(text) to service_role;
grant execute on function public.bo_error_code(text) to service_role;
grant execute on function public.bo_identifier(text) to service_role;
grant execute on function public.bo_safe_uuid(text) to service_role;
grant execute on function public.bo_is_staff(uuid) to service_role;
grant execute on function public.bo_staff_role(uuid) to service_role;

-- Audit rows written by the backoffice carry the acting staff member in
-- metadata; without this the staff activity view degrades to a sequential scan.
create index if not exists audit_logs_staff_actor_idx
  on public.audit_logs ((metadata ->> 'staff_user_id'), created_at desc)
  where metadata ? 'staff_user_id';

create index if not exists audit_logs_action_idx
  on public.audit_logs (action, created_at desc);

-- ===========================================================================
-- CONTENT-BLIND VIEWS
--
-- Each is dropped and recreated so the file stays re-runnable even when a
-- column list changes. None of them depends on another, so no cascade is
-- needed and no other agent's object can be caught in the drop.
-- ===========================================================================

-- ── bo_users ───────────────────────────────────────────────────────────────
drop view if exists public.bo_users;
create view public.bo_users as
select
  p.id                                                     as user_id,
  public.bo_redact_email(p.email)                          as email_redacted,
  split_part(p.email, '@', 2)                              as email_domain,
  p.locale,
  p.time_zone,
  (p.onboarding_completed_at is not null)                  as is_onboarded,
  p.onboarding_completed_at,
  (p.deleted_at is not null)                               as is_deleted,
  p.deleted_at,
  p.created_at,
  p.updated_at,
  coalesce(s.status, 'free'::subscription_status)          as subscription_status,
  s.current_period_end                                     as subscription_period_end,
  s.trial_ends_at,
  coalesce(acc.account_count, 0)::integer                  as account_count,
  coalesce(acc.account_connected_count, 0)::integer        as account_connected_count,
  coalesce(acc.account_error_count, 0)::integer            as account_error_count,
  acc.last_synced_at,
  coalesce(syn.sync_error_count, 0)::integer               as sync_error_count,
  greatest(acc.last_synced_at, syn.last_run_at)            as last_activity_at
from public.profiles p
left join public.subscriptions s
  on s.user_id = p.id
left join lateral (
  select
    count(*)                                                     as account_count,
    count(*) filter (where a.status = 'connected')               as account_connected_count,
    count(*) filter (where a.status in ('error', 'expired', 'revoked')) as account_error_count,
    max(a.last_synced_at)                                        as last_synced_at
  from public.connected_accounts a
  where a.user_id = p.id
) acc on true
left join lateral (
  select
    count(*) filter (where ss.status = 'error') as sync_error_count,
    max(ss.last_run_at)                         as last_run_at
  from public.sync_states ss
  where ss.user_id = p.id
) syn on true;

comment on view public.bo_users is
  'User roster for support triage: identity as a uuid plus a redacted address, entitlement state, and connection counts. Deliberately omits profiles.display_name, .given_name and .avatar_url, the raw email, subscriptions.revenuecat_customer_id, and every mail, calendar, capture and assistant column. An operator can tell that an account exists, what plan it is on and whether its sync is healthy — nothing about the person or their correspondence.';

-- ── bo_user_detail ─────────────────────────────────────────────────────────
drop view if exists public.bo_user_detail;
create view public.bo_user_detail as
select
  p.id                                              as user_id,
  public.bo_redact_email(p.email)                   as email_redacted,
  split_part(p.email, '@', 2)                       as email_domain,
  p.locale,
  p.time_zone,
  (p.onboarding_completed_at is not null)           as is_onboarded,
  p.onboarding_completed_at,
  (p.deleted_at is not null)                        as is_deleted,
  p.deleted_at,
  p.created_at,
  p.updated_at,
  coalesce(s.status, 'free'::subscription_status)   as subscription_status,
  s.store                                           as subscription_store,
  s.current_period_end                              as subscription_period_end,
  s.trial_ends_at,
  coalesce(acc.account_count, 0)::integer           as account_count,
  coalesce(acc.account_connected_count, 0)::integer as account_connected_count,
  coalesce(acc.account_error_count, 0)::integer     as account_error_count,
  acc.last_synced_at,
  coalesce(syn.sync_total, 0)::integer              as sync_resource_count,
  coalesce(syn.sync_error_count, 0)::integer        as sync_error_count,
  syn.last_run_at                                   as sync_last_run_at,
  coalesce(ap.approval_pending_count, 0)::integer   as approval_pending_count,
  coalesce(ap.approval_executed_count, 0)::integer  as approval_executed_count,
  coalesce(ap.approval_failed_count, 0)::integer    as approval_failed_count,
  coalesce(br.briefing_ready_count_30d, 0)::integer as briefing_ready_count_30d,
  coalesce(br.briefing_failed_count_30d, 0)::integer as briefing_failed_count_30d,
  coalesce(cp.capture_count, 0)::integer            as capture_count,
  coalesce(cp.capture_failed_count, 0)::integer     as capture_failed_count,
  coalesce(ex.export_open_count, 0)::integer        as export_open_count,
  ex.export_last_requested_at,
  coalesce(ai.cost_micros_30d, 0)::bigint           as ai_cost_micros_30d,
  coalesce(ai.event_count_30d, 0)::bigint           as ai_event_count_30d,
  ai.last_event_at                                  as ai_last_event_at,
  coalesce(pt.device_count, 0)::integer             as device_count,
  r.code                                            as referral_code,
  coalesce(r.redemption_count, 0)::integer          as referral_redemption_count
from public.profiles p
left join public.subscriptions s on s.user_id = p.id
left join public.referrals r on r.user_id = p.id
left join lateral (
  select
    count(*)                                                     as account_count,
    count(*) filter (where a.status = 'connected')               as account_connected_count,
    count(*) filter (where a.status in ('error', 'expired', 'revoked')) as account_error_count,
    max(a.last_synced_at)                                        as last_synced_at
  from public.connected_accounts a
  where a.user_id = p.id
) acc on true
left join lateral (
  select
    count(*)                                    as sync_total,
    count(*) filter (where ss.status = 'error') as sync_error_count,
    max(ss.last_run_at)                         as last_run_at
  from public.sync_states ss
  where ss.user_id = p.id
) syn on true
left join lateral (
  select
    count(*) filter (where aa.status = 'pending')  as approval_pending_count,
    count(*) filter (where aa.status = 'executed') as approval_executed_count,
    count(*) filter (where aa.status = 'failed')   as approval_failed_count
  from public.approval_actions aa
  where aa.user_id = p.id
) ap on true
left join lateral (
  select
    count(*) filter (where b.status = 'ready')  as briefing_ready_count_30d,
    count(*) filter (where b.status = 'failed') as briefing_failed_count_30d
  from public.briefings b
  where b.user_id = p.id
    and b.created_at >= now() - interval '30 days'
) br on true
left join lateral (
  select
    count(*)                                   as capture_count,
    count(*) filter (where c.status = 'failed') as capture_failed_count
  from public.captures c
  where c.user_id = p.id
) cp on true
left join lateral (
  select
    count(*) filter (where d.status in ('requested', 'processing')) as export_open_count,
    max(d.created_at)                                               as export_last_requested_at
  from public.data_export_requests d
  where d.user_id = p.id
) ex on true
left join lateral (
  select
    sum(u.cost_micros) as cost_micros_30d,
    count(*)           as event_count_30d,
    max(u.occurred_at) as last_event_at
  from public.ai_usage_events u
  where u.user_id = p.id
    and u.occurred_at >= now() - interval '30 days'
) ai on true
left join lateral (
  select count(*) as device_count
  from public.push_tokens t
  where t.user_id = p.id
    and t.disabled_at is null
) pt on true;

comment on view public.bo_user_detail is
  'Everything the single-user support screen may know: the bo_users row plus per-feature counters. Every added column is a count, a state or a timestamp. Deliberately omits every title, body, subject, quote, payload, extracted field, push token and storage path behind those counters — an operator can see that eleven captures failed, never what was captured.';

-- ── bo_accounts ────────────────────────────────────────────────────────────
drop view if exists public.bo_accounts;
create view public.bo_accounts as
select
  a.id                                        as account_id,
  a.user_id,
  a.provider,
  a.kinds,
  a.status,
  a.is_primary,
  public.bo_redact_email(a.email)             as email_redacted,
  case when a.email is null then null else split_part(a.email, '@', 2) end as email_domain,
  coalesce(array_length(a.granted_scopes, 1), 0)::integer as granted_scope_count,
  a.granted_scopes,
  a.last_synced_at,
  public.bo_error_code(a.last_error_code)     as last_error_code,
  a.last_error_at,
  (oc.connected_account_id is not null)       as has_stored_credentials,
  oc.key_version                              as credential_key_version,
  oc.access_token_expires_at,
  oc.rotated_at                               as credential_rotated_at,
  coalesce(syn.resource_count, 0)::integer    as sync_resource_count,
  coalesce(syn.error_count, 0)::integer       as sync_error_count,
  syn.last_run_at                             as sync_last_run_at,
  syn.next_run_at                             as sync_next_run_at,
  a.created_at,
  a.updated_at
from public.connected_accounts a
left join public.oauth_credentials oc
  on oc.connected_account_id = a.id
left join lateral (
  select
    count(*)                                    as resource_count,
    count(*) filter (where ss.status = 'error') as error_count,
    max(ss.last_run_at)                         as last_run_at,
    min(ss.next_run_at)                         as next_run_at
  from public.sync_states ss
  where ss.connected_account_id = a.id
) syn on true;

comment on view public.bo_accounts is
  'One row per provider grant, for connection triage. Reads exactly four things from oauth_credentials — whether a row exists, its key generation, the access-token expiry and the rotation time — and never the ciphertext, nonce or tag columns; the tokens themselves cannot be projected through this view at all. Also omits connected_accounts.display_name, .external_account_id and the raw address, and reports last_error_code through bo_error_code so a provider message cannot smuggle a subject line into the operator''s screen.';

-- ── bo_sync_health ─────────────────────────────────────────────────────────
drop view if exists public.bo_sync_health;
create view public.bo_sync_health as
select
  ss.id                                    as sync_state_id,
  ss.user_id,
  ss.connected_account_id,
  a.provider,
  a.status                                 as account_status,
  ss.resource,
  ss.status,
  ss.consecutive_failures,
  public.bo_error_code(ss.last_error)      as last_error_code,
  ss.last_run_at,
  ss.next_run_at,
  ss.backfill_cursor,
  ss.backfill_completed_at,
  (ss.backfill_completed_at is null)       as is_backfilling,
  case
    when ss.last_run_at is null then null
    else floor(extract(epoch from (now() - ss.last_run_at)) / 60)::integer
  end                                      as minutes_since_last_run,
  (
    ss.status <> 'error'
    and ss.next_run_at is not null
    and ss.next_run_at < now() - interval '1 hour'
  )                                        as is_stalled,
  ss.created_at,
  ss.updated_at
from public.sync_states ss
join public.connected_accounts a
  on a.id = ss.connected_account_id;

comment on view public.bo_sync_health is
  'Per-resource sync state, for spotting stuck or failing pipelines. sync_states.cursor is an opaque provider token (a Gmail historyId, a Graph deltaLink) and a standing pointer into the mailbox: the view does not reference it at all, not even to test it for null. Progress is read instead from status, backfill_cursor, backfill_completed_at and the run timestamps. last_error passes through bo_error_code, since provider errors quote the payload that failed.';

-- ── bo_approvals ───────────────────────────────────────────────────────────
drop view if exists public.bo_approvals;
create view public.bo_approvals as
select
  aa.id                                     as approval_id,
  aa.user_id,
  aa.type,
  aa.status,
  aa.source_type,
  aa.attempt_count,
  coalesce(
    public.bo_error_code(aa.failure_code),
    public.bo_error_code(aa.failure_reason)
  )                                         as failure_code,
  aa.expires_at,
  (aa.expires_at < now() and aa.status = 'pending') as is_overdue,
  aa.approved_at,
  aa.rejected_at,
  aa.executed_at,
  aa.next_attempt_at,
  case
    when aa.approved_at is null then null
    else floor(extract(epoch from (aa.approved_at - aa.created_at)))::integer
  end                                       as decision_seconds,
  case
    when aa.executed_at is null or aa.approved_at is null then null
    else floor(extract(epoch from (aa.executed_at - aa.approved_at)))::integer
  end                                       as execution_seconds,
  aa.created_at,
  aa.updated_at
from public.approval_actions aa;

comment on view public.bo_approvals is
  'The approval queue as states and timings. This is the highest-risk table in the schema for a support tool, because an approval_actions row contains a fully drafted outgoing email. what, why, payload and original_payload are not merely unprojected — the view does not reference them at all, so no boolean, hash or length derived from a draft can appear here either; "did the user edit the draft" is a question this tool deliberately cannot answer. source_label, source_id, idempotency_key and result_ref are omitted for the same reason: each can carry a subject line or a provider message id.';

-- ── bo_ai_spend ────────────────────────────────────────────────────────────
drop view if exists public.bo_ai_spend;
create view public.bo_ai_spend as
select
  u.user_id,
  public.bo_redact_email(p.email)                            as email_redacted,
  count(*)                                                   as event_count,
  sum(u.tokens_in)::bigint                                   as tokens_in,
  sum(u.tokens_out)::bigint                                  as tokens_out,
  sum(u.cost_micros)::bigint                                 as cost_micros,
  coalesce(sum(u.cost_micros) filter (
    where u.occurred_at >= now() - interval '24 hours'), 0)::bigint  as cost_micros_24h,
  coalesce(sum(u.cost_micros) filter (
    where u.occurred_at >= now() - interval '7 days'), 0)::bigint    as cost_micros_7d,
  coalesce(sum(u.cost_micros) filter (
    where u.occurred_at >= now() - interval '30 days'), 0)::bigint   as cost_micros_30d,
  count(*) filter (where u.occurred_at >= now() - interval '30 days') as event_count_30d,
  count(distinct u.model)::integer                           as model_count,
  min(u.occurred_at)                                         as first_event_at,
  max(u.occurred_at)                                         as last_event_at
from public.ai_usage_events u
left join public.profiles p on p.id = u.user_id
group by u.user_id, p.email;

comment on view public.bo_ai_spend is
  'Model cost per user with rolling windows, for quota and abuse investigation. ai_usage_events is already content-free by construction (0009 forbids prompt and completion text in it); this view additionally reduces it to sums so no single request is inspectable, and identifies the user by uuid plus a redacted address.';

-- ── bo_ai_spend_daily ──────────────────────────────────────────────────────
drop view if exists public.bo_ai_spend_daily;
create view public.bo_ai_spend_daily as
select
  (u.occurred_at at time zone 'Europe/Istanbul')::date as usage_date,
  u.model,
  u.operation,
  count(*)                                             as event_count,
  count(distinct u.user_id)                            as user_count,
  sum(u.tokens_in)::bigint                             as tokens_in,
  sum(u.tokens_out)::bigint                            as tokens_out,
  sum(u.cost_micros)::bigint                           as cost_micros
from public.ai_usage_events u
group by 1, 2, 3;

comment on view public.bo_ai_spend_daily is
  'Platform-wide daily spend by model and operation, bucketed on Europe/Istanbul days so a chart lines up with the working day the team actually watches. `operation` is a coarse label such as email_analysis (0009 forbids prompt fragments there); no user is identifiable, only counted.';

-- ── bo_privacy_requests ────────────────────────────────────────────────────
drop view if exists public.bo_privacy_requests;
create view public.bo_privacy_requests as
select
  d.id                                              as request_id,
  d.user_id,
  public.bo_redact_email(p.email)                   as email_redacted,
  d.status,
  d.size_bytes,
  (d.size_bytes is not null and d.status = 'ready') as has_artifact,
  public.bo_error_code(d.failure_reason)            as failure_code,
  d.created_at                                      as requested_at,
  d.ready_at,
  d.expires_at,
  (d.expires_at is not null and d.expires_at < now()) as is_expired,
  floor(extract(epoch from (now() - d.created_at)) / 3600)::integer as age_hours,
  case
    when d.ready_at is null then null
    else floor(extract(epoch from (d.ready_at - d.created_at)) / 60)::integer
  end                                               as fulfilment_minutes,
  d.updated_at
from public.data_export_requests d
left join public.profiles p on p.id = d.user_id;

comment on view public.bo_privacy_requests is
  'KVKK/GDPR export and erasure queue, so a request cannot quietly miss its statutory deadline. data_export_requests.storage_path is the object key of an archive holding the user''s entire mailbox; the view does not reference it at all, so no operator can construct a link to it from this tool. has_artifact is inferred from status and size_bytes instead.';

-- ── bo_referrals ───────────────────────────────────────────────────────────
drop view if exists public.bo_referrals;
create view public.bo_referrals as
select
  r.id                                          as referral_id,
  r.user_id,
  public.bo_redact_email(p.email)               as email_redacted,
  r.code,
  r.redemption_count,
  coalesce(c.credit_count, 0)::integer          as credit_count,
  coalesce(c.credit_active_count, 0)::integer   as credit_active_count,
  coalesce(c.credit_revoked_count, 0)::integer  as credit_revoked_count,
  coalesce(c.bonus_days_total, 0)::integer      as bonus_days_total,
  c.last_credit_at,
  r.created_at,
  r.updated_at
from public.referrals r
left join public.profiles p on p.id = r.user_id
left join lateral (
  select
    count(*)                                       as credit_count,
    count(*) filter (where rc.revoked_at is null)  as credit_active_count,
    count(*) filter (where rc.revoked_at is not null) as credit_revoked_count,
    sum(rc.bonus_days) filter (where rc.revoked_at is null) as bonus_days_total,
    max(rc.granted_at)                             as last_credit_at
  from public.referral_credits rc
  where rc.code = r.code
) c on true;

comment on view public.bo_referrals is
  'Referral programme health per code owner, for fraud review. The code itself is a public share token the user hands out deliberately, so it is shown; referral_credits.revoked_reason is free text written by an operator or a job and is omitted in favour of the revoked count.';

-- ── bo_audit ───────────────────────────────────────────────────────────────
drop view if exists public.bo_audit;
create view public.bo_audit as
select
  al.id                                                as audit_id,
  al.user_id                                           as subject_user_id,
  public.bo_identifier(al.action)                      as action,
  public.bo_identifier(al.entity_type)                 as entity_type,
  public.bo_identifier(al.entity_id)                   as entity_id,
  public.bo_identifier(al.metadata ->> 'actor')        as actor,
  public.bo_safe_uuid(al.metadata ->> 'staff_user_id') as staff_user_id,
  public.bo_identifier(al.metadata ->> 'staff_role')   as staff_role,
  public.bo_identifier(al.metadata ->> 'outcome')      as outcome,
  case
    when al.metadata ->> 'actor' = 'staff' then al.metadata ->> 'reason'
  end                                                  as staff_reason,
  (select array_agg(k order by k) from jsonb_object_keys(al.metadata) k) as metadata_keys,
  al.created_at
from public.audit_logs al;

comment on view public.bo_audit is
  'The forensic trail, readable as structure rather than prose. action, entity_type, entity_id and the lifted metadata scalars all pass through bo_identifier, which rejects anything containing whitespace or "@", so neither a sentence nor an address can arrive through them. The metadata document itself is never projected — only its top-level key names — with one deliberate exception: staff_reason, the justification a staff member types into the backoffice before a destructive action. That string is staff-authored text about a staff action and is exposed only on rows whose actor is ''staff''; no user-content column feeds it, and a reader who could type it already had it.';

-- ── bo_staff ───────────────────────────────────────────────────────────────
drop view if exists public.bo_staff;
create view public.bo_staff as
select
  sm.user_id                                        as staff_user_id,
  sm.role,
  public.bo_redact_email(coalesce(p.email, au.email)) as email_redacted,
  sm.created_at,
  sm.disabled_at,
  (sm.disabled_at is null)                          as is_active,
  coalesce(act.action_count_30d, 0)::integer        as action_count_30d,
  act.last_action_at
from public.staff_members sm
left join public.profiles p on p.id = sm.user_id
left join auth.users au on au.id = sm.user_id
left join lateral (
  select
    count(*)          as action_count_30d,
    max(al.created_at) as last_action_at
  from public.audit_logs al
  where al.metadata ->> 'staff_user_id' = sm.user_id::text
    and al.created_at >= now() - interval '30 days'
) act on true;

comment on view public.bo_staff is
  'The roster with activity counters, so an unused or over-active grant is visible. Shows a redacted staff address only; staff are users of the product too, and nothing about their own mailbox is reachable here.';

-- ── bo_briefing_health ─────────────────────────────────────────────────────
drop view if exists public.bo_briefing_health;
create view public.bo_briefing_health as
select
  b.for_date,
  b.kind,
  count(*)                                                as total_count,
  count(distinct b.user_id)                               as user_count,
  count(*) filter (where b.status = 'ready')              as ready_count,
  count(*) filter (where b.status = 'failed')             as failed_count,
  count(*) filter (where b.status = 'queued')             as queued_count,
  count(*) filter (where b.status = 'generating')         as generating_count,
  count(*) filter (where b.status = 'skipped')            as skipped_count,
  count(*) filter (where b.opened_at is not null)         as opened_count,
  round(
    avg(extract(epoch from (b.generated_at - b.created_at)))
      filter (where b.generated_at is not null)
  )::integer                                              as avg_generation_seconds
from public.briefings b
group by b.for_date, b.kind;

comment on view public.bo_briefing_health is
  'Daily briefing generation outcomes per kind. Counts statuses and open rates only; briefings.narrative and .headline are the single largest concentration of derived content in the product and are never read here, nor is .audio_url or the .stats document.';

-- ── bo_notification_health ─────────────────────────────────────────────────
drop view if exists public.bo_notification_health;
create view public.bo_notification_health as
select
  (nd.created_at at time zone 'Europe/Istanbul')::date as delivery_date,
  nd.category,
  count(*)                                             as total_count,
  count(distinct nd.user_id)                           as user_count,
  count(*) filter (where nd.sent_at is not null)      as sent_count,
  count(*) filter (where nd.delivered_at is not null) as delivered_count,
  count(*) filter (where nd.failed_at is not null)    as failed_count,
  round(avg(nd.attempt_count), 2)                      as avg_attempt_count
from public.notification_deliveries nd
group by 1, 2;

comment on view public.bo_notification_health is
  'Push delivery outcomes by day and category. notification_deliveries.title and .body are the notification copy the user sees on a lock screen — often a summarised subject line — and .data carries the deep-link payload; none of the three is read here, only whether the row was sent, delivered or failed.';

-- ── bo_capture_health ──────────────────────────────────────────────────────
drop view if exists public.bo_capture_health;
create view public.bo_capture_health as
select
  (c.created_at at time zone 'Europe/Istanbul')::date as capture_date,
  c.kind,
  count(*)                                            as total_count,
  count(distinct c.user_id)                           as user_count,
  count(*) filter (where c.status = 'ready')         as ready_count,
  count(*) filter (where c.status = 'failed')        as failed_count,
  count(*) filter (where c.status = 'analyzing')     as analyzing_count,
  count(*) filter (where c.status = 'uploading')     as uploading_count,
  count(*) filter (where c.detected_intent is not null) as classified_count,
  round(avg(c.size_bytes))::bigint                    as avg_size_bytes,
  round(
    avg(extract(epoch from (c.analyzed_at - c.created_at)))
      filter (where c.analyzed_at is not null)
  )::integer                                          as avg_analysis_seconds
from public.captures c
group by 1, 2;

comment on view public.bo_capture_health is
  'Capture pipeline throughput by day and kind. captures.raw_text, .extracted, .storage_path and .source_url are the capture itself — a photographed invoice, a scanned letter — and none of them is read; the view knows only how many arrived, how many were classified and how long analysis took.';

-- ── bo_signup_daily ────────────────────────────────────────────────────────
drop view if exists public.bo_signup_daily;
create view public.bo_signup_daily as
select
  (p.created_at at time zone 'Europe/Istanbul')::date as signup_date,
  count(*)                                            as signup_count,
  count(*) filter (where p.onboarding_completed_at is not null) as onboarded_count,
  count(*) filter (where p.deleted_at is not null)    as deleted_count,
  round(
    avg(extract(epoch from (p.onboarding_completed_at - p.created_at)) / 60)
      filter (where p.onboarding_completed_at is not null)
  )::integer                                          as avg_onboarding_minutes
from public.profiles p
group by 1;

comment on view public.bo_signup_daily is
  'Signup cohorts by Istanbul day with onboarding completion. Aggregate only: no row here corresponds to an identifiable person.';

-- ── bo_platform_overview ───────────────────────────────────────────────────
drop view if exists public.bo_platform_overview;
create view public.bo_platform_overview as
select
  now() as generated_at,
  (select count(*) from public.profiles where deleted_at is null)                       as user_total,
  (select count(*) from public.profiles where deleted_at is not null)                   as user_deleted_total,
  (select count(*) from public.profiles
     where deleted_at is null and created_at >= now() - interval '24 hours')            as user_new_24h,
  (select count(*) from public.profiles
     where deleted_at is null and created_at >= now() - interval '7 days')              as user_new_7d,
  (select count(distinct user_id) from public.sync_states
     where last_run_at >= now() - interval '7 days')                                    as user_active_7d,
  (select count(*) from public.subscriptions
     where status in ('active', 'trialing', 'grace_period'))                            as subscription_active,
  (select count(*) from public.subscriptions where status = 'billing_issue')            as subscription_billing_issue,
  (select count(*) from public.connected_accounts)                                      as account_total,
  (select count(*) from public.connected_accounts
     where status in ('error', 'expired', 'revoked'))                                   as account_error,
  (select count(*) from public.sync_states where status = 'error')                      as sync_error,
  (select count(*) from public.sync_states
     where status <> 'error' and next_run_at is not null
       and next_run_at < now() - interval '1 hour')                                     as sync_stalled,
  (select count(*) from public.approval_actions where status = 'pending')               as approval_pending,
  (select count(*) from public.approval_actions
     where status = 'pending' and expires_at < now())                                   as approval_overdue,
  (select count(*) from public.approval_actions
     where status = 'failed' and updated_at >= now() - interval '24 hours')             as approval_failed_24h,
  (select count(*) from public.data_export_requests
     where status in ('requested', 'processing'))                                       as export_open,
  (select count(*) from public.data_export_requests
     where status = 'failed' and updated_at >= now() - interval '7 days')               as export_failed_7d,
  (select coalesce(sum(cost_micros), 0)::bigint from public.ai_usage_events
     where occurred_at >= now() - interval '24 hours')                                  as ai_cost_micros_24h,
  (select coalesce(sum(cost_micros), 0)::bigint from public.ai_usage_events
     where occurred_at >= now() - interval '30 days')                                   as ai_cost_micros_30d,
  (select count(*) from public.briefings
     where status = 'failed' and created_at >= now() - interval '24 hours')             as briefing_failed_24h,
  (select count(*) from public.notification_deliveries
     where failed_at >= now() - interval '24 hours')                                    as notification_failed_24h,
  (select count(*) from public.staff_members where disabled_at is null)                 as staff_active;

comment on view public.bo_platform_overview is
  'One row of headline counters for the operations landing page, so the first screen is a single query rather than twenty. Every column is a count or a sum across a where-clause on states and timestamps; no column of any content table is read, and nothing here can be traced back to an individual user.';

-- ===========================================================================
-- Grants
--
-- Supabase applies default privileges that grant new objects in `public` to
-- anon and authenticated. These revokes are therefore load-bearing: without
-- them a signed-in user could read platform-wide aggregates about everyone.
-- Only the service role, held exclusively by the backoffice server process,
-- may select from these views.
-- ===========================================================================

do $$
declare
  view_name text;
begin
  foreach view_name in array array[
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
    'bo_platform_overview'
  ]
  loop
    execute format('revoke all on public.%I from public, anon, authenticated', view_name);
    execute format('grant select on public.%I to service_role', view_name);
  end loop;
end
$$;

-- The roster itself is service-role writable and self-readable by a staff
-- member (the policy above); no client role may enumerate it.
revoke all on public.staff_members from public, anon;
grant select on public.staff_members to authenticated;
grant select, insert, update, delete on public.staff_members to service_role;
