# Admin console roles and permissions

Seven roles, thirty-six permissions, and one table that decides. This document is
derived from `supabase/migrations/0019_admin_platform.sql` and checked against it
on every CI run by `scripts/check-rbac-doc.mjs`; if the migration and the tables
below ever disagree, the build fails and names the cell. A matrix document that
quietly goes stale is worse than none, because people plan around it and
reviewers cite it.

For the mechanisms behind the console, see [BACKOFFICE.md](BACKOFFICE.md).

---

## What is authoritative

`public.admin_role_permissions` is the authority. It is a two-column table,
`delete`d and rebuilt in full every time `0019_admin_platform.sql` runs, so the
migration file is the single source of truth and a grant hand-inserted between
deploys does not survive one.

Two functions read it, both `security definer` and both granted to
`service_role` alone:

```sql
admin_permissions_for(p_admin_user_id uuid) returns setof admin_permission
admin_has_permission(p_admin_user_id uuid, p_permission admin_permission) returns boolean
```

Both join `admin_users` with `status = 'active' and disabled_at is null`. Deny by
default falls out of the function rather than out of a filter someone might
forget: a disabled admin has no permissions, not default permissions.

Three things are **not** authoritative, and it matters which is which:

| Where                                    | What it is                                                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/backoffice/src/lib/permissions.ts` | A reviewed mirror. `decideAccess()` grants the _intersection_ of it and the database's answer, so a row inserted outside a migration is inert until this file is changed and reviewed too. |
| `apps/backoffice/src/lib/nav.ts`         | Rendering only. It decides which sidebar entries to draw so the console does not offer a door it will slam. It is not the lock.                                                            |
| `admin_roles.rank`                       | Display order for a picker. Never an authorization comparison — see below.                                                                                                                 |

## The roles are not a hierarchy

The migration says it in a comment on the type, and it is worth repeating
because it is the single most common wrong assumption about a seven-role system:

> Deliberately NOT a hierarchy: finance is not a superset of support.
> Authorization is decided by `admin_role_permissions`, never by comparing two
> roles.

`support` can perform a Support Access reveal and `operations` cannot.
`operations` can approve a Support Access request and `support` cannot. `ai_ops`
can write and activate a prompt; `operations`, which sits above it in display
rank, can only read one. `analyst` and `finance` can export the audit log;
`operations` and `support` cannot. Nothing in the console compares two roles to
decide anything.

`admin_roles.rank` (10, 20, 30, 40, 50, 60, 100) orders a `<select>` least to
most privileged in the loose sense an operator expects, and orders nothing else.

---

## The roles

<!-- rbac-role-totals:start -->

| Role          | Permissions | Turkish label    | What it is for                                                            | The most dangerous thing it can do                                                                                                                                                                                                        |
| ------------- | ----------- | ---------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `super_admin` | 36          | `Süper Yönetici` | Owns the console. Invites administrators, changes roles, closes accounts. | Everything, but specifically `users.delete` and `admin.role.write`: it is the only role that can permanently delete a customer's account, and the only one that can change who else is an administrator — including granting super_admin. |
| `operations`  | 24          | `Operasyon`      | Runs the platform: provider health, integrations, flags, announcements.   | `integration.disconnect` — severs a live customer's mailbox connection — and `support.access.approve`, which turns somebody else's request into a live key to a named user's content.                                                     |
| `support`     | 14          | `Destek`         | The front line: tickets, sync health, requesting Support Access.          | `support.access.reveal` — it is the role that actually reads user content once a grant exists. It deliberately holds no `support.access.approve`, so it cannot open the door it walks through.                                            |
| `finance`     | 9           | `Finans`         | Subscriptions, refunds and reconciliation.                                | `billing.grant` — hands out entitlement days that cost real money and are indistinguishable from revenue if they are not kept in their own table. It also holds `audit.export`, which takes the trail off the platform.                   |
| `ai_ops`      | 11          | `Yapay Zeka Ops` | Prompt versions, model settings and quality monitoring.                   | `prompt.activate` — one row changes the prompt behind every model call for that feature, for every user, immediately. It also holds `flags.write`.                                                                                        |
| `analyst`     | 9           | `Analist`        | Metrics, reports and the audit trail. Changes nothing.                    | `audit.export`. It holds no write permission at all; its risk is exfiltration, not damage. The console additionally puts this role at redaction level `aggregate`, so it sees no per-person identifier.                                   |
| `readonly`    | 5           | `Salt Okunur`    | A new hire or an external auditor. The minimum useful view.               | Nothing. Five read permissions, no write, no export, no audit trail.                                                                                                                                                                      |

<!-- rbac-role-totals:end -->

The Turkish labels above are the ones seeded into `admin_roles.label_tr`, which
is what `loadAssignableRoles()` renders in the invite and role-change pickers.
`ROLE_LABELS_TR` in `permissions.ts` is a separate constant used elsewhere in the
console; it agrees with the seed for six of the seven roles and renders `ai_ops`
as `Yapay Zekâ Operasyonları`.

`analyst` deserves one more sentence. The matrix gives it `users.read`, because
an analyst needs the user table to compute cohorts. Section 7 of the
specification also says an analyst sees aggregated analytics only. Both are true
at once: `baseRedactionLevel()` in `redact.ts` returns `aggregate` for `analyst`
and `metadata` for every other role, so `redactEmailFor()` and `userRefFor()`
return `null` — an analyst may read the rows and may not read the identifiers in
them. `readonly` is `metadata`, because a new hire still needs to tell which row
they are looking at.

Retiring a role: Postgres cannot drop an enum member, so
`admin_roles.is_assignable` is how a role is decommissioned. Setting it false
removes the role from the invite and role-change pickers without touching the
administrators already on it. It is advisory by design — there is no constraint
behind it, and `lib/actions/admins.ts` is its only enforcement.

---

## The matrix

Every cell below is `(role, permission)` as
`supabase/migrations/0019_admin_platform.sql` seeds it. `✓` means the pair is in
`admin_role_permissions`; `·` means it is not. Rows are the 36 members of
`admin_permission` in declaration order; columns are the 7 members of
`admin_role` in declaration order.

`super_admin` is not listed row by row in the migration. It is populated from
`unnest(enum_range(null::admin_permission))`, so a permission added to the enum
later belongs to it without anybody editing a list — which is also why the
`super_admin` column below is solid.

<!-- rbac-matrix:start -->

| Permission               | super_admin | operations | support | finance | ai_ops | analyst | readonly |
| ------------------------ | ----------- | ---------- | ------- | ------- | ------ | ------- | -------- |
| `users.read`             | ✓           | ✓          | ✓       | ✓       | ✓      | ✓       | ✓        |
| `users.export`           | ✓           | ·          | ·       | ·       | ·      | ·       | ·        |
| `users.disable`          | ✓           | ✓          | ·       | ·       | ·      | ·       | ·        |
| `users.delete`           | ✓           | ·          | ·       | ·       | ·      | ·       | ·        |
| `support.ticket.read`    | ✓           | ✓          | ✓       | ✓       | ·      | ✓       | ✓        |
| `support.ticket.write`   | ✓           | ✓          | ✓       | ·       | ·      | ·       | ·        |
| `support.ticket.assign`  | ✓           | ✓          | ✓       | ·       | ·      | ·       | ·        |
| `support.access.request` | ✓           | ✓          | ✓       | ·       | ·      | ·       | ·        |
| `support.access.approve` | ✓           | ✓          | ·       | ·       | ·      | ·       | ·        |
| `support.access.reveal`  | ✓           | ·          | ✓       | ·       | ·      | ·       | ·        |
| `integration.read`       | ✓           | ✓          | ✓       | ·       | ·      | ·       | ·        |
| `integration.resync`     | ✓           | ✓          | ✓       | ·       | ·      | ·       | ·        |
| `integration.disconnect` | ✓           | ✓          | ·       | ·       | ·      | ·       | ·        |
| `billing.read`           | ✓           | ✓          | ✓       | ✓       | ·      | ✓       | ·        |
| `billing.grant`          | ✓           | ·          | ·       | ✓       | ·      | ·       | ·        |
| `billing.revoke`         | ✓           | ·          | ·       | ✓       | ·      | ·       | ·        |
| `flags.read`             | ✓           | ✓          | ✓       | ·       | ✓      | ·       | ✓        |
| `flags.write`            | ✓           | ✓          | ·       | ·       | ✓      | ·       | ·        |
| `announcement.read`      | ✓           | ✓          | ✓       | ·       | ·      | ·       | ✓        |
| `announcement.write`     | ✓           | ✓          | ·       | ·       | ·      | ·       | ·        |
| `prompt.read`            | ✓           | ✓          | ·       | ·       | ✓      | ✓       | ·        |
| `prompt.write`           | ✓           | ·          | ·       | ·       | ✓      | ·       | ·        |
| `prompt.activate`        | ✓           | ·          | ·       | ·       | ✓      | ·       | ·        |
| `ai.read`                | ✓           | ✓          | ·       | ·       | ✓      | ✓       | ·        |
| `ai.configure`           | ✓           | ·          | ·       | ·       | ✓      | ·       | ·        |
| `analytics.read`         | ✓           | ✓          | ·       | ✓       | ✓      | ✓       | ·        |
| `audit.read`             | ✓           | ✓          | ✓       | ✓       | ✓      | ✓       | ·        |
| `audit.export`           | ✓           | ·          | ·       | ✓       | ·      | ✓       | ·        |
| `privacy.read`           | ✓           | ✓          | ✓       | ·       | ·      | ·       | ·        |
| `privacy.process`        | ✓           | ✓          | ·       | ·       | ·      | ·       | ·        |
| `admin.read`             | ✓           | ✓          | ·       | ·       | ·      | ·       | ·        |
| `admin.invite`           | ✓           | ·          | ·       | ·       | ·      | ·       | ·        |
| `admin.role.write`       | ✓           | ·          | ·       | ·       | ·      | ·       | ·        |
| `admin.disable`          | ✓           | ·          | ·       | ·       | ·      | ·       | ·        |
| `system.health.read`     | ✓           | ✓          | ✓       | ✓       | ✓      | ✓       | ✓        |
| `system.config.read`     | ✓           | ✓          | ·       | ·       | ·      | ·       | ·        |

<!-- rbac-matrix:end -->

### What each permission means

| Permission               | Turkish label (`PERMISSION_LABELS_TR`)    | Scope                                                                    |
| ------------------------ | ----------------------------------------- | ------------------------------------------------------------------------ |
| `users.read`             | Kullanıcı kayıtlarını görüntüleme         | Read `bo_users` / `bo_user_detail`: counts, states, timestamps, `y•••@…` |
| `users.export`           | Kullanıcı verisi dışa aktarma             | Generate a user data export                                              |
| `users.disable`          | Kullanıcı hesabı askıya alma              | Suspend a customer account                                               |
| `users.delete`           | Kullanıcı hesabı silme                    | Delete a customer account                                                |
| `support.ticket.read`    | Destek taleplerini görüntüleme            | The support queue and one ticket                                         |
| `support.ticket.write`   | Destek talebi yazma ve güncelleme         | Status, priority, notes, resolution                                      |
| `support.ticket.assign`  | Destek talebi atama                       | Assign a ticket to an administrator                                      |
| `support.access.request` | Destek Erişimi talep etme                 | Open a Support Access request. Grants nothing on its own                 |
| `support.access.approve` | Destek Erişimi onaylama                   | Approve, deny or revoke somebody else's request                          |
| `support.access.reveal`  | Destek Erişimi ile içerik görüntüleme     | Call a `sa_reveal_*` function under a live grant                         |
| `integration.read`       | Entegrasyon durumunu görüntüleme          | Connection and sync state                                                |
| `integration.resync`     | Yeniden senkronizasyon tetikleme          | Force a resync; also what "may act on the platform" means in the bridge  |
| `integration.disconnect` | Entegrasyon bağlantısını kesme            | Sever a connected account                                                |
| `billing.read`           | Abonelik ve gelir kayıtlarını görüntüleme | Subscriptions, grants, reconciliation                                    |
| `billing.grant`          | Geçici Pro tanımlama                      | Write `admin_entitlement_grants`                                         |
| `billing.revoke`         | Geçici Pro geri alma                      | Revoke one                                                               |
| `flags.read`             | Özellik bayraklarını görüntüleme          | Flags and their per-user overrides                                       |
| `flags.write`            | Özellik bayraklarını değiştirme           | Edit a flag, set or remove an override, throw a kill switch              |
| `announcement.read`      | Duyuruları görüntüleme                    | In-app announcements                                                     |
| `announcement.write`     | Duyuru yazma ve yayınlama                 | Write and publish one                                                    |
| `prompt.read`            | Prompt sürümlerini görüntüleme            | Prompt versions and their attributed cost                                |
| `prompt.write`           | Prompt sürümü yazma                       | Create or edit a draft                                                   |
| `prompt.activate`        | Prompt sürümü etkinleştirme               | Make a version live for a feature                                        |
| `ai.read`                | Yapay zekâ kullanımını görüntüleme        | Model spend, token consumption, quality                                  |
| `ai.configure`           | Yapay zekâ model ayarlarını değiştirme    | Change model settings                                                    |
| `analytics.read`         | Analitik raporları görüntüleme            | Aggregated platform metrics                                              |
| `audit.read`             | Denetim kaydını görüntüleme               | `bo_audit`                                                               |
| `audit.export`           | Denetim kaydını dışa aktarma              | Take the trail off the platform                                          |
| `privacy.read`           | Gizlilik taleplerini görüntüleme          | Export and deletion requests                                             |
| `privacy.process`        | Gizlilik taleplerini işleme               | Reissue an export, retry a deletion                                      |
| `admin.read`             | Yönetici listesini görüntüleme            | The roster, the invites, the sessions, the role matrix page              |
| `admin.invite`           | Yönetici davet etme                       | Issue and revoke console invitations                                     |
| `admin.role.write`       | Yönetici rolü değiştirme                  | Change another administrator's role                                      |
| `admin.disable`          | Yönetici hesabı kapatma                   | Close or reopen an administrator account, evict its sessions             |
| `system.health.read`     | Sistem sağlığını görüntüleme              | The health page. The one permission all seven roles hold                 |
| `system.config.read`     | Sistem yapılandırmasını görüntüleme       | Which secrets are configured. Never a value                              |

`system.health.read` is universal on purpose: a console where an analyst cannot
see whether the platform is up is a console that generates support tickets of its
own.

### Permissions with no console screen yet

The enum is the specification's vocabulary, and some of it is ahead of the
console. As the routes stand today, no page or Server Action performs
`users.export`, `users.delete`, `integration.disconnect`, `privacy.process`,
`ai.configure` or `audit.export`. Holding one of those permissions therefore
grants a capability the interface does not yet offer — it does not grant a
hidden one.

`support.access.reveal` is no longer among them.
`/support/access/[grantId]/reveal` calls the eight `sa_reveal_*` functions
through the wrappers in `lib/db.ts`, one record at a time, and every call writes
its own `support_access_reveals` row and its own `support_access.revealed` audit
row; see [SUPPORT_ACCESS.md](SUPPORT_ACCESS.md#the-procedure).

---

## How a permission is checked at runtime

Four checks, in this order, and none of them is the sidebar.

### 1. The page

Every protected Server Component opens with `requirePermission(...)`, which takes
a `PermissionRequirement`: a single permission, `{ anyOf: [...] }` for a page two
different roles reach for different reasons, or `{ allOf: [...] }` for something
that genuinely needs two capabilities at once. There is no default and no
"public" mode, so a page that names no permission does not compile.

An empty `anyOf` or `allOf` is unsatisfiable rather than trivially true: an empty
list is a caller bug, and the safe reading of a bug in an authorization check is
"no".

### 2. `decideAccess()`

`requirePermission()` resolves the session and hands five facts to a pure
function in `permissions.ts`:

```ts
if (subject === null) return { allowed: false, reason: 'no_session' }
if (!subject.sessionLive) return { allowed: false, reason: 'session_expired' }
if (subject.status === 'disabled') return { allowed: false, reason: 'admin_disabled' }
if (subject.status !== 'active') return { allowed: false, reason: 'not_admin' }
if (!subject.assuranceMet) return { allowed: false, reason: 'mfa_required' }
if (!satisfiesRequirement(subject.permissions, requirement)) {
  return { allowed: false, reason: 'permission_denied' }
}
return { allowed: true }
```

There is no code path through it that returns `allowed: true` without a live
session, an active status, a satisfied MFA policy and a permission the subject
actually holds. Because it is pure — no client, no cookies, no clock, no I/O —
`__tests__/permissions.test.ts` enumerates the whole matrix role by role rather
than asserting on a handful of examples.

The permission set it is given comes from `bo_admin_permissions` (the view over
`admin_role_permissions`, with the same `status = 'active' and disabled_at is
null` filter the function applies), passed through `toPermissionSet()`, which
discards anything that is not a member of `admin_permission` and then intersects
the rest with the role's entry in `ROLE_PERMISSIONS`.

### 3. The Server Action

`requirePermissionAction(requirement, formData)` performs the same decision plus
the two CSRF checks, and throws a typed error instead of redirecting — an action
cannot redirect a client mid-POST as cleanly as a page can, and the form needs
something to render.

Then `runAdminAction` asks the database again, through
`admin_has_permission()`, at the moment of acting. A refusal there is audited
with `outcome: 'failure'` and `detail.denied_permission`. So a hidden button
stops nobody who can post a form, and reaching for something you may not do
leaves a record naming the account you aimed it at.

### 4. `assertPermissionAtSource()`

For the decisions with the least undo — approving somebody's access to a
stranger's mailbox, denying it, revoking it, and starting a health probe — the
question is asked a further time directly against `admin_has_permission()`, which
is `security definer` and re-reads `admin_users.status` itself. A role changed or
an account disabled while the page was open takes effect on that click rather
than at the operator's next page load.

### The sidebar is not any of these

`navGroupsFor(permissions)` filters the eight groups down to the entries a viewer
may open, and drops a group whose every entry was filtered out — a heading over
nothing is a promise the console does not keep. That is about not offering a door
that will be slammed. Typing the same route straight into the address bar gets
the same refusal from `requirePermission()`.

---

## What a denial looks like

### To an operator

`refuse()` in `auth.ts` splits the six denial reasons in two.
`isRecoverableBySigningIn()` is true for `no_session`, `session_expired` and
`mfa_required`, and those redirect to `/sign-in`. The other three —
`not_admin`, `admin_disabled`, `permission_denied` — redirect to `/forbidden`,
because signing in again would not help.

The Turkish sentence per reason, from `DENIAL_MESSAGES_TR`:

| Reason              | Message                                                     |
| ------------------- | ----------------------------------------------------------- |
| `no_session`        | `Oturum bulunamadı. Lütfen tekrar giriş yapın.`             |
| `session_expired`   | `Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.`     |
| `not_admin`         | `Bu hesabın yönetim konsolunda yetkisi yok.`                |
| `admin_disabled`    | `Yönetici hesabınız kapatılmış.`                            |
| `mfa_required`      | `İki adımlı doğrulama tamamlanmadan bu konsola erişilemez.` |
| `permission_denied` | `Bu sayfa için gereken yetkiye sahip değilsiniz.`           |

`describeRequirement()` turns a requirement into the Turkish names of the
permissions it wanted, joined with `veya` for `anyOf` and `ve` for `allOf`.

The `/forbidden` page renders a `403` kicker, the heading `Yetkin yok`, the
account the operator is signed in as — so they can tell they are on the wrong one
— and two actions: sign out, or go back.

**A discrepancy to be aware of.** `refuse()` builds
`/forbidden?reason=<reason>&needed=<permissions>`, but `app/forbidden/page.tsx`
reads the Turkish parameter names `neden` and `gerekli`, which are what the
console's first pass sent. The page therefore falls back to the generic body
(`Hesabın geçerli ama backoffice erişimi tanımlı değil…`) and never renders
`denialMessage()` or the permission name, even though both are on the URL. The
refusal itself is correct and complete; only its explanation is generic. The fix
is to read `reason` and `needed` in that page.

### To a Server Action

`refuseAction()` throws an `AppError` — `unauthorized` with status 401 for a
recoverable reason, `forbidden` with 403 otherwise — carrying
`"<reason>: <permissions>"` as its detail. Forms surface a Turkish message; the
detail is for the log.

### To the audit trail

A denial inside `runAdminAction` is a real row in `audit_logs`:

| Column                       | Value                                                      |
| ---------------------------- | ---------------------------------------------------------- |
| `action`                     | The action that was attempted                              |
| `actor_admin_user_id`        | The operator who attempted it                              |
| `actor_role`                 | Resolved by `admin_write_audit()`                          |
| `reason`                     | `Yetki reddedildi: <permission>`, plus whatever they typed |
| `is_sensitive`               | `true`                                                     |
| `metadata.outcome`           | `failure`                                                  |
| `metadata.denied_permission` | The permission that was missing                            |

Read it back through `bo_audit`, where those land as `admin_reason`,
`actor_admin_user_id`, `admin_role`, `is_sensitive` and `outcome`.

---

## Reading the matrix from the running system

`/system/roles` renders the matrix as the database currently holds it, not as
this document describes it. It reads `bo_admin_permissions`, one representative
active administrator per role, because the console's query surface has no path to
`admin_role_permissions` itself — `db.ts` exposes the `bo_*` views and the
operator-owned tables, and that table is neither.

A role nobody active holds has no rows in that view, and the page reports it as
unreadable rather than filling the gap from a TypeScript constant. An honest `?`
is worth more than a confident tick nobody checked.

The page also draws the console's own mirror beside the database's answer and
counts the disagreements, because `decideAccess()` acts on the intersection and a
matrix page showing only one of the two sets would be hiding the difference.

It needs `admin.read`, and it has no control on it: the matrix is changed by a
reviewed migration and nothing else. A button there would be a lie about where
authorization lives.

---

## Changing the matrix

1. Edit the `insert into public.admin_role_permissions` seed in
   `supabase/migrations/0019_admin_platform.sql`. Adding a permission means
   adding it to the `admin_permission` enum in the same file, in the position the
   TypeScript unions expect.
2. Mirror it in `apps/backoffice/src/lib/permissions.ts` — `ADMIN_PERMISSIONS`
   and the role's constant. Until you do, `decideAccess()` intersects the new
   grant away and it does nothing.
3. Mirror it in `apps/backoffice/src/lib/db.ts` (`ADMIN_PERMISSIONS`), which
   carries its own copy of the vocabulary.
4. Update the two tables in this document.
5. Run the gates:

```bash
pnpm run verify:rbac-doc   # this document against the migration
pnpm run test              # permission-matrix.test.ts: TypeScript against the migration
pnpm run verify:supabase   # the schema, applied and probed
```

`apps/backoffice/src/lib/__tests__/permission-matrix.test.ts` parses the same
migration and fails if the mirror and the seed disagree by a single row — in
either direction — and also checks the enum member order, the display ranks and
the sensitive-action seed. `scripts/check-rbac-doc.mjs` does the same for the
tables above, cell by cell, and additionally checks the stated per-role totals
and the permission count in the prose. Between them, the migration, the console
and this document cannot drift apart.
