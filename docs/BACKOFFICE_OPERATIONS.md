# Running the admin console

The operator's handbook for `apps/backoffice`: what to set, how to get the first
administrator in, what the routine work looks like, and what to do when
something is wrong. The architecture is [BACKOFFICE.md](BACKOFFICE.md), the role
matrix is [BACKOFFICE_RBAC.md](BACKOFFICE_RBAC.md), and the Support Access
procedure is [SUPPORT_ACCESS.md](SUPPORT_ACCESS.md).

```bash
pnpm run dev:backoffice     # next dev, port 3100
pnpm run build:backoffice   # next build
pnpm --filter @da/backoffice run start   # next start, port 3100
```

**Do not expose this application publicly.** It holds the service-role key,
which bypasses row-level security entirely. Put it behind whatever network
boundary you would put a database console behind. The response headers
(`X-Robots-Tag: noindex`, `frame-ancestors 'none'`, `Referrer-Policy:
no-referrer`) reduce accidental exposure; they are not a boundary.

---

## 1 · Configuration

`apps/backoffice/src/lib/env.ts` declares six variables in `ENV_VARIABLES` and
is the only module that reads a secret. `readEnv()` has four importers —
`db.ts` and `auth.ts`, both `server-only`, and two `'use server'` action modules
(`lib/actions/health.ts` and `app/(dash)/ops/actions.ts`, which read
`supabaseUrl` to build a probe or a function URL). None can reach a client
bundle, so the service-role key stays on the server by construction rather than
by convention. Nothing here is `NEXT_PUBLIC_`.

### The three required ones

| Variable                    | What it does                                                                                     | If absent                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `SUPABASE_URL`              | The project every read goes to. Trailing slashes are stripped.                                   | A 500 naming the variable — never a silent degradation.                             |
| `SUPABASE_SERVICE_ROLE_KEY` | Reads the `bo_*` views and calls the admin RPCs. Bypasses RLS.                                   | A 500 naming the variable.                                                          |
| `SUPABASE_ANON_KEY`         | Signs staff in through GoTrue and refreshes their token at the edge. Never used for a data read. | Falls back to `NEXT_PUBLIC_SUPABASE_ANON_KEY`; a 500 naming both if neither is set. |

`readEnv()` caches its result for the life of the process. A variable changed
after boot takes effect on the next deploy, not on the next request.

The `SUPABASE_ANON_KEY` fallback is a real trade-off, not a convenience. The
anon key is public by design, so nothing leaks by accepting the `NEXT_PUBLIC_`
name, and a deployment that already has the project's standard variables set
needs no new secret. What you lose is the distinction: a variable named
`NEXT_PUBLIC_` is one Next will inline into a client bundle the moment any client
component references it, and the console's habit of keeping every secret
un-prefixed is what makes an audit of the bundle trivial. The config page marks
the fallback with a caveat rather than a clean tick —
`NEXT_PUBLIC_SUPABASE_ANON_KEY üzerinden okunuyor.` — so it is visible rather
than forgotten. Prefer setting `SUPABASE_ANON_KEY`.

### The three optional ones

**`BACKOFFICE_ENV`** (alias `APP_ENV`) — the deployment label, one of
`production`, `staging`, `development`. `prod`/`live`, `preview`/`test`/`stage`
and `dev`/`local` are accepted spellings. Anything unrecognised resolves to
`development`.

When absent, `resolveEnvironment()` falls through to `VERCEL_ENV` (`preview` maps
to **staging**, whatever the branch) and then to `NODE_ENV`.

That last fallback is where the trade-off bites. `next build` sets
`NODE_ENV=production`, so **any deployment that is not on Vercel and does not set
this variable is reported as production**, including staging. The chip goes
quiet-neutral, `dangerousActionNote()` returns `null`, and the operator loses
exactly the signal that stops a test disconnect landing on a paying customer.
`env.ts` is right that the _unrecognised-value_ fallback errs safely; the
_absent-value_ fallback on a built deployment does not. **Set
`BACKOFFICE_ENV=staging` explicitly on every non-production deployment.** The
config page reports the fallback:
`Ayarlanmamış; ortam VERCEL_ENV ve NODE_ENV üzerinden çıkarsanıyor.`

**`BACKOFFICE_HASH_SALT`** — the HMAC key behind `hashIdentifier()`, which
produces `admin_rate_limits.subject_key` and `admin_sessions.ip_hash`. Both
columns are constrained to 64 lowercase hex characters precisely so a raw address
or IP cannot be written into them, and an _unkeyed_ SHA-256 of an email address
is reversible with a word list — hence the key.

