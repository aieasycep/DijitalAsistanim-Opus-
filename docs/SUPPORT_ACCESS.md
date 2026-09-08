# Support Access

Support Access is the only way anybody at this company can see a user's own
words. Everywhere else the admin console is blind by construction: the `bo_*`
views have no content column to project, so there is nothing to withhold and
nothing to log. This is the exception, and it is deliberately narrow, written
down, approved by a second person, time-boxed, and recorded record by record.

This page is the procedure. It is written for the person following it at 02:00
with a customer on the phone, so it is ordered the way the work happens. The
mechanism behind it is [BACKOFFICE.md](BACKOFFICE.md); the permissions are
[BACKOFFICE_RBAC.md](BACKOFFICE_RBAC.md).

---

## Before you start: you probably do not need it

The console shows all of this without a grant, without a reason and without a
log entry, because none of it is content:

connected accounts and their status · last sync time and the error code if it
failed · number of sync errors · emails processed, in total and in the last 30
days · threads unread, action-required, suppressed · calendar events · assistant
threads and message counts · approvals pending, executed and failed · briefings
ready and failed in 30 days · notifications sent and failed in 30 days · captures
and capture failures · retention window, history days, briefing time, "notify
only if important", lock-screen privacy · AI cost and event counts · device count
and platforms.

The request form puts that table on screen above the scope checkboxes for this
exact reason, under the heading **"Erişim olmadan hâlihazırda görebildikleriniz"**,
and closes with:

> Bağlantı durumu, son senkronizasyon zamanı, işlenen ve başarısız kayıt
> sayıları Destek Erişimi olmadan da görülebilir. Soru bunlarla
> yanıtlanabiliyorsa bu talebi açmayın.

"Connection healthy, last sync 10:42, 743 emails processed, 2 failed" answers
most support questions. If it answers yours, stop here.

## When it is legitimate

- A user has reported a concrete failure, the operational counters do not explain
  it, and a specific record has to be inspected to reproduce it — a briefing that
  came out empty, an approval whose payload will not execute, a notification that
  never arrived.
- A user has asked, in a ticket you can reference, for someone to look at
  something on their behalf.
- A legal or regulatory obligation names a specific record.

In every one of those the request names **one** user, the **narrowest** scope
that answers the question, and the **shortest** window that fits the work.
`SCOPE_SENSITIVITY_ORDER` in `lib/redact.ts` orders the checkboxes least- to
most-revealing precisely so the cheapest sufficient scope is the first one you
see: most "I can't see my mail" tickets are answered by `email_subject` and never
need `email_body`.

## When it is not

- Curiosity, however professional the framing.
- "Checking whether the feature works" — that is a test account's job.
- Building a dataset, sampling for quality, or looking at "a few examples".
- A colleague asking you to look on their behalf. They request under their own
  name; a grant belongs to one administrator and cannot be handed over.
- Anything you cannot write down in a sentence an auditor could weigh in six
  months. The 20-character floor is not a formatting rule; it is the test.

There is no impersonation, no "sign in as user", and no scope that returns a
credential. The eight scopes each map to exactly one function that reads exactly
one kind of record for exactly one user.

---

## The scopes

Eight members of `support_access_scope`, each with exactly one `sa_reveal_*`
function and no other route: a scope with no function unlocks nothing, and a
function with no scope cannot be called.

| Scope                    | Turkish label               | What it actually shows                                                  | Function                     |
| ------------------------ | --------------------------- | ----------------------------------------------------------------------- | ---------------------------- |
| `identity`               | Kimlik bilgileri            | Name, email address, given name, locale, time zone, created date        | `sa_reveal_identity`         |
| `email_subject`          | E-posta konu başlıkları     | Thread subjects and summaries, category, importance, counts — no bodies | `sa_reveal_email_subjects`   |
| `notification_content`   | Bildirim içeriği            | One notification's title and body, and its send/fail times              | `sa_reveal_notification`     |
| `approval_payload`       | Onay içeriği                | One pending action's what/why/payload, and the pre-edit original        | `sa_reveal_approval`         |
| `calendar_detail`        | Takvim etkinlik ayrıntıları | Event title, description, location, organiser, times, in a date range   | `sa_reveal_calendar_events`  |
| `capture_content`        | Yakalanan içerik            | One capture's raw text, extracted fields, source URL, storage path      | `sa_reveal_capture`          |
| `assistant_conversation` | Asistan konuşmaları         | Every message in one assistant thread, both sides                       | `sa_reveal_assistant_thread` |
| `email_body`             | E-posta içeriği             | One message in full: sender, recipients, subject, snippet, body text    | `sa_reveal_email_message`    |

