-- OAuth flow state, and a dedicated nonce column for the refresh token.
--
-- Two corrections to the initial schema:
--
--  1. The authorization-code flow needs somewhere to bind a `state` value to
--     the user, the scopes being requested and the return URL. Signing the
--     state into the URL is not enough: a signed-but-unstored state can be
--     replayed against a different account, so it is stored server-side and
--     consumed exactly once.
--
--  2. AES-GCM requires a unique nonce per encryption. The access token and the
--     refresh token in a row are encrypted separately and therefore need two
--     nonces. `auth_tag` was unused (WebCrypto appends the GCM tag to the
--     ciphertext), so it is replaced by an explicitly named column.

create table if not exists public.oauth_states (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider provider_kind not null,
  scopes text[] not null default '{}',
  redirect_to text not null default '',
  -- Set when an existing connection is stepping up its scopes rather than a
  -- brand-new account being connected.
  connected_account_id uuid references public.connected_accounts (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.oauth_states is
  'Single-use CSRF state for the OAuth authorization-code flow. Service-role only: a client that could read or write this table could bind another user''s consent to its own account.';

create index if not exists oauth_states_user_id_idx on public.oauth_states (user_id);
create index if not exists oauth_states_expires_at_idx on public.oauth_states (expires_at);

alter table public.oauth_states enable row level security;
alter table public.oauth_states force row level security;
-- Intentionally no policies: only the service role touches this table.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'oauth_credentials'
      and column_name = 'refresh_nonce'
  ) then
    alter table public.oauth_credentials add column refresh_nonce bytea;
  end if;
end
$$;

comment on column public.oauth_credentials.refresh_nonce is
  'AES-256-GCM nonce for encrypted_refresh_token. Distinct from `nonce`, which belongs to encrypted_access_token: reusing a nonce across two ciphertexts under one key breaks GCM.';

comment on column public.oauth_credentials.auth_tag is
  'Unused. WebCrypto appends the GCM authentication tag to the ciphertext, so no separate tag is stored. Retained so an existing deployment is not broken by dropping a column.';

-- Expired states are worthless and must not accumulate.
create or replace function public.cleanup_expired_oauth_states()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed integer;
begin
  delete from public.oauth_states where expires_at < now();
  get diagnostics removed = row_count;
  return removed;
end
$$;

revoke all on function public.cleanup_expired_oauth_states() from public, anon, authenticated;
