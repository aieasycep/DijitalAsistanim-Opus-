-- 0009 — subscription state, referrals, and the metering tables.

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status subscription_status not null default 'free',
  entitlement text,
  product_id text,
  store text check (store in ('app_store', 'play_store', 'promotional')),
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  revenuecat_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.subscriptions is
  'Server-side mirror of the store entitlement. RevenueCat webhooks are the only writer; the client reads but never asserts its own plan.';

create unique index if not exists subscriptions_revenuecat_customer_key
  on public.subscriptions (revenuecat_customer_id)
  where revenuecat_customer_id is not null;

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code text not null,
  redemption_count integer not null default 0 check (redemption_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referrals_unique_code unique (code),
  constraint referrals_one_per_user unique (user_id),
  constraint referrals_code_shape check (code ~ '^[A-Z0-9]{8}$')
);

comment on column public.referrals.code is
  'Eight uppercase alphanumerics, matching REFERRAL_CODE_LENGTH and isValidReferralCode() in @da/domain.';

create table if not exists public.referral_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code text not null,
  referrer_user_id uuid references auth.users (id) on delete set null,
  referee_user_id uuid references auth.users (id) on delete set null,
  bonus_days integer not null default 14 check (bonus_days > 0),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referral_credits_unique_redemption unique (referee_user_id, code),
  constraint referral_credits_not_self
    check (referrer_user_id is null or referrer_user_id <> referee_user_id)
);

comment on table public.referral_credits is
  'One row per granted bonus. user_id is the account the days were applied to, so the row is readable by whoever benefits from it.';

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  model text not null,
  operation text not null,
  tokens_in integer not null default 0 check (tokens_in >= 0),
  tokens_out integer not null default 0 check (tokens_out >= 0),
  cost_micros bigint not null default 0 check (cost_micros >= 0),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_usage_events is
  'Counts only: model name, operation label, token totals and cost. Prompt text, completion text, subjects, names and addresses are never written here.';
comment on column public.ai_usage_events.operation is
  'Coarse label such as email_analysis or briefing_generation. Never a free-text prompt fragment.';

create table if not exists public.rate_limit_counters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rate_limit_counters_unique_window unique (user_id, bucket, window_start)
);

comment on table public.rate_limit_counters is
  'Fixed-window counters enforcing PLAN_LIMITS. Rows older than their window are swept, not updated.';