The order above is `SCOPE_SENSITIVITY_ORDER`, not the enum's declaration order.
Tick the highest row that answers the question and stop.

---

## The procedure

### 1. Write the reason

The floor is **20 characters**, and it is a database constraint
(`support_access_grants_reason_is_written`,
`check (length(btrim(reason)) >= 20)`), not a form validation somebody can relax.
The console's ceiling is 500. The form says what the sentence is for:

> En az 20 karakter. Bu cümleyi altı ay sonra bir denetçi okuyacak: neyi, neden
> görmen gerektiğini yaz.

A reason that would pass the length check and fail the purpose — "kontrol",
"bakıyorum", "destek" — is exactly what the four-eyes step exists to catch. The
form's own placeholder is the shape to copy:

> Örn. DA-001042 numaralı talepte kullanıcı, brifingin boş geldiğini bildirdi;
> konu başlıklarının senkronize olup olmadığını doğrulamam gerekiyor.

The reason is immutable once written, is shown to the approver, is kept for the
life of the grant, and is quoted beside every reveal in
`bo_support_access_reveals.grant_reason`.

### 2. Open the request

`/support/access/new`, which needs `support.access.request` — held by
`super_admin`, `operations` and `support`.

| Field             | Rule                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| Kullanıcı kimliği | The subject's UUID. The console does not search users by address; copy the id from the user list.            |
| Kapsamlar         | At least one. `assertScopes()` de-duplicates and re-orders to the enum's own order so stored arrays compare. |
| Gerekçe           | ≥ 20 characters, ≤ 500.                                                                                      |
| Destek talebi     | Optional. A ticket reference such as `DA-001042`, verified against `support_tickets` before the insert.      |
| Süre              | 15 min, 30 min, 1 h, 2 h, 4 h, 8 h or 24 h. Default 1 hour.                                                  |

The window ceiling is a constraint too — `support_access_grants_window_is_short`,
`check (expires_at <= requested_at + interval '24 hours')` — so a form that sent
48 hours would be refused by Postgres, not merely by the picker. The form says
so: _"Veritabanı 24 saatten uzun bir pencereyi kabul etmez. En kısa yeterli
süreyi seçin."_

The row lands as `pending_approval`. It opens nothing:

> Bu form yalnızca talebi açar; hiçbir şeyi açmaz.

Rate limit: 20 requests per administrator per hour (`support_access.request`).

An `audit_logs` row is written immediately — `support_access.requested`, naming
you, the subject, the grant id, your reason and the scope count.

### 3. A second administrator approves

`support.access.approve` is held by `super_admin` and `operations`, and
deliberately **not** by `support`. The role that performs reveals is not the role
that authorises them.

Four eyes is enforced three times over:

1. `support_access_grants_four_eyes` —
   `check (approved_by is null or approved_by <> admin_user_id)`. A self-approval
   cannot exist as a row.
2. `approveSupportAccess()` refuses `grant.adminUserId === session.adminUserId`
   with a readable Turkish error rather than a constraint violation.
3. `assertPermissionAtSource()` re-asks `admin_has_permission()` at the moment of
   the click, so an approver whose role changed while the page was open is
   refused on this click rather than at their next page load.

On approval the window is **re-based on the approval**, so a request that waited
an hour for a reviewer does not arrive with most of its time already spent —
clamped, as the constraint insists, to 24 hours after the original request. The
row moves to `active` with `approved_by`, `approved_at`, `granted_at` and the
recomputed `expires_at`.

