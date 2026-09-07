-- 0006 — generated briefings and the approval queue that guards every external write.

create table if not exists public.briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind briefing_kind not null,
  status briefing_status not null default 'queued',
  for_date date not null,
  narrative text,
  headline text,
  duration_seconds integer check (duration_seconds >= 0),
  audio_url text,
  audio_provider text,
  generated_at timestamptz,
  opened_at timestamptz,
  content_hash text,
  stats jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint briefings_unique_per_day unique (user_id, kind, for_date),
  constraint briefings_stats_is_object check (jsonb_typeof(stats) = 'object')
);

comment on column public.briefings.content_hash is
  'Hash of the source set the narrative was built from. Regeneration is skipped when nothing underneath changed.';
comment on column public.briefings.narrative is
  'Editorial prose rendered in Lora. Written from briefing_items only, so every sentence traces to a stored source.';

create table if not exists public.briefing_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  briefing_id uuid not null references public.briefings (id) on delete cascade,
  section briefing_section not null,
  position integer not null default 0 check (position >= 0),
  title text not null,
  detail text,
  source_type source_type,
  source_id text,
  source_label text,
  related_entity_type source_type,
  related_entity_id text,
  importance importance_level not null default 'normal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint briefing_items_title_not_blank check (length(btrim(title)) > 0),
  constraint briefing_items_unique_position unique (briefing_id, section, position)
);

create table if not exists public.approval_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type approval_action_type not null,
  status approval_status not null default 'pending',
  what text not null,
  why text not null,
  source_type source_type,
  source_id text,
  source_label text,
  payload jsonb not null,
  original_payload jsonb not null,
  idempotency_key text not null,
  expires_at timestamptz not null,
  approved_at timestamptz,
  executed_at timestamptz,
  rejected_at timestamptz,
  failure_reason text,
  failure_code text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  result_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approval_actions_unique_idempotency unique (user_id, idempotency_key),
  constraint approval_actions_what_not_blank check (length(btrim(what)) > 0),
  constraint approval_actions_why_not_blank check (length(btrim(why)) > 0),
  constraint approval_actions_payload_is_object check (jsonb_typeof(payload) = 'object'),
  constraint approval_actions_original_payload_is_object
    check (jsonb_typeof(original_payload) = 'object'),
  constraint approval_actions_executed_needs_timestamp
    check (status <> 'executed' or executed_at is not null)
);

comment on table public.approval_actions is
  'Every action with an external side effect queues here first. Nothing is sent, created or changed outside the app until the row reaches status = approved and the executor moves it to executing.';
comment on column public.approval_actions.original_payload is
  'The proposal exactly as generated. payload holds the user-edited version; the pair is diffed so the review sheet can show what the user changed.';
comment on column public.approval_actions.idempotency_key is
  'Built by buildIdempotencyKey() in @da/domain. Unique per user so a retry after a timeout can never send the same mail twice.';
comment on column public.approval_actions.why is
  'Plain-Turkish reason shown to the user before they approve. An action we cannot explain is not proposed.';
