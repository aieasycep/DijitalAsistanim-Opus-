-- 0019_admin_platform.sql
-- The admin platform: a separate authorization layer, the operations tables the
-- backoffice needs, and the ONE audited path by which user content may ever be
-- revealed to a human operator.
--
-- ===========================================================================
-- WHAT THIS FILE IS FOR
-- ===========================================================================
--
-- 0017 gave the backoffice a set of content-blind `bo_*` views. That file is the
-- *default*: an operator working normally sees counts, states and timestamps and
-- nothing a person wrote. This file adds the three things 0017 deliberately left
-- out, and keeps them separable by name so a reviewer can tell them apart at a
-- glance:
--
--   `admin_*`   — who may operate the console, and with which permissions.
--   `support_*` — the support workflow, including Support Access.
--   `sa_*`      — the reveal path. Every one of these functions writes a row to
--                 `support_access_reveals` in the same statement that returns the
--                 content, so a reveal that was not logged did not happen.
--
-- Four properties are enforced here by the database rather than by application
-- code, because application code is exactly what an incident review cannot trust:
--
--   1. The last enabled super_admin cannot be deleted, disabled, demoted or
--      unbound from its auth account (trigger + advisory lock, so two concurrent
--      demotions cannot both succeed).
--   2. A feature has at most one active prompt version (partial unique index).
--   3. A sensitive admin action cannot be recorded in `audit_logs` without a
--      named acting admin and, where the action is destructive, a written
--      reason (trigger driven by `admin_sensitive_actions`).
--   4. Content cannot be revealed without an approved, unexpired, unrevoked,
--      scope-matching Support Access grant approved by someone other than the
--      requester — and the reveal is logged by the same call.
--
-- Nothing in this file is client-reachable. Every table carries RLS enabled and
-- forced with zero policies, and every table, view and function is revoked from
-- `public`, `anon` and `authenticated` and granted only to `service_role`.
-- Supabase's default privileges hand new objects in `public` to the client
-- roles, so those revokes are load-bearing rather than decorative.
--
-- Style follows 0011, 0016 and 0017: every statement is re-runnable.

-- ===========================================================================
-- 1. ENUMS
--
-- Members and their order are the contract with the TypeScript unions the app
-- packages declare; `scripts/validate-supabase.mjs` asserts both the literal
-- member list and, where the TypeScript constant exists, parity with it.
-- ===========================================================================

do $$ begin
  create type admin_role as enum (
    'super_admin',
    'operations',
    'support',
    'finance',
    'ai_ops',
    'analyst',
    'readonly'
  );
exception when duplicate_object then null; end $$;

comment on type admin_role is
  'Backoffice roles. Deliberately NOT a hierarchy: finance is not a superset of support. Authorization is decided by admin_role_permissions, never by comparing two roles.';

do $$ begin
  create type admin_status as enum ('invited', 'active', 'disabled');
exception when duplicate_object then null; end $$;

comment on type admin_status is
  'invited = row exists but no auth account is bound yet, cannot sign in. active = may sign in. disabled = revoked, row retained so the audit trail still resolves.';

do $$ begin
  create type admin_permission as enum (
    'users.read',
    'users.export',
    'users.disable',
    'users.delete',
    'support.ticket.read',
    'support.ticket.write',
    'support.ticket.assign',
    'support.access.request',
    'support.access.approve',
    'support.access.reveal',
    'integration.read',
    'integration.resync',
    'integration.disconnect',
    'billing.read',
    'billing.grant',
    'billing.revoke',
    'flags.read',
    'flags.write',
    'announcement.read',
    'announcement.write',
    'prompt.read',
    'prompt.write',
    'prompt.activate',
    'ai.read',
    'ai.configure',
    'analytics.read',
    'audit.read',
    'audit.export',
    'privacy.read',
    'privacy.process',
    'admin.read',
    'admin.invite',
    'admin.role.write',
    'admin.disable',
    'system.health.read',
    'system.config.read'
  );
exception when duplicate_object then null; end $$;

comment on type admin_permission is
  'The authorization vocabulary of the console. Every server-side route guard names one of these; a screen with no permission behind it is a screen nobody may open.';

