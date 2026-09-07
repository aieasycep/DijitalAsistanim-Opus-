-- 0010 — feedback, audit trail, data export, and the private storage buckets.

create table if not exists public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  signal feedback_signal not null,
  entity_type source_type not null,
  entity_id text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_feedback is
  'Explicit correction signals. They feed learned_preferences, which the user can read and switch off.';

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint audit_logs_action_not_blank check (length(btrim(action)) > 0),
  constraint audit_logs_metadata_is_object check (jsonb_typeof(metadata) = 'object')
);

comment on table public.audit_logs is
  'Append-only record of security-relevant events: account connect and disconnect, approval decisions, exports, deletions. user_id survives as null after the account is gone so the trail is not silently rewritten.';
comment on column public.audit_logs.metadata is
  'Identifiers and outcome codes only. Mail content, subjects, names and addresses never go in here.';

create table if not exists public.data_export_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status export_status not null default 'requested',
  storage_path text,
  size_bytes bigint check (size_bytes >= 0),
  ready_at timestamptz,
  expires_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.data_export_requests.storage_path is
  'Object key inside the private "exports" bucket. Reached only through a short-lived signed URL, and purged at expires_at.';

-- Private buckets. Neither is public; access is exclusively through signed URLs issued by
-- trusted server code after an ownership check.
insert into storage.buckets (id, name, public)
values
  ('captures', 'captures', false),
  ('exports', 'exports', false)
on conflict (id) do nothing;
