-- seed/seed.sql
-- Reference data only. Nothing here belongs to a user, and every statement is
-- idempotent so it can be replayed on a branch database, a restored backup or a
-- local `supabase db reset` without drifting.
--
-- User-shaped demo content lives in seed/demo-fixtures.sql, which is guarded on
-- app.settings.environment and never runs in production.

-- ---------------------------------------------------------------------------
-- Private storage buckets.
--
-- 0010 creates them; this file owns their limits, so tightening a limit is a seed
-- change rather than a migration. Both stay private: bytes are reached only
-- through short-lived signed URLs issued after a server-side ownership check.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values
  ('captures', 'captures', false),
  ('exports', 'exports', false)
on conflict (id) do nothing;

update storage.buckets
set public = false,
    -- 25 MB: comfortably above a phone photo or a multi-page invoice scan, well
    -- below anything that would stall an upload on a mobile connection.
    file_size_limit = 26214400,
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'application/pdf',
      'text/plain'
    ]
where id = 'captures'
  and (
    public is distinct from false
    or file_size_limit is distinct from 26214400
    or allowed_mime_types is distinct from array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'application/pdf',
      'text/plain'
    ]
  );

update storage.buckets
set public = false,
    -- A full KVKK/GDPR export of several years of mail metadata is large but bounded.
    file_size_limit = 536870912,
    allowed_mime_types = array['application/zip', 'application/json']
where id = 'exports'
  and (
    public is distinct from false
    or file_size_limit is distinct from 536870912
    or allowed_mime_types is distinct from array['application/zip', 'application/json']
  );

-- ---------------------------------------------------------------------------
-- Sanity check: a seeded database with RLS missing on a user table would leak
-- every mailbox to every signed-in device, so fail loudly here rather than in
-- production. This asserts; it does not create anything.
-- ---------------------------------------------------------------------------

do $$
declare
  v_unprotected text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
  into v_unprotected
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname <> 'schema_migrations'
    and not c.relrowsecurity;

  if v_unprotected is not null then
    raise exception 'row level security is not enabled on: %', v_unprotected;
  end if;
end;
$$;