A second live grant for the same (administrator, subject) pair is refused:
`support_access_grants_one_active` is a partial unique index, so "who could see
this account, and when" has one answer rather than a set. The console says so
before the index does, with the remedy rather than a constraint name.

Denial is a first-class outcome: `denySupportAccess()` needs a reason of its own
(≥ 3 characters), moves the row to `denied` with `denied_by`, `denied_at` and
`denied_reason`, and writes a `support_access.denied` audit row. The request row
stays forever. A refusal is evidence too.

### 4. What the requester sees

Until approval, on `/support/access/[grantId]`:

> Henüz hiçbir şey açılmadı. Talebi açan yöneticiden başka bir yönetici
> onaylayana kadar bu izinle tek bir kayıt bile görüntülenemez.

Once active:

> Bu izin şu anda kullanılabilir durumda. Talep eden yönetici, kapsamdaki içeriği
> süre dolana kadar görüntüleyebilir ve her görüntüleme tek tek kaydedilir.

The request form states the consequences before anything is ticked, because an
operator who does not understand what they are asking for cannot write a reason a
reviewer can weigh:

- Seçtiğiniz kapsamlardaki kayıtları, yalnızca bu tek kullanıcı için ve yalnızca
  seçtiğiniz süre boyunca görüntüleyebilirsiniz.
- Açtığınız her kayıt tek tek kaydedilir: hangi kayıt, ne zaman, hangi
  gerekçeyle. Bu kayıtlar sizin adınıza yazılır ve silinemez.
- Bu izin size ait olur; başka bir yöneticiye devredilemez ve kullanıcı adına
  işlem yapma yetkisi vermez.
- Süre dolduğunda erişim kendiliğinden kapanır. Onaylayan yönetici veya siz,
  süre dolmadan da geri alabilirsiniz.

The detail page shows a live countdown (`grantMinutesRemaining()`, rendered as
`43 dakika` / `2 saat 5 dakika`), the reveal count per scope — including zero for
a scope that was asked for and never spent — the full reveal log, and the
decision trail from `bo_audit`.

### 5. Every reveal is logged, by the same statement that returns the data

A reveal is one `sa_reveal_*` call. Before it returns anything, `sa_assert_grant()`
proves six things:

1. the grant exists;
2. it belongs to **this** administrator;
3. it is `active` and unrevoked;
4. it has started (`granted_at <= now()`) and has not lapsed (`expires_at > now()`);
5. the scope being read is in its list;
6. the administrator's account is still `active`, not disabled, and their role
   still carries `support.access.reveal`.

Then `sa_log_reveal()` writes one `support_access_reveals` row **inside the same
call**. A `before insert` trigger on that table re-checks the grant independently,
so even a direct service-role `INSERT` cannot record a reveal it was not entitled
to, and the same trigger increments `support_access_grants.reveal_count`.

Per reveal, the log holds:

| Column            | What it is                                                  |
| ----------------- | ----------------------------------------------------------- |
| `grant_id`        | Which grant was spent                                       |
| `admin_user_id`   | Who looked                                                  |
| `subject_user_id` | Whose data                                                  |
| `scope`           | Which of the eight                                          |
| `entity_type`     | What kind of record — `profile`, `email_message`, `capture` |
| `entity_id`       | Which record, through `bo_identifier()`                     |
| `item_count`      | How many records that one call opened                       |
| `request_id`      | Correlates the audit row, the reveal row and the render     |
| `revealed_at`     | When                                                        |

It never holds what was shown. `entity_id`, `entity_type` and `request_id` all
pass through `bo_identifier()` on the way in, so a caller cannot smuggle a subject
line into the log while pretending it is an identifier.

Alongside it, `runAdminAction` writes an `audit_logs` row — `support_access.revealed`,
carrying `support_access_grant_id`, the scope, the item count and the request id
— after the call returns, so a refusal inside Postgres does not leave an audit
row claiming a reveal that never happened. Its written justification is the
grant's own reason, which is the sentence a second administrator already weighed
and is what `bo_support_access_reveals` quotes back as `grant_reason`.