do $$ begin
  create type support_ticket_status as enum (
    'open',
    'in_progress',
    'waiting_user',
    'resolved',
    'closed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type support_ticket_priority as enum ('low', 'normal', 'high', 'critical');
exception when duplicate_object then null; end $$;

do $$ begin
  create type support_ticket_category as enum (
    'account',
    'integration',
    'sync',
    'billing',
    'ai_quality',
    'notification',
    'privacy',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type app_platform as enum ('ios', 'android', 'web');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app_plan as enum ('free', 'pro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type announcement_audience as enum ('all', 'free', 'pro', 'ios', 'android');
exception when duplicate_object then null; end $$;

do $$ begin
  create type prompt_status as enum ('draft', 'active', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type system_health_status as enum ('operational', 'degraded', 'down', 'unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type admin_grant_kind as enum (
    'trial_extension',
    'goodwill',
    'compensation',
    'beta_access'
  );
exception when duplicate_object then null; end $$;

comment on type admin_grant_kind is
  'Why an operator handed out entitlement days. Distinct from a store purchase (public.subscriptions) and from a referral bonus (public.referral_credits): those three are separate tables and never merge, so finance can always tell paid revenue from goodwill.';

do $$ begin
  create type support_access_scope as enum (
    'identity',
    'email_subject',
    'email_body',
    'calendar_detail',
    'assistant_conversation',
    'capture_content',
    'approval_payload',
    'notification_content'
  );
exception when duplicate_object then null; end $$;

comment on type support_access_scope is
  'What a Support Access grant unlocks. Each member has exactly one sa_reveal_* function and no other route: adding a scope without a function grants nothing, and a function without a scope cannot be called.';

do $$ begin
  create type support_access_status as enum (
    'pending_approval',
    'active',
    'denied',
    'expired',
    'revoked'
  );
exception when duplicate_object then null; end $$;

-- ===========================================================================
-- 2. ROLES AND PERMISSIONS
-- ===========================================================================

create table if not exists public.admin_roles (
  role admin_role primary key,
  rank integer not null,
  label_tr text not null,
  description_tr text not null,
  is_assignable boolean not null default true,
  created_at timestamptz not null default now(),
  constraint admin_roles_rank_positive check (rank > 0),
  constraint admin_roles_label_not_blank check (length(btrim(label_tr)) > 0)
);

comment on table public.admin_roles is
  'One row per backoffice role, with the Turkish label the console renders and a display rank. rank orders a picker and nothing else — it is NOT an authorization comparison, because the roles are not nested. Read admin_role_permissions to decide what someone may do.';
comment on column public.admin_roles.rank is
  'Display order only, least to most privileged in the loose sense an operator expects. Never compare two ranks to authorise an action.';
comment on column public.admin_roles.is_assignable is
  'False retires a role from the invite and role-change pickers without touching existing holders. Postgres cannot drop an enum member, so this is how a role is decommissioned: the console stops offering it, and the admins already on it keep working until they are moved.';

create unique index if not exists admin_roles_rank_key on public.admin_roles (rank);

insert into public.admin_roles (role, rank, label_tr, description_tr, is_assignable) values
  ('readonly',    10, 'Salt Okunur',      'Yalnizca gorüntüleme. Hicbir islem yapamaz.', true),
  ('analyst',     20, 'Analist',          'Metrik, rapor ve denetim kaydi okur; degisiklik yapamaz.', true),
  ('support',     30, 'Destek',           'Talepleri yönetir, senkronizasyon tetikler, Destek Erisimi talep eder.', true),
  ('finance',     40, 'Finans',           'Abonelik, iade ve mutabakat; gecici Pro tanimlar.', true),
  ('ai_ops',      50, 'Yapay Zeka Ops',   'Prompt sürümleri, model ayarlari ve kalite izleme.', true),
  ('operations',  60, 'Operasyon',        'Platform saglik, entegrasyon, bayrak ve duyuru yönetimi.', true),
  ('super_admin', 100, 'Süper Yönetici',  'Tam yetki. Yönetici davet eder, rol degistirir, hesap kapatir.', true)
on conflict (role) do update set
  rank = excluded.rank,
  label_tr = excluded.label_tr,
  description_tr = excluded.description_tr,
  is_assignable = excluded.is_assignable;

create table if not exists public.admin_role_permissions (
  role admin_role not null references public.admin_roles (role) on delete cascade,
  permission admin_permission not null,
  primary key (role, permission)
);

comment on table public.admin_role_permissions is
  'The permission matrix. Rewritten in full every time this migration runs, so the file is the single source of truth and a hand-edited grant does not survive a deploy.';

-- Declarative: the matrix below is the whole truth, so the table is emptied and
-- rebuilt rather than merged into.
delete from public.admin_role_permissions;

insert into public.admin_role_permissions (role, permission)
select 'super_admin'::admin_role, p
from unnest(enum_range(null::admin_permission)) as p;

insert into public.admin_role_permissions (role, permission) values
  -- operations: runs the platform. No billing writes, no admin management.
  ('operations', 'users.read'),
  ('operations', 'users.disable'),
  ('operations', 'support.ticket.read'),
  ('operations', 'support.ticket.write'),
  ('operations', 'support.ticket.assign'),
  ('operations', 'support.access.request'),
  ('operations', 'support.access.approve'),
  ('operations', 'integration.read'),
  ('operations', 'integration.resync'),
  ('operations', 'integration.disconnect'),
  ('operations', 'billing.read'),
  ('operations', 'flags.read'),
  ('operations', 'flags.write'),
  ('operations', 'announcement.read'),
  ('operations', 'announcement.write'),
  ('operations', 'prompt.read'),
  ('operations', 'ai.read'),
  ('operations', 'analytics.read'),
  ('operations', 'audit.read'),
  ('operations', 'privacy.read'),
  ('operations', 'privacy.process'),
  ('operations', 'admin.read'),
  ('operations', 'system.health.read'),
  ('operations', 'system.config.read'),

  -- support: the front line. May request a reveal and perform one, but may not
  -- approve its own request — see the four-eyes constraint on
  -- support_access_grants.
  ('support', 'users.read'),
  ('support', 'support.ticket.read'),
  ('support', 'support.ticket.write'),
  ('support', 'support.ticket.assign'),
  ('support', 'support.access.request'),
  ('support', 'support.access.reveal'),
  ('support', 'integration.read'),
  ('support', 'integration.resync'),
  ('support', 'billing.read'),
  ('support', 'flags.read'),
  ('support', 'announcement.read'),
  ('support', 'privacy.read'),
  ('support', 'audit.read'),
  ('support', 'system.health.read'),

  -- finance: money only.
  ('finance', 'users.read'),
  ('finance', 'billing.read'),
  ('finance', 'billing.grant'),
  ('finance', 'billing.revoke'),
  ('finance', 'support.ticket.read'),
  ('finance', 'analytics.read'),
  ('finance', 'audit.read'),
  ('finance', 'audit.export'),
  ('finance', 'system.health.read'),

  -- ai_ops: prompts, models and the quality surface.
  ('ai_ops', 'users.read'),
  ('ai_ops', 'prompt.read'),
  ('ai_ops', 'prompt.write'),
  ('ai_ops', 'prompt.activate'),
  ('ai_ops', 'ai.read'),
  ('ai_ops', 'ai.configure'),
  ('ai_ops', 'analytics.read'),
  ('ai_ops', 'flags.read'),
  ('ai_ops', 'flags.write'),
  ('ai_ops', 'audit.read'),
  ('ai_ops', 'system.health.read'),

  -- analyst: reads everything measurable, changes nothing.
  ('analyst', 'users.read'),
  ('analyst', 'analytics.read'),
  ('analyst', 'ai.read'),
  ('analyst', 'prompt.read'),
  ('analyst', 'billing.read'),
  ('analyst', 'support.ticket.read'),
  ('analyst', 'audit.read'),
  ('analyst', 'audit.export'),
  ('analyst', 'system.health.read'),

  -- readonly: the minimum useful view, for a new hire or an auditor.
  ('readonly', 'users.read'),
  ('readonly', 'support.ticket.read'),
  ('readonly', 'flags.read'),
  ('readonly', 'announcement.read'),
  ('readonly', 'system.health.read');

-- ===========================================================================
-- 3. ADMIN USERS
--
-- Authentication still happens in GoTrue; this table is the AUTHORIZATION layer
-- on top of it. Signing into the product grants nothing: without an `active` row
-- here whose `user_id` matches the verified JWT subject, the console is closed.
-- ===========================================================================

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  email text not null,
  display_name text,
  role admin_role not null default 'readonly' references public.admin_roles (role),
  status admin_status not null default 'invited',
  last_login_at timestamptz,
  mfa_enrolled_at timestamptz,
  invited_by uuid references public.admin_users (id) on delete restrict,
  invited_at timestamptz not null default now(),
  disabled_at timestamptz,
  disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_users_email_not_blank check (length(btrim(email)) > 0),
  constraint admin_users_email_shape check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- status and disabled_at are two views of one fact; keeping them in step means
  -- a query may filter on either and get the same answer.
  constraint admin_users_disabled_consistent
    check ((status = 'disabled') = (disabled_at is not null)),
  -- Disabling is destructive: it must be explainable.
  constraint admin_users_disabled_needs_reason
    check (disabled_at is null or length(btrim(coalesce(disabled_reason, ''))) >= 3),
  -- An admin who can sign in must be bound to an auth account.
  constraint admin_users_active_needs_auth_user
    check (status <> 'active' or user_id is not null),
  constraint admin_users_not_self_invited check (invited_by is null or invited_by <> id)
);

comment on table public.admin_users is
  'Who may open the backoffice, and as what. A separate authorization layer: a normal Dijital Asistan account signing in with the same credentials reaches nothing, because access requires a row here with status = active and a matching user_id. Rows are disabled, never deleted, so every audit row can still name who acted.';
comment on column public.admin_users.user_id is
  'The GoTrue account this admin authenticates with. Nullable: `on delete set null` keeps the admin row (and therefore the audit trail) intact if the underlying account is erased, while status/`admin_users_active_needs_auth_user` makes the orphan unusable.';
comment on column public.admin_users.email is
  'Work address, denormalised for display and for matching an invite. Shown in full only to other admins about themselves; every backoffice view redacts it through bo_redact_email().';
comment on column public.admin_users.mfa_enrolled_at is
  'When this admin completed MFA enrolment in GoTrue. Null means not enrolled — the console renders that as a real warning, not a green tick.';

create unique index if not exists admin_users_email_lower_key
  on public.admin_users (lower(email));

create index if not exists admin_users_role_idx
  on public.admin_users (role)
  where status = 'active';

create index if not exists admin_users_status_idx
  on public.admin_users (status, created_at desc);

-- ── the last super_admin floor ─────────────────────────────────────────────
--
-- Locking someone out of their own platform is unrecoverable without a database
-- console, so the floor is enforced here rather than in a form handler. The
-- advisory lock is the point: without it two transactions demoting two different
-- super_admins would each still see the other as enabled (READ COMMITTED shows
-- the pre-update row) and both would commit, leaving zero.

create or replace function public.admin_users_protect_last_super_admin()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_was_enabled boolean;
  v_others integer;
begin
  v_was_enabled :=
    old.role = 'super_admin'
    and old.status = 'active'
    and old.disabled_at is null
    and old.user_id is not null;

  if not v_was_enabled then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE'
     and new.role = 'super_admin'
     and new.status = 'active'
     and new.disabled_at is null
     and new.user_id is not null
  then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('public.admin_users.super_admin_floor')::bigint);

  select count(*)
  into v_others
  from public.admin_users a
  where a.id <> old.id
    and a.role = 'super_admin'
    and a.status = 'active'
    and a.disabled_at is null
    and a.user_id is not null;

  if v_others = 0 then
    raise exception
      'admin_users %: refusing to remove the last enabled super_admin', old.id
      using errcode = 'P0001',
            hint = 'admin_last_super_admin',
            detail = 'Promote another admin to super_admin before disabling, demoting, unbinding or deleting this one.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

comment on function public.admin_users_protect_last_super_admin() is
  'Refuses any UPDATE or DELETE that would leave the platform with no enabled super_admin — including the FK''s own `on delete set null` when that admin''s auth account is erased. Serialised on an advisory lock so two concurrent demotions cannot both pass the check.';

drop trigger if exists admin_users_protect_last_super_admin on public.admin_users;
create trigger admin_users_protect_last_super_admin
  before update or delete on public.admin_users
  for each row execute function public.admin_users_protect_last_super_admin();

-- ── migration from the 0017 staff roster ───────────────────────────────────
--
-- 0017's staff_members is superseded but not dropped: existing sessions and the
-- bo_staff view still read it. Seeding admin_users from it means an existing
-- deployment is not locked out of its own console the moment this migration
-- lands. support -> support, ops -> operations, admin -> super_admin.

insert into public.admin_users (user_id, email, role, status, created_at)
select
  sm.user_id,
  coalesce(p.email, au.email),
  case sm.role
    when 'admin' then 'super_admin'::admin_role
    when 'ops'   then 'operations'::admin_role
    else 'support'::admin_role
  end,
  case when sm.disabled_at is null then 'active'::admin_status else 'invited'::admin_status end,
  sm.created_at
from public.staff_members sm
left join public.profiles p on p.id = sm.user_id
left join auth.users au on au.id = sm.user_id
where sm.disabled_at is null
  and coalesce(p.email, au.email) is not null
on conflict (user_id) do nothing;

comment on table public.staff_members is
  'Superseded by public.admin_users (0019), which carries the six-role permission model. Retained so the bo_staff view and any in-flight session keep resolving; new grants are made in admin_users.';

-- ===========================================================================
-- 4. INVITES
-- ===========================================================================

create table if not exists public.admin_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role admin_role not null references public.admin_roles (role),
  token_hash bytea not null unique,
  invited_by uuid not null references public.admin_users (id) on delete restrict,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references public.admin_users (id) on delete restrict,
  revoked_at timestamptz,
  revoked_reason text,
  revoked_by uuid references public.admin_users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint admin_invites_email_not_blank check (length(btrim(email)) > 0),
  constraint admin_invites_email_shape check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint admin_invites_token_hash_is_sha256 check (octet_length(token_hash) = 32),
  constraint admin_invites_expiry_after_creation check (expires_at > created_at),
  constraint admin_invites_consumed_needs_admin
    check ((consumed_at is null) = (consumed_by is null)),
  constraint admin_invites_revoked_needs_reason
    check (revoked_at is null or length(btrim(coalesce(revoked_reason, ''))) >= 3),
  constraint admin_invites_revoked_needs_admin
    check ((revoked_at is null) = (revoked_by is null)),
  constraint admin_invites_not_both_consumed_and_revoked
    check (consumed_at is null or revoked_at is null)
);

comment on table public.admin_invites is
  'One-time invitations to the console. Only the SHA-256 of the token is stored: the token itself exists once, in the mail that carried it, and cannot be recovered from this table — a database dump therefore grants nobody access.';
comment on column public.admin_invites.token_hash is
  'sha256(token) as 32 raw bytes. Never the token. The consume path hashes the presented token and looks it up here; a mismatch is indistinguishable from a missing row.';

-- One live invite per address, so a second invite must revoke the first.
create unique index if not exists admin_invites_live_email_key
  on public.admin_invites (lower(email))
  where consumed_at is null and revoked_at is null;

create index if not exists admin_invites_expires_at_idx
  on public.admin_invites (expires_at)
  where consumed_at is null and revoked_at is null;

create index if not exists admin_invites_invited_by_idx
  on public.admin_invites (invited_by, created_at desc);

-- ===========================================================================
-- 5. SESSIONS
--
-- Server-side, so "log out all sessions" is a fact rather than a cookie the
-- browser may ignore, and so expiry is decided here rather than by a client
-- clock.
-- ===========================================================================

create table if not exists public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users (id) on delete cascade,
  token_hash bytea not null unique,
  issued_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_reason text,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint admin_sessions_token_hash_is_sha256 check (octet_length(token_hash) = 32),
  constraint admin_sessions_absolute_after_idle check (absolute_expires_at >= expires_at),
  constraint admin_sessions_expiry_after_issue check (expires_at > issued_at),
  constraint admin_sessions_ip_hash_shape
    check (ip_hash is null or ip_hash ~ '^[a-f0-9]{64}$'),
  constraint admin_sessions_revoked_needs_reason
    check (revoked_at is null or length(btrim(coalesce(revoked_reason, ''))) >= 3)
);

comment on table public.admin_sessions is
  'One row per signed-in console session. The cookie carries an opaque token; only its SHA-256 is stored here, so the table cannot be replayed. expires_at slides forward on activity but never past absolute_expires_at, which is fixed at issue.';
comment on column public.admin_sessions.expires_at is
  'Idle deadline. admin_touch_session() pushes it forward on each request and refuses to push it past absolute_expires_at.';
comment on column public.admin_sessions.ip_hash is
  'sha256(ip + server-side salt), 64 lowercase hex. The shape is a constraint so a raw address cannot be written into this column by accident.';

create index if not exists admin_sessions_admin_user_idx
  on public.admin_sessions (admin_user_id, issued_at desc);

create index if not exists admin_sessions_live_idx
  on public.admin_sessions (expires_at)
  where revoked_at is null;

-- ===========================================================================
-- 6. ADMIN RATE LIMITS
--
-- public.rate_limit_counters cannot serve: its user_id is NOT NULL and foreign
-- keyed to auth.users, so it can key neither an admin (identified by
-- admin_users.id) nor a pre-authentication sign-in attempt (identified by a
-- hashed address or IP, before any user is known). Both are exactly the buckets
-- an admin console must limit.
-- ===========================================================================

