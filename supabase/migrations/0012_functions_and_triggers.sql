-- 0012_functions_and_triggers.sql
-- Database functions, triggers and the server-side halves of the domain rules
-- that packages/domain encodes in TypeScript. Where a rule exists in both places
-- (approval state machine, retention windows, rate limits) the database is the
-- last line of defence: a compromised or out-of-date client cannot talk its way
-- past a constraint that lives here.

-- ---------------------------------------------------------------------------
-- updated_at bookkeeping
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Stamps updated_at on every UPDATE so clients never have to be trusted for it.';

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles',
    'user_preferences',
    'notification_preferences',
    'subscriptions',
    'connected_accounts',
    'oauth_credentials',
    'sync_states',
    'email_threads',
    'email_messages',
    'calendar_events',
    'tasks',
    'commitments',
    'reminders',
    'contacts',
    'vip_people',
    'priority_rules',
    'learned_preferences',
    'insights',
    'life_events',
    'follow_ups',
    'briefings',
    'briefing_items',
    'approval_actions',
    'assistant_threads',
    'assistant_messages',
    'memory_chunks',
    'captures',
    'push_tokens',
    'notification_deliveries',
    'device_notifications',
    'referrals',
    'referral_credits',
    'ai_feedback',
    'ai_usage_events',
    'rate_limit_counters',
    'data_export_requests'
  ]
  loop
    -- Only wire the trigger where the column actually exists; sibling migrations
    -- own the table definitions and this file must not assume more than it needs.
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = t
        and column_name = 'updated_at'
    ) then
      execute format('drop trigger if exists set_updated_at on public.%I', t);
      execute format(
        'create trigger set_updated_at before update on public.%I
           for each row execute function public.set_updated_at()',
        t
      );
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Identity helper
-- ---------------------------------------------------------------------------

create or replace function public.app_current_user_id()
returns uuid
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select auth.uid();
$$;

comment on function public.app_current_user_id() is
  'auth.uid() behind a stable wrapper so policies and views have one call site.';

-- ---------------------------------------------------------------------------
-- Referral codes
--
-- Alphabet excludes I, L, O, U and 0/1 so a code read aloud or typed from a
-- screenshot cannot be confused. 8 characters over 30 symbols is ~39 bits.
-- ---------------------------------------------------------------------------

create or replace function public.generate_referral_code()
returns text
language plpgsql
volatile
security definer
-- `extensions` is on the path because gen_random_bytes lives there on Supabase.
set search_path = public, extensions, pg_temp
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
  alphabet_len constant int := length(alphabet);
  code_len constant int := 8;
  candidate text;
  raw bytea;
  i int;
  attempts int := 0;
  -- pgcrypto is created best-effort in 0001; a referral code is not a secret, so a
  -- database without it falls back to random() rather than blocking signup.
  has_pgcrypto constant boolean := exists (
    select 1 from pg_extension where extname = 'pgcrypto'
  );
begin
  loop
    attempts := attempts + 1;
    candidate := '';
    -- Dynamic so the missing-pgcrypto case never has to plan gen_random_bytes.
    if has_pgcrypto then
      execute format('select gen_random_bytes(%s)', code_len) into raw;
    else
      raw := null;
    end if;

    for i in 0 .. code_len - 1 loop
      -- Modulo bias over 30 symbols from a 256-value byte is negligible for a
      -- non-secret, collision-checked human-readable code.
      candidate := candidate || substr(
        alphabet,
        case
          when raw is null then floor(random() * alphabet_len)::int + 1
          else (get_byte(raw, i) % alphabet_len) + 1
        end,
        1
      );
    end loop;

    exit when not exists (
      select 1 from public.referrals where code = candidate
    );

    if attempts >= 32 then
      raise exception 'could not generate a unique referral code after % attempts', attempts
        using errcode = 'P0001';
    end if;
  end loop;

  return candidate;
end;
$$;

comment on function public.generate_referral_code() is
  'Ambiguity-free 8-char referral code, retried until unique in public.referrals.';

-- ---------------------------------------------------------------------------
-- New user bootstrap
--
-- Runs inside the auth signup transaction. Everything is ON CONFLICT DO NOTHING
-- so a retried signup (or a user re-created after erasure) is idempotent rather
-- than a 500 the client cannot recover from.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_display_name text;
  v_code text;
