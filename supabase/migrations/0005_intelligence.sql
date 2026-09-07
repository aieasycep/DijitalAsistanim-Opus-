-- 0005 — the derived intelligence layer: people, rules, commitments, insights, life events.
-- contacts is created first because commitments and vip_people reference it.

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  name text,
  alternate_emails text[] not null default '{}',
  company text,
  role text,
  avatar_url text,
  last_contact_at timestamptz,
  interaction_count integer not null default 0 check (interaction_count >= 0),
  is_vip boolean not null default false,
  vip_set_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_unique_email unique (user_id, email),
  constraint contacts_email_not_blank check (length(btrim(email)) > 0)
);

create table if not exists public.vip_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete cascade,
  email text not null,
  name text,
  added_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vip_people_unique_email unique (user_id, email)
);

comment on table public.vip_people is
  'Explicit VIP list. Kept separate from contacts.is_vip so a VIP survives a contact being merged or pruned.';

create table if not exists public.commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  text text not null,
  direction commitment_direction not null,
  person_id uuid references public.contacts (id) on delete set null,
  person_name text,
  due_at timestamptz,
  status commitment_status not null default 'open',
  source_type source_type not null,
  source_id text not null,
  source_quote text not null,
  confidence numeric(3, 2) check (confidence between 0 and 1),
  confirmed_by_user boolean not null default false,
  completed_at timestamptz,
  snoozed_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commitments_text_not_blank check (length(btrim(text)) > 0),
  constraint commitments_source_quote_not_blank check (length(btrim(source_quote)) > 0)
);

comment on column public.commitments.source_quote is
  'The literal sentence the promise was extracted from. Required and non-blank: a claim we cannot quote back to the source is never persisted, so an unverifiable extraction is dropped rather than stored.';

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text,
  remind_at timestamptz not null,
  preset reminder_preset not null default 'custom',
  source_type source_type,
  source_id text,
  related_entity_type source_type,
  related_entity_id text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'fired', 'cancelled', 'completed')),
  fired_at timestamptz,
  category notification_category,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reminders_title_not_blank check (length(btrim(title)) > 0)
);

create table if not exists public.priority_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind priority_rule_kind not null,
  match_value text,
  match_category email_category,
  enabled boolean not null default true,
  note text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint priority_rules_has_a_target
    check (match_value is not null or match_category is not null)
);

comment on table public.priority_rules is
  'Rules the user set by hand. They always win over learned_preferences.';

create table if not exists public.learned_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  statement text not null,
  kind priority_rule_kind not null,
  match_value text,
  strength numeric(3, 2) not null default 0.5 check (strength between 0 and 1),
  observation_count integer not null default 1 check (observation_count >= 0),
  enabled boolean not null default true,
  last_observed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learned_preferences_statement_not_blank check (length(btrim(statement)) > 0)
);

comment on column public.learned_preferences.statement is
  'Plain-Turkish sentence shown on the "Seni nasil taniyorum" screen, so every inference is reviewable and revocable.';

create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  detail text,
  importance importance_level not null default 'normal',
  category text,
  source_type source_type,
  source_id text,
  source_label text,
  reason_important text,
  actions jsonb not null default '[]',
  due_at timestamptz,
  priority_score numeric(12, 4) not null default 0,
  completed_at timestamptz,
  dismissed_at timestamptz,
  for_date date not null,
  confidence numeric(3, 2) check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint insights_title_not_blank check (length(btrim(title)) > 0),
  constraint insights_actions_is_array check (jsonb_typeof(actions) = 'array')
);

comment on column public.insights.priority_score is
  'Denormalised evaluatePriority() output, so the daily card stack sorts in the database instead of the client.';

create table if not exists public.life_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type life_event_type not null,
  title text not null,
  detail text,
  occurs_at timestamptz,
  amount_value numeric(14, 2),
  amount_currency char(3),
  reference text,
  tracking_url text,
  source_type source_type not null,
  source_id text not null,
  source_quote text,
  confidence numeric(3, 2) check (confidence between 0 and 1),
  status text not null default 'active'
    check (status in ('active', 'completed', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint life_events_title_not_blank check (length(btrim(title)) > 0),
  constraint life_events_amount_needs_currency
    check (amount_value is null or amount_currency is not null),
  constraint life_events_amount_needs_quote
    check (amount_value is null or source_quote is not null)
);

comment on column public.life_events.source_quote is
  'The literal source sentence behind the amount, date or reference. An amount we cannot quote is never persisted, which is why amount_value requires it.';
comment on column public.life_events.amount_value is
  'Copied verbatim from the source. Never inferred, converted or rounded by the model.';

create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id uuid not null references public.email_threads (id) on delete cascade,
  message_id text,
  recipient_email text,
  recipient_name text,
  sent_at timestamptz,
  due_at timestamptz,
  status text not null default 'waiting'
    check (status in ('waiting', 'replied', 'nudged', 'closed')),
  replied_at timestamptz,
  closed_at timestamptz,
  dismiss_count integer not null default 0 check (dismiss_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.follow_ups is
  'Outbound mail we are still waiting on. A nudge is only ever proposed, never sent without approval.';