Rate limit: 60 reveals per grant per hour (`support_access.reveal`). The grant is
already scoped, approved and time-limited; this is what stops one legitimate
grant being used to walk an entire mailbox message by message inside its window.

### 6. It ends

- **By expiry.** `expires_at` passes and no reveal succeeds, whatever the stored
  status says — every guard checks the timestamps, not the column.
- **By revocation.** Available to the approver _and_ to the holder: an operator
  who no longer needs the access should be able to hand it back without asking,
  and a reviewer who does not like what they see should be able to take it away.
  Needs a written reason (≥ 3 characters); writes `support_access.revoked`.
- **Never by deletion.** A grant is the evidence that somebody was allowed to
  look, and it has to outlive the looking. `admin_cleanup_expired()` moves lapsed
  grants to `expired`; it deletes neither grants nor reveals.

### Where the reveal actually happens

`/support/access/[grantId]/reveal`, which needs `support.access.reveal` — held
by `super_admin` and `support`, and deliberately not by `operations`: the role
that authorises a grant does not spend one.

The screen is reached from the grant record, and the link is drawn only for an
operator who could actually use it — the holder, with the permission, while the
timestamps still say the grant is live. It opens nothing by itself. What it
shows before anything is revealed is the grant, the operator's own written
reason, the countdown, how many records they have already opened under this
grant and the log of which ones; none of that is content, and all of it comes
from the two `bo_*` views.

The scope picker lists only the scopes **this** grant carries. That list is
derived from `evaluateReveal()` in `lib/redact.ts` — the same guard the reveal
path passes through — asked once per scope while the page renders, so a scope
outside the grant is never offered as a control that would then be refused. A
scope typed into the URL is refused the same way, with the sentence that a
grant's scopes are never widened.

Choosing a scope draws one form, whose shape follows the function's own
signature: nothing for `identity`, one record id for the five single-record
scopes, a listing size for `email_subject`, a date range for `calendar_detail`.
Submitting it performs exactly one `sa_reveal_*` call through the wrapper in
`lib/db.ts`, inside `runAdminAction`, which applies the rate limit, re-asks
`admin_has_permission()` and writes the `support_access.revealed` audit row on
the success path and on the failure path both.

The Server Action checks none of the six things `sa_assert_grant()` checks. It
makes the call and renders whatever comes back: each of the six `P0001` hints
maps to one Turkish sentence, and a raw Postgres message never reaches a screen.
A reveal that returned no rows still happened and still logged — the screen says
so rather than implying nothing was spent.

Two bounds on that screen are the console's own rather than the database's. A
listing is capped at 200 subjects, which mirrors what `sa_reveal_email_subjects`
already does to `p_limit`; a calendar range is capped at 31 days, which mirrors
nothing — the function accepts any range, and one call over five years would
open five years of somebody's diary as a single logged reveal.

---

## What the user is entitled to know

The product's public promise is that nobody reads their mail. Support Access is
the bounded exception to that, so the honest position is:

- **They may ask, and they get a truthful answer.** Every access to their content
  is recorded per record with the administrator's identity, the scope, the
  timestamp and the written reason. The queries below produce that answer for one
  `subject_user_id` in a single statement. There is no path to their content that
  does not appear there.
- **They are told what the console can see without a grant**, which is
  operational metadata: counts, states, timestamps and a redacted address. No
  message, no event title, no conversation.
- **They are told the accurate encryption claim, and no more.** _Veriler aktarım
  sırasında ve saklanırken şifrelenir._ The architecture is not end-to-end
  encrypted; the server decrypts and analyses their mail, because that is the
  product, and an operator with an approved grant can read it. Saying anything
  stronger would be false.
- **Consent is recorded when it exists, and is not pretended when it does not.**
  `support_access_grants.user_consent_ref` and `user_consent_at` hold a reference
  to the artefact in which the user agreed — the ticket message, a signed
  consent. `recordUserConsent()` writes them. Nothing in the reveal path is
  unlocked by consent and nothing is blocked by its absence: it is a fact added
  to the record, not a control. A grant without it is not a grant the user
  agreed to, and the detail page renders `Kayıtlı değil` rather than leaving the
  field blank.
