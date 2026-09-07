-- 0003 — provider connections, encrypted OAuth credentials and per-resource sync state.

create table if not exists public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider provider_kind not null,
  kinds account_kind[] not null default '{}',
  external_account_id text not null,
  display_name text,
  email text,
  status connection_status not null default 'connected',
  granted_scopes text[] not null default '{}',
  last_synced_at timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connected_accounts_external_id_not_blank
    check (length(btrim(external_account_id)) > 0),
  constraint connected_accounts_unique_external
    unique (user_id, provider, external_account_id)
);

comment on table public.connected_accounts is
  'A single provider grant. One row can serve several account kinds (mail + calendar) when the grant covers them.';

create unique index if not exists connected_accounts_one_primary_per_user
  on public.connected_accounts (user_id)
  where is_primary;

create table if not exists public.oauth_credentials (
  id uuid primary key default gen_random_uuid(),
  connected_account_id uuid not null unique
    references public.connected_accounts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  encrypted_refresh_token bytea,
  encrypted_access_token bytea,
  nonce bytea not null,
  auth_tag bytea,
  key_version integer not null default 1 check (key_version >= 1),
  access_token_expires_at timestamptz,
  granted_scopes text[] not null default '{}',
  rotated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.oauth_credentials is
  'Provider refresh and access tokens, sealed with AES-256-GCM using a key derived from the OAUTH_ENCRYPTION_KEY server secret. No client role is ever granted select on this table: tokens are read only by trusted server code holding the service key, decrypted in memory, and never returned in an API response.';
comment on column public.oauth_credentials.encrypted_refresh_token is
  'AES-256-GCM ciphertext of the provider refresh token. Never leaves the server.';
comment on column public.oauth_credentials.encrypted_access_token is
  'AES-256-GCM ciphertext of the short-lived access token, cached to avoid a refresh round-trip on every sync.';
comment on column public.oauth_credentials.nonce is
  'Per-row 96-bit AES-GCM nonce. Regenerated on every write; never reused across ciphertexts.';
comment on column public.oauth_credentials.auth_tag is
  'AES-GCM authentication tag when the runtime returns it separately from the ciphertext.';
comment on column public.oauth_credentials.key_version is
  'Which OAUTH_ENCRYPTION_KEY generation sealed this row, so keys can be rotated without a flag day.';

create table if not exists public.sync_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connected_account_id uuid not null
    references public.connected_accounts (id) on delete cascade,
  resource account_kind not null,
  status sync_status not null default 'idle',
  cursor text,
  backfill_cursor timestamptz,
  backfill_completed_at timestamptz,
  last_run_at timestamptz,
  next_run_at timestamptz,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sync_states_unique_resource unique (connected_account_id, resource)
);

comment on column public.sync_states.cursor is
  'Opaque provider delta token (Gmail historyId, Graph deltaLink). Forward sync only.';
comment on column public.sync_states.backfill_cursor is
  'How far back the historical fill has reached. Moves backwards until backfill_completed_at is set.';