begin
  v_display_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');

  insert into public.profiles (id, email, display_name, time_zone, locale)
  values (new.id, new.email, v_display_name, 'Europe/Istanbul', 'tr')
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.subscriptions (user_id, status)
  values (new.id, 'free')
  on conflict (user_id) do nothing;

  if not exists (select 1 from public.referrals where user_id = new.id) then
    v_code := public.generate_referral_code();
    insert into public.referrals (user_id, code)
    values (new.id, v_code)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates profile, preferences, notification prefs, free subscription and referral code on signup.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Memory search
--
-- Two ranking modes. Semantic when an embedding is supplied AND pgvector is
-- installed; otherwise Turkish-tolerant keyword search over content_tsv.
--
-- The vector branch is built as dynamic SQL guarded on pg_extension, and the
-- embedding arrives as float8[] rather than vector(1536), so this function
-- compiles and runs on a database where pgvector was never installed — the
-- `vector` type would otherwise have to resolve at CREATE FUNCTION time.
-- ---------------------------------------------------------------------------

create or replace function public.search_memory(
  p_user_id uuid,
  p_query text,
  p_embedding float8[] default null,
  p_match_count int default 10
)
returns table (
  id uuid,
  content text,
  -- source_type and source_id mirror memory_chunks: an enum widened to text, and
  -- the opaque provider/entity identifier the chunk was derived from.
  source_type text,
  source_id text,
  source_label text,
  occurred_at timestamptz,
  score numeric,
  mode text
)
language plpgsql
stable
security definer
-- `extensions` carries the vector type/operators and unaccent on Supabase.
set search_path = public, extensions, pg_temp
as $$
declare
  v_has_vector boolean;
  v_limit int := greatest(1, least(coalesce(p_match_count, 10), 100));
  v_query text := coalesce(nullif(trim(p_query), ''), '');
  v_has_unaccent boolean;
  v_vector_literal text;
begin
  select exists (select 1 from pg_extension where extname = 'vector') into v_has_vector;

  -- Fold the query exactly as the stored column was folded. 0007 builds content_tsv
  -- with unaccent only when the dictionary resolves, so testing the extension is not
  -- enough: unaccenting one side and not the other silently breaks every Turkish
  -- query with a diacritic in it.
  select exists (
    select 1
    from pg_attribute a
    join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = 'public.memory_chunks'::regclass
      and a.attname = 'content_tsv'
      and pg_get_expr(d.adbin, d.adrelid) ilike '%unaccent%'
  )
  into v_has_unaccent;

  if p_embedding is not null and v_has_vector then
    -- pgvector parses '[1,2,3]', not the '{1,2,3}' that array_out would produce.
    v_vector_literal := '[' || array_to_string(p_embedding, ',') || ']';

    return query execute format(
      $q$
        select m.id,
               m.content,
               m.source_type::text,
               m.source_id,
               m.source_label,
               m.occurred_at,
               round((1 - (m.embedding <=> $1::vector))::numeric, 6) as score,
               'semantic'::text as mode
        from public.memory_chunks m
        where m.user_id = $2
          and m.embedding is not null
        order by m.embedding <=> $1::vector
        limit %s
      $q$,
      v_limit
    )
    using v_vector_literal, p_user_id;
    return;
  end if;

  if v_query = '' then
    return;
  end if;

  -- unaccent folds "İ/ı/ş/ğ" style input against the 'simple' dictionary the
  -- content_tsv column is built with; without the extension we search raw.
  return query execute format(
    $q$
      select m.id,
             m.content,
             m.source_type::text,
             m.source_id,
             m.source_label,
             m.occurred_at,
             round(ts_rank(m.content_tsv, q.tsq)::numeric, 6) as score,
             'keyword'::text as mode
      from public.memory_chunks m,
           lateral (select websearch_to_tsquery('simple', %s) as tsq) q
      where m.user_id = $2
        and m.content_tsv @@ q.tsq
      order by ts_rank(m.content_tsv, q.tsq) desc, m.occurred_at desc
      limit %s
    $q$,
    case when v_has_unaccent then 'unaccent($1)' else '$1' end,
    v_limit
  )
  using v_query, p_user_id;
end;
$$;

comment on function public.search_memory(uuid, text, float8[], int) is
  'Ranked memory retrieval: semantic when pgvector + embedding are available, keyword otherwise.';

-- ---------------------------------------------------------------------------
-- Approval expiry
--
-- Mirrors approvalExpiryFrom/isExpired in @da/domain. An approval that sat
-- unanswered must not become executable later — a stale "send this mail" is a
-- real-world side effect the user has forgotten about.
-- ---------------------------------------------------------------------------

create or replace function public.expire_stale_approvals()
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.approval_actions
    set status = 'expired'
    where status in ('pending', 'approved')
      and expires_at is not null
      and expires_at <= now()
    returning 1
  )
  select count(*) into v_count from expired;

  return coalesce(v_count, 0);
