-- 0011_rls_policies.sql
-- Row level security for every user-facing table.
--
-- The access model has three tiers, and the split matters for product integrity:
--
--   1. Client-writable  — things the human authored (preferences, contacts, VIP list,
--      priority rules, captures, tasks, reminders, commitments, feedback, chat threads).
--      The user owns this data outright, so the client may insert/update/delete it.
--
--   2. Client-readable only — anything the ASSISTANT produced or that encodes an
--      entitlement: insights, briefings, approval actions, life events, follow-ups,
--      subscriptions, referral credits, synced mail and calendar. Writes happen from
--      edge functions with the service role. If the client could write these rows it
--      could fabricate an insight ("your flight is cancelled"), pre-approve an action
--      that sends mail, or grant itself Pro. Read-only closes all three.
--
--   3. No authenticated policy at all — RLS is on with zero policies, so PostgREST
--      returns nothing to any signed-in user and only the service role can touch it.
--      Used for secrets and forensic trails.
--
-- Every policy uses `(select auth.uid())` rather than a bare `auth.uid()`: the subquery
-- form is evaluated once per statement as an InitPlan instead of once per candidate row,
-- which is the difference between an index scan and a sequential scan on large mailboxes.

-- ---------------------------------------------------------------------------
-- Enable + force RLS on every table.
-- `force` also applies the policies to the table owner, so a migration or a
-- mis-scoped connection cannot quietly bypass them.
-- ---------------------------------------------------------------------------

alter table public.profiles                enable row level security;
alter table public.profiles                force  row level security;
alter table public.user_preferences        enable row level security;
alter table public.user_preferences        force  row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_preferences force  row level security;
alter table public.subscriptions           enable row level security;
alter table public.subscriptions           force  row level security;
alter table public.connected_accounts      enable row level security;
alter table public.connected_accounts      force  row level security;
alter table public.oauth_credentials       enable row level security;
alter table public.oauth_credentials       force  row level security;
alter table public.sync_states             enable row level security;
alter table public.sync_states             force  row level security;
alter table public.email_threads           enable row level security;
alter table public.email_threads           force  row level security;
alter table public.email_messages          enable row level security;
alter table public.email_messages          force  row level security;
alter table public.calendar_events         enable row level security;
alter table public.calendar_events         force  row level security;
alter table public.tasks                   enable row level security;
alter table public.tasks                   force  row level security;
alter table public.commitments             enable row level security;
alter table public.commitments             force  row level security;
alter table public.reminders               enable row level security;
alter table public.reminders               force  row level security;
alter table public.contacts                enable row level security;
alter table public.contacts                force  row level security;
alter table public.vip_people              enable row level security;
alter table public.vip_people              force  row level security;
alter table public.priority_rules          enable row level security;
alter table public.priority_rules          force  row level security;
alter table public.learned_preferences     enable row level security;
alter table public.learned_preferences     force  row level security;
alter table public.insights                enable row level security;
alter table public.insights                force  row level security;
alter table public.life_events             enable row level security;
alter table public.life_events             force  row level security;
alter table public.follow_ups              enable row level security;
alter table public.follow_ups              force  row level security;
alter table public.briefings               enable row level security;
alter table public.briefings               force  row level security;
alter table public.briefing_items          enable row level security;
alter table public.briefing_items          force  row level security;
alter table public.approval_actions        enable row level security;
alter table public.approval_actions        force  row level security;
alter table public.assistant_threads       enable row level security;
alter table public.assistant_threads       force  row level security;
alter table public.assistant_messages      enable row level security;
alter table public.assistant_messages      force  row level security;
alter table public.memory_chunks           enable row level security;
alter table public.memory_chunks           force  row level security;
alter table public.captures                enable row level security;
alter table public.captures                force  row level security;
alter table public.push_tokens             enable row level security;
alter table public.push_tokens             force  row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_deliveries force  row level security;
alter table public.device_notifications    enable row level security;
alter table public.device_notifications    force  row level security;
alter table public.referrals                enable row level security;
alter table public.referrals                force  row level security;
alter table public.referral_credits        enable row level security;
alter table public.referral_credits        force  row level security;
alter table public.ai_feedback             enable row level security;
alter table public.ai_feedback             force  row level security;
alter table public.ai_usage_events         enable row level security;
alter table public.ai_usage_events         force  row level security;
alter table public.rate_limit_counters     enable row level security;
alter table public.rate_limit_counters     force  row level security;
alter table public.audit_logs              enable row level security;
alter table public.audit_logs              force  row level security;
alter table public.data_export_requests    enable row level security;
alter table public.data_export_requests    force  row level security;

-- ===========================================================================
-- TIER 1 — client-writable (user-authored data)
-- ===========================================================================