- **Notification is a policy question this repository does not decide.** There is
  no automated message to a user when a grant is approved. If your obligations
  require one, it is sent out of band, and the grant's `ticket_id` is where the
  correspondence belongs.

For the wider picture the user is entitled to, see
[PRIVACY_DATA_FLOW.md](PRIVACY_DATA_FLOW.md).

---

## Auditing after the fact

All of these run against the Supabase project as the service role. The `bo_*`
views are the safe surface — addresses are already redacted and identifiers
already guarded — so prefer them over the base tables.

### Everything ever done to one user

```sql
select revealed_at, admin_email_redacted, admin_role, scope,
       entity_type, entity_id, item_count, grant_reason
from public.bo_support_access_reveals
where subject_user_id = '<uuid>'
order by revealed_at desc;
```

This is the answer to "has anyone read my mail". An empty result means nobody
has, because there is no other route: the reveal functions are the only
`security definer` readers of those columns, they are granted to `service_role`
alone, and every one writes its own row.

### Every grant ever issued over one user

```sql
select grant_id, requested_at, admin_email_redacted, admin_role, status,
       scopes, window_minutes, reason,
       approved_by_admin_user_id, approved_at, granted_at, expires_at,
       revoked_at, reveal_count, last_reveal_at, has_recorded_consent
from public.bo_support_access_grants
where subject_user_id = '<uuid>'
order by requested_at desc;
```

`reveal_count` is the sum of `item_count` — records opened, not calls made. The
detail page labels it `Açılan kayıt` for that reason, and shows the call count
separately so the two numbers do not look like one count disagreeing with itself.

### Grants that are live right now

```sql
select grant_id, admin_email_redacted, subject_user_id, scopes,
       minutes_remaining, reveal_count, reason
from public.bo_support_access_grants
where is_live
order by expires_at;
```

`is_live` is computed from the timestamps in the view, not from `status`, so a
grant that lapsed before the sweep ran does not appear.

### Grants with a high reveal count against a narrow reason

The review that matters most. A grant asked for on one ticket and spent sixty
times is the shape of a mailbox being walked.

```sql
select grant_id, admin_email_redacted, subject_user_id, scopes,
       reveal_count, window_minutes, requested_at, reason
from public.bo_support_access_grants
where reveal_count > 20
order by reveal_count desc;
```

### Reveals per administrator over a period

```sql
select admin_email_redacted, admin_role, scope,
       count(*) as calls, sum(item_count) as records
from public.bo_support_access_reveals
where revealed_at >= now() - interval '30 days'
group by 1, 2, 3
order by records desc;
```

### The full decision trail for one grant

The denial and revocation reasons are on the audit rows rather than repeated on
the grant, so this is where "why was it refused" lives.

```sql
select created_at, action, actor_admin_user_id, admin_role,
       outcome, admin_reason, entity_type, entity_id
from public.bo_audit
where support_access_grant_id = '<grant uuid>'
order by created_at;
```

Expect `support_access.requested`, then one of `support_access.approved` /
`support_access.denied`, then zero or more `support_access.revealed`, and
possibly `support_access.revoked`.

### Every Support Access action, whoever took it

```sql
select created_at, action, actor_admin_user_id, admin_role, subject_user_id,
       outcome, admin_reason, support_access_grant_id
from public.bo_audit
where action like 'support_access.%'
order by created_at desc
limit 200;
```

### Self-approval, and other things that should return nothing

Run these as assertions. A non-empty result is an incident.