When absent, the fallback is the service-role key. That is a legitimate HMAC key:
high entropy, server-only, already the most sensitive value the process holds,
and no hash discloses it. The cost is coupling. Rotating the service-role key —
something you should be able to do for its own reasons — silently rotates every
rate-limit bucket and makes every stored `ip_hash` incomparable with the ones
written before the rotation. A limiter that resets at the moment of a credential
incident is a limiter that resets at the worst possible moment. The config page
says so:
`Ayarlanmamış; servis anahtarı geçici olarak kullanılıyor. Kendi değerinizi tanımlayın.`

**`BACKOFFICE_RELEASE`** (falls back to `VERCEL_GIT_COMMIT_SHA`) — the deployed
commit, shown truncated to twelve characters in the environment chip's tooltip.
When absent the chip simply omits it, and an incident report cannot say which
build produced the behaviour. Cheap to set; set it.

**`BACKOFFICE_MFA_POLICY`** — `required` means nobody signs in without an
enrolled, verified second factor. Anything else — including absent — means
`enrolled`: an admin who has enrolled MFA must present it, one who has not signs
in with a password, and the roster shows the warning rather than a tick. There is
deliberately no `off`. `mfaPolicy()` compares the raw value against exactly
`required`, so a typo is a quietly weaker policy; the config page says so rather
than showing a tick, with
`Tanınmayan değer; enrolled uygulanıyor. Katı politika için tam olarak "required" yazılmalı.`

### Read but not declared

Two more variables affect the console and are **not** in `ENV_VARIABLES`, so
`secretInventory()` does not report them and the config page does not show them.

| Variable        | Read by                    | Effect                                                                                                                                                                                                                         |
| --------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AI_PROVIDER`   | the `model_provider` probe | `anthropic` or `openai` selects which endpoint is probed. Absent or anything else records the target as `unknown` with the error code `provider_not_selected` — never as healthy.                                              |
| `EXPO_PUSH_URL` | the `push` probe           | Overrides the probe endpoint, but only when it parses as an absolute `https:` URL. A misconfigured value falls back to Expo's published address rather than turning a health probe into a request to whatever the string says. |

### What the config page will and will not tell you

`/health/config` needs `system.config.read` — `super_admin` and `operations`
only. It reports, per variable, a name, `Yapılandırıldı ✅` or
`Yapılandırılmadı ❌`, whether it is required, and a Turkish note. There is no
code path in `secretInventory()` or `loadPlatformSecretState()` that can return a
value, a prefix, a length or a fingerprint, because none of those is ever
computed.

It reads **this console server's** environment and nothing else. The page says so:

> Burada okunan tek şey bu konsol sunucusunun ortam değişkenleridir. Kenar
> fonksiyonların gizli anahtarları Supabase tarafında ayrı tutulur; orada tanımlı
> bir değer burada "yapılandırılmadı" görünebilir.

The platform section mirrors `.env.example` — `OAUTH_ENCRYPTION_KEY`, the Google
and Microsoft pairs, the AI keys, RevenueCat, Expo, Sentry — as presence flags
only, and a red mark there means _this process_ cannot see it, which for an edge
function secret is expected and not a fault.

---

## 2 · First run

### Apply the schema

```bash
supabase db push        # or: psql -f each migration in order
pnpm run verify:supabase
```

`verify:supabase` applies every migration to a throwaway database, applies them a
second time to prove they are re-runnable, checks each Postgres enum against the
TypeScript union it mirrors, asserts RLS is enabled _and_ forced, re-derives the
`bo_*` views' column dependencies from `pg_depend`, and then _attempts_ each
forbidden thing the admin platform must refuse. It needs `SUPABASE_DB_URL`.

### The first `super_admin`

`0019_admin_platform.sql` seeds `admin_users` from the 0017 `staff_members`
roster, so an existing deployment is not locked out of its own console the moment
the migration lands:

| `staff_members.role` | becomes `admin_users.role` |
| -------------------- | -------------------------- |
| `admin`              | `super_admin`              |
| `ops`                | `operations`               |
| anything else        | `support`                  |

Only rows with `disabled_at is null` and a resolvable email address (from
`profiles` or `auth.users`) are seeded, as `active`, `on conflict (user_id) do
nothing`.

On a fresh project there is no `staff_members` row, so `admin_users` is empty and
nobody can sign in. Bootstrap it directly, once:

```sql
-- 0. Create the GoTrue account first (Supabase dashboard → Authentication, or
--    the admin API). Note its user id. Do not put a password in this file.