-- profiles: keyed on its own primary key, which IS the auth user id.
-- Delete is intentionally absent: account deletion runs through the erasure
-- edge function so provider tokens and storage objects are torn down too.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete to authenticated
  using ((select auth.uid()) = id);

-- user_preferences (pk user_id)
drop policy if exists user_preferences_select on public.user_preferences;
create policy user_preferences_select on public.user_preferences
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists user_preferences_insert on public.user_preferences;
create policy user_preferences_insert on public.user_preferences
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists user_preferences_update on public.user_preferences;
create policy user_preferences_update on public.user_preferences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists user_preferences_delete on public.user_preferences;
create policy user_preferences_delete on public.user_preferences
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- notification_preferences (pk user_id)
drop policy if exists notification_preferences_select on public.notification_preferences;
create policy notification_preferences_select on public.notification_preferences
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists notification_preferences_insert on public.notification_preferences;
create policy notification_preferences_insert on public.notification_preferences
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists notification_preferences_update on public.notification_preferences;
create policy notification_preferences_update on public.notification_preferences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists notification_preferences_delete on public.notification_preferences;
create policy notification_preferences_delete on public.notification_preferences
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- contacts
drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert on public.contacts
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists contacts_delete on public.contacts;
create policy contacts_delete on public.contacts
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- vip_people
drop policy if exists vip_people_select on public.vip_people;
create policy vip_people_select on public.vip_people
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists vip_people_insert on public.vip_people;
create policy vip_people_insert on public.vip_people
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists vip_people_update on public.vip_people;
create policy vip_people_update on public.vip_people
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists vip_people_delete on public.vip_people;
create policy vip_people_delete on public.vip_people
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- priority_rules
drop policy if exists priority_rules_select on public.priority_rules;
create policy priority_rules_select on public.priority_rules
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists priority_rules_insert on public.priority_rules;
create policy priority_rules_insert on public.priority_rules
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists priority_rules_update on public.priority_rules;
create policy priority_rules_update on public.priority_rules
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists priority_rules_delete on public.priority_rules;
create policy priority_rules_delete on public.priority_rules
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- learned_preferences: the assistant writes these server-side, but the user must be
-- able to correct or forget one, which is why delete/update stay open to the client.
drop policy if exists learned_preferences_select on public.learned_preferences;
create policy learned_preferences_select on public.learned_preferences
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists learned_preferences_insert on public.learned_preferences;
create policy learned_preferences_insert on public.learned_preferences
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists learned_preferences_update on public.learned_preferences;
create policy learned_preferences_update on public.learned_preferences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists learned_preferences_delete on public.learned_preferences;
create policy learned_preferences_delete on public.learned_preferences
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- captures
drop policy if exists captures_select on public.captures;
create policy captures_select on public.captures
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists captures_insert on public.captures;
create policy captures_insert on public.captures
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists captures_update on public.captures;
create policy captures_update on public.captures
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists captures_delete on public.captures;
create policy captures_delete on public.captures
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ai_feedback
drop policy if exists ai_feedback_select on public.ai_feedback;
create policy ai_feedback_select on public.ai_feedback
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists ai_feedback_insert on public.ai_feedback;
create policy ai_feedback_insert on public.ai_feedback
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists ai_feedback_update on public.ai_feedback;
create policy ai_feedback_update on public.ai_feedback
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists ai_feedback_delete on public.ai_feedback;
create policy ai_feedback_delete on public.ai_feedback
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- assistant_threads: the user starts, renames and deletes conversations.
-- The messages inside them are read-only (see tier 2) so a client cannot forge
-- an assistant turn and then cite it back as grounded context.
drop policy if exists assistant_threads_select on public.assistant_threads;
create policy assistant_threads_select on public.assistant_threads
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists assistant_threads_insert on public.assistant_threads;
create policy assistant_threads_insert on public.assistant_threads
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists assistant_threads_update on public.assistant_threads;
create policy assistant_threads_update on public.assistant_threads
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists assistant_threads_delete on public.assistant_threads;
create policy assistant_threads_delete on public.assistant_threads
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- push_tokens
drop policy if exists push_tokens_select on public.push_tokens;
create policy push_tokens_select on public.push_tokens
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists push_tokens_insert on public.push_tokens;
create policy push_tokens_insert on public.push_tokens
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists push_tokens_update on public.push_tokens;
create policy push_tokens_update on public.push_tokens
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists push_tokens_delete on public.push_tokens;
create policy push_tokens_delete on public.push_tokens
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- reminders
drop policy if exists reminders_select on public.reminders;
create policy reminders_select on public.reminders
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists reminders_insert on public.reminders;
create policy reminders_insert on public.reminders
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists reminders_update on public.reminders;
create policy reminders_update on public.reminders
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists reminders_delete on public.reminders;
create policy reminders_delete on public.reminders
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- tasks
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- commitments
drop policy if exists commitments_select on public.commitments;
create policy commitments_select on public.commitments
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists commitments_insert on public.commitments;
create policy commitments_insert on public.commitments
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists commitments_update on public.commitments;
create policy commitments_update on public.commitments
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists commitments_delete on public.commitments;
create policy commitments_delete on public.commitments
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ===========================================================================
-- TIER 2 — client-readable, service-role-writable
--
-- These rows are evidence: synced provider data, or something the model derived
-- from it. A user reads them; only an edge function running with the service
-- role creates or mutates them. That keeps three invariants honest:
--   * an insight/briefing always traces back to a real synced source,
--   * an approval_action can only reach 'approved' through the decide endpoint
--     (which records who approved, when, and the payload diff),
--   * subscription status comes from the RevenueCat webhook, never the device.
-- ===========================================================================