end;
$$;

comment on function public.expire_stale_approvals() is
  'Expires pending/approved approvals past expires_at; returns how many were expired.';

-- ---------------------------------------------------------------------------
-- Rate limiting
--
-- Fixed-window counters keyed on (user, bucket, window start). Returns true when
-- the call is allowed. The increment and the check are one statement so two
-- concurrent requests cannot both read "n" and both write "n + 1".
-- ---------------------------------------------------------------------------

create or replace function public.enforce_rate_limit(
  p_user_id uuid,
  p_bucket text,
  p_limit int,
  p_window interval
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_window_start timestamptz;
  v_count int;
begin
  if p_limit <= 0 then
    return false;
  end if;

  -- Snap to a deterministic window boundary so every caller in the same period
  -- lands on the same row and the unique index does the serialising for us.
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / greatest(extract(epoch from p_window), 1))
      * greatest(extract(epoch from p_window), 1)
  );

  insert into public.rate_limit_counters (user_id, bucket, window_start, count)
  values (p_user_id, p_bucket, v_window_start, 1)
  on conflict (user_id, bucket, window_start)
    do update set count = rate_limit_counters.count + 1
  returning rate_limit_counters.count into v_count;

  return v_count <= p_limit;
end;
$$;

comment on function public.enforce_rate_limit(uuid, text, int, interval) is
  'Atomic fixed-window rate limiter; false once the bucket exceeds p_limit in the window.';

-- ---------------------------------------------------------------------------
-- Retention sweep
--
-- Honours each user's retention_window preference (30d / 90d / 1y / forever)
-- plus a handful of fixed operational windows. audit_logs are anonymised rather
-- than deleted: we keep the fact that an approval was executed, and drop what it
-- pointed at.
-- ---------------------------------------------------------------------------

create or replace function public.cleanup_expired_retention()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_interval interval;
  v_cutoff timestamptz;
  v_n bigint;
  v_email_messages bigint := 0;
  v_email_threads bigint := 0;
  v_memory_chunks bigint := 0;
  v_insights bigint := 0;
  v_life_events bigint := 0;
  v_briefings bigint := 0;
  v_captures bigint := 0;
  v_assistant_messages bigint := 0;
  v_device_notifications bigint := 0;
  v_approval_actions bigint := 0;
  v_export_requests bigint := 0;
  v_rate_limit_counters bigint := 0;
  v_audit_anonymised bigint := 0;
begin
  for r in
    select user_id, retention_window
    from public.user_preferences
    where coalesce(retention_window, 'forever') <> 'forever'
  loop
    v_interval := case r.retention_window
      when '30d' then interval '30 days'
      when '90d' then interval '90 days'
      when '1y' then interval '365 days'
      else null
    end;

    continue when v_interval is null;

    v_cutoff := now() - v_interval;

    with d as (
      delete from public.email_messages
      where user_id = r.user_id and sent_at < v_cutoff
      returning 1
    )
    select count(*) into v_n from d;
    v_email_messages := v_email_messages + v_n;

    with d as (
      delete from public.email_threads
      where user_id = r.user_id and last_message_at < v_cutoff
      returning 1
    )
    select count(*) into v_n from d;
    v_email_threads := v_email_threads + v_n;

    with d as (
      delete from public.memory_chunks
      where user_id = r.user_id and occurred_at < v_cutoff
      returning 1
    )
    select count(*) into v_n from d;
    v_memory_chunks := v_memory_chunks + v_n;

    with d as (
      delete from public.insights
      where user_id = r.user_id and created_at < v_cutoff
      returning 1
    )
    select count(*) into v_n from d;
    v_insights := v_insights + v_n;

    with d as (
      delete from public.life_events
      where user_id = r.user_id and created_at < v_cutoff
      returning 1
    )
    select count(*) into v_n from d;
    v_life_events := v_life_events + v_n;

    with d as (
      delete from public.briefings
      where user_id = r.user_id and created_at < v_cutoff
      returning 1
    )
    select count(*) into v_n from d;
    v_briefings := v_briefings + v_n;

    with d as (
      delete from public.captures
      where user_id = r.user_id and created_at < v_cutoff
      returning 1
    )
    select count(*) into v_n from d;
    v_captures := v_captures + v_n;

    with d as (
      delete from public.assistant_messages
      where user_id = r.user_id and created_at < v_cutoff
      returning 1
    )
    select count(*) into v_n from d;
    v_assistant_messages := v_assistant_messages + v_n;
  end loop;

  -- Fixed operational windows, independent of user preference.
  -- Keyed on posted_at, not created_at: a mirrored notification ages from when the
  -- phone showed it, not from when a late sync happened to ingest it.
  with d as (
    delete from public.device_notifications
    where posted_at < now() - interval '30 days'
    returning 1
  )
  select count(*) into v_device_notifications from d;

  with d as (
    delete from public.approval_actions
    where created_at < now() - interval '365 days'
    returning 1
  )
  select count(*) into v_approval_actions from d;

  with d as (
    delete from public.data_export_requests
    where created_at < now() - interval '30 days'
    returning 1
  )
  select count(*) into v_export_requests from d;

  -- Rate limit windows are decided, not updated, once they close.
  with d as (
    delete from public.rate_limit_counters
    where window_start < now() - interval '7 days'
    returning 1
  )
  select count(*) into v_rate_limit_counters from d;

  -- Keep the shape of the audit trail forever, drop its subject after 400 days.
  with a as (
    update public.audit_logs
    set entity_id = null,
        metadata = '{}'::jsonb
    where created_at < now() - interval '400 days'
      and (entity_id is not null or metadata <> '{}'::jsonb)
    returning 1
  )
  select count(*) into v_audit_anonymised from a;

  return jsonb_build_object(
    'email_messages', v_email_messages,
    'email_threads', v_email_threads,
    'memory_chunks', v_memory_chunks,
    'insights', v_insights,
    'life_events', v_life_events,
    'briefings', v_briefings,
    'captures', v_captures,
    'assistant_messages', v_assistant_messages,
    'device_notifications', v_device_notifications,
    'approval_actions', v_approval_actions,
    'data_export_requests', v_export_requests,
    'rate_limit_counters', v_rate_limit_counters,
    'audit_logs_anonymised', v_audit_anonymised,
    'swept_at', to_jsonb(now())
  );
