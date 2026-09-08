# The admin console

`apps/backoffice` is a third application in this repository: a Next.js 16 staff
console, server-rendered, on port 3100. It is not part of the product. It shares
an identity provider with the mobile app and nothing else — a paying customer
signing in with a perfectly valid password reaches nothing here, because access
is a row in `public.admin_users` and not a session in GoTrue.

This document is about the guarantees. The role matrix is
[BACKOFFICE_RBAC.md](BACKOFFICE_RBAC.md), the reveal procedure is
[SUPPORT_ACCESS.md](SUPPORT_ACCESS.md), and running the thing is
[BACKOFFICE_OPERATIONS.md](BACKOFFICE_OPERATIONS.md).

---

## What it is

An operations console over the same Supabase project the app uses, reading
through the content-blind `bo_*` views from `0017_backoffice.sql` and
`0019_admin_platform.sql`. Eight sections, declared once in
`apps/backoffice/src/lib/nav.ts`: overview, users, operations, AI, business,
product, privacy, system. The sidebar, the command palette and the breadcrumb
all read that one file, so they cannot disagree about what the console contains.

The interface language is Turkish. The URL space is not: route segments are
English throughout (`/support/access`, `/system/admins`), because a mixed
Turkish-and-English URL space was a defect in the first pass and was corrected.

## What it cannot do

These are not policies. Each one is a mechanism named beside it.

