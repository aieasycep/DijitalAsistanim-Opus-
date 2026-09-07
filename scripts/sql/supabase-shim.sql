-- Minimum Supabase surface the migrations depend on, for validating them
-- against a plain PostgreSQL instance in CI.
--
-- This file is NEVER applied to a real Supabase project: there, `auth`,
-- `storage` and the `auth.uid()` helper already exist and are owned by the
-- platform. It exists so `pnpm verify:supabase` can prove the migration set
-- applies cleanly and that RLS is correct, without needing Docker.

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;

create extension if not exists pgcrypto with schema public;

-- Mirrors the columns the migrations actually reference on auth.users.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- On Supabase these read the request's JWT claims. The stubs return null,
-- which is the correct "no authenticated user" answer for a validation run.
create or replace function auth.uid() returns uuid
  language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create or replace function auth.role() returns text
  language sql stable
  as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;

create or replace function auth.email() returns text
  language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.email', true), '') $$;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Supabase's own helper: splits an object path into its folder segments.
create or replace function storage.foldername(name text) returns text[]
  language plpgsql immutable
  as $$
declare
  parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1:array_length(parts, 1) - 1];
end
$$;

-- The roles the policies grant to.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema storage to anon, authenticated, service_role;
