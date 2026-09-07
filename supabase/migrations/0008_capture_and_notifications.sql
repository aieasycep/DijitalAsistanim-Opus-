-- 0008 — captures (camera, file, link, text) and the notification pipeline.

create table if not exists public.captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind capture_kind not null,
  status capture_status not null default 'uploading',
  storage_path text,
  source_url text,
  raw_text text,
  mime_type text,
  size_bytes bigint check (size_bytes >= 0),
  detected_intent capture_intent,
  extracted jsonb,
  failure_reason text,
  analyzed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint captures_extracted_is_object
    check (extracted is null or jsonb_typeof(extracted) = 'object'),
  constraint captures_has_payload
    check (storage_path is not null or source_url is not null or raw_text is not null)
);

comment on column public.captures.storage_path is
  'Object key inside the private "captures" bucket. Bytes are removed when deleted_at is set and the retention sweep runs.';
comment on column public.captures.extracted is
  'CaptureExtraction JSON. Fields the model could not quote from the capture are dropped before the row is written.';

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  categories jsonb not null default '{}',
  only_if_important boolean not null default false,
  lock_screen_privacy lock_screen_privacy not null default 'title_only',
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_preferences_categories_is_object
    check (jsonb_typeof(categories) = 'object')
);

comment on column public.notification_preferences.categories is
  'notification_category -> boolean map. A category absent from the map falls back to its product default.';
comment on column public.notification_preferences.lock_screen_privacy is
  'Governs how much of a notification body reaches a locked screen. Default hides content.';

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios', 'android')),
  device_id text not null,
  device_name text,
  app_version text,
  last_seen_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_tokens_unique_device unique (user_id, device_id),
  constraint push_tokens_token_not_blank check (length(btrim(token)) > 0)
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category notification_category not null,
  push_token_id uuid references public.push_tokens (id) on delete set null,
  dedupe_key text not null,
  title text,
  body text,
  data jsonb not null default '{}',
  scheduled_for timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_deliveries_unique_dedupe unique (user_id, dedupe_key),
  constraint notification_deliveries_data_is_object check (jsonb_typeof(data) = 'object')
);

comment on column public.notification_deliveries.dedupe_key is
  'Stable key per user and logical event, so a retried job or a second device can never double-notify.';

-- Android notification listener mirror. Read-only signal used to spot things that never
-- reach mail (cargo apps, bank alerts).
create table if not exists public.device_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  package_name text not null,
  app_name text,
  title text not null default '',
  text text,
  posted_at timestamptz not null,
  importance importance_level,
  category email_category,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint device_notifications_unique_post
    unique (user_id, package_name, posted_at, title)
);

comment on table public.device_notifications is
  'Mirrored Android notifications, ingested only while the user keeps the listener permission granted. Nothing here is sent to analytics.';