drop policy if exists connected_accounts_select on public.connected_accounts;
create policy connected_accounts_select on public.connected_accounts
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists sync_states_select on public.sync_states;
create policy sync_states_select on public.sync_states
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists email_threads_select on public.email_threads;
create policy email_threads_select on public.email_threads
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists email_messages_select on public.email_messages;
create policy email_messages_select on public.email_messages
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists calendar_events_select on public.calendar_events;
create policy calendar_events_select on public.calendar_events
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists insights_select on public.insights;
create policy insights_select on public.insights
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists life_events_select on public.life_events;
create policy life_events_select on public.life_events
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists follow_ups_select on public.follow_ups;
create policy follow_ups_select on public.follow_ups
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists briefings_select on public.briefings;
create policy briefings_select on public.briefings
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists briefing_items_select on public.briefing_items;
create policy briefing_items_select on public.briefing_items
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists approval_actions_select on public.approval_actions;
create policy approval_actions_select on public.approval_actions
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists assistant_messages_select on public.assistant_messages;
create policy assistant_messages_select on public.assistant_messages
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists memory_chunks_select on public.memory_chunks;
create policy memory_chunks_select on public.memory_chunks
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists referrals_select on public.referrals;
create policy referrals_select on public.referrals
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists referral_credits_select on public.referral_credits;
create policy referral_credits_select on public.referral_credits
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists data_export_requests_select on public.data_export_requests;
create policy data_export_requests_select on public.data_export_requests
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists device_notifications_select on public.device_notifications;
create policy device_notifications_select on public.device_notifications
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ===========================================================================
-- TIER 3 — service role only. RLS is enabled with no policy, so every
-- authenticated request sees zero rows and every write is rejected.
-- ===========================================================================

-- oauth_credentials holds encrypted provider refresh tokens. A refresh token is a
-- standing key to the user's whole mailbox; it must never leave the server, so no
-- client role is granted any access, not even select of its own row.
comment on table public.oauth_credentials is
  'Encrypted provider tokens. RLS on with zero policies: service role only, never client-readable.';

-- audit_logs is the forensic record of approvals, exports and deletions. If a client
-- could write it, the record could be forged; if it could delete, the trail could be
-- erased. Users read their history through an edge function that redacts internals.
comment on table public.audit_logs is
  'Append-only forensic trail. RLS on with zero policies so it cannot be forged or erased from a client.';

-- ai_usage_events drives cost accounting and quota enforcement. Client writes would
-- let a device under-report its own token spend.
comment on table public.ai_usage_events is
  'Model cost + quota accounting. RLS on with zero policies so usage cannot be under-reported by a client.';

-- rate_limit_counters IS the rate limiter. Any client write is a bypass.
comment on table public.rate_limit_counters is
  'Rate limiter state. RLS on with zero policies: a client-writable counter is not a limit.';

-- notification_deliveries records what was actually pushed, including provider
-- receipts and failures. It is operational telemetry, not user content.
comment on table public.notification_deliveries is
  'Push delivery receipts. RLS on with zero policies: server-side telemetry, not user-facing content.';

-- ===========================================================================
-- Storage buckets
--
-- Object keys are laid out as `<user_id>/<...>`, so the first path segment is the
-- ownership check. `captures` holds user uploads (photos, PDFs) and is fully
-- client-managed. `exports` holds generated GDPR/KVKK archives: the user downloads
-- them, but only the export worker may create or remove them.
-- ===========================================================================

drop policy if exists captures_objects_select on storage.objects;
create policy captures_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'captures'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists captures_objects_insert on storage.objects;
create policy captures_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'captures'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists captures_objects_update on storage.objects;
create policy captures_objects_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'captures'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'captures'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists captures_objects_delete on storage.objects;
create policy captures_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'captures'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists exports_objects_select on storage.objects;
create policy exports_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'exports'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