end;
$$;

comment on function public.cleanup_expired_retention() is
  'Applies per-user retention windows plus fixed operational windows; returns a jsonb count summary.';

-- ---------------------------------------------------------------------------
-- Approval state machine
--
-- The same transition table as canTransition() in @da/domain. Enforced here
-- because every transition past 'approved' can cause an external side effect —
-- a mail leaving the account, an invite landing in someone else's calendar.
-- pending   -> approved | rejected | expired
-- approved  -> executing | rejected | expired
-- executing -> executed | failed | approved      (approved = retry after backoff)
-- failed    -> approved | rejected | expired
-- executed / rejected / expired are terminal.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_approval_transition()
returns trigger
language plpgsql
as $$
declare
  v_allowed text[];
begin
  if new.status = old.status then
    return new;
  end if;

  v_allowed := case old.status::text
    when 'pending'   then array['approved', 'rejected', 'expired']
    when 'approved'  then array['executing', 'rejected', 'expired']
    when 'executing' then array['executed', 'failed', 'approved']
    when 'failed'    then array['approved', 'rejected', 'expired']
    else array[]::text[]
  end;

  if not (new.status::text = any (v_allowed)) then
    raise exception
      'illegal approval transition % -> % for approval %',
      old.status, new.status, old.id
      using errcode = 'P0001',
            hint = 'approval_illegal_edit';
  end if;

  return new;
end;
$$;

comment on function public.enforce_approval_transition() is
  'Rejects any approval_actions status change outside the domain state machine.';

drop trigger if exists enforce_approval_transition on public.approval_actions;
create trigger enforce_approval_transition
  before update of status on public.approval_actions
  for each row execute function public.enforce_approval_transition();

-- ---------------------------------------------------------------------------
-- Execution grants
--
-- Helpers callable from edge functions (service role) and, where safe, from a
-- signed-in client. search_memory stays user-scoped by its p_user_id argument,
-- which edge functions bind from the verified JWT.
-- ---------------------------------------------------------------------------

revoke all on function public.generate_referral_code() from public, anon, authenticated;
revoke all on function public.expire_stale_approvals() from public, anon, authenticated;
revoke all on function public.enforce_rate_limit(uuid, text, int, interval)
  from public, anon, authenticated;
revoke all on function public.cleanup_expired_retention() from public, anon, authenticated;
-- search_memory is SECURITY DEFINER and takes p_user_id as an argument, so it must
-- never be reachable from a client role; edge functions bind p_user_id from the
-- verified JWT and call it with the service role.
revoke all on function public.search_memory(uuid, text, float8[], int)
  from public, anon, authenticated;

grant execute on function public.app_current_user_id() to authenticated;