-- 1. The 0017 roster row. Optional: sign-in no longer consults staff_members
--    (see "The shipped sign-in path" below) and a row here grants nothing. It
--    is still what `bo_staff` counts, so without it the overview reports no
--    active staff.
insert into public.staff_members (user_id, role)
values ('<auth user id>', 'admin')
on conflict (user_id) do update set role = 'admin', disabled_at = null;

-- 2. The 0019 authorization row. This is what actually grants the console.
insert into public.admin_users (user_id, email, display_name, role, status)
values ('<auth user id>', '<work address>', '<display name>', 'super_admin', 'active')
on conflict (user_id) do update
  set role = 'super_admin', status = 'active', disabled_at = null;

-- 3. Confirm.
select id, email, role, status, mfa_enrolled_at, user_id
from public.admin_users
where role = 'super_admin';
```

`admin_users_active_needs_auth_user` refuses `status = 'active'` without a bound
`user_id`, so step 0 genuinely has to come first.

Then enrol a second factor for that account in the Supabase identity dashboard —
the console has no enrolment screen, deliberately — and **create a second
`super_admin` before you do anything else.** The last-super_admin trigger means a
single one is a single point of failure you cannot repair from the console; see
[SUPPORT_ACCESS.md](SUPPORT_ACCESS.md#the-last-super_admin-is-unavailable).

### The shipped sign-in path

`signInAction` in `app/session-actions.ts` — the action the sign-in form posts —
calls `signInAdmin()` and nothing else. That one call applies, in order: the
`admin.sign_in` rate limit (8 attempts per 15 minutes, bucketed by hashed address
_and_ by hashed client IP), the password against GoTrue,
`admin_resolve_by_auth_user()` against **`admin_users`**, and
`BACKOFFICE_MFA_POLICY`. The console session is issued only after every one of
them passes. **`staff_members` is not consulted at sign-in at all**; a row there
grants nothing.

It answers with one of six outcomes, and `lib/sign-in-state.ts` maps each to what
the form shows. That mapping is pure and covered by
`lib/__tests__/sign-in-state.test.ts`:

| Outcome                  | The operator sees                                                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `signed_in`              | The overview. `admin.signed_in` is written with them as actor.                                                                                  |
| `mfa_required`           | The code step, with a chooser when more than one factor is verified.                                                                            |
| `mfa_enrolment_required` | A terminal explanation and one working button — see below.                                                                                      |
| `invalid_credentials`    | `E-posta veya parola hatalı.` on the password step; `Kod doğrulanmadı…` on the code step.                                                       |
| `not_admin`              | `Bu hesabın backoffice yetkisi yok.`, and an `auth.admin_sign_in_denied` row with no actor and the outcome `not_staff`.                         |
| `rate_limited`           | `Çok fazla giriş denemesi yapıldı. Bu bir parola hatası değil: en fazla 15 dakika bekleyip tekrar dene.` — a wait, never a password accusation. |

An unknown address, an address that is not an address, and a wrong password all
produce the same sentence: the form is deliberately not an account-existence
oracle.

The second step is challenge-and-verify in one request. The form holds a factor
id, never a challenge — GoTrue expires a challenge on its own schedule, and a
form carrying a stale one would refuse a correct code. Both steps count against
the same limiter, the MFA step bucketed by the authenticated subject.

**`mfa_enrolment_required` is terminal on purpose.** It means the policy demands
a second factor and GoTrue reports no verified one — either never enrolled, or
enrolled and since removed upstream, which the console treats as owed rather than
waving through. The screen explains that and offers no enrolment control: a
sign-in page that let whoever knows the password bind their own second factor
would be a policy any stolen password walks through. Enrolment is done in the
Supabase identity dashboard by a `super_admin`; see step 4 of
[An administrator is locked out](#an-administrator-is-locked-out). The one button
on the screen — `Baştan başla` — clears the half-finished GoTrue session
server-side and returns to the password form.

### Inviting an administrator

`/system/admins/invite`, `admin.invite`, which only `super_admin` holds.

| Field   | Rule                                                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E-posta | Validated against `@da/validation`'s `emailSchema` _and_ mirrored against `admin_invites_email_shape`, so the operator learns which character the database will reject before submitting. Lower-cased. |
| Rol     | Only roles with `admin_roles.is_assignable = true`.                                                                                                                                                    |
| Süre    | 1, 3, 7 or 14 days. Default 7.                                                                                                                                                                         |
| Gerekçe | 10–500 characters (`MIN_REASON_LENGTH` in `admin-action.ts`).                                                                                                                                          |

Before the insert the console checks that the role is assignable and that no
administrator already exists for that address; `admin_invites_live_email_key`, a
partial unique index, enforces one live invite per address, and a conflict is
turned into the duplicate message rather than a constraint name.

**The token is shown exactly once.** It is 32 bytes from the platform CSPRNG,
base64url, 43 characters. Only `sha256(token)` reaches
`admin_invites.token_hash`, which `admin_invites_token_hash_is_sha256`
constrains to 32 bytes. The plaintext is returned to precisely one caller — the
form that asked for it — and it is:

- not written to the database in any form;
- not in the audit detail (the row records `invited_domain`, the domain only, so
  the trail names the organisation without putting a colleague's mailbox in a
  document other administrators can read);
- not on the redirect URL;
- not readable back — `admin_invites.token_hash` is on `db.ts`'s
  `UNREADABLE_COLUMNS` list, and a query naming it throws.

Copy it out of the form before you navigate away. If you lose it, revoke the
invite (a reason is required, `admin.invite_revoked` is audited) and issue a new
one. There is no "show again".

Rate limit: 20 invites or revocations per administrator per hour.

### Activating an invited administrator

**The console has no route that consumes an invite.** `admin_invites` is written
and revoked from `/system/admins`, and nothing sets `consumed_at`,
`consumed_by`, or binds the invited person's GoTrue account to an `admin_users`
row. Until that route exists, the invite is a record and a token to hand over,
and activation is the manual step above: have the invitee create their GoTrue
account with the invited address, then insert their `admin_users` row (and, for
now, their `staff_members` row) and close the invite:

```sql
update public.admin_invites
set consumed_at = now(), consumed_by = '<new admin_users.id>'
where id = '<invite id>'
  and consumed_at is null
  and revoked_at is null;
