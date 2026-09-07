-- 0001 — extensions and enum types.
-- Every statement is idempotent: migrations are replayed on branch databases and on
-- restored backups, and pgvector is not available on every Postgres flavour we target.

create schema if not exists extensions;

do $$
begin
  create extension if not exists pgcrypto with schema extensions;
exception
  when others then
    raise notice 'pgcrypto unavailable: %', sqlerrm;
end
$$;

do $$
begin
  create extension if not exists pg_trgm with schema extensions;
exception
  when others then
    raise notice 'pg_trgm unavailable: %', sqlerrm;
end
$$;

do $$
begin
  create extension if not exists unaccent with schema extensions;
exception
  when others then
    raise notice 'unaccent unavailable: %', sqlerrm;
end
$$;

-- pgvector powers semantic memory search. When it is missing the schema still migrates and
-- memory falls back to the full-text index built in 0007.
do $$
begin
  create extension if not exists vector with schema extensions;
exception
  when others then
    raise notice 'vector unavailable: %', sqlerrm;
end
$$;

do $$
begin
  create extension if not exists citext with schema extensions;
exception
  when others then
    raise notice 'citext unavailable: %', sqlerrm;
end
$$;

-- ---------------------------------------------------------------------------
-- Enum types. Members and their order mirror the TypeScript unions in
-- @da/domain/enums.ts exactly; changing one without the other breaks decoding.
-- ---------------------------------------------------------------------------

do $$ begin
  create type importance_level as enum ('critical', 'high', 'normal', 'low');
exception when duplicate_object then null; end $$;

do $$ begin
  create type email_category as enum (
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
    'promotion'
  );
exception when duplicate_object then null; end $$;

-- Named provider_kind rather than provider to stay clear of provider-named columns.
do $$ begin
  create type provider_kind as enum ('google', 'microsoft', 'apple', 'device', 'demo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type account_kind as enum ('mail', 'calendar', 'tasks', 'contacts');
exception when duplicate_object then null; end $$;

do $$ begin
  create type connection_status as enum ('connected', 'expired', 'revoked', 'error', 'disconnected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type approval_status as enum (
    'pending',
    'approved',
    'rejected',
    'executing',
    'executed',
    'failed',
    'expired'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type approval_action_type as enum (
    'email_send',
    'calendar_create',
    'calendar_update',
    'task_create',
    'reminder_create',
    'commitment_create'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type life_event_type as enum (
    'shipment',
    'flight',
    'reservation',
    'payment',
    'subscription',
    'security'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type briefing_kind as enum ('morning', 'midday', 'evening', 'weekly');
exception when duplicate_object then null; end $$;

do $$ begin
  create type briefing_status as enum ('queued', 'generating', 'ready', 'failed', 'skipped');
exception when duplicate_object then null; end $$;

do $$ begin
  create type briefing_section as enum (
    'priorities',
    'schedule',
    'expected_from_you',
    'waiting_on_others',
    'deadlines',
    'personal'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type commitment_direction as enum ('user_owes', 'other_owes');
exception when duplicate_object then null; end $$;

do $$ begin
  create type commitment_status as enum ('open', 'done', 'snoozed', 'cancelled', 'overdue');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum ('open', 'done', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type priority_rule_kind as enum (
    'sender_always_important',
    'domain_always_important',
    'keyword_high_priority',
    'vip_always_notify',
    'category_low_priority',
    'mute_sender'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type capture_kind as enum ('camera', 'photo', 'pdf', 'file', 'link', 'text');
exception when duplicate_object then null; end $$;

do $$ begin
  create type capture_status as enum ('uploading', 'queued', 'analyzing', 'ready', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type capture_intent as enum (
    'event',
    'task',
    'deadline',
    'person',
    'note',
    'payment',
    'reservation',
    'travel',
    'product_info'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_category as enum (
    'morning_briefing',
    'midday_pulse',
    'evening_close',
    'weekly_review',
    'critical_email',
    'meeting',
    'deadline',
    'follow_up',
    'life_event',
    'approval'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type lock_screen_privacy as enum ('full', 'title_only', 'generic');
exception when duplicate_object then null; end $$;

do $$ begin
  create type retention_window as enum ('30d', '90d', '1y', 'forever');
exception when duplicate_object then null; end $$;

do $$ begin
  create type source_type as enum (
    'email',
    'calendar_event',
    'task',
    'capture',
    'commitment',
    'notification',
    'contact',
    'user_input'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type reply_tone as enum ('short', 'professional', 'friendly', 'detailed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type subscription_status as enum (
    'free',
    'trialing',
    'active',
    'grace_period',
    'expired',
    'billing_issue'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type export_status as enum ('requested', 'processing', 'ready', 'failed', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sync_status as enum ('idle', 'syncing', 'backfilling', 'error');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app_locale as enum ('tr', 'en');
exception when duplicate_object then null; end $$;

do $$ begin
  create type feedback_signal as enum (
    'not_important',
    'more_like_this',
    'mark_vip',
    'stop_following',
    'good_summary',
    'bad_summary'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type reminder_preset as enum (
    'in_30_minutes',
    'in_1_hour',
    'this_evening',
    'tomorrow_morning',
    'smart',
    'custom'
  );
exception when duplicate_object then null; end $$;