create table if not exists public.admin_rate_limits (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  subject_key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_rate_limits_count_non_negative check (count >= 0),
  constraint admin_rate_limits_scope_shape
    check (scope ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
  -- The subject is always a hash. The shape constraint is what stops an address
  -- or an IP being stored here in the clear.
  constraint admin_rate_limits_subject_is_hash check (subject_key ~ '^[a-f0-9]{64}$'),
  constraint admin_rate_limits_unique_window unique (scope, subject_key, window_start)
);

comment on table public.admin_rate_limits is
  'Fixed-window counters for console endpoints — sign-in attempts, reveal calls, export generation. Keyed by a SHA-256 of whatever identifies the caller, never by the identifier itself.';

create index if not exists admin_rate_limits_window_idx
  on public.admin_rate_limits (window_start);

-- ===========================================================================
-- 7. AUDIT
--
-- audit_logs (0010) already is the append-only forensic trail and it fits, with
-- one correction. The retention sweep in 0012 blanks `metadata` after 400 days,
-- and the backoffice was keeping the acting staff member and their written
-- reason inside that document — so the record of who did what, and why, would
-- quietly erase itself. Those two facts are about STAFF, not about a data
-- subject, and must outlive the subject's data. Promoting them to real columns
-- puts them out of reach of a sweep that only touches entity_id and metadata,
-- and makes them indexable at the same time.
-- ===========================================================================

alter table public.audit_logs
  add column if not exists actor_admin_user_id uuid references public.admin_users (id) on delete restrict;

alter table public.audit_logs
  add column if not exists actor_role admin_role;

alter table public.audit_logs
  add column if not exists reason text;

alter table public.audit_logs
  add column if not exists is_sensitive boolean not null default false;

alter table public.audit_logs
  add column if not exists support_access_grant_id uuid;

comment on column public.audit_logs.actor_admin_user_id is
  'The admin who took the action, as a real column rather than a metadata key, so the 400-day metadata anonymisation in cleanup_expired_retention() cannot erase accountability for a staff action.';
comment on column public.audit_logs.reason is
  'The written justification an operator typed before a destructive action. Staff-authored text about a staff action; no user-content column ever feeds it.';
comment on column public.audit_logs.is_sensitive is
  'Set by trigger from public.admin_sensitive_actions. A sensitive row is refused unless it names its actor, and — where the action is destructive — carries a reason.';

create table if not exists public.admin_sensitive_actions (
  action text primary key,
  description_tr text not null,
  requires_reason boolean not null default true,
  created_at timestamptz not null default now(),
  constraint admin_sensitive_actions_shape
    check (action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  constraint admin_sensitive_actions_description_not_blank
    check (length(btrim(description_tr)) > 0)
);

comment on table public.admin_sensitive_actions is
  'The actions the product owner requires an audit row for. The database, not the application, decides which action names are sensitive — so a new page cannot forget to audit itself, it simply fails to write the row. Rows here are the explicit list; the trigger additionally treats every action in the `admin.` and `support_access.` namespaces as sensitive, so a console action invented later is covered before anyone remembers to add it.';
comment on column public.admin_sensitive_actions.requires_reason is
  'False only where the action is a fact rather than a decision — signing in has no justification to type. Everything destructive is true, and an action absent from this table but inside the admin. / support_access. namespaces defaults to true.';

insert into public.admin_sensitive_actions (action, description_tr, requires_reason) values
  ('admin.signed_in',              'Yönetici oturum acti', false),
  ('admin.signed_out',             'Yönetici oturumu kapatti', false),
  ('admin.invited',                'Yeni yönetici davet edildi', true),
  ('admin.invite_revoked',         'Yönetici daveti iptal edildi', true),
  ('admin.role_changed',           'Yönetici rolü degistirildi', true),
  ('admin.disabled',               'Yönetici hesabi kapatildi', true),
  ('admin.sessions_revoked',       'Yöneticinin tüm oturumlari sonlandirildi', true),
  ('user.disabled',                'Kullanici hesabi askiya alindi', true),
  ('user.deleted',                 'Kullanici hesabi silindi', true),
  ('integration.disconnected',     'Entegrasyon baglantisi kesildi', true),
  ('integration.force_resync',     'Zorunlu yeniden senkronizasyon baslatildi', true),
  ('entitlement.granted',          'Gecici Pro tanimlandi', true),
  ('entitlement.revoked',          'Gecici Pro geri alindi', true),
  ('feature_flag.changed',         'Özellik bayragi degistirildi', true),
  ('feature_flag.override_set',    'Kullaniciya özel bayrak tanimlandi', true),
  ('feature_flag.override_removed','Kullaniciya özel bayrak kaldirildi', true),
  ('announcement.published',       'Duyuru yayinlandi', true),
  ('prompt.activated',             'Prompt sürümü etkinlestirildi', true),
  ('ai.model_changed',             'Yapay zeka modeli degistirildi', true),
  ('deletion.retried',             'Silme islemi yeniden denendi', true),
  ('privacy.export_reissued',      'Veri disa aktarimi yeniden üretildi', true),
  ('support_access.requested',     'Destek Erisimi talep edildi', true),
  ('support_access.approved',      'Destek Erisimi onaylandi', true),
  ('support_access.denied',        'Destek Erisimi reddedildi', true),
  ('support_access.revoked',       'Destek Erisimi geri alindi', true),
  ('support_access.revealed',      'Hassas veri görüntülendi', true)
on conflict (action) do update set
  description_tr = excluded.description_tr,
  requires_reason = excluded.requires_reason;

create or replace function public.audit_logs_enforce_accountability()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_requires_reason boolean;
begin
  select s.requires_reason
  into v_requires_reason
  from public.admin_sensitive_actions s
  where s.action = new.action;

  if not found then
    -- Namespace rule. Everything an admin does is written under `admin.` or
    -- `support_access.`, so a console action invented after this migration is
    -- accountable from its first insert rather than from whenever somebody
    -- remembers to list it. Product events written by edge functions
    -- (`sync.*`, `approval.*`, `privacy.*`) are untouched: they have no admin
    -- actor and must keep working.
    if new.action not like 'admin.%' and new.action not like 'support_access.%' then
      return new;
    end if;
    v_requires_reason := true;
  end if;

  new.is_sensitive := true;

  if new.actor_admin_user_id is null then
    raise exception
      'audit action % is sensitive and must name the acting admin', new.action
      using errcode = 'P0001', hint = 'audit_actor_required';
  end if;

  if v_requires_reason and length(btrim(coalesce(new.reason, ''))) < 3 then
    raise exception
      'audit action % is destructive and must carry a written reason', new.action
      using errcode = 'P0001', hint = 'audit_reason_required';
  end if;

  if new.actor_role is null then
    select a.role
    into new.actor_role
    from public.admin_users a
    where a.id = new.actor_admin_user_id;
  end if;

  return new;
end;
$$;

comment on function public.audit_logs_enforce_accountability() is
  'Marks an audit row sensitive when its action is listed in admin_sensitive_actions, or when it sits in the admin. / support_access. namespace, and refuses the insert unless it names an admin and — for a destructive action — a written reason. This is why "who granted Pro to this account, and why" always has an answer, and why a console page added next month is audited before anyone thinks about it. Product events written by edge functions are outside both namespaces and pass through untouched.';

drop trigger if exists audit_logs_enforce_accountability on public.audit_logs;
create trigger audit_logs_enforce_accountability
  before insert on public.audit_logs
  for each row execute function public.audit_logs_enforce_accountability();

create index if not exists audit_logs_actor_admin_idx
  on public.audit_logs (actor_admin_user_id, created_at desc)
  where actor_admin_user_id is not null;

create index if not exists audit_logs_sensitive_idx
  on public.audit_logs (created_at desc)
  where is_sensitive;

create index if not exists audit_logs_admin_actor_metadata_idx
  on public.audit_logs ((metadata ->> 'admin_user_id'), created_at desc)
  where metadata ? 'admin_user_id';

-- ===========================================================================
-- 8. SUPPORT
-- ===========================================================================

create sequence if not exists public.support_ticket_reference_seq as bigint start with 1000;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  reference text not null default
    'DA-' || lpad(nextval('public.support_ticket_reference_seq')::text, 6, '0'),
  subject_user_id uuid references auth.users (id) on delete set null,
  status support_ticket_status not null default 'open',
  priority support_ticket_priority not null default 'normal',
  category support_ticket_category not null default 'other',
  channel text not null default 'in_app',
  subject text not null,
  body text,
  external_ref text,
  assigned_admin_user_id uuid references public.admin_users (id) on delete set null,
  opened_by_admin_user_id uuid references public.admin_users (id) on delete restrict,
  due_at timestamptz,
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_tickets_reference_key unique (reference),
  constraint support_tickets_subject_not_blank check (length(btrim(subject)) > 0),
  constraint support_tickets_channel_known
    check (channel in ('in_app', 'email', 'store_review', 'internal', 'phone')),
  constraint support_tickets_resolved_needs_timestamp
    check (status <> 'resolved' or resolved_at is not null),
  constraint support_tickets_closed_needs_timestamp
    check (status <> 'closed' or closed_at is not null)
);

comment on table public.support_tickets is
  'The support queue. `subject_user_id` is the only link to a person: no address is stored here, so a ticket cannot become a shadow contact list — the redacted address comes from bo_users when an operator needs to confirm the account.';
comment on column public.support_tickets.reference is
  'Human-quotable ticket number (DA-001234) from a sequence, so an operator and a user can name the same ticket out loud.';
comment on column public.support_tickets.external_ref is
  'Identifier of the same conversation in the helpdesk that actually holds the correspondence. This table triages; it is not a mailbox.';

create index if not exists support_tickets_queue_idx
  on public.support_tickets (status, priority, created_at desc);

create index if not exists support_tickets_assigned_idx
  on public.support_tickets (assigned_admin_user_id, status)
  where assigned_admin_user_id is not null;

create index if not exists support_tickets_subject_user_idx
  on public.support_tickets (subject_user_id, created_at desc)
  where subject_user_id is not null;

create index if not exists support_tickets_open_due_idx
  on public.support_tickets (due_at)
  where status in ('open', 'in_progress', 'waiting_user');

create table if not exists public.support_notes (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  admin_user_id uuid not null references public.admin_users (id) on delete restrict,
  body text not null,
  is_internal boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_notes_body_not_blank check (length(btrim(body)) > 0)
);

comment on table public.support_notes is
  'Operator notes on a ticket. is_internal = false marks a note that was actually sent to the user, so the thread of what the user was told is reconstructable without storing their reply.';

create index if not exists support_notes_ticket_idx
  on public.support_notes (ticket_id, created_at);

create index if not exists support_notes_admin_idx
  on public.support_notes (admin_user_id, created_at desc);

-- ===========================================================================
-- 9. FEATURE FLAGS
-- ===========================================================================

create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  description text not null,
  enabled boolean not null default false,
  kill_switch boolean not null default false,
  rollout_percentage integer not null default 0,
  platforms app_platform[] not null default '{}',
  plans app_plan[] not null default '{}',
  min_app_version text,
  max_app_version text,
  created_by uuid references public.admin_users (id) on delete restrict,
  updated_by uuid references public.admin_users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feature_flags_key_unique unique (key),
  constraint feature_flags_key_shape check (key ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$'),
  constraint feature_flags_description_not_blank check (length(btrim(description)) > 0),
  constraint feature_flags_rollout_range check (rollout_percentage between 0 and 100),
  constraint feature_flags_min_version_shape
    check (min_app_version is null or min_app_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  constraint feature_flags_max_version_shape
    check (max_app_version is null or max_app_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$')
);

comment on table public.feature_flags is
  'Global switches with targeting. Nothing reads these columns directly to decide a rollout — public.feature_flag_is_enabled() is the single evaluator, so the kill switch, the targeting and the percentage bucket cannot be applied in three different orders by three different callers.';
comment on column public.feature_flags.kill_switch is
  'Forces the flag off for everyone, overriding enabled, targeting, percentage and every per-user override. The one control that is guaranteed to stop a feature.';
comment on column public.feature_flags.platforms is
  'Empty array means every platform. A non-empty array is a whitelist.';
comment on column public.feature_flags.plans is
  'Empty array means every plan. A non-empty array is a whitelist.';

create table if not exists public.feature_flag_overrides (
  id uuid primary key default gen_random_uuid(),
  flag_id uuid not null references public.feature_flags (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  enabled boolean not null,
  reason text not null,
  created_by uuid not null references public.admin_users (id) on delete restrict,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feature_flag_overrides_unique unique (flag_id, user_id),
  constraint feature_flag_overrides_reason_not_blank check (length(btrim(reason)) >= 3)
);

comment on table public.feature_flag_overrides is
  'Per-user pin, for reproducing a bug on one account. The reason is NOT NULL: an override that outlives its investigation is how a "50% rollout" quietly becomes something else, and the reason is what makes a stale one obvious.';

create index if not exists feature_flag_overrides_user_idx
  on public.feature_flag_overrides (user_id);

create index if not exists feature_flag_overrides_expiry_idx
  on public.feature_flag_overrides (expires_at)
  where expires_at is not null;

-- The single evaluator. Precedence, highest first:
--   1. kill switch          — off, unconditionally
--   2. per-user override    — whatever the operator pinned, while it lasts
--   3. global enabled       — off means off
--   4. platform / plan / version targeting
--   5. deterministic percentage bucket on (key, user)
create or replace function public.feature_flag_is_enabled(
  p_key text,
  p_user_id uuid default null,
  p_platform app_platform default null,
  p_plan app_plan default null,
  p_app_version text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_flag public.feature_flags%rowtype;
  v_override boolean;
  v_bucket integer;
begin
  select * into v_flag from public.feature_flags f where f.key = p_key;
  if not found then
    return false;
  end if;

  if v_flag.kill_switch then
    return false;
  end if;

  if p_user_id is not null then
    select o.enabled
    into v_override
    from public.feature_flag_overrides o
    where o.flag_id = v_flag.id
      and o.user_id = p_user_id
      and (o.expires_at is null or o.expires_at > now());

    if found then
      return v_override;
    end if;
  end if;

  if not v_flag.enabled then
    return false;
  end if;

  if cardinality(v_flag.platforms) > 0
     and (p_platform is null or not (p_platform = any (v_flag.platforms)))
  then
    return false;
  end if;

  if cardinality(v_flag.plans) > 0
     and (p_plan is null or not (p_plan = any (v_flag.plans)))
  then
    return false;
  end if;

  -- Version comparison is on the numeric triple, so 1.10.0 sorts above 1.9.0.
  if v_flag.min_app_version is not null then
    if p_app_version is null
       or string_to_array(p_app_version, '.')::int[] < string_to_array(v_flag.min_app_version, '.')::int[]
    then
      return false;
    end if;
  end if;

  if v_flag.max_app_version is not null then
    if p_app_version is null
       or string_to_array(p_app_version, '.')::int[] > string_to_array(v_flag.max_app_version, '.')::int[]
    then
      return false;
    end if;
  end if;

  if v_flag.rollout_percentage >= 100 then
    return true;
  end if;

  if v_flag.rollout_percentage <= 0 then
    return false;
  end if;

  if p_user_id is null then
    return false;
  end if;

  -- 28 bits of md5 over (key, user): always non-negative, stable across restarts
  -- and major versions, and independent per flag so a user is not permanently in
  -- the first bucket of everything.
  v_bucket := ('x' || substr(md5(v_flag.key || ':' || p_user_id::text), 1, 7))::bit(28)::int % 100;

  return v_bucket < v_flag.rollout_percentage;
end;
$$;

comment on function public.feature_flag_is_enabled(text, uuid, app_platform, app_plan, text) is
  'The only correct way to read a feature flag. Applies kill switch, per-user override, global switch, platform/plan/version targeting and a deterministic percentage bucket, in that order. An unknown key is false, never true.';

-- ===========================================================================
-- 10. ANNOUNCEMENTS
-- ===========================================================================

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience announcement_audience not null default 'all',
  platforms app_platform[] not null default '{}',
  min_app_version text,
  locale app_locale not null default 'tr',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  dismissible boolean not null default true,
  published_at timestamptz,
  published_by uuid references public.admin_users (id) on delete restrict,
  created_by uuid references public.admin_users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_title_not_blank check (length(btrim(title)) > 0),
  constraint announcements_body_not_blank check (length(btrim(body)) > 0),
  constraint announcements_window_ordered check (ends_at is null or ends_at > starts_at),
  constraint announcements_min_version_shape
    check (min_app_version is null or min_app_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  constraint announcements_published_needs_admin
    check ((published_at is null) = (published_by is null)),
  -- Target by platform through `audience` OR through `platforms`, never both:
  -- two overlapping platform filters is how a notice reaches nobody.
  constraint announcements_one_platform_filter
    check (cardinality(platforms) = 0 or audience in ('all', 'free', 'pro'))
);

comment on table public.announcements is
  'In-app notices. A row with published_at null is a draft and is never served, whatever its window says; the window then decides when a published notice is live.';
comment on column public.announcements.dismissible is
  'False pins the notice until its window closes. Reserved for outages and forced upgrades — a non-dismissible marketing banner is a dark pattern.';

create index if not exists announcements_live_idx
  on public.announcements (starts_at desc)
  where published_at is not null;

-- ===========================================================================
-- 11. PROMPT VERSIONS
--
-- At most one active version per feature, enforced by a partial unique index so
-- a race between two activations loses one of them at the database rather than
-- leaving the platform with two live prompts and no way to tell which ran.
-- ===========================================================================

create table if not exists public.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  feature text not null,
  version integer not null,
  status prompt_status not null default 'draft',
  body text not null,
  -- Derived once, at write time, so the list view can size and fingerprint a
  -- version without any query reading the prompt itself. Both expressions are
  -- immutable, which is what lets them be stored generated columns.
  body_length integer generated always as (length(body)) stored,
  body_fingerprint text generated always as (md5(body)) stored,
  notes text,
  model text,
  created_by uuid references public.admin_users (id) on delete restrict,
  activated_by uuid references public.admin_users (id) on delete restrict,
  activated_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prompt_versions_feature_shape check (feature ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$'),
  constraint prompt_versions_version_positive check (version > 0),
  constraint prompt_versions_body_not_blank check (length(btrim(body)) > 0),
  constraint prompt_versions_unique_version unique (feature, version),
  constraint prompt_versions_active_needs_activation
    check (status <> 'active' or (activated_at is not null and activated_by is not null)),
  constraint prompt_versions_archived_needs_timestamp
    check (status <> 'archived' or archived_at is not null)
);

comment on table public.prompt_versions is
  'Versioned prompts per feature. `body` is company IP, not user content, and is the one long text column in this file — it is read from the table by the prompt editor and is never projected into a bo_* view.';

create unique index if not exists prompt_versions_one_active_per_feature
  on public.prompt_versions (feature)
  where status = 'active';

comment on index public.prompt_versions_one_active_per_feature is
  'THE invariant: one active version per feature, in the database. Application code cannot get this wrong, and two concurrent activations cannot both commit.';

create index if not exists prompt_versions_feature_idx
  on public.prompt_versions (feature, version desc);

-- Attribution: every model call records which prompt version produced it, so a
-- quality regression can be traced to the activation that caused it.
alter table public.ai_usage_events
  add column if not exists prompt_version_id uuid references public.prompt_versions (id) on delete set null;

comment on column public.ai_usage_events.prompt_version_id is
  'The prompt_versions row that produced this call. Nullable for calls made before a feature was versioned, and set null rather than cascading if a version is ever removed — the cost record must survive the prompt.';

create index if not exists ai_usage_events_prompt_version_idx
  on public.ai_usage_events (prompt_version_id, occurred_at desc)
  where prompt_version_id is not null;

-- ===========================================================================
-- 12. SYSTEM HEALTH
--
-- Real measurements only. A row claiming anything other than 'unknown' must
-- carry the latency it measured, and a row claiming 'down' must carry the error
-- code it saw. There is no way to write a green tick that nobody observed.
-- ===========================================================================

create table if not exists public.system_health_checks (
  id uuid primary key default gen_random_uuid(),
  target text not null,
  status system_health_status not null,
  checked_at timestamptz not null default now(),
  latency_ms integer,
  error_code text,
  observed_by text not null default 'cron',
  created_at timestamptz not null default now(),
  constraint system_health_checks_target_shape
    check (target ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$'),
  constraint system_health_checks_latency_non_negative
    check (latency_ms is null or latency_ms >= 0),
  constraint system_health_checks_observed_by_known
    check (observed_by in ('cron', 'manual', 'webhook', 'probe')),
  -- A verdict other than "we do not know" is a claim about a measurement, so it
  -- must be accompanied by one.
  constraint system_health_checks_verdict_needs_measurement
    check (status = 'unknown' or latency_ms is not null),
  -- "down" without an error code is not actionable and usually means nobody
  -- looked.
  constraint system_health_checks_down_needs_code
    check (status <> 'down' or length(btrim(coalesce(error_code, ''))) > 0)
);

comment on table public.system_health_checks is
  'Append-only probe results per dependency (google_gmail, microsoft_graph, revenuecat, push_apns, ...). Constraints make an unmeasured "operational" impossible to insert, which is why the console can render this as a status light without lying.';

create index if not exists system_health_checks_target_idx
  on public.system_health_checks (target, checked_at desc);

create index if not exists system_health_checks_checked_at_idx
  on public.system_health_checks (checked_at desc);

create or replace function public.admin_record_health_check(
  p_target text,
  p_status system_health_status,
  p_latency_ms integer default null,
  p_error_code text default null,
  p_observed_by text default 'cron'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.system_health_checks (target, status, latency_ms, error_code, observed_by)
  values (p_target, p_status, p_latency_ms, public.bo_error_code(p_error_code), p_observed_by)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.admin_record_health_check(text, system_health_status, integer, text, text) is
  'The single writer for system_health_checks. Passes the provider message through bo_error_code() first, because a probe failure routinely quotes the request that failed.';

-- ===========================================================================
-- 13. TEMPORARY ENTITLEMENT GRANTS
--
-- Kept in their own table so an operator's goodwill is never mistaken for
-- revenue. The three sources of entitlement in this schema are:
--   public.subscriptions       — a store purchase (RevenueCat is the writer)
--   public.referral_credits    — a referral bonus
--   public.admin_entitlement_grants — this table, an operator decision
-- bo_entitlement_sources unions the three with a `source` discriminator so a
-- finance report never has to guess.
-- ===========================================================================

create table if not exists public.admin_entitlement_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind admin_grant_kind not null default 'goodwill',
  days integer not null,
  reason text not null,
  granted_by uuid not null references public.admin_users (id) on delete restrict,
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references public.admin_users (id) on delete restrict,
  revoked_reason text,
  ticket_id uuid references public.support_tickets (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_entitlement_grants_days_range check (days between 1 and 365),
  constraint admin_entitlement_grants_reason_not_blank check (length(btrim(reason)) >= 3),
  constraint admin_entitlement_grants_window_ordered check (expires_at > granted_at),
  constraint admin_entitlement_grants_revoked_needs_reason
    check (revoked_at is null or length(btrim(coalesce(revoked_reason, ''))) >= 3),
  constraint admin_entitlement_grants_revoked_needs_admin
    check ((revoked_at is null) = (revoked_by is null))
);

comment on table public.admin_entitlement_grants is
  'Temporary Pro handed out by an operator. reason is NOT NULL and granted_by is NOT NULL: free months are a real cost, and every one of them has a name and a justification attached to it.';
comment on column public.admin_entitlement_grants.days is
  'Length of the grant as decided, kept alongside expires_at so shortening a grant later is visible as a difference rather than a silent edit.';

create index if not exists admin_entitlement_grants_user_idx
  on public.admin_entitlement_grants (user_id, granted_at desc);

create index if not exists admin_entitlement_grants_live_idx
  on public.admin_entitlement_grants (expires_at)
  where revoked_at is null;

create index if not exists admin_entitlement_grants_granted_by_idx
  on public.admin_entitlement_grants (granted_by, granted_at desc);

-- Two live grants on one account double-count the cost and make "when does this
-- expire" unanswerable, so overlapping windows are refused.
create or replace function public.admin_entitlement_grants_no_overlap()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.revoked_at is not null then
    return new;
  end if;

  if exists (
    select 1
    from public.admin_entitlement_grants g
    where g.user_id = new.user_id
      and g.id <> new.id
      and g.revoked_at is null
      and tstzrange(g.granted_at, g.expires_at, '[)')
          && tstzrange(new.granted_at, new.expires_at, '[)')
  ) then
    raise exception
      'user % already holds an admin entitlement grant covering that window', new.user_id
      using errcode = 'P0001', hint = 'admin_grant_overlap';
  end if;

  return new;
end;
$$;

comment on function public.admin_entitlement_grants_no_overlap() is
  'Refuses a second unrevoked grant whose window overlaps an existing one for the same user, so an account cannot accumulate stacked free periods nobody is tracking.';

drop trigger if exists admin_entitlement_grants_no_overlap on public.admin_entitlement_grants;
create trigger admin_entitlement_grants_no_overlap
  before insert or update on public.admin_entitlement_grants
  for each row execute function public.admin_entitlement_grants_no_overlap();

-- ===========================================================================
-- 14. SUPPORT ACCESS — the only path to user content
--
-- Section 7 of the specification: content is hidden by default, and where a
-- genuine support need requires more, the reveal is authorised, reasoned,
-- time-limited and completely logged.
--
-- A grant becomes usable only when ALL of these hold:
--   * status = 'active'
--   * approved by a DIFFERENT admin (four eyes, enforced by constraint)
--   * now() is inside [granted_at, expires_at), and expires_at is at most 24
--     hours after the request (enforced by constraint)
--   * not revoked
--   * the requesting admin's role still carries support.access.reveal
--   * the scope being read is in the grant's scope list
--
-- Every sa_reveal_* function checks all six and writes a support_access_reveals
-- row in the same call that returns the content. There is no other route: the
-- underlying tables carry forced RLS with no policies, the reveal functions are
-- the only SECURITY DEFINER readers, and they are granted to service_role alone.
-- ===========================================================================

create table if not exists public.support_access_grants (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users (id) on delete restrict,
  subject_user_id uuid not null references auth.users (id) on delete cascade,
  scopes support_access_scope[] not null,
  reason text not null,
  ticket_id uuid references public.support_tickets (id) on delete set null,
  status support_access_status not null default 'pending_approval',
  requested_at timestamptz not null default now(),
  approved_by uuid references public.admin_users (id) on delete restrict,
  approved_at timestamptz,
  granted_at timestamptz,
  expires_at timestamptz not null,
  denied_by uuid references public.admin_users (id) on delete restrict,
  denied_at timestamptz,
  denied_reason text,
  revoked_by uuid references public.admin_users (id) on delete restrict,
  revoked_at timestamptz,
  revoked_reason text,
  user_consent_ref text,
  user_consent_at timestamptz,
  reveal_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_access_grants_scopes_not_empty check (cardinality(scopes) > 0),
  -- A justification has to be a sentence a reviewer can weigh, not "debug".
  constraint support_access_grants_reason_is_written check (length(btrim(reason)) >= 20),
  -- Four eyes: nobody approves their own request.
  constraint support_access_grants_four_eyes
    check (approved_by is null or approved_by <> admin_user_id),
  constraint support_access_grants_approval_pairs
    check ((approved_by is null) = (approved_at is null)),
  constraint support_access_grants_active_needs_approval
    check (status <> 'active' or (approved_by is not null and granted_at is not null)),
  -- Short by construction: a grant may never be written with a window longer
  -- than 24 hours, whatever a form sends.
  constraint support_access_grants_window_ordered check (expires_at > requested_at),
  constraint support_access_grants_window_is_short
    check (expires_at <= requested_at + interval '24 hours'),
  constraint support_access_grants_denied_needs_reason
    check (status <> 'denied' or (denied_at is not null and denied_by is not null
           and length(btrim(coalesce(denied_reason, ''))) >= 3)),
  constraint support_access_grants_revoked_needs_reason
    check (revoked_at is null or (revoked_by is not null
           and length(btrim(coalesce(revoked_reason, ''))) >= 3)),
  constraint support_access_grants_revoked_status
    check (revoked_at is null or status = 'revoked'),
  constraint support_access_grants_consent_pairs
    check ((user_consent_ref is null) = (user_consent_at is null)),
  constraint support_access_grants_reveal_count_non_negative check (reveal_count >= 0)
);

comment on table public.support_access_grants is
  'The Support Access mechanism from section 7. A grant is a written, approved, time-limited permission for ONE admin to read ONE user''s content within a named scope. Four eyes and a 24-hour ceiling are constraints, not settings: a request cannot be self-approved and cannot be written with a longer window.';
comment on column public.support_access_grants.reason is
  'Why this reveal is necessary, in the requester''s own words, minimum 20 characters. Shown to the approver, kept forever, and quoted back in the reveal log.';
comment on column public.support_access_grants.user_consent_ref is
  'Identifier of the consent artefact — the ticket message or signed consent in which the user agreed. Optional today so the mechanism ships, and the column exists so consent-gated reveals need no schema change.';
comment on column public.support_access_grants.reveal_count is
  'Maintained by trigger from support_access_reveals. A grant with a high count against a narrow reason is exactly what a review should look at.';

-- One live grant per (admin, subject): a second one must wait for the first to
-- expire, which keeps the audit answer to "who could see this account, when"
-- a single row rather than a set.
create unique index if not exists support_access_grants_one_active
  on public.support_access_grants (admin_user_id, subject_user_id)
  where status = 'active';

create index if not exists support_access_grants_subject_idx
  on public.support_access_grants (subject_user_id, requested_at desc);

create index if not exists support_access_grants_admin_idx
  on public.support_access_grants (admin_user_id, requested_at desc);

create index if not exists support_access_grants_live_idx
  on public.support_access_grants (expires_at)
  where status = 'active';

create table if not exists public.support_access_reveals (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.support_access_grants (id) on delete restrict,
  admin_user_id uuid not null references public.admin_users (id) on delete restrict,
  subject_user_id uuid not null references auth.users (id) on delete cascade,
  scope support_access_scope not null,
  entity_type text not null,
  entity_id text,
  item_count integer not null default 1,
  request_id text,
  revealed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint support_access_reveals_entity_type_shape
    check (entity_type ~ '^[a-z][a-z0-9_]*$'),
  constraint support_access_reveals_item_count_positive check (item_count >= 1)
);

comment on table public.support_access_reveals is
  'One row per individual view. This is the answer to "who saw what, and when": it records the grant, the admin, the subject, the scope and which record was opened — never the content that was shown. Written by the sa_reveal_* functions in the same statement that returns the data, and rejected outright by trigger if the grant is not live.';
comment on column public.support_access_reveals.entity_id is
  'The id of the record that was opened. An identifier only; the reveal log is not a second copy of the mailbox.';

create index if not exists support_access_reveals_grant_idx
  on public.support_access_reveals (grant_id, revealed_at desc);

create index if not exists support_access_reveals_subject_idx
  on public.support_access_reveals (subject_user_id, revealed_at desc);

create index if not exists support_access_reveals_admin_idx
  on public.support_access_reveals (admin_user_id, revealed_at desc);

-- A reveal row that does not correspond to a live, matching grant is refused, so
-- the log cannot be padded with entries that claim an authority nobody held.
create or replace function public.support_access_reveals_verify_grant()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_grant public.support_access_grants%rowtype;
begin
  select * into v_grant
  from public.support_access_grants g
  where g.id = new.grant_id
  for update;

  if not found then
    raise exception 'support access grant % does not exist', new.grant_id
      using errcode = 'P0001', hint = 'support_access_unknown_grant';
  end if;

  if v_grant.status <> 'active'
     or v_grant.revoked_at is not null
     or v_grant.granted_at is null
     or v_grant.granted_at > now()
     or v_grant.expires_at <= now()
  then
    raise exception 'support access grant % is not live', new.grant_id
      using errcode = 'P0001', hint = 'support_access_grant_not_live';
  end if;

  if v_grant.admin_user_id <> new.admin_user_id then
    raise exception 'support access grant % belongs to another admin', new.grant_id
      using errcode = 'P0001', hint = 'support_access_wrong_admin';
  end if;

  if v_grant.subject_user_id <> new.subject_user_id then
    raise exception 'support access grant % covers another user', new.grant_id
      using errcode = 'P0001', hint = 'support_access_wrong_subject';
  end if;

  if not (new.scope = any (v_grant.scopes)) then
    raise exception 'support access grant % does not cover scope %', new.grant_id, new.scope
      using errcode = 'P0001', hint = 'support_access_scope_denied';
  end if;

  update public.support_access_grants
  set reveal_count = reveal_count + new.item_count
  where id = new.grant_id;

  return new;
end;
$$;

comment on function public.support_access_reveals_verify_grant() is
  'Re-checks the grant on every reveal insert and keeps reveal_count in step. Belt and braces behind sa_assert_grant(): even a direct INSERT by a service-role process cannot record a reveal it was not entitled to.';

drop trigger if exists support_access_reveals_verify_grant on public.support_access_reveals;
create trigger support_access_reveals_verify_grant
  before insert on public.support_access_reveals
  for each row execute function public.support_access_reveals_verify_grant();

-- ── the guard every reveal goes through ────────────────────────────────────

create or replace function public.sa_assert_grant(
  p_grant_id uuid,
  p_admin_user_id uuid,
  p_scope support_access_scope
)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_grant public.support_access_grants%rowtype;
begin
  select * into v_grant
  from public.support_access_grants g
  where g.id = p_grant_id;

  if not found then
    raise exception 'support access grant % does not exist', p_grant_id
      using errcode = 'P0001', hint = 'support_access_unknown_grant';
  end if;

  if v_grant.admin_user_id <> p_admin_user_id then
    raise exception 'support access grant % belongs to another admin', p_grant_id
      using errcode = 'P0001', hint = 'support_access_wrong_admin';
  end if;

  if v_grant.status <> 'active'
     or v_grant.revoked_at is not null
     or v_grant.granted_at is null
     or v_grant.granted_at > now()
     or v_grant.expires_at <= now()
  then
    raise exception 'support access grant % is not live', p_grant_id
      using errcode = 'P0001', hint = 'support_access_grant_not_live';
  end if;

  if not (p_scope = any (v_grant.scopes)) then
    raise exception 'support access grant % does not cover scope %', p_grant_id, p_scope
      using errcode = 'P0001', hint = 'support_access_scope_denied';
  end if;

  if not exists (
    select 1
    from public.admin_users a
    join public.admin_role_permissions rp on rp.role = a.role
    where a.id = p_admin_user_id
      and a.status = 'active'
      and a.disabled_at is null
      and rp.permission = 'support.access.reveal'
  ) then
    raise exception 'admin % may no longer reveal support data', p_admin_user_id
      using errcode = 'P0001', hint = 'support_access_permission_lost';
  end if;

  return v_grant.subject_user_id;
end;
$$;

comment on function public.sa_assert_grant(uuid, uuid, support_access_scope) is
  'Six checks in one place: the grant exists, belongs to this admin, is active and unrevoked, is inside its window, covers the scope, and the admin''s role still carries support.access.reveal. Returns the subject user id; raises otherwise.';

create or replace function public.sa_log_reveal(
  p_grant_id uuid,
  p_admin_user_id uuid,
  p_subject_user_id uuid,
  p_scope support_access_scope,
  p_entity_type text,
  p_entity_id text,
  p_item_count integer,
  p_request_id text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.support_access_reveals (
    grant_id, admin_user_id, subject_user_id, scope, entity_type, entity_id, item_count, request_id
  )
  values (
    p_grant_id,
    p_admin_user_id,
    p_subject_user_id,
    p_scope,
    p_entity_type,
    public.bo_identifier(p_entity_id),
    greatest(1, coalesce(p_item_count, 1)),
    public.bo_identifier(p_request_id)
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.sa_log_reveal(uuid, uuid, uuid, support_access_scope, text, text, integer, text) is
  'Writes the reveal row. Identifiers pass through bo_identifier() so a caller cannot smuggle an address or a subject line into the log while pretending it is an id.';

-- ── the reveal functions ───────────────────────────────────────────────────
-- One per scope. Each asserts, logs, then returns. Nothing else in the schema
-- can read these columns on behalf of an operator.

create or replace function public.sa_reveal_identity(
  p_grant_id uuid,
  p_admin_user_id uuid,
  p_request_id text default null
)
returns table (
  user_id uuid,
  email text,
  display_name text,
  given_name text,
  locale app_locale,
  time_zone text,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_subject uuid;
begin
  v_subject := public.sa_assert_grant(p_grant_id, p_admin_user_id, 'identity');
  perform public.sa_log_reveal(
    p_grant_id, p_admin_user_id, v_subject, 'identity', 'profile', v_subject::text, 1, p_request_id
  );

  return query
  select p.id, p.email, p.display_name, p.given_name, p.locale, p.time_zone, p.created_at
  from public.profiles p
  where p.id = v_subject;
end;
$$;

create or replace function public.sa_reveal_email_subjects(
  p_grant_id uuid,
  p_admin_user_id uuid,
  p_limit integer default 50,
  p_request_id text default null
)
returns table (
  thread_id uuid,
  subject text,
  summary text,
  category email_category,
  importance importance_level,
  message_count integer,
  last_message_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_subject uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_count integer;
begin
  v_subject := public.sa_assert_grant(p_grant_id, p_admin_user_id, 'email_subject');

  select least(count(*), v_limit)
  into v_count
  from public.email_threads t
  where t.user_id = v_subject;

  perform public.sa_log_reveal(
    p_grant_id, p_admin_user_id, v_subject, 'email_subject', 'email_thread', null,
    greatest(1, coalesce(v_count, 1)), p_request_id
  );

  return query
  select t.id, t.subject, t.summary, t.category, t.importance, t.message_count, t.last_message_at
  from public.email_threads t
  where t.user_id = v_subject
  order by t.last_message_at desc nulls last
  limit v_limit;
end;
$$;

create or replace function public.sa_reveal_email_message(
  p_grant_id uuid,
  p_admin_user_id uuid,
  p_message_id uuid,
  p_request_id text default null
)
returns table (
  message_id uuid,
  thread_id uuid,
  subject text,
  from_email text,
  from_name text,
  to_emails text[],
  sent_at timestamptz,
  snippet text,
  body_text text
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_subject uuid;
begin
  v_subject := public.sa_assert_grant(p_grant_id, p_admin_user_id, 'email_body');
  perform public.sa_log_reveal(
    p_grant_id, p_admin_user_id, v_subject, 'email_body', 'email_message',
    p_message_id::text, 1, p_request_id
  );

  return query
  select m.id, m.thread_id, m.subject, m.from_email, m.from_name, m.to_emails,
         m.sent_at, m.snippet, m.body_text
  from public.email_messages m
  where m.id = p_message_id
    and m.user_id = v_subject;
end;
$$;

create or replace function public.sa_reveal_calendar_events(
  p_grant_id uuid,
  p_admin_user_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_request_id text default null
)
returns table (
  event_id uuid,
  title text,
  description text,
  location text,
  organizer_email text,
  starts_at timestamptz,
  ends_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_subject uuid;
  v_count integer;
begin
  v_subject := public.sa_assert_grant(p_grant_id, p_admin_user_id, 'calendar_detail');

  select count(*)
  into v_count
  from public.calendar_events e
  where e.user_id = v_subject
    and e.starts_at >= p_from
    and e.starts_at < p_to;

  perform public.sa_log_reveal(
    p_grant_id, p_admin_user_id, v_subject, 'calendar_detail', 'calendar_event', null,
    greatest(1, coalesce(v_count, 1)), p_request_id
  );

  return query
  select e.id, e.title, e.description, e.location, e.organizer_email, e.starts_at, e.ends_at
  from public.calendar_events e
  where e.user_id = v_subject
    and e.starts_at >= p_from
    and e.starts_at < p_to
  order by e.starts_at;
end;
$$;

create or replace function public.sa_reveal_assistant_thread(
  p_grant_id uuid,
  p_admin_user_id uuid,
  p_thread_id uuid,
  p_request_id text default null
)
returns table (
  message_id uuid,
  role text,
  content text,
  model text,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_subject uuid;
  v_count integer;
begin
  v_subject := public.sa_assert_grant(p_grant_id, p_admin_user_id, 'assistant_conversation');

  select count(*)
  into v_count
  from public.assistant_messages m
  where m.thread_id = p_thread_id
    and m.user_id = v_subject;

  perform public.sa_log_reveal(
    p_grant_id, p_admin_user_id, v_subject, 'assistant_conversation', 'assistant_thread',
    p_thread_id::text, greatest(1, coalesce(v_count, 1)), p_request_id
  );

  return query
  select m.id, m.role, m.content, m.model, m.created_at
  from public.assistant_messages m
  where m.thread_id = p_thread_id
    and m.user_id = v_subject
  order by m.created_at;
end;
$$;

create or replace function public.sa_reveal_capture(
  p_grant_id uuid,
  p_admin_user_id uuid,
  p_capture_id uuid,
  p_request_id text default null
)
returns table (
  capture_id uuid,
  kind capture_kind,
  status capture_status,
  raw_text text,
  extracted jsonb,
  source_url text,
  storage_path text,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_subject uuid;
begin
  v_subject := public.sa_assert_grant(p_grant_id, p_admin_user_id, 'capture_content');
  perform public.sa_log_reveal(
    p_grant_id, p_admin_user_id, v_subject, 'capture_content', 'capture',
    p_capture_id::text, 1, p_request_id
  );

  return query
  select c.id, c.kind, c.status, c.raw_text, c.extracted, c.source_url, c.storage_path, c.created_at
  from public.captures c
  where c.id = p_capture_id
    and c.user_id = v_subject;
end;
$$;

create or replace function public.sa_reveal_approval(
  p_grant_id uuid,
  p_admin_user_id uuid,
  p_approval_id uuid,
  p_request_id text default null
)
returns table (
  approval_id uuid,
  type approval_action_type,
  status approval_status,
  what text,
  why text,
  payload jsonb,
  original_payload jsonb,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_subject uuid;
begin
  v_subject := public.sa_assert_grant(p_grant_id, p_admin_user_id, 'approval_payload');
  perform public.sa_log_reveal(
    p_grant_id, p_admin_user_id, v_subject, 'approval_payload', 'approval_action',
    p_approval_id::text, 1, p_request_id
  );

  return query
  select a.id, a.type, a.status, a.what, a.why, a.payload, a.original_payload, a.created_at
  from public.approval_actions a
  where a.id = p_approval_id
    and a.user_id = v_subject;
end;
$$;

create or replace function public.sa_reveal_notification(
  p_grant_id uuid,
  p_admin_user_id uuid,
  p_delivery_id uuid,
  p_request_id text default null
)
returns table (
  delivery_id uuid,
  category notification_category,
  title text,
  body text,
  scheduled_for timestamptz,
  sent_at timestamptz,
  failed_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_subject uuid;
begin
  v_subject := public.sa_assert_grant(p_grant_id, p_admin_user_id, 'notification_content');
  perform public.sa_log_reveal(
    p_grant_id, p_admin_user_id, v_subject, 'notification_content', 'notification_delivery',
    p_delivery_id::text, 1, p_request_id
  );

  return query
  select n.id, n.category, n.title, n.body, n.scheduled_for, n.sent_at, n.failed_at
  from public.notification_deliveries n
  where n.id = p_delivery_id
    and n.user_id = v_subject;
end;
$$;

-- ===========================================================================
-- 15. ADMIN HELPER FUNCTIONS
-- ===========================================================================

create or replace function public.admin_permissions_for(p_admin_user_id uuid)
returns setof admin_permission
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select rp.permission
  from public.admin_users a
  join public.admin_role_permissions rp on rp.role = a.role
  where a.id = p_admin_user_id
    and a.status = 'active'
    and a.disabled_at is null
  order by rp.permission
$$;

comment on function public.admin_permissions_for(uuid) is
  'Every permission an admin currently holds, or nothing at all when the account is not active. Deny by default: an empty result means no access, never default access.';

create or replace function public.admin_has_permission(
  p_admin_user_id uuid,
  p_permission admin_permission
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admin_users a
    join public.admin_role_permissions rp on rp.role = a.role
    where a.id = p_admin_user_id
      and a.status = 'active'
      and a.disabled_at is null
      and rp.permission = p_permission
  )
$$;

comment on function public.admin_has_permission(uuid, admin_permission) is
  'The server-side authorization check. Hiding a menu item is not security; this is what a route guard calls before it renders anything.';

create or replace function public.admin_resolve_by_auth_user(p_user_id uuid)
returns table (
  admin_user_id uuid,
  role admin_role,
  status admin_status,
  email text,
  display_name text,
  mfa_enrolled_at timestamptz,
  last_login_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.id, a.role, a.status, a.email, a.display_name, a.mfa_enrolled_at, a.last_login_at
  from public.admin_users a
  where a.user_id = p_user_id
    and a.status = 'active'
    and a.disabled_at is null
$$;

comment on function public.admin_resolve_by_auth_user(uuid) is
  'Turns a verified GoTrue subject into an admin identity, or returns no rows. This is the separation between authentication and authorization: a valid product login that has no row here resolves to nothing.';

create or replace function public.admin_touch_session(
  p_token_hash bytea,
  p_idle_window interval default interval '2 hours'
)
returns table (
  session_id uuid,
  admin_user_id uuid,
  role admin_role,
  expires_at timestamptz,
  absolute_expires_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  update public.admin_sessions s
  set last_seen_at = now(),
      expires_at = least(now() + p_idle_window, s.absolute_expires_at)
  from public.admin_users a
  where s.token_hash = p_token_hash
    and s.revoked_at is null
    and s.expires_at > now()
    and s.absolute_expires_at > now()
    and a.id = s.admin_user_id
    and a.status = 'active'
    and a.disabled_at is null
  returning s.id, s.admin_user_id, a.role, s.expires_at, s.absolute_expires_at;
end;
$$;

comment on function public.admin_touch_session(bytea, interval) is
  'Validates a session token hash and slides its idle deadline in one atomic statement, returning no rows when the session is expired, revoked, or belongs to an admin who has since been disabled. Expiry is therefore enforced server-side on every request rather than trusted from a cookie.';

create or replace function public.admin_revoke_sessions(
  p_admin_user_id uuid,
  p_reason text,
  p_except_session_id uuid default null
)
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'revoking sessions requires a written reason'
      using errcode = 'P0001', hint = 'admin_reason_required';
  end if;

  with revoked as (
    update public.admin_sessions s
    set revoked_at = now(),
        revoked_reason = btrim(p_reason)
    where s.admin_user_id = p_admin_user_id
      and s.revoked_at is null
      and (p_except_session_id is null or s.id <> p_except_session_id)
    returning 1
  )
  select count(*) into v_count from revoked;

  return coalesce(v_count, 0);
end;
$$;

comment on function public.admin_revoke_sessions(uuid, text, uuid) is
  '"Log out all sessions", as a server-side fact. Optionally keeps the caller''s own session so an admin can evict a stolen cookie without locking themselves out.';

create or replace function public.admin_enforce_rate_limit(
  p_scope text,
  p_subject_key text,
  p_limit integer,
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
  v_count integer;
begin
  if p_limit <= 0 then
    return false;
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / greatest(extract(epoch from p_window), 1))
      * greatest(extract(epoch from p_window), 1)
  );

  insert into public.admin_rate_limits (scope, subject_key, window_start, count)
  values (p_scope, p_subject_key, v_window_start, 1)
  on conflict (scope, subject_key, window_start)
    do update set count = admin_rate_limits.count + 1
  returning admin_rate_limits.count into v_count;

  return v_count <= p_limit;
end;
$$;

comment on function public.admin_enforce_rate_limit(text, text, integer, interval) is
  'Atomic fixed-window limiter for console endpoints. The increment and the check are one statement, so two concurrent sign-in attempts cannot both read n and both write n + 1.';

create or replace function public.admin_write_audit(
  p_actor_admin_user_id uuid,
  p_action text,
  p_reason text default null,
  p_subject_user_id uuid default null,
  p_entity_type text default null,
  p_entity_id text default null,
  p_outcome text default 'success',
  p_support_access_grant_id uuid default null,
  p_detail jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_role admin_role;
  v_detail jsonb := coalesce(p_detail, '{}'::jsonb);
begin
  if jsonb_typeof(v_detail) <> 'object' then
    raise exception 'audit detail must be a json object'
      using errcode = 'P0001', hint = 'audit_detail_shape';
  end if;

  select a.role into v_role from public.admin_users a where a.id = p_actor_admin_user_id;

  insert into public.audit_logs (
    user_id, action, entity_type, entity_id, metadata,
    actor_admin_user_id, actor_role, reason, support_access_grant_id
  )
  values (
    p_subject_user_id,
    p_action,
    p_entity_type,
    p_entity_id,
    v_detail || jsonb_strip_nulls(jsonb_build_object(
      'actor', 'admin',
      'admin_user_id', p_actor_admin_user_id,
      'admin_role', v_role,
      'outcome', coalesce(p_outcome, 'success')
    )),
    p_actor_admin_user_id,
    v_role,
    nullif(btrim(coalesce(p_reason, '')), ''),
    p_support_access_grant_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.admin_write_audit(uuid, text, text, uuid, text, text, text, uuid, jsonb) is
  'The one call site for an admin audit row. Resolves the actor''s role, puts the actor and the reason in real columns (so the 400-day metadata sweep cannot erase them) and mirrors the identifiers into metadata for bo_audit. The accountability trigger still refuses the insert if a sensitive action arrives without an actor or a reason.';

create or replace function public.admin_cleanup_expired()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_sessions bigint;
  v_invites bigint;
  v_grants bigint;
  v_overrides bigint;
  v_limits bigint;
  v_health bigint;
begin
  with d as (
    delete from public.admin_sessions
    where absolute_expires_at < now() - interval '30 days'
    returning 1
  )
  select count(*) into v_sessions from d;

  with d as (
    delete from public.admin_invites
    where consumed_at is null
      and revoked_at is null
      and expires_at < now() - interval '30 days'
    returning 1
  )
  select count(*) into v_invites from d;

  -- Expiry is a state change, not a deletion: the grant is the evidence that an
  -- operator was allowed to look, and it has to outlive the window.
  with e as (
    update public.support_access_grants
    set status = 'expired'
    where status in ('pending_approval', 'active')
      and expires_at <= now()
    returning 1
  )
  select count(*) into v_grants from e;

  with d as (
    delete from public.feature_flag_overrides
    where expires_at is not null
      and expires_at < now() - interval '7 days'
    returning 1
  )
  select count(*) into v_overrides from d;

  with d as (
    delete from public.admin_rate_limits
    where window_start < now() - interval '7 days'
    returning 1
  )
  select count(*) into v_limits from d;

  with d as (
    delete from public.system_health_checks
    where checked_at < now() - interval '90 days'
    returning 1
  )
  select count(*) into v_health from d;

  return jsonb_build_object(
    'admin_sessions', v_sessions,
    'admin_invites', v_invites,
    'support_access_grants_expired', v_grants,
    'feature_flag_overrides', v_overrides,
    'admin_rate_limits', v_limits,
    'system_health_checks', v_health,
    'swept_at', to_jsonb(now())
  );
end;
$$;

comment on function public.admin_cleanup_expired() is
  'Sweeps the admin platform: removes dead sessions, unconsumed invites, stale overrides, closed rate-limit windows and old probe rows, and moves lapsed Support Access grants to expired. Grants and reveals are never deleted — they are the audit.';

-- ===========================================================================
-- 16. updated_at
-- ===========================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'admin_users',
    'admin_rate_limits',
    'support_tickets',
    'support_notes',
    'feature_flags',
    'feature_flag_overrides',
    'announcements',
    'prompt_versions',
    'admin_entitlement_grants',
    'support_access_grants'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end;
$$;

-- ===========================================================================
-- 17. ROW LEVEL SECURITY
--
-- Every table here is enabled AND forced with zero policies. There is no tier
-- for a signed-in product user: the admin platform is not part of the product,
-- and PostgREST therefore returns nothing to `anon` and `authenticated` on any
-- of these tables, whatever a compromised client asks for.
-- ===========================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'admin_roles',
    'admin_role_permissions',
    'admin_users',
    'admin_invites',
    'admin_sessions',
    'admin_rate_limits',
    'admin_sensitive_actions',
    'support_tickets',
    'support_notes',
    'feature_flags',
    'feature_flag_overrides',
    'announcements',
    'prompt_versions',
    'system_health_checks',
    'admin_entitlement_grants',
    'support_access_grants',
    'support_access_reveals'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end;
$$;

-- ===========================================================================
-- 18. VIEWS
--
-- Same rules as 0017: `bo_` prefix, content-blind, service_role only. These
-- read the admin platform's own tables, so there is nothing of a user's in them
-- to blind — but the prefix keeps them inside the machine check in
-- scripts/validate-supabase.mjs, which is where the guarantee is actually held.
-- ===========================================================================

-- ── bo_admin_users ─────────────────────────────────────────────────────────
drop view if exists public.bo_admin_users;
create view public.bo_admin_users as
select
  a.id                                          as admin_user_id,
  a.user_id                                     as auth_user_id,
  public.bo_redact_email(a.email)               as email_redacted,
  split_part(a.email, '@', 2)                   as email_domain,
  a.display_name                                as admin_name,
  a.role,
  r.rank                                        as role_rank,
  r.label_tr                                    as role_label,
  a.status,
  (a.status = 'active' and a.disabled_at is null) as is_active,
  (a.mfa_enrolled_at is not null)               as is_mfa_enrolled,
  a.mfa_enrolled_at,
  a.last_login_at,
  a.invited_by                                  as invited_by_admin_user_id,
  a.invited_at,
  a.disabled_at,
  coalesce(perm.permission_count, 0)::integer   as permission_count,
  coalesce(sess.active_session_count, 0)::integer as active_session_count,
  sess.last_seen_at                             as session_last_seen_at,
  coalesce(act.action_count_30d, 0)::integer    as action_count_30d,
  coalesce(act.sensitive_count_30d, 0)::integer as sensitive_count_30d,
  act.last_action_at,
  coalesce(sa.active_grant_count, 0)::integer   as support_access_active_count,
  a.created_at,
  a.updated_at
from public.admin_users a
join public.admin_roles r on r.role = a.role
left join lateral (
  select count(*) as permission_count
  from public.admin_role_permissions rp
  where rp.role = a.role
) perm on true
left join lateral (
  select
    count(*)            as active_session_count,
    max(s.last_seen_at) as last_seen_at
  from public.admin_sessions s
  where s.admin_user_id = a.id
    and s.revoked_at is null
    and s.expires_at > now()
) sess on true
left join lateral (
  select
    count(*)                                   as action_count_30d,
    count(*) filter (where al.is_sensitive)    as sensitive_count_30d,
    max(al.created_at)                         as last_action_at
  from public.audit_logs al
  where al.actor_admin_user_id = a.id
    and al.created_at >= now() - interval '30 days'
) act on true
left join lateral (
  select count(*) as active_grant_count
  from public.support_access_grants g
  where g.admin_user_id = a.id
    and g.status = 'active'
    and g.expires_at > now()
) sa on true;

comment on view public.bo_admin_users is
  'The console roster: role, status, MFA enrolment, live sessions, 30-day activity and how many Support Access grants this admin currently holds. Addresses are redacted here as everywhere else — an admin is a person too, and this view is read by other admins.';

-- ── bo_admin_permissions ───────────────────────────────────────────────────
drop view if exists public.bo_admin_permissions;
create view public.bo_admin_permissions as
select
  a.id        as admin_user_id,
  a.role,
  rp.permission
from public.admin_users a
join public.admin_role_permissions rp on rp.role = a.role
where a.status = 'active'
  and a.disabled_at is null;

comment on view public.bo_admin_permissions is
  'Flattened effective permissions per active admin, so a route guard loads the whole set in one query. A disabled admin has no rows here at all — deny by default falls out of the view rather than out of a filter someone might forget.';

-- ── bo_admin_sessions ──────────────────────────────────────────────────────
drop view if exists public.bo_admin_sessions;
create view public.bo_admin_sessions as
select
  s.id                                as session_id,
  s.admin_user_id,
  a.role                              as admin_role,
  s.issued_at,
  s.last_seen_at,
  s.expires_at,
  s.absolute_expires_at,
  s.revoked_at,
  (s.revoked_at is null and s.expires_at > now() and s.absolute_expires_at > now()) as is_active,
  floor(extract(epoch from (now() - s.last_seen_at)) / 60)::integer as idle_minutes,
  case
    when s.expires_at <= now() then 0
    else floor(extract(epoch from (s.expires_at - now())) / 60)::integer
  end                                 as minutes_remaining,
  s.created_at
from public.admin_sessions s
join public.admin_users a on a.id = s.admin_user_id;

comment on view public.bo_admin_sessions is
  'Live and recent console sessions, for spotting a session an admin does not recognise. token_hash, ip_hash and user_agent are not referenced at all: a session list that leaks the token hash is a session list that can be replayed offline.';

-- ── bo_support_ticket_stats ────────────────────────────────────────────────
drop view if exists public.bo_support_ticket_stats;
create view public.bo_support_ticket_stats as
select
  (t.created_at at time zone 'Europe/Istanbul')::date as ticket_date,
  t.category,
  t.priority,
  count(*)                                            as total_count,
  count(*) filter (where t.status = 'open')           as open_count,
  count(*) filter (where t.status = 'in_progress')    as in_progress_count,
  count(*) filter (where t.status = 'waiting_user')   as waiting_user_count,
  count(*) filter (where t.status = 'resolved')       as resolved_count,
  count(*) filter (where t.status = 'closed')         as closed_count,
  count(*) filter (
    where t.status in ('open', 'in_progress', 'waiting_user')
      and t.due_at is not null
      and t.due_at < now()
  )                                                   as overdue_count,
  round(
    avg(extract(epoch from (t.first_response_at - t.created_at)) / 60)
      filter (where t.first_response_at is not null)
  )::integer                                          as avg_first_response_minutes,
  round(
    avg(extract(epoch from (t.resolved_at - t.created_at)) / 3600)
      filter (where t.resolved_at is not null)
  )::integer                                          as avg_resolution_hours
from public.support_tickets t
group by 1, 2, 3;

comment on view public.bo_support_ticket_stats is
  'Queue health by Istanbul day, category and priority. support_tickets.subject, .body and .resolution_note are never read here — the dashboard counts tickets, it does not skim them.';

-- ── bo_support_access_grants ───────────────────────────────────────────────
drop view if exists public.bo_support_access_grants;
create view public.bo_support_access_grants as
select
  g.id                                  as grant_id,
  g.admin_user_id,
  public.bo_redact_email(ga.email)      as admin_email_redacted,
  ga.role                               as admin_role,
  g.subject_user_id,
  public.bo_redact_email(p.email)       as subject_email_redacted,
  g.scopes,
  cardinality(g.scopes)::integer        as scope_count,
  g.reason,
  g.ticket_id,
  g.status,
  g.requested_at,
  g.approved_by                         as approved_by_admin_user_id,
  g.approved_at,
  g.granted_at,
  g.expires_at,
  g.denied_at,
  g.revoked_at,
  (
    g.status = 'active'
    and g.revoked_at is null
    and g.granted_at is not null
    and g.granted_at <= now()
    and g.expires_at > now()
  )                                     as is_live,
  case
    when g.expires_at <= now() then 0
    else floor(extract(epoch from (g.expires_at - now())) / 60)::integer
  end                                   as minutes_remaining,
  floor(extract(epoch from (g.expires_at - g.requested_at)) / 60)::integer as window_minutes,
  (g.user_consent_ref is not null)      as has_recorded_consent,
  g.user_consent_at,
  g.reveal_count,
  rv.last_reveal_at,
  g.created_at,
  g.updated_at
from public.support_access_grants g
join public.admin_users ga on ga.id = g.admin_user_id
left join public.profiles p on p.id = g.subject_user_id
left join lateral (
  select max(r.revealed_at) as last_reveal_at
  from public.support_access_reveals r
  where r.grant_id = g.id
) rv on true;

comment on view public.bo_support_access_grants is
  'Every Support Access request and its outcome — who asked, about whom, under what written reason, who approved it, how long the window was and how many times it was used. This is the review surface for the one mechanism in the product that can show an operator a user''s content.';

-- ── bo_support_access_reveals ──────────────────────────────────────────────
drop view if exists public.bo_support_access_reveals;
create view public.bo_support_access_reveals as
select
  r.id                                  as reveal_id,
  r.grant_id,
  r.admin_user_id,
  public.bo_redact_email(a.email)       as admin_email_redacted,
  a.role                                as admin_role,
  r.subject_user_id,
  r.scope,
  public.bo_identifier(r.entity_type)   as entity_type,
  public.bo_identifier(r.entity_id)     as entity_id,
  r.item_count,
  public.bo_identifier(r.request_id)    as request_id,
  r.revealed_at,
  g.reason                              as grant_reason,
  g.expires_at                          as grant_expires_at
from public.support_access_reveals r
join public.support_access_grants g on g.id = r.grant_id
join public.admin_users a on a.id = r.admin_user_id;

comment on view public.bo_support_access_reveals is
  'The "who saw what, when" ledger, one row per individual view, joined to the reason the grant was issued under. Records which record was opened, never what it said.';

-- ── bo_feature_flags ───────────────────────────────────────────────────────
drop view if exists public.bo_feature_flags;
create view public.bo_feature_flags as
select
  f.id                                      as flag_id,
  f.key,
  f.description,
  f.enabled,
  f.kill_switch,
  f.rollout_percentage,
  f.platforms,
  f.plans,
  f.min_app_version,
  f.max_app_version,
  case
    when f.kill_switch then 'killed'
    when not f.enabled then 'off'
    when f.rollout_percentage >= 100 then 'on'
    else 'partial'
  end                                       as effective_state,
  coalesce(o.override_count, 0)::integer    as override_count,
  coalesce(o.override_on_count, 0)::integer as override_on_count,
  coalesce(o.override_off_count, 0)::integer as override_off_count,
  o.last_override_at,
  f.created_by                              as created_by_admin_user_id,
  f.updated_by                              as updated_by_admin_user_id,
  f.created_at,
  f.updated_at
from public.feature_flags f
left join lateral (
  select
    count(*)                                  as override_count,
    count(*) filter (where fo.enabled)        as override_on_count,
    count(*) filter (where not fo.enabled)    as override_off_count,
    max(fo.created_at)                        as last_override_at
  from public.feature_flag_overrides fo
  where fo.flag_id = f.id
    and (fo.expires_at is null or fo.expires_at > now())
) o on true;

comment on view public.bo_feature_flags is
  'Flags with their effective state and live override counts. effective_state is computed the same way feature_flag_is_enabled() computes it, so the list cannot claim a flag is on while the evaluator returns false.';

-- ── bo_feature_flag_overrides ──────────────────────────────────────────────
drop view if exists public.bo_feature_flag_overrides;
create view public.bo_feature_flag_overrides as
select
  o.id                              as override_id,
  o.flag_id,
  f.key                             as flag_key,
  o.user_id,
  public.bo_redact_email(p.email)   as user_email_redacted,
  o.enabled,
  o.reason,
  o.created_by                      as created_by_admin_user_id,
  o.expires_at,
  (o.expires_at is not null and o.expires_at <= now()) as is_expired,
  o.created_at,
  o.updated_at
from public.feature_flag_overrides o
join public.feature_flags f on f.id = o.flag_id
left join public.profiles p on p.id = o.user_id;

comment on view public.bo_feature_flag_overrides is
  'Per-user flag pins with the reason they were created and whether they have lapsed. An expired override that is still listed is the point: it is how a forgotten debugging pin gets noticed and removed.';

-- ── bo_prompt_versions ─────────────────────────────────────────────────────
drop view if exists public.bo_prompt_versions;
create view public.bo_prompt_versions as
select
  pv.id                                  as prompt_version_id,
  pv.feature,
  pv.version,
  pv.status,
  pv.model,
  pv.body_length,
  pv.body_fingerprint,
  pv.notes                               as prompt_notes,
  pv.created_by                          as created_by_admin_user_id,
  pv.activated_by                        as activated_by_admin_user_id,
  pv.activated_at,
  pv.archived_at,
  coalesce(u.event_count_30d, 0)::bigint as event_count_30d,
  coalesce(u.cost_micros_30d, 0)::bigint as cost_micros_30d,
  u.last_used_at,
  pv.created_at,
  pv.updated_at
from public.prompt_versions pv
left join lateral (
  select
    count(*)                as event_count_30d,
    sum(e.cost_micros)      as cost_micros_30d,
    max(e.occurred_at)      as last_used_at
  from public.ai_usage_events e
  where e.prompt_version_id = pv.id
    and e.occurred_at >= now() - interval '30 days'
) u on true;

comment on view public.bo_prompt_versions is
  'Prompt versions with their 30-day usage and cost, so activating a version and the spend that followed are visible on one screen. The view does not reference prompt_versions.body at all — not even inside length() — because the guarantee in 0017 is about column dependencies, not about output names; the length and the md5 fingerprint are stored generated columns, which is enough to tell two versions apart in a list.';

-- ── bo_system_health ───────────────────────────────────────────────────────
drop view if exists public.bo_system_health;
create view public.bo_system_health as
select
  latest.target,
  latest.status,
  latest.checked_at,
  latest.latency_ms,
  public.bo_error_code(latest.error_code)                          as error_code,
  latest.observed_by,
  floor(extract(epoch from (now() - latest.checked_at)) / 60)::integer as minutes_since_check,
  -- A probe that stopped running is not healthy, it is unobserved. The console
  -- renders a stale target as unknown rather than as its last green answer.
  (latest.checked_at < now() - interval '15 minutes')              as is_stale,
  coalesce(w.sample_count_24h, 0)::integer                         as sample_count_24h,
  coalesce(w.degraded_count_24h, 0)::integer                       as degraded_count_24h,
  coalesce(w.down_count_24h, 0)::integer                           as down_count_24h,
  w.avg_latency_ms_24h,
  w.max_latency_ms_24h
from (
  select distinct on (c.target) c.*
  from public.system_health_checks c
  order by c.target, c.checked_at desc
) latest
left join lateral (
  select
    count(*)                                        as sample_count_24h,
    count(*) filter (where h.status = 'degraded')   as degraded_count_24h,
    count(*) filter (where h.status = 'down')       as down_count_24h,
    round(avg(h.latency_ms))::integer               as avg_latency_ms_24h,
    max(h.latency_ms)                               as max_latency_ms_24h
  from public.system_health_checks h
  where h.target = latest.target
    and h.checked_at >= now() - interval '24 hours'
) w on true;

comment on view public.bo_system_health is
  'The current verdict per dependency plus its last 24 hours. is_stale exists so a status light can never be green because the probe died — an unobserved target reads as unobserved.';

-- ── bo_entitlement_grants ──────────────────────────────────────────────────
drop view if exists public.bo_entitlement_grants;
create view public.bo_entitlement_grants as
select
  g.id                                as grant_id,
  g.user_id,
  public.bo_redact_email(p.email)     as user_email_redacted,
  g.kind,
  g.days,
  g.reason,
  g.granted_by                        as granted_by_admin_user_id,
  public.bo_redact_email(a.email)     as granted_by_email_redacted,
  g.granted_at,
  g.expires_at,
  g.revoked_at,
  g.revoked_by                        as revoked_by_admin_user_id,
  (g.revoked_at is null and g.expires_at > now() and g.granted_at <= now()) as is_live,
  case
    when g.expires_at <= now() then 0
    else floor(extract(epoch from (g.expires_at - now())) / 86400)::integer
  end                                 as days_remaining,
  g.ticket_id,
  g.created_at,
  g.updated_at
from public.admin_entitlement_grants g
join public.admin_users a on a.id = g.granted_by
left join public.profiles p on p.id = g.user_id;

comment on view public.bo_entitlement_grants is
  'Operator-issued Pro, with who granted it and why. Finance reads this to separate goodwill from revenue; the reason column is what makes an audit of "why is this account Pro" answerable in one query.';

-- ── bo_entitlement_sources ─────────────────────────────────────────────────
drop view if exists public.bo_entitlement_sources;
create view public.bo_entitlement_sources as
select
  s.user_id,
  'store'::text                              as source,
  s.status::text                             as detail_status,
  s.store                                    as store,
  null::admin_grant_kind                     as grant_kind,
  null::integer                              as days,
  coalesce(s.current_period_end, s.trial_ends_at) as ends_at,
  null::timestamptz                          as revoked_at,
  null::uuid                                 as source_id
from public.subscriptions s
where s.status in ('trialing', 'active', 'grace_period')

union all

select
  rc.user_id,
  'referral'::text,
  case when rc.revoked_at is null then 'active' else 'revoked' end,
  null::text,
  null::admin_grant_kind,
  rc.bonus_days,
  rc.expires_at,
  rc.revoked_at,
  rc.id
from public.referral_credits rc

union all

select
  g.user_id,
  'admin_grant'::text,
  case
    when g.revoked_at is not null then 'revoked'
    when g.expires_at <= now() then 'expired'
    else 'active'
  end,
  null::text,
  g.kind,
  g.days,
  g.expires_at,
  g.revoked_at,
  g.id
from public.admin_entitlement_grants g;

comment on view public.bo_entitlement_sources is
  'Every reason an account might be entitled, in one shape with a `source` discriminator: a store purchase, a referral bonus, or an operator grant. subscriptions.entitlement and .product_id are deliberately not read — the store SKU is a billing detail, and what an operator needs is which of the three sources is responsible.';

-- ── bo_audit (redefined) ───────────────────────────────────────────────────
--
-- 0017 created this view against metadata alone. Section 7 above promoted the
-- acting admin and the written reason to real columns so the retention sweep
-- cannot erase them; the view is recreated here to surface those columns. Every
-- column 0017 defined is kept, in its original order, so nothing that already
-- reads bo_audit changes shape.
drop view if exists public.bo_audit;
create view public.bo_audit as
select
  al.id                                                as audit_id,
  al.user_id                                           as subject_user_id,
  public.bo_identifier(al.action)                      as action,
  public.bo_identifier(al.entity_type)                 as entity_type,
  public.bo_identifier(al.entity_id)                   as entity_id,
  public.bo_identifier(al.metadata ->> 'actor')        as actor,
  public.bo_safe_uuid(al.metadata ->> 'staff_user_id') as staff_user_id,
  public.bo_identifier(al.metadata ->> 'staff_role')   as staff_role,
  public.bo_identifier(al.metadata ->> 'outcome')      as outcome,
  case
    when al.metadata ->> 'actor' = 'staff' then al.metadata ->> 'reason'
  end                                                  as staff_reason,
  (select array_agg(k order by k) from jsonb_object_keys(al.metadata) k) as metadata_keys,
  al.created_at,
  al.actor_admin_user_id,
  al.actor_role                                        as admin_role,
  al.is_sensitive,
  al.reason                                            as admin_reason,
  al.support_access_grant_id
from public.audit_logs al;

comment on view public.bo_audit is
  'The forensic trail, readable as structure rather than prose. action, entity_type, entity_id and the lifted metadata scalars all pass through bo_identifier, which rejects anything containing whitespace or "@", so neither a sentence nor an address can arrive through them. The metadata document itself is never projected — only its top-level key names — with two deliberate exceptions: staff_reason and admin_reason, the justification an operator types into the backoffice before a destructive action. Both are staff-authored text about a staff action, and a reader who could type it already had it.';

-- ===========================================================================
-- 19. GRANTS
--
-- Supabase's default privileges grant new objects in `public` to `anon` and
-- `authenticated`. Everything in this file is revoked from them explicitly.
-- ===========================================================================

do $$
declare
  obj text;
begin
  foreach obj in array array[
    'admin_roles',
    'admin_role_permissions',
    'admin_users',
    'admin_invites',
    'admin_sessions',
    'admin_rate_limits',
    'admin_sensitive_actions',
    'support_tickets',
    'support_notes',
    'feature_flags',
    'feature_flag_overrides',
    'announcements',
    'prompt_versions',
    'system_health_checks',
    'admin_entitlement_grants',
    'support_access_grants',
    'support_access_reveals'
  ]
  loop
    execute format('revoke all on public.%I from public, anon, authenticated', obj);
    execute format('grant select, insert, update, delete on public.%I to service_role', obj);
  end loop;

  foreach obj in array array[
    'bo_admin_users',
    'bo_admin_permissions',
    'bo_admin_sessions',
    'bo_support_ticket_stats',
    'bo_support_access_grants',
    'bo_support_access_reveals',
    'bo_feature_flags',
    'bo_feature_flag_overrides',
    'bo_prompt_versions',
    'bo_system_health',
    'bo_entitlement_grants',
    'bo_entitlement_sources',
    'bo_audit'
  ]
  loop
    execute format('revoke all on public.%I from public, anon, authenticated', obj);
    execute format('grant select on public.%I to service_role', obj);
  end loop;
end
$$;

revoke all on sequence public.support_ticket_reference_seq from public, anon, authenticated;
grant usage, select on sequence public.support_ticket_reference_seq to service_role;

-- Functions. Every one of these either decides authorization or returns user
-- content, so none of them may be reachable from a client role — not even to be
-- called and have its answer discarded.
do $$
declare
  sig text;
begin
  foreach sig in array array[
    'public.admin_users_protect_last_super_admin()',
    'public.audit_logs_enforce_accountability()',
    'public.admin_entitlement_grants_no_overlap()',
    'public.support_access_reveals_verify_grant()',
    'public.feature_flag_is_enabled(text, uuid, app_platform, app_plan, text)',
    'public.admin_record_health_check(text, system_health_status, integer, text, text)',
    'public.admin_permissions_for(uuid)',
    'public.admin_has_permission(uuid, admin_permission)',
    'public.admin_resolve_by_auth_user(uuid)',
    'public.admin_touch_session(bytea, interval)',
    'public.admin_revoke_sessions(uuid, text, uuid)',
    'public.admin_enforce_rate_limit(text, text, integer, interval)',
    'public.admin_write_audit(uuid, text, text, uuid, text, text, text, uuid, jsonb)',
    'public.admin_cleanup_expired()',
    'public.sa_assert_grant(uuid, uuid, support_access_scope)',
    'public.sa_log_reveal(uuid, uuid, uuid, support_access_scope, text, text, integer, text)',
    'public.sa_reveal_identity(uuid, uuid, text)',
    'public.sa_reveal_email_subjects(uuid, uuid, integer, text)',
    'public.sa_reveal_email_message(uuid, uuid, uuid, text)',
    'public.sa_reveal_calendar_events(uuid, uuid, timestamptz, timestamptz, text)',
    'public.sa_reveal_assistant_thread(uuid, uuid, uuid, text)',
    'public.sa_reveal_capture(uuid, uuid, uuid, text)',
    'public.sa_reveal_approval(uuid, uuid, uuid, text)',
    'public.sa_reveal_notification(uuid, uuid, uuid, text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', sig);
    execute format('grant execute on function %s to service_role', sig);
  end loop;
end
$$;