```

`admin_invites_consumed_needs_admin` requires both columns together, and
`admin_invites_not_both_consumed_and_revoked` refuses a row that is already
revoked.

---

## 3 · Routine tasks

Every one of these is audited. The `Audit action` column is the name that lands
in `audit_logs.action`; all of them require a written reason except where noted.

| Module         | Route                              | Permission                                               | Task                                                       | Audit action                                                                                    |
| -------------- | ---------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Overview       | `/`                                | via the legacy bridge — see below                        | Platform state at a glance                                 | —                                                                                               |
| Users          | `/users`, `/users/[id]`            | via the legacy bridge                                    | Search an account, read connection and subscription state  | —                                                                                               |
| Support        | `/support`, `/support/[id]`        | `support.ticket.read` / `.write` / `.assign`             | Triage, assign, note, resolve, reopen                      | local runner; ticket edits are not in the 26-name seed                                          |
| Support Access | `/support/access`                  | `support.access.request` or `.approve`                   | Request, approve, deny, revoke — see SUPPORT_ACCESS.md     | `support_access.requested` / `.approved` / `.denied` / `.revoked` / `.revealed`                 |
| Operations     | `/ops`, `/ops/sync`                | via the legacy bridge                                    | Provider health, stalled and failing sync rows             | —                                                                                               |
| Approvals      | `/approvals`                       | via the legacy bridge                                    | Approval queue, rejection rates, execution failures        | —                                                                                               |
| AI             | `/ai`, `/ai/limits`, `/ai/quality` | via the legacy bridge                                    | Model spend, token consumption, top spenders               | —                                                                                               |
| Prompts        | `/ai/prompts`                      | `prompt.read` / `.write` / `.activate`                   | Draft, edit, activate, archive a prompt version            | `prompt.activated`, and `prompt.draft_created` / `.draft_updated` / `admin.prompt_archived`     |
| Billing        | `/billing`, `/billing/grants`      | `billing.read` / `.grant` / `.revoke`                    | Subscriptions, reconciliation, temporary Pro grants        | `entitlement.granted` / `.revoked`                                                              |
| Flags          | `/flags`, `/flags/[id]`            | `flags.read` / `.write`                                  | Create, target, toggle, kill-switch, per-user override     | `feature_flag.changed` / `.override_set` / `.override_removed`                                  |
| Announcements  | `/announcements`                   | `announcement.read` / `.write`                           | Write, publish, unpublish an in-app announcement           | `announcement.published`, `announcement.created` / `.updated`, `admin.announcement_unpublished` |
| Privacy        | `/privacy`                         | via the legacy bridge                                    | Export and deletion requests against the 30-day obligation | —                                                                                               |
| Audit          | `/audit`, `/audit/actions`         | via the legacy bridge                                    | Who did what, when, and why                                | —                                                                                               |
| Health         | `/health`                          | `system.health.read` (+ `integration.resync` to measure) | Dependency status, scheduled-job evidence                  | `system.health_checked` via the local runner                                                    |
| Config         | `/health/config`                   | `system.config.read`                                     | Which secrets are configured                               | —                                                                                               |
| Administrators | `/system/admins`                   | `admin.read` / `.invite` / `.role.write` / `.disable`    | Roster, invites, roles, sessions                           | `admin.invited` / `.invite_revoked` / `.role_changed` / `.disabled` / `.sessions_revoked`       |
| Roles          | `/system/roles`                    | `admin.read`                                             | The matrix as the database holds it. Read-only             | —                                                                                               |

### The legacy bridge, and what it means for who can open what

Eleven page groups still call the first pass's `requireStaff(tier)` rather than
`requirePermission(permission)`. The bridge is a real authorization decision, not
a name mapping — `LEGACY_TIER_PERMISSION` in `auth.ts` maps each tier to the
permission it stood for:

| `requireStaff(...)` | Actually requires    |
| ------------------- | -------------------- |
| `'support'`         | `users.read`         |
| `'ops'`             | `integration.resync` |
| `'admin'`           | `admin.role.write`   |

The consequence is that several pages demand a different permission from the one
`nav.ts` advertises for their sidebar entry, so the entry can be drawn for
somebody the page will refuse:

| Route        | Sidebar entry declares | The page actually requires |
| ------------ | ---------------------- | -------------------------- |
| `/`          | `system.health.read`   | `users.read`               |
| `/ops`       | `system.health.read`   | `integration.resync`       |
| `/ops/sync`  | `integration.read`     | `integration.resync`       |
| `/approvals` | `integration.read`     | `integration.resync`       |
| `/ai`        | `ai.read`              | `integration.resync`       |
| `/billing`   | `billing.read`         | `integration.resync`       |
| `/privacy`   | `privacy.read`         | `users.read`               |
| `/audit`     | `audit.read`           | `integration.resync`       |

In practice: an `analyst` or `finance` administrator sees "Denetim", "Yapay
zekâ" and "Abonelikler" in the sidebar and is redirected to `/forbidden` on
clicking them, because neither role holds `integration.resync`. `readonly` sees
the overview entry and reaches the page, because it holds `users.read`. The
refusals are correct — the pages are not over-permissive, they are
_under_-permissive relative to what the sidebar promises. The fix is to move each
page onto `requirePermission()` with the permission its nav entry names; the
bridge functions exist so that can happen one area at a time rather than in one
unreviewable commit.

---

## 4 · Incidents

### The health page

`/health`, `system.health.read` — the one permission all seven roles hold,
because a console where an analyst cannot see whether the platform is up
generates support tickets of its own. Pressing **"Şimdi ölç"** additionally
requires `integration.resync`; the control is only drawn for an operator holding
both, and `runHealthCheckAction` asks the database again anyway.

### What the words mean, and why "bilinmiyor" is not "healthy"

The vocabulary keeps four ideas apart, and the fourth is **not a softer version
of the first**:

| Turkish        | `system_health_status` | Means                                                                   |
| -------------- | ---------------------- | ----------------------------------------------------------------------- |
| `Sağlıklı`     | `operational`          | A probe ran, answered, and answered inside its threshold                |
| `Yavaş`        | `degraded`             | A probe ran and answered, later than its threshold                      |
| `Erişilemiyor` | `down`                 | A probe ran and did not get an answer                                   |
| `Bilinmiyor`   | `unknown`              | **Nobody measured this**, or the last measurement is too old to believe |

`Bilinmiyor` means the console has no evidence. It is not a mild problem, it is
the _absence_ of information, and during an incident it is the row you
investigate first — a probe that stopped running looks exactly like a dependency
that has not been checked, and both are unknowns you are carrying.

Two mechanisms make that honest rather than aspirational:

- `bo_system_health.is_stale` is `checked_at < now() - interval '15 minutes'`. A
  target whose last reading is older than that renders as `bilinmiyor` **with the
  age beside it**, never as its last green answer.
- The schema refuses to store an unmeasured verdict at all:
  `system_health_checks_verdict_needs_measurement` requires a latency for
  anything other than `unknown`, and `system_health_checks_down_needs_code`
  requires an error code for `down`. There is no way through
  `admin_record_health_check()` to write a green tick nobody observed.

A target with no row at all renders `hiç ölçülmedi`.

### What a probe proves, and what it does not

Every outbound probe is an **unauthenticated GET to a fixed public endpoint**. No
API key, no OAuth token, no `Authorization` header; the reply's body is cancelled
without being read, because a provider's error body routinely quotes the request
that failed. The only facts extracted are the round-trip time and the HTTP status
code — which is all `system_health_checks` can hold anyway.

| Target           | Probe        | `degradedMs` | What it measures                                                      |
| ---------------- | ------------ | ------------ | --------------------------------------------------------------------- |
| `database`       | real query   | 800          | A `count` through PostgREST. The latency is the whole round trip.     |
| `edge_functions` | reachability | 1500         | The Supabase function gateway answers. **No function runs.**          |
| `google`         | reachability | 1500         | `accounts.google.com` OAuth discovery is reachable from this server.  |
| `microsoft`      | reachability | 1500         | `login.microsoftonline.com` OAuth discovery is reachable.             |
| `model_provider` | reachability | 2500         | The endpoint selected by `AI_PROVIDER`. No key sent, no tokens spent. |
| `revenuecat`     | reachability | 2000         | The RevenueCat API endpoint. No key sent.                             |
| `push`           | reachability | 2000         | The Expo notification endpoint. **No notification is sent.**          |

So a green row means _this console server can reach that dependency's front
door_. It does **not** mean:

- that mailbox sync works — that runs from an edge function, with an access
  token, over a different network path. The page says so:
  _"Ölçüm konsol sunucusundan yapılır. Kenar fonksiyonların ağ yolu farklı
  olabilir."_
- that a credential is valid. Nothing is authenticated, so an expired
  `GOOGLE_CLIENT_SECRET` or a revoked RevenueCat key produces a perfectly green
  row.
- that a specific user's account is healthy. That is `/users/[id]` and
  `/ops/sync`.
- that the scheduled jobs are running. The job panel infers that from evidence in
  the `bo_*` views — the newest `bo_sync_health` run, the newest
  `bo_briefing_health` day, `bo_approvals`, `bo_privacy_requests` — not from
  `cron.job_run_details`. A job whose effect leaves no row (`da_follow_up_detection`,
  `da_retention_cleanup`) has `evidence: 'none'` and cannot be confirmed from
  this page at all.

### An incident, in order

1. **Open `/health`.** Read the four tiles. Treat `Ölçüm yok` as an open
   question, not as a pass.
2. **Press "Şimdi ölç"** if any row is stale. It measures now, and the row it
   writes is a real measurement.
3. **Database red?** Nothing else on the page is meaningful — every other row is
   read through the same connection. Check Supabase's own status, then
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on `/health/config`.
4. **A provider red or slow?** Cross-check against `/ops` and `/ops/sync`: a
   reachable front door with a wall of `bo_sync_health.is_stalled` rows is a
   credential or quota problem, not a network one, and the probe cannot see it.
5. **Everything green and users still complaining?** The probes are not the
   product path. Go to `/ops/sync` for stalled resources, `/approvals/failures`
   for execution failures, and `/ai/limits` for spend cut-offs. The counters on
   `/users/[id]` answer most individual reports without any grant.
6. **Only then** consider Support Access, and only after the operational counters
   have failed to explain it. See [SUPPORT_ACCESS.md](SUPPORT_ACCESS.md).

### Scheduled jobs

`0014_cron_jobs.sql` schedules six jobs, all in UTC. Where `pg_net` is absent the
migration raises a notice and skips the ones that need an HTTP call; two have
real SQL fallbacks and still run.

| Job                      | Cron           | Edge function            | SQL fallback                     |
| ------------------------ | -------------- | ------------------------ | -------------------------------- |
| `da_sync_incremental`    | `*/15 * * * *` | `sync-start`             | none                             |
| `da_briefing_dispatch`   | `*/5 * * * *`  | `notification-scheduler` | none                             |
| `da_follow_up_detection` | `0 * * * *`    | `detect-followups`       | none                             |
| `da_approval_expiry`     | `*/10 * * * *` | `approvals-expire`       | `expire_stale_approvals()`       |
| `da_retention_cleanup`   | `15 3 * * *`   | `retention-cleanup`      | `cleanup_expired_retention()`    |
| `da_export_cleanup`      | `45 3 * * *`   | none                     | `data_export_requests → expired` |

**`admin_cleanup_expired()` is not among them.** The admin platform's own sweep —
dead sessions, unconsumed invites, stale flag overrides, closed rate-limit
windows, probe rows older than 90 days, and lapsed Support Access grants moved to
`expired` — is not scheduled by 0014 and is not called by any console screen,
although `runAdminCleanup()` exists in `db.ts`. Until it is scheduled, run it by
hand or add it to your own scheduler:

```sql
select public.admin_cleanup_expired();
```

It returns a JSON report keyed by table. It never deletes a Support Access grant
or a reveal — those are the audit.

---

## 5 · When something is wrong

### The build is red

Each CI job names itself, so start with which one failed.

| Job                          | What it proves                                                                                                                | First thing to check                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `static` → Format            | `prettier --check` over every `ts/tsx/js/jsx/json/md/yml/yaml`                                                                | `pnpm run format` and commit the result                                         |
| `static` → Lint / Types      | ESLint at zero warnings; `tsc --noEmit` in every workspace                                                                    | A content table added to `BoViewRows` or `AdminTableRows` fails here, by design |
| `test`                       | Vitest, including `permission-matrix.test.ts`                                                                                 | The migration and `permissions.ts` disagree by a row                            |
| `guards` → Message catalogue | Turkish and English define the same keys; no string claims end-to-end encryption                                              | A new Turkish string                                                            |
| `guards` → Dead code         | No unfinished-work markers, no control that looks pressable and is not                                                        | `apps/backoffice/src` is **not** in this scanner's `SOURCE_DIRS`                |
| `guards` → Secrets           | No committed credential; no server secret referenced from a bundle                                                            | `docs/` is not scanned; `scripts/` and `apps/` are                              |
| `guards` → RBAC document     | `docs/BACKOFFICE_RBAC.md` against `0019_admin_platform.sql`                                                                   | The matrix was widened in SQL and not in the document                           |
| `database`                   | Migrations apply twice; RLS enabled _and_ forced; `bo_*` views content-blind; every admin-platform invariant actually refuses | A view that reads one more column than it should                                |
| `backoffice`                 | `tsc` and `next build` for the console                                                                                        | A Server Component importing something `server-only`                            |

`verify:rbac-doc` failing prints the exact cell:

```
- the matrix says support holds support.access.approve, but 0019 does not grant it
```

The migration is the authority. Correct the document, unless the grant itself is
wrong — in which case correct the seed, the mirror in `permissions.ts`, the copy
in `db.ts` and the document, in one change, and re-run `pnpm run verify`.

### An administrator is locked out

Work through this in order; most lockouts stop at step 2.

1. **Are they disabled?**

   ```sql
   select id, email, role, status, disabled_at, disabled_reason,
          mfa_enrolled_at, last_login_at, user_id
   from public.admin_users
   where lower(email) = lower('<address>');
   ```

   `status = 'disabled'` is a decision somebody made and it carries its reason.
   Another `super_admin` reopens the account from `/system/admins/[id]` with a
   reason of their own; the reopen writes an `admin.disabled` audit row carrying
   `admin_reenabled: true` in its detail (there is no 27th action name for a
   reopen, and inventing one outside the seed would slip past
   `admin_sensitive_actions`). An account whose GoTrue user was erased returns to
   `invited`, not `active`, because `admin_users_active_needs_auth_user` refuses
   the alternative.

2. **Were their sessions revoked?** They simply sign in again. "Log out all
   sessions" is a server-side `UPDATE`, not a ban.

3. **Did the session expire?** Two hours idle, twelve hours absolute. Sign in
   again. `admin_touch_session()` decides this, not the cookie, so clearing
   browser storage changes nothing.

4. **MFA.** They reach the password step, it is accepted, and the screen says
   `Bu konsol ikinci adım olmadan açılmıyor ve hesabında tanımlı bir doğrulama yöntemi yok.`
   The remedy is in GoTrue — remove any stale factor in the Supabase identity
   dashboard and enrol a fresh one for them; the console has no enrolment screen,
   because a sign-in page that let whoever holds the password bind a second
   factor would be a policy any stolen password walks through. Nothing in
   `admin_users` needs to change.

   This is not only a `BACKOFFICE_MFA_POLICY=required` problem.
   `admin_users.mfa_enrolled_at` is the console's _mirror_ of a fact GoTrue owns:
   it is stamped the first time an `aal2` sign-in is seen, and a factor removed
   upstream leaves the mirror stale. Under the default `enrolled` policy a
   stamped mirror with no verified factor is treated as owed rather than waved
   through, so the same screen appears — and the roster's MFA column still shows
   a tick for an account with no working factor.

5. **They can authenticate but the console says
   `Bu hesabın backoffice yetkisi yok.`** `admin_resolve_by_auth_user()` returned
   no row for their GoTrue subject: no `admin_users` row, a row whose `user_id`
   points at a different auth user, or a status that is not `active`. The refusal
   is in `audit_logs` as `auth.admin_sign_in_denied` with the outcome
   `not_staff`. See [the shipped sign-in path](#the-shipped-sign-in-path).

6. **The last `super_admin` is gone.** Do not `delete from public.admin_users` —
   the audit-bearing foreign keys carry `on delete restrict` so that fails
   loudly rather than orphaning a year of accountability. The recovery is in
   [SUPPORT_ACCESS.md](SUPPORT_ACCESS.md#the-last-super_admin-is-unavailable).

7. **Everyone is locked out and the console will not load at all.** Check
   `/health/config` if you can reach it; otherwise check `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` and the anon key in the deployment. A
   configuration failure surfaces as `server_unavailable` and an error boundary,
   never as a sign-in loop — that distinction is deliberate, and a sign-in form
   that keeps reappearing means something else.

### An audit row looks wrong

`audit_logs` is append-only by intent. **Do not edit or delete a row.** A
corrected trail with two entries is evidence; a trail with one edited entry is
not.

Read the row through the view first, which is where the promoted columns surface:

```sql
select audit_id, created_at, action, actor_admin_user_id, admin_role,
       subject_user_id, entity_type, entity_id, outcome, is_sensitive,
       admin_reason, support_access_grant_id, metadata_keys