```sql
-- A grant approved by its own requester. The four-eyes constraint forbids it.
select id from public.support_access_grants where approved_by = admin_user_id;

-- A window longer than the ceiling.
select id from public.support_access_grants
where expires_at > requested_at + interval '24 hours';

-- A reveal with no grant behind it, or against a grant for another admin
-- or another user. The trigger forbids all three.
select r.id
from public.support_access_reveals r
left join public.support_access_grants g on g.id = r.grant_id
where g.id is null
   or g.admin_user_id <> r.admin_user_id
   or g.subject_user_id <> r.subject_user_id
   or not (r.scope = any (g.scopes));

-- A reveal with no matching audit row.
select r.id, r.revealed_at
from public.support_access_reveals r
where not exists (
  select 1 from public.audit_logs a
  where a.support_access_grant_id = r.grant_id
    and a.action = 'support_access.revealed'
    and a.created_at between r.revealed_at - interval '1 minute'
                         and r.revealed_at + interval '1 minute'
);
```

The first three are checked on every CI run by
`scripts/validate-supabase.mjs`, which attempts each of them against a throwaway
database and requires Postgres to refuse. Running them against production is
belt and braces on a schema that has already been proven — but a constraint can
be dropped by a hand-run migration, and that is precisely the case worth
catching.

---

## Failure modes

### The six refusals the database raises

Every one arrives as `P0001` with a `hint` the console maps to a Turkish
sentence. A raw Postgres message never reaches a screen.

| Hint                             | What happened                                         | Remedy                                                              |
| -------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| `support_access_unknown_grant`   | No grant with that id                                 | The link is wrong, or the record never existed                      |
| `support_access_wrong_admin`     | The grant belongs to another administrator            | Request your own. Grants are not transferable                       |
| `support_access_wrong_subject`   | The grant covers a different user                     | You are on the wrong record                                         |
| `support_access_grant_not_live`  | Pending, denied, revoked, expired, or not yet started | A new request and a new approval                                    |
| `support_access_scope_denied`    | The scope is not in the grant's list                  | A new request naming that scope. A grant's scopes are never widened |
| `support_access_permission_lost` | Your role no longer carries `support.access.reveal`   | Nothing you can do from the console; ask a `super_admin`            |

The console-side mirror in `lib/redact.ts` refuses the same five cases _before_
opening a connection, with these sentences:

- `Rolünüz Destek Erişimi ile içerik görüntüleyemez.`
- `Bu Destek Erişimi izni başka bir yöneticiye ait.`
- `Bu Destek Erişimi izni başka bir kullanıcıyı kapsıyor.`
- `Destek Erişimi izniniz etkin değil veya süresi doldu.`
- `Destek Erişimi izniniz bu içerik türünü kapsamıyor.`

That is the outermost of three locks. `sa_assert_grant()` is the second, and the
trigger on `support_access_reveals` is the third. Removing any one leaves the
other two standing; that is the point of having three.

### "Etkin" on a grant whose time has passed

`admin_cleanup_expired()` moves lapsed grants from `active` to `expired` on a
sweep. Between the lapse and the sweep the stored status still reads `active`.
This is cosmetic, not a hole: every guard checks the timestamps, and the console
reports the timestamps rather than the column. The detail page says so out loud:

> Kayıtlı durum hâlâ "Etkin" görünüyor çünkü süresi dolan izinleri kapatan
> temizlik işi henüz çalışmadı. Süre dolduğu için bu izinle içerik
> görüntülenemez.

`0020_admin_cleanup_schedule.sql` schedules the sweep hourly, on the half hour,
so the window between a lapse and the status catching up is at most an hour and
the note above is what the operator sees inside it. The schedule is not what
protects the data and is not described as though it were: `sa_assert_grant()`
re-checks `expires_at` on every single reveal, so a lapsed grant opens nothing
whether or not the sweep has run. To run it by hand:

```sql
select public.admin_cleanup_expired();
```

It returns a JSON report keyed by table, and it never deletes a grant or a
reveal.

### "You already hold a live grant for this user"

`support_access_grants_one_active` allows one live grant per (administrator,
subject). A second approval is refused with a 409 and the remedy rather than a
constraint name: wait for the first to lapse, or revoke it. If the first grant's
scopes are too narrow, revoke it with a reason saying so and open a new request —
a grant's scopes are never widened in place.

### The approver is unavailable

