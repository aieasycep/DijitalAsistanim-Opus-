-- 0013 — indexes.
--
-- Two groups. First, an index behind every foreign key, so a cascading delete of an account
-- or a user never degrades into a sequential scan. A foreign-key column that is already a
-- primary key, or already the leading column of a unique constraint, is covered by that
-- index and is not duplicated here. Second, the composite indexes that back the ranked
-- reads the product actually performs.

-- ---------------------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------------------

create index if not exists connected_accounts_user_id_idx
  on public.connected_accounts (user_id);

create index if not exists oauth_credentials_user_id_idx
  on public.oauth_credentials (user_id);

create index if not exists sync_states_user_id_idx
  on public.sync_states (user_id);

create index if not exists email_threads_connected_account_id_idx
  on public.email_threads (connected_account_id);

create index if not exists email_messages_thread_id_idx
  on public.email_messages (thread_id);

create index if not exists email_messages_connected_account_id_idx
  on public.email_messages (connected_account_id);

create index if not exists calendar_events_connected_account_id_idx
  on public.calendar_events (connected_account_id);

create index if not exists tasks_user_id_idx
  on public.tasks (user_id);

create index if not exists tasks_connected_account_id_idx
  on public.tasks (connected_account_id);

create index if not exists vip_people_contact_id_idx
  on public.vip_people (contact_id);

create index if not exists commitments_person_id_idx
  on public.commitments (person_id);

create index if not exists priority_rules_user_id_idx
  on public.priority_rules (user_id);

create index if not exists learned_preferences_user_id_idx
  on public.learned_preferences (user_id);

create index if not exists follow_ups_thread_id_idx
  on public.follow_ups (thread_id);

create index if not exists briefing_items_briefing_id_idx
  on public.briefing_items (briefing_id);

create index if not exists briefing_items_user_id_idx
  on public.briefing_items (user_id);

create index if not exists assistant_threads_user_id_idx
  on public.assistant_threads (user_id, last_message_at desc);

create index if not exists assistant_messages_thread_id_idx
  on public.assistant_messages (thread_id, created_at);

create index if not exists assistant_messages_user_id_idx
  on public.assistant_messages (user_id);

create index if not exists assistant_messages_proposed_approval_id_idx
  on public.assistant_messages (proposed_approval_id)
  where proposed_approval_id is not null;

create index if not exists memory_chunks_user_id_idx
  on public.memory_chunks (user_id, occurred_at desc);

create index if not exists captures_user_id_idx
  on public.captures (user_id, created_at desc);

create index if not exists push_tokens_user_id_idx
  on public.push_tokens (user_id);

create index if not exists notification_deliveries_push_token_id_idx
  on public.notification_deliveries (push_token_id);

create index if not exists device_notifications_user_id_idx
  on public.device_notifications (user_id, posted_at desc);

create index if not exists referral_credits_user_id_idx
  on public.referral_credits (user_id);

create index if not exists referral_credits_referrer_user_id_idx
  on public.referral_credits (referrer_user_id);

create index if not exists referral_credits_referee_user_id_idx
  on public.referral_credits (referee_user_id);

create index if not exists ai_usage_events_user_id_idx
  on public.ai_usage_events (user_id, occurred_at desc);

create index if not exists rate_limit_counters_user_id_idx
  on public.rate_limit_counters (user_id);

create index if not exists ai_feedback_user_id_idx
  on public.ai_feedback (user_id, created_at desc);

create index if not exists audit_logs_user_id_idx
  on public.audit_logs (user_id, created_at desc);

create index if not exists data_export_requests_user_id_idx
  on public.data_export_requests (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Ranked reads
-- ---------------------------------------------------------------------------

-- The inbox ranking. Suppressed threads are excluded from the index itself so the hot path
-- never pays for muted mail.
create index if not exists email_threads_priority_idx
  on public.email_threads (user_id, priority_score desc, last_message_at desc)
  where suppressed_at is null;

create index if not exists email_threads_category_idx
  on public.email_threads (user_id, category, last_message_at desc);

create index if not exists email_messages_sent_at_idx
  on public.email_messages (user_id, sent_at desc);

-- Cross-account de-duplication: the same message reaching two connected inboxes is stored once.
create unique index if not exists email_messages_content_hash_key
  on public.email_messages (user_id, content_hash);

create index if not exists calendar_events_starts_at_idx
  on public.calendar_events (user_id, starts_at);

create index if not exists insights_for_date_idx
  on public.insights (user_id, for_date, priority_score desc);

create index if not exists approval_actions_status_idx
  on public.approval_actions (user_id, status, expires_at);

create index if not exists follow_ups_due_idx
  on public.follow_ups (user_id, status, due_at);

create index if not exists reminders_due_idx
  on public.reminders (user_id, status, remind_at);

create index if not exists commitments_due_idx
  on public.commitments (user_id, status, due_at);

create index if not exists life_events_occurs_at_idx
  on public.life_events (user_id, status, occurs_at);

create index if not exists briefings_for_date_idx
  on public.briefings (user_id, kind, for_date desc);

create index if not exists notification_deliveries_pending_idx
  on public.notification_deliveries (user_id, scheduled_for)
  where sent_at is null;

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------

-- Trigram search over people and subjects. The opclass lives wherever pg_trgm was installed,
-- so resolve its schema instead of assuming the search path.
do $$
declare
  opclass_schema text;
begin
  select n.nspname
  into opclass_schema
  from pg_opclass o
  join pg_namespace n on n.oid = o.opcnamespace
  where o.opcname = 'gin_trgm_ops'
  limit 1;

  if opclass_schema is null then
    raise notice 'pg_trgm missing: skipping trigram search indexes';
    return;
  end if;

  execute format(
    'create index if not exists contacts_name_trgm_idx on public.contacts using gin (name %I.gin_trgm_ops)',
    opclass_schema
  );
  execute format(
    'create index if not exists email_threads_subject_trgm_idx on public.email_threads using gin (subject %I.gin_trgm_ops)',
    opclass_schema
  );
exception
  when others then
    raise notice 'skipping trigram search indexes: %', sqlerrm;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'memory_chunks'
      and column_name = 'content_tsv'
  ) then
    execute 'create index if not exists memory_chunks_content_tsv_idx '
      || 'on public.memory_chunks using gin (content_tsv)';
  end if;
exception
  when others then
    raise notice 'skipping memory_chunks full-text index: %', sqlerrm;
end
$$;

-- Approximate nearest-neighbour over memory embeddings. No-ops when pgvector, its opclass,
-- or the embedding column itself is absent.
do $$
declare
  opclass_schema text;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'memory_chunks'
      and column_name = 'embedding'
  ) then
    raise notice 'memory_chunks.embedding missing: skipping vector index';
    return;
  end if;

  select n.nspname
  into opclass_schema
  from pg_opclass o
  join pg_namespace n on n.oid = o.opcnamespace
  where o.opcname = 'vector_cosine_ops'
  limit 1;

  if opclass_schema is null then
    raise notice 'vector_cosine_ops missing: skipping vector index';
    return;
  end if;

  execute format(
    'create index if not exists memory_chunks_embedding_idx on public.memory_chunks '
    || 'using ivfflat (embedding %I.vector_cosine_ops) with (lists = 100)',
    opclass_schema
  );
exception
  when others then
    raise notice 'skipping memory_chunks vector index: %', sqlerrm;
end
$$;