- **It cannot read mail, calendar detail, assistant conversations, captures,
  approval payloads or notification bodies by ordinary means.** Every screen
  reads a `bo_*` view, and no `bo_*` view depends on a content column — see
  [the chain](#the-content-blindness-guarantee) below.
- **It cannot impersonate a user.** There is no "sign in as", no scope that
  returns a credential, and no route from the console to `oauth_credentials`:
  `ContentTable` in `apps/backoffice/src/lib/db.ts` names it, and the
  compile-time assertions there refuse any query surface that includes it.
- **It cannot escalate its own authority.** The role matrix is
  `public.admin_role_permissions`, rewritten in full by
  `0019_admin_platform.sql` on every migration run. There is no screen that
  writes it, and a row inserted into it by hand grants nothing until the mirror
  in `apps/backoffice/src/lib/permissions.ts` is changed and reviewed too —
  `decideAccess()` grants the _intersection_ of the two.
- **It cannot delete an administrator, an audit row, a Support Access grant or a
  reveal.** `DeletableTable` in `db.ts` is the single literal type
  `'feature_flag_overrides'`; every other table in the admin platform is
  disabled, revoked or expired instead, because the audit trail has to keep
  resolving.
- **It cannot leave the last enabled `super_admin` behind.** A demote, a
  disable, a delete or an unbinding of that account is refused by a trigger, not
  by a form handler.
- **It cannot record a privileged change without a trail.** An action whose
  audit row did not land reports failure, even when the change itself succeeded.

One thing it explicitly _can_ do, and the documentation is honest about it: with
an approved, time-limited, four-eyes Support Access grant, an operator can read
one named user's content within a named scope. That path is deliberate, audited
per reveal, and described in full in [SUPPORT_ACCESS.md](SUPPORT_ACCESS.md).

> Veriler aktarım sırasında ve saklanırken şifrelenir.

That is the whole encryption claim the product makes, here as everywhere. The
architecture is not end-to-end encrypted; the server decrypts and analyses mail,
because that is the product. See
[SECURITY.md](SECURITY.md#what-is-not-claimed).

---

## The content-blindness guarantee

The product promises publicly that nobody at the company reads user mail and
that support cannot see message content. That promise is held by a chain of four
links, and the interesting part is that they are enforced in four different
places by four different mechanisms. A reader can verify each one independently.

### Link 1 — the views have no content column (the database)

`0017_backoffice.sql` creates sixteen `bo_*` views and
`0019_admin_platform.sql` adds twelve more plus a redefinition of `bo_audit`.
Not one of them projects a column that can carry what a person wrote, received,
said or was told. 0017 lists, by name, every column it refuses to read —
`email_messages.body_text`, `calendar_events.title`, `assistant_messages.content`,
`captures.raw_text`, and thirty-odd more.

Three helpers narrow what can escape through the columns that _are_ read:

| Helper              | What it does                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `bo_redact_email()` | `yunus.emre@example.com` becomes `y•••@example.com`. Enough to confirm the account, never enough to contact them. |
| `bo_error_code()`   | A provider failure that quotes the offending payload collapses to the literal `unstructured`.                     |
| `bo_identifier()`   | A token-shaped string passes; anything with whitespace or `@` collapses to `unstructured`.                        |

Every view and every admin-platform table is `revoke all … from public, anon,
authenticated` and `grant select … to service_role`. Supabase's default
privileges hand new objects in `public` to the client roles, so those revokes are
load-bearing rather than decorative. Every admin-platform table additionally
carries RLS **enabled and forced** with zero policies: there is no tier for a
signed-in product user, because the admin platform is not part of the product.

**Enforced by:** Postgres. A view cannot project a column it does not select, and
a client role cannot read an object it has no grant on.

### Link 2 — the application can only name a view (the type system)

Two modules construct a service-role Supabase client — `db.ts` and `auth.ts` —
and in both the client is module-private: never exported, never returned, never
handed to a caller. Everything leaves those files as a plain typed row, so no
page can compose a query of its own. (`db.ts`'s own header comment claims it is
the only one; that is a stale comment, not a second surface — `auth.ts` carries
its own, narrower allow-lists, described below.)

`queryView` accepts `BoViewName`, a union derived from the `BoViewRows`
interface. `queryTable` accepts `AdminTableName`, derived from `AdminTableRows`.
There is no overload taking `string` and no generic escape hatch. Naming
`email_messages` is a type error rather than a code-review finding.

Two assertions make that permanent:

```ts
type _ContentTablesAreUnreadable = Assert<
  Extract<BoViewName, ContentTable> extends never ? true : false
>
type _ContentTablesAreUnwritable = Assert<
  Extract<AdminTableName, ContentTable> extends never ? true : false
>
```

`ContentTable` is a 35-member union naming every base table that holds — or keys
— something a person wrote. The moment either query surface gains one of those
names, the file stops compiling.

`apps/backoffice/src/lib/auth.ts` carries a second, much smaller surface
(`ADMIN_READABLE`, eight sources; `ADMIN_WRITABLE`, three tables) with its own
allow-lists, used by the authorization layer. It has its own client, and it too
never sees a content table.

**Enforced by:** `tsc --noEmit`, which CI runs as the `Types` step of the
`static` job and again in the `backoffice` job.

### Link 3 — a cast cannot get past it either (the runtime)

A value that never met the type checker — one from `searchParams`, a JSON body,
or a deliberate `as never` — still cannot reach a content table. Every read
passes `assertReadableView()` or `assertAdminTable()`, which test a frozen
`Set` and throw `AppError('forbidden')` on a miss:

```
backoffice may only read the bo_* views; refused "email_messages"
```

The remote-procedure surface is closed the same way: `ADMIN_RPCS` is an
eighteen-name union and `assertRpcName()` refuses anything else, because a
`string` there would be a way to call whatever the service role can execute —
including the `sa_reveal_*` family.

Two columns are writable but never readable, listed in `UNREADABLE_COLUMNS`:
`admin_invites.token_hash` and `admin_sessions.token_hash` / `ip_hash`. A table
that appears there cannot be selected with `*` at all — the caller must name its
columns, which is what makes the omission deliberate rather than lucky.

**Enforced by:** the application, at runtime, on every call.

### Link 4 — the guarantee is re-derived from the catalogue (a test)

`scripts/validate-supabase.mjs` applies every migration to a throwaway Postgres,
then asks the catalogue what each view actually reads:

```sql
select distinct v.relname, rn.nspname, rt.relname, a.attname
from pg_depend d
join pg_rewrite r on r.oid = d.objid
join pg_class v on v.oid = r.ev_class
...
where d.classid = 'pg_rewrite'::regclass
  and v.relname like 'bo\_%'
```

This is the whole check, and it is deliberately **not** a check on output column
names — a view could rename `body_text` to `note`. Postgres records, per view,
exactly which base-table columns the rewrite rule touches. A view that so much as
tests `payload is null` shows up here and fails the build.

The same block additionally:

- fails any view that reads a token store (`oauth_credentials`, `oauth_states`)
  outside the six scalars 0017 needs to answer "is this grant still usable";
- fails any view that reads a guarded column without calling its guard —
  `admin_users.email` without `bo_redact_email()`,
  `support_access_reveals.entity_id` without `bo_identifier()`;
- fails any `bo_*` view that _exposes_ a column whose name reads like content, as
  a second, independent test on the projection side;
- fails any grant of a `bo_*` view or an admin-platform table to `anon`,
  `authenticated` or `PUBLIC`;
- executes `bo_redact_email()` and `bo_error_code()` and asserts their output, so
  a redactor edited into a no-op fails rather than passing quietly.

**Enforced by:** CI, in the `database` job, on every push and pull request.

### What each link would and would not catch

| Failure                                            | Caught by                              |
| -------------------------------------------------- | -------------------------------------- |
| A view edited to select `email_messages.body_text` | Link 4 (the `pg_depend` re-derivation) |
| A page written to query `email_messages` directly  | Link 2 (compile error)                 |
| A view name arriving from a query string           | Link 3 (runtime refusal)               |
| A `revoke` forgotten on a new view                 | Links 1 and 4                          |
| A redaction helper edited to return its input      | Link 4 (the executed assertions)       |
| A reveal function called without a grant           | Not this chain — see SUPPORT_ACCESS.md |

The last row is the point of separating the two mechanisms by name. `bo_*` is
blind, needs no grant, and records nothing because there is nothing to record.
`sa_*` is the reveal path, needs a grant somebody else approved, and writes its
own log. They cannot be confused at a call site, because reaching content is not
a matter of typing a slightly different table name.

---

## `runAdminAction`

Every privileged operation in the console goes through one wrapper,
`apps/backoffice/src/lib/admin-action.ts`. A sensitive admin operation has five
obligations before it does its own job — establish who is acting, confirm the
permission, stay inside a rate limit, validate its input, and leave an audit row
— and five obligations repeated across every module is five chances for one to
be forgotten. The one that gets forgotten is always the audit, because its
absence is the only one nothing complains about at the time.

### The branded actor

`runAdminAction` cannot be called without an `AdminActor`, and the type carries a
brand backed by a `unique symbol` that `db.ts` never exports:

```ts
const ADMIN_ACTOR_BRAND: unique symbol = Symbol('da.backoffice.admin-actor')
```

There is no object literal anywhere in the console that produces one. The only
three ways to obtain an actor are `resolveAdminByAuthUser()`,
`resolveAdminById()` and `touchAdminSession()`, and every one of them asks the
database: `admin_resolve_by_auth_user()` returns no rows for a normal product
account or a disabled admin, `admin_touch_session()` returns none for an expired
or revoked session, and `resolveAdminById()` re-reads `admin_users` with
`status = 'active' and disabled_at is null` rather than trusting the id it was
handed. An operator disabled between the render and the click is refused at the
click.

### The order, and why it is that order

| Step | What happens                                        | Why it is here                                                                                                 |
| ---- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1    | Rate limit, if the spec declares one                | Before anything else, so a script cannot force thousands of validation failures or audit rows                  |
| 2    | Parse the input through the spec's schema           | So the handler never sees an unparsed value, and the reason is known before the permission decision is audited |
| 3    | `admin_has_permission()` against the database       | Not against the rendered menu, and not against the set loaded at sign-in                                       |
| 4    | Reason, where `admin_sensitive_actions` demands one | Refused here as a field error rather than as a database exception three layers away                            |
| 5    | The handler                                         | Only after every gate above has passed                                                                         |
| 6    | The audit row                                       | After the effect, so it records what happened rather than what was attempted                                   |

### Reason enforcement is driven by the database

Whether an action needs a written justification is read from
`public.admin_sensitive_actions`, the same twenty-six-row table the
`audit_logs_enforce_accountability()` trigger consults. It is not copied into
TypeScript, so the console's pre-validation and the trigger's refusal cannot
disagree. The table is cached for five minutes — reading it per action would be
a round trip to learn something that changes only when a migration runs, and
caching it forever would mean a migration needs a restart to take effect.

The console's own floor is ten characters (`MIN_REASON_LENGTH` in
`admin-action.ts`); the database's floor is three; `support_access_grants.reason`
demands twenty. Where they differ the strictest one the operator meets applies
first, and the database still wins if the console is ever wrong.

If the console's cache and the trigger disagree, the trigger wins and the row is
refused. The pre-check exists to produce a readable field error, not to be the
decision.

### The audit is written on both paths

`runAdminAction` writes an audit row when the handler succeeds **and** when it
throws, so an endpoint cannot skip the trail by returning early:

- **Permission denied.** The refusal itself is audited, with
  `outcome: 'failure'` and a reason the guard supplies —
  `Yetki reddedildi: <permission>` — kept alongside whatever the operator typed.
  An admin repeatedly reaching for something they may not do is exactly what an
  audit trail is for.
- **The handler threw.** A `failure` row carries the error code and, where the
  database named one, the `hint` that identifies the rule that refused.
- **The audit itself failed.** Reporting success would put an unrecorded
  privileged change into the system, so the result is `failed` with
  `effectApplied: true` — the change landed, the trail did not, and the screen
  says which.

Where an audit row for a refusal cannot be written, the result carries
`auditWritten: false` rather than turning a correct refusal into a 500. The
screen can then say the trail is incomplete instead of implying it is intact.

### Why it returns instead of throwing

A Server Action's caller is a form. A thrown error becomes an error boundary,
which loses the operator's typed input and says nothing about which field was
wrong. Every outcome is a serialisable value:

```ts
type AdminActionResult<T> =
  | { status: 'success'; data: T; auditId: string }
  | { status: 'invalid'; issues: readonly FieldIssue[] }
  | { status: 'denied'; permission: AdminPermission; auditWritten: boolean }
  | { status: 'rate_limited'; scope: string; limit: number; window: string }
  | {
      status: 'failed'
      code: ErrorCode
      hint: DatabaseHint | null
      effectApplied: boolean
      auditWritten: boolean
    }
```

The `hint` is what lets a screen say "son süper yönetici kaldırılamaz" instead of
"bir hata oluştu". `DATABASE_HINTS` is the closed list of twelve names 0019
raises; anything else arrives as `null` and no caller ever sees a raw Postgres
message.

### Two modules run their own copy, on purpose

`lib/actions/health.ts` and `lib/actions/tickets.ts` reproduce the same six steps
inline rather than calling `runAdminAction`. The reason is stated in both files:
the wrapper's `action` field is typed `AdminAuditAction`, the closed union of the
twenty-six names the migration seeded, and neither a probe nor a ticket edit is
one of them. Widening that union means editing `db.ts`, `permissions.ts` and the
migration's seed together — a change those modules do not own. They borrow every
guard (`requirePermissionAction`, `assertPermissionAtSource`, `assertRateLimit`,
`writeAudit`) rather than reimplementing one.

---

## Where the invariants live

The rule of thumb this codebase follows: **an invariant whose violation is
unrecoverable, or which two concurrent requests could each individually pass,
belongs in the database.** Application code is exactly what an incident review
cannot trust, and a check written in a form handler is a check that races.

### Enforced by Postgres

| Invariant                                                                                     | Mechanism                                                                                                  | Why not the application                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The last enabled `super_admin` cannot be demoted, disabled, deleted or unbound                | `admin_users_protect_last_super_admin`, a `before update or delete` trigger taking `pg_advisory_xact_lock` | Two transactions demoting two different super_admins would each see the other as enabled under READ COMMITTED and both commit, leaving zero. Locking yourself out of your own platform is unrecoverable without a database console.                                        |
| A feature has at most one active prompt version                                               | `prompt_versions_one_active_per_feature`, a partial unique index                                           | Two concurrent activations would otherwise both commit, leaving the platform with two live prompts and no way to tell which ran                                                                                                                                            |
| A sensitive action cannot be audited without an actor, and a destructive one without a reason | `audit_logs_enforce_accountability()`, a `before insert` trigger driven by `admin_sensitive_actions`       | A new console page cannot forget to audit itself — it simply fails to write the row. The trigger additionally treats every action in the `admin.` and `support_access.` namespaces as sensitive, so a page added next month is covered before anybody remembers to seed it |
| Content cannot be revealed without a live, scope-matching, four-eyes grant                    | `sa_assert_grant()` plus a `before insert` trigger on `support_access_reveals`                             | A reveal that was not logged did not happen, and the log has to be unforgeable even against a direct service-role insert                                                                                                                                                   |
| Nobody approves their own Support Access request                                              | `support_access_grants_four_eyes`, a `check` constraint                                                    | Four eyes as a policy is a policy somebody can relax in a form handler                                                                                                                                                                                                     |
| A Support Access window is never longer than 24 hours                                         | `support_access_grants_window_is_short`, a `check` constraint                                              | Whatever a form sends                                                                                                                                                                                                                                                      |
| A Support Access reason is at least 20 characters                                             | `support_access_grants_reason_is_written`                                                                  | "debug" is not a justification a reviewer can weigh six months later                                                                                                                                                                                                       |
| One live grant per (admin, subject)                                                           | `support_access_grants_one_active`, a partial unique index                                                 | So "who could see this account, and when" is a row rather than a set                                                                                                                                                                                                       |
| A health verdict other than `unknown` carries a measurement, and `down` carries an error code | `system_health_checks_verdict_needs_measurement` / `_down_needs_code`                                      | There must be no way to insert a green tick nobody observed                                                                                                                                                                                                                |
| A rate-limit subject and a session IP are hashes, never raw values                            | `admin_rate_limits_subject_is_hash`, `admin_sessions_ip_hash_shape` (`^[a-f0-9]{64}$`)                     | A bug that passed the raw value is refused rather than quietly building a log of who signed in from where                                                                                                                                                                  |
| An invite or session token is stored only as a 32-byte digest                                 | `admin_invites_token_hash_is_sha256`, `admin_sessions_token_hash_is_sha256`                                | A database dump must grant nobody access                                                                                                                                                                                                                                   |
| The rate-limit counter increments and compares atomically                                     | `admin_enforce_rate_limit()`, one `insert … on conflict do update … returning`                             | On serverless, a `Map` in module scope multiplies the limit by the number of warm instances and resets on every cold start                                                                                                                                                 |

`scripts/validate-supabase.mjs` does not inspect these — it _attempts_ each
forbidden thing against a throwaway database and requires the refusal, matching
the constraint or hint name. A dropped trigger and a constraint written with a
typo that makes it always true both look perfectly healthy in the catalogue.

### Enforced by the application, and why

Three rules are the console's alone, and each is deliberate:

- **`admin_roles.is_assignable`.** The migration says plainly that it is
  advisory: it retires a role from the invite and role-change pickers without
  touching its existing holders, because Postgres cannot drop an enum member.
  There is no constraint behind it, so `lib/actions/admins.ts` is its only
  enforcement.
- **Acting on your own account.** Changing your own role and closing your own
  account are refused in the console. There is no database rule to race — the
  schema is happy to let a super_admin demote themselves while another remains —
  and the result is an operator who cannot undo what they just did.
- **The permission mirror.** `decideAccess()` intersects the database's answer
  with `ROLE_PERMISSIONS` in `permissions.ts`, so a grant inserted outside a
  reviewed migration is inert. This is defence in depth, not a second authority;
  the database is still what actually decides.

Nothing in the console pre-checks the last-super_admin rule. A pre-check would be
a race with a worse outcome than the refusal it tried to avoid, so the refusal
arrives as `P0001` with `hint = 'admin_last_super_admin'` and the console turns
exactly that hint into a Turkish sentence.

---

## Environment awareness

An operations console that looks identical against production and staging is a
console where somebody eventually disconnects a real customer's mailbox while
reproducing a bug. So the environment is a typed, server-resolved fact rather
than a string three components re-derive from `NODE_ENV`.

`describeEnvironment()` in `apps/backoffice/src/lib/env.ts` returns a plain
serialisable `EnvironmentDescriptor`. It **throws in a browser** rather than
guessing: none of the variables it reads are `NEXT_PUBLIC_`, so a Client
Component calling it would receive `undefined` for every one and cheerfully
report "development" while pointed at production. A Server Component resolves it
and passes it down as a prop.

Resolution order, from `resolveEnvironment()`:

1. `BACKOFFICE_ENV` or `APP_ENV`, normalised — `prod`/`live` → production,
   `preview`/`test`/`stage` → staging, `dev`/`local` → development.
2. `VERCEL_ENV` — `production` → production, `preview` → **staging** whatever the
   branch, `development` → development.
3. `NODE_ENV === 'production'` → production, otherwise development.

Anything unrecognised resolves to `development`, which is the safe direction to
be wrong in: an over-cautious banner on the real console is a nuisance, a missing
one on staging is how a test disconnect lands on a paying customer.

The descriptor carries the Turkish label and a four-character chip:

| Environment   | `label`             | `code` |
| ------------- | ------------------- | ------ |
| `production`  | `Canlı ortam`       | `PROD` |
| `staging`     | `Hazırlık ortamı`   | `TEST` |
| `development` | `Geliştirme ortamı` | `GELŞ` |

It also carries `projectRef` — `abcdefgh` from `https://abcdefgh.supabase.co`,
`null` for a self-hosted URL. An identifier, not a secret, and it is what makes
"am I on staging?" answerable from the screen instead of from a deployment
dashboard.

`EnvironmentBadge` renders the chip in the topbar **in every environment**,
including production. That is the opposite of the usual advice and it is
deliberate: a banner that only appears on staging teaches operators that _no
banner_ means production, and "no banner" is also what a broken banner looks
like. Production is a quiet neutral chip; everything else is amber. The `title`
attribute carries the full sentence from `environmentBannerText()`:

- production — `Canlı ortam · <ref> — bu konsol gerçek müşteri verisiyle çalışıyor.`
- otherwise — `Hazırlık ortamı · <ref> — bu ekrandaki veriler canlı müşteri verisi değildir.`

Beside a destructive control, `dangerousActionNote()` returns
`<label>: bu işlem gerçek müşteriyi etkilemez.` outside production and `null`
inside it, where the button's own confirmation dialog is the warning and a second
banner would dilute it. Two screens use it today: the Support Access grant detail
page and the admin detail page.

---

## Sessions

Two independent credentials, and only one of them authorises anything.

| Cookie  | Name        | What it is                         | What it authorises               |
| ------- | ----------- | ---------------------------------- | -------------------------------- |
| Console | `da_bo_sid` | 256 random bits, base64url, opaque | Everything. This is the session. |
| GoTrue  | `da_bo_at`  | Supabase access token              | Nothing after sign-in            |
| GoTrue  | `da_bo_rt`  | Supabase refresh token             | Nothing after sign-in            |

The GoTrue pair is kept for two narrow reasons: `proxy.ts` uses their presence to
send a credential-free visitor to the sign-in page without rendering, and signing
out revokes the GoTrue session upstream as well as ending the console session.

All three are set with `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`, and
`secure: process.env.NODE_ENV === 'production'` — which is every built
deployment, and off under `next dev`, where the browser would drop a secure
cookie on plain-HTTP localhost and sign-in would silently fail. `lax` rather than
`strict` so an operator following a link to a ticket from their mail client
arrives signed in; `lax` still refuses to send the cookie on a cross-site POST,
which is the case CSRF cares about. `httpOnly` is not negotiable — no script ever
reads a session token.

### The token is never stored

`newSessionToken()` generates 32 bytes from the platform CSPRNG. Only
`sha256(token)` reaches `admin_sessions.token_hash`, which
`admin_sessions_token_hash_is_sha256` constrains to exactly 32 bytes. A database
dump cannot be replayed, and a stolen cookie can be killed server-side.

### Two deadlines, both decided by Postgres

| Constant                         | Value    | Column                |
| -------------------------------- | -------- | --------------------- |
| `ADMIN_SESSION_IDLE_SECONDS`     | 2 hours  | `expires_at`          |
| `ADMIN_SESSION_ABSOLUTE_SECONDS` | 12 hours | `absolute_expires_at` |
| `ACCESS_COOKIE_MAX_AGE`          | 1 hour   | —                     |
| `REFRESH_COOKIE_MAX_AGE`         | 7 days   | —                     |

Every protected render calls `admin_touch_session()`, which in one atomic
statement validates the token hash, checks both deadlines, checks the admin is
still `active` and not disabled, and slides `expires_at` forward by
`least(now() + idle_window, absolute_expires_at)`. No rows means no session, and
the reason is deliberately not disclosed. Expiry is therefore a fact about the
database rather than a claim made by a cookie, and "log out all sessions" is a
single `UPDATE` rather than a hope about a browser.

The console session cookie's `maxAge` is the _shorter_ of the two lifetimes —
whatever is left of the absolute window, capped at the idle window. A cookie that
outlived its session would only produce requests that get refused.

`evaluateSessionWindow()` in `session-cookies.ts` mirrors the same `where` clause
as a pure function, so the rule can be tested without a request context. It
returns `revoked` before `absolute_expired` before `idle_expired`, because
"somebody logged you out" and "you were away too long" are different facts and
the audit trail should not confuse them.

`readAdminSession()` is memoised per request with React's `cache`, so a layout, a
page and three Server Actions in one render share a single
`admin_touch_session()` round trip.

A configuration or database outage returns `{ kind: 'unavailable' }` and is
re-thrown as a retryable error, never turned into a sign-in redirect. A dead
session is _no rows_, never an error; an outage is not a signed-out operator, and
treating it as one loops the operator through a form that cannot work.

### The layout is not the guard

`app/(dash)/layout.tsx` resolves the session because it needs one to draw the
rail, and redirects a visitor without one because rendering console chrome to a
stranger is pointless. It is **not** what protects the pages: a Next.js layout
does not re-run for every nested render path, and treating one as an
authorization boundary is a known way to ship a hole. Every page calls
`requirePermission()` itself; the file could be deleted and nothing would become
reachable.

`proxy.ts` — Next 16's replacement for middleware — is likewise not a gate. It
does two things: refresh the GoTrue access token when it is inside its
two-minute skew window, and turn "no credential at all" into a clean 307. It
imports nothing from `db.ts` or `auth.ts`, so the service-role key never enters
the edge bundle.

### CSRF

Two independent checks on every mutating Server Action.

1. **Same origin.** `assertSameOriginRequest()` compares the `Origin` header with
   `X-Forwarded-Host` or `Host`. A missing `Origin` is refused rather than
   allowed: every browser sends it on a POST, so its absence means a non-browser
   client or a stripped header, and neither should be disabling accounts. Next
   performs an equivalent check of its own; these two fail independently, so a
   framework upgrade that changed the default would not silently remove the
   protection.
2. **A synchronizer token.** `deriveCsrfToken()` is `sha256(sessionToken + ':csrf')`,
   rendered into the hidden `_csrf` field by `csrfField(session)` and compared
   with `constantTimeEqual()`. An attacker who cannot read the httpOnly session
   cookie cannot produce it, and a leaked form does not leak the session token,
   because SHA-256 does not run backwards. No extra secret, no extra cookie, no
   extra table.

Both are performed by `requirePermissionAction(requirement, formData)`. Passing
the `FormData` gets both; passing nothing still gets the same-origin check. That
signature is shaped so an action that forgets to call a separate `assertCsrf()`
is not a mistake anybody can make.

### Rate limits

All counted atomically in Postgres by `admin_enforce_rate_limit()`, keyed by
`sha256(scope + ':' + subject)` — never by the subject itself.

| Scope                    | Limit | Window     | Bucket                 |
| ------------------------ | ----- | ---------- | ---------------------- |
| `admin.sign_in`          | 8     | 15 minutes | address, and client IP |
| `support_access.request` | 20    | 1 hour     | admin                  |
| `support_access.reveal`  | 60    | 1 hour     | grant                  |
| `admin.export`           | 10    | 1 hour     | admin                  |
| `admin.destructive`      | 30    | 5 minutes  | admin                  |
| `admin.role_write`       | 30    | 1 hour     | admin                  |
| `admin.invite`           | 20    | 1 hour     | admin                  |

The attempt is counted whether or not it is allowed. Refusing to count refused
attempts would let an attacker stay under the cap forever by simply being wrong
every time.

---

## Response headers

`next.config.mjs` is deliberately stricter than the marketing site's, because a
backoffice URL can carry a user id:

`X-Content-Type-Options: nosniff` · `Referrer-Policy: no-referrer` ·
`X-Frame-Options: DENY` · `X-Robots-Tag: noindex, nofollow, noarchive` ·
`Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`
· a CSP with `default-src 'self'`, `connect-src 'self'`, `frame-ancestors 'none'`
and `form-action 'self'`.

`poweredByHeader` is off. None of this substitutes for the network boundary: the
console holds the service-role key, which bypasses RLS entirely, and belongs
behind whatever you would put a database console behind.

---

## Related documents

| Document                                             | What it covers                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| [BACKOFFICE_RBAC.md](BACKOFFICE_RBAC.md)             | The 7 roles and 36 permissions, cell by cell, and how a denial reads |
| [SUPPORT_ACCESS.md](SUPPORT_ACCESS.md)               | The one audited path to user content, and how to audit it afterwards |
| [BACKOFFICE_OPERATIONS.md](BACKOFFICE_OPERATIONS.md) | Environment variables, first run, routine work, incidents            |
| [SECURITY.md](SECURITY.md)                           | Token encryption, RLS, SSRF, and the platform threat model           |
| [DATA_MODEL.md](DATA_MODEL.md)                       | The product's own tables and their RLS model                         |