There is no override. Four eyes is a `check` constraint; nothing in the console
and nothing in the schema can approve a request for its own requester, and no
configuration flag turns it off. The escalation is a _person_: another holder of
`support.access.approve` — `super_admin` or `operations`. If none is reachable,
the request waits, and the correct answer to the customer is that it waits.

Keep more than one administrator with `support.access.approve` at all times.
This is the single most common way this procedure stalls.

### The last `super_admin` is unavailable

This is the platform-level version of the same problem, and it has a hard floor
beneath it. `admin_users_protect_last_super_admin` refuses any `UPDATE` or
`DELETE` that would leave the platform with no enabled `super_admin` — including
the demotion, the disable, the delete, and the foreign key's own
`on delete set null` when that admin's GoTrue account is erased. It takes
`pg_advisory_xact_lock` first, so two concurrent demotions cannot both pass the
check and leave zero.

Consequences, in order of what to try:

1. **If another `super_admin` exists**, the floor is not engaged. Have them act.
2. **If the last one is merely locked out** — lost their second factor, session
   revoked — the account still exists and is still `active`. Restoring their
   sign-in is a GoTrue matter (reset the password, remove the stale MFA factor
   from the Supabase dashboard), not a console matter. Nothing in `admin_users`
   needs to change.
3. **If the last one has genuinely gone** — left the company, account
   irrecoverable — you cannot fix it from the console, by design. Promote a
   second administrator directly in the database first, then act:

   ```sql
   -- 1. Confirm what you actually have.
   select id, email, role, status, disabled_at, user_id
   from public.admin_users
   where role = 'super_admin';

   -- 2. Promote a second one. Requires an existing active admin row
   --    already bound to a GoTrue account.
   update public.admin_users
   set role = 'super_admin'
   where id = '<admin_users.id of the successor>'
     and status = 'active'
     and user_id is not null;

   -- 3. Now the floor is satisfied and the original may be disabled
   --    through the console, with a reason, and audited.
   ```

   Step 2 is a privileged database operation performed outside the console and
   outside the audit trail. Record it wherever your organisation records
   break-glass actions, and do it in front of a second person — the whole point
   of the constraint you are stepping around is that this decision should never
   be one person's.

4. **Never** `delete from public.admin_users`. The audit-bearing foreign keys
   carry `on delete restrict` precisely so a `DELETE` fails loudly rather than
   orphaning a year of accountability.

### A reveal returned rows and the audit row did not land

`runAdminAction` writes the `audit_logs` row after the reveal returns, so the
ordering is: the reveal is logged by Postgres in the same statement as the read,
and the audit row follows. If the audit write fails, the
`support_access_reveals` row still exists — the accountability record is intact,
the cross-reference is not. The screen does not pretend otherwise: it withholds
the rows it just read and tells the operator that a privileged read went
unrecorded and infrastructure must be told, rather than rendering the record
under a green banner. Run the "reveal with no matching audit row" query above; a
hit means the trail is incomplete for that reveal and it should be reconciled by
hand from the reveal row, which is the authoritative one.

### An audit row looks wrong

`audit_logs` is append-only by intent. Do not edit one. If a row is
mis-attributed or carries a reason that does not match the action, write a new
row that says so (`admin.*` namespace, with a reason) and keep both. A corrected
trail with two entries is evidence; a trail with one edited entry is not.

---

## Related documents

| Document                                             | What it covers                                          |
| ---------------------------------------------------- | ------------------------------------------------------- |
| [BACKOFFICE.md](BACKOFFICE.md)                       | The content-blindness chain, `runAdminAction`, sessions |
| [BACKOFFICE_RBAC.md](BACKOFFICE_RBAC.md)             | Which roles hold `request`, `approve` and `reveal`      |
| [BACKOFFICE_OPERATIONS.md](BACKOFFICE_OPERATIONS.md) | Running the console, incidents, lockouts                |
| [PRIVACY_DATA_FLOW.md](PRIVACY_DATA_FLOW.md)         | What is collected, where it goes, how long it stays     |
| [SECURITY.md](SECURITY.md)                           | Encryption, RLS, and what is explicitly not claimed     |
