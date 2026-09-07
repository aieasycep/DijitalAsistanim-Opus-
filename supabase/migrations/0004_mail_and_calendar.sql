-- 0004 — mirrored provider data: mail threads and messages, calendar events, tasks.

create table if not exists public.email_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connected_account_id uuid not null
    references public.connected_accounts (id) on delete cascade,
  external_thread_id text not null,
  subject text,
  participant_emails text[] not null default '{}',
  last_message_at timestamptz,
  message_count integer not null default 0 check (message_count >= 0),
  is_read boolean not null default false,
  importance importance_level,
  category email_category,
  summary text,
  reason_important text,
  requires_user_action boolean not null default false,
  deadline timestamptz,
  deadline_quote text,
  confidence numeric(3, 2) check (confidence between 0 and 1),
  priority_score numeric(12, 4) not null default 0,
  suppressed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_threads_unique_external
    unique (user_id, connected_account_id, external_thread_id),
  constraint email_threads_deadline_needs_quote
    check (deadline is null or deadline_quote is not null)
);

comment on column public.email_threads.priority_score is
  'Denormalised output of evaluatePriority() in @da/domain. Recomputed on analysis and on rule changes; sorted on directly so the inbox ranking never runs in the client. Higher is more urgent.';
comment on column public.email_threads.deadline_quote is
  'The literal source sentence the deadline was read from. A date we cannot quote is never persisted, so this column is required whenever deadline is set.';
comment on column public.email_threads.suppressed_at is
  'Set when a mute rule or a not_important signal hides the thread from ranked surfaces without deleting it.';

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id uuid not null references public.email_threads (id) on delete cascade,
  connected_account_id uuid not null
    references public.connected_accounts (id) on delete cascade,
  external_message_id text not null,
  from_email text,
  from_name text,
  to_emails text[] not null default '{}',
  cc_emails text[] not null default '{}',
  subject text,
  snippet text,
  body_text text,
  sent_at timestamptz,
  is_from_user boolean not null default false,
  has_attachments boolean not null default false,
  attachment_meta jsonb not null default '[]',
  content_hash text not null,
  external_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_messages_unique_external
    unique (user_id, connected_account_id, external_message_id),
  constraint email_messages_attachment_meta_is_array
    check (jsonb_typeof(attachment_meta) = 'array'),
  constraint email_messages_content_hash_not_blank
    check (length(btrim(content_hash)) > 0)
);

comment on column public.email_messages.attachment_meta is
  'Attachment file names, sizes and MIME types only. Attachment bytes are never stored.';
comment on column public.email_messages.content_hash is
  'Stable hash of sender + subject + body, used to collapse the same message arriving through two connected accounts.';

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connected_account_id uuid references public.connected_accounts (id) on delete cascade,
  external_event_id text not null,
  provider provider_kind not null,
  title text,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_all_day boolean not null default false,
  time_zone text,
  attendees jsonb not null default '[]',
  organizer_email text,
  conference_url text,
  status text not null default 'confirmed'
    check (status in ('confirmed', 'tentative', 'cancelled')),
  provider_updated_at timestamptz,
  external_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_unique_external
    unique (user_id, connected_account_id, external_event_id),
  constraint calendar_events_attendees_is_array
    check (jsonb_typeof(attendees) = 'array'),
  constraint calendar_events_ends_after_starts check (ends_at >= starts_at)
);

-- connected_account_id is null for locally created events; the composite unique above
-- treats nulls as distinct, so guard that case explicitly.
create unique index if not exists calendar_events_unique_external_local
  on public.calendar_events (user_id, external_event_id)
  where connected_account_id is null;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connected_account_id uuid references public.connected_accounts (id) on delete cascade,
  external_task_id text,
  provider provider_kind not null default 'device',
  title text not null,
  notes text,
  due_at timestamptz,
  status task_status not null default 'open',
  completed_at timestamptz,
  source_type source_type,
  source_id text,
  provider_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_title_not_blank check (length(btrim(title)) > 0)
);

create unique index if not exists tasks_unique_external
  on public.tasks (user_id, connected_account_id, external_task_id)
  where external_task_id is not null and connected_account_id is not null;
