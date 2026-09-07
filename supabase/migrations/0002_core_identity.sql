-- 0002 — core identity: profile and per-user preferences.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  given_name text,
  avatar_url text,
  time_zone text not null default 'Europe/Istanbul',
  locale app_locale not null default 'tr',
  onboarding_completed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_not_blank check (length(btrim(email)) > 0),
  constraint profiles_time_zone_not_blank check (length(btrim(time_zone)) > 0)
);

comment on table public.profiles is
  'One row per authenticated user. Soft-deleted via deleted_at so an in-flight deletion job can still resolve references.';

create unique index if not exists profiles_email_lower_key
  on public.profiles (lower(email))
  where deleted_at is null;

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  color_scheme text not null default 'system'
    check (color_scheme in ('system', 'light', 'dark')),
  language app_locale not null default 'tr',
  morning_briefing_time time not null default '07:30',
  midday_pulse_enabled boolean not null default true,
  midday_pulse_time time not null default '13:00',
  evening_close_enabled boolean not null default true,
  evening_close_time time not null default '20:30',
  weekly_review_enabled boolean not null default true,
  weekly_review_weekday integer not null default 0
    check (weekly_review_weekday between 0 and 6),
  weekly_review_time time not null default '19:00',
  briefing_on_weekends boolean not null default false,
  quiet_days integer[] not null default '{}',
  quiet_hours_start time not null default '22:30',
  quiet_hours_end time not null default '07:00',
  learn_from_interactions boolean not null default true,
  analyze_attachments boolean not null default false,
  retention_window retention_window not null default '90d',
  history_days integer not null default 90 check (history_days between 1 and 3650),
  reduce_motion boolean not null default false,
  audio_briefing_voice text,
  audio_briefing_speed numeric(3, 2) not null default 1.0
    check (audio_briefing_speed between 0.5 and 2.0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_preferences_quiet_days_range check (
    quiet_days <@ array[0, 1, 2, 3, 4, 5, 6]
  )
);

comment on column public.user_preferences.quiet_days is
  'ISO-style weekday indices (0 = Sunday) on which no briefing or non-critical push is delivered.';
comment on column public.user_preferences.history_days is
  'How far back the initial backfill reaches. Independent of retention_window, which governs deletion.';