from public.bo_audit
where audit_id = '<uuid>';
```

Then work out which of these it is.

- **No `actor_admin_user_id` on an `admin.*` row.** Impossible through the
  console — `audit_logs_enforce_accountability()` refuses the insert with
  `audit_actor_required`. If one exists, it was written by a direct
  service-role statement, or the trigger was dropped. Check:

  ```sql
  select tgname, tgenabled from pg_trigger
  where tgrelid = 'public.audit_logs'::regclass;
  ```

- **`is_sensitive` false on something that should not be.** The trigger sets it
  from `admin_sensitive_actions` plus the `admin.` / `support_access.` namespace
  rule. An action outside both namespaces and absent from the seed —
  `announcement.created`, `prompt.draft_updated` — is genuinely not sensitive and
  carries no actor requirement. That is correct, not a fault; those are the
  console's own names for non-destructive edits, and only the seeded twenty-six
  are accountable.

- **`admin_reason` empty on a destructive action.** Also impossible through the
  console: `audit_reason_required` refuses it, and `runAdminAction` refuses
  earlier with a field error. Same investigation as above.

- **The row says `outcome: failure` and the change happened anyway.** Read
  `metadata_keys` for `failure_code` and `failure_hint`. `runAdminAction` writes
  the audit row _after_ the effect, so a `failure` row means the handler threw —
  and a partially-applied handler is the case to look for.

- **The row says the action succeeded and nothing changed.** The reverse case is
  the one the console reports as `effectApplied: true, auditWritten: false`: the
  change landed and the trail did not, so the operator was shown a failure. There
  is no row to find; reconcile from the affected record.

- **A `support_access.revealed` row with no matching `support_access_reveals`
  row, or vice versa.** The reveal row is the authoritative one — Postgres writes
  it in the same statement as the read. The queries are in
  [SUPPORT_ACCESS.md](SUPPORT_ACCESS.md#auditing-after-the-fact).

- **Anything genuinely mis-attributed.** Write a _new_ row that says so, in the
  `admin.` namespace with a reason, and keep both. That is what the namespace
  rule is for: an action invented later is accountable from its first insert.

Remember that `cleanup_expired_retention()` blanks `audit_logs.metadata` after
400 days. `actor_admin_user_id`, `actor_role` and `reason` are real columns
specifically so the sweep cannot reach them — a row older than 400 days with an
empty `metadata_keys` array and an intact actor and reason is working as
designed, not damaged.

---

## Related documents

| Document                                 | What it covers                                              |
| ---------------------------------------- | ----------------------------------------------------------- |
| [BACKOFFICE.md](BACKOFFICE.md)           | Content-blindness, `runAdminAction`, invariants, sessions   |
| [BACKOFFICE_RBAC.md](BACKOFFICE_RBAC.md) | The role and permission matrix                              |
| [SUPPORT_ACCESS.md](SUPPORT_ACCESS.md)   | The one audited path to user content                        |
| [DEPLOYMENT.md](DEPLOYMENT.md)           | Database, edge functions, mobile builds, the marketing site |
| [TESTING.md](TESTING.md)                 | What each gate proves, and what it does not                 |
