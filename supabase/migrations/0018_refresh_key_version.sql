-- Give the refresh token its own key version.
--
-- `oauth_credentials` carried ONE `key_version` for TWO independently encrypted
-- columns. Access tokens are re-encrypted on every refresh (roughly hourly);
-- refresh tokens are re-encrypted only when the provider issues a new one,
-- which Microsoft often does not.
--
-- So `storeTokens` stamped the row with the *current* key version whenever it
-- wrote a new access token, while leaving the refresh ciphertext under the key
-- it was originally sealed with. The moment a key rotation happened, every
-- account's refresh token became undecryptable within the hour: the row claimed
-- version 2, the bytes were sealed under version 1, and AES-GCM fails closed.
-- The documented rotation procedure would have bricked every connected account.
--
-- The two ciphertexts already have separate nonces (0015) for the same reason
-- they need separate key versions: they are separate secrets with separate
-- lifetimes.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'oauth_credentials'
      and column_name = 'refresh_key_version'
  ) then
    alter table public.oauth_credentials
      add column refresh_key_version integer check (refresh_key_version >= 1);

    -- Existing rows were written when both ciphertexts shared a version, and
    -- at that time the shared value was correct for both.
    update public.oauth_credentials
    set refresh_key_version = key_version
    where encrypted_refresh_token is not null
      and refresh_key_version is null;
  end if;
end
$$;

comment on column public.oauth_credentials.refresh_key_version is
  'Encryption key version for encrypted_refresh_token. Separate from key_version, which belongs to encrypted_access_token: the two are re-encrypted on different schedules, so one shared version silently mislabels the refresh ciphertext after a key rotation.';

comment on column public.oauth_credentials.key_version is
  'Encryption key version for encrypted_access_token only. The refresh token carries refresh_key_version.';
