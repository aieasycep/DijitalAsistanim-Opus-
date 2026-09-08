# Google OAuth verification

`gmail.readonly` is a **restricted** scope. Using it in production requires a
Google security assessment on top of the ordinary brand review. Budget six to
eight weeks, and expect the assessment itself to cost between $15,000 and
$75,000 depending on the assessor.

This document is what the review asks for and what our answer is.

---

## Why we need each restricted scope

Reviewers reject applications that justify a scope by naming a feature. They
accept ones that explain why no narrower scope would do.

### `gmail.readonly`

The product's entire premise is deciding which of today's messages matter and
summarising them. That requires reading message bodies: the deadline, the
question, the promise are all in the text. Metadata-only scopes
(`gmail.metadata`) give sender and subject, from which none of this can be
derived.

We do **not** request `gmail.modify` or `gmail.compose`. The app never marks
mail read, never labels, never archives, and never writes a draft into the
user's mailbox — so a reviewer can confirm that the read grant cannot be
turned into a write.

### `gmail.send`

Requested only when the user first approves a reply, not at connect. It sends
exactly the message shown on the approval card. Nothing is sent without a
person pressing approve, which the demo video shows.

### `calendar.readonly` / `calendar.events`

Read for the day's plan and conflict detection; write only through the same
approval card.

---

## What the assessment covers

Two notes before the table. Everything in it that can be checked against this
repository is written to be checked; the rows that describe organisational
process (incident response, employee access, pen test) are commitments about
how the company operates and are not evidenced by code.

| Area              | Our answer                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Data in transit   | TLS everywhere; no plaintext endpoint exists. The exact TLS version is the hosting platform's, not something this codebase configures.                                                                                                                                                                                                     |
| Data at rest      | AES-256 at the database and object-store level. Provider refresh **and** access tokens additionally AES-256-GCM with a key held as an environment secret, not in the database.                                                                                                                                                             |
| Access control    | RLS enabled _and_ forced on all 39 tables, verified in CI on every push. See the row below — the honest statement is more specific than "clients cannot write".                                                                                                                                                                            |
| Client writes     | Clients write only their own rows in the 14 user-authored tables. The 18 tables holding assistant output, synced provider data and entitlements are `select`-only to a client; 7 more are service-role only. Nothing a client can write is provider data or an entitlement.                                                                |
| Provider data     | `email_threads`, `email_messages`, `calendar_events` and `tasks` are readable by their owner and writable by no client role at all. Only an edge function running with the service role writes them.                                                                                                                                       |
| Key management    | `OAUTH_ENCRYPTION_KEY` as a function secret; `key_version` and `refresh_key_version` per row support rotation without downtime. Every refresh-token decryption writes an `account.token_decrypted` audit row naming the account, provider and key version. Rotation is lazy: both keys stay configured until no row names the old version. |
| Deletion          | Self-service in the app, and **immediate**. Provider tokens are revoked with Google first, then Storage objects are deleted, then the auth user — whose cascade clears every table. Irreversible from that moment; there is no recovery window.                                                                                            |
| Retention         | User-chosen: 30 days, 90 days, 1 year, or until deleted. Default 90. Enforced by the daily `da_retention_cleanup` job, not by policy alone.                                                                                                                                                                                                |
| Human access      | Support tooling reads 16 `bo_*` views granted to `service_role` only. No view selects a column that can carry message content; addresses appear only through `bo_redact_email()`. `validate-supabase.mjs` re-derives every view's column dependencies from `pg_depend` and fails the build if one reaches a content column.                |
| Incident response | Documented, with a named owner and a 72-hour notification commitment. _(Process commitment; not evidenced in this repository.)_                                                                                                                                                                                                            |
| Third parties     | Model providers under agreements forbidding training on the data; they receive an opaque id, never a user identity. _(Contractual; the code sends no user identity.)_                                                                                                                                                                      |
| Employee access   | Production access is break-glass, audited, and requires a second approver. _(Process commitment.)_                                                                                                                                                                                                                                         |
| Pen test          | Annual third-party test; report available to the assessor. _(Process commitment.)_                                                                                                                                                                                                                                                         |

### On the authorization-code flow

The flow does **not** use PKCE, and does not need to. The code is exchanged
server-side by an edge function holding the client secret — a confidential
client under RFC 6749 — so client authentication, not a proof key, is what binds
the exchange. What protects the round trip is a 32-byte random `state` stored
server-side and redeemed exactly once by an atomic `delete … returning`, a
10-minute expiry, and a check that the state's user matches the caller's
verified JWT. Full detail in
[SECURITY.md](SECURITY.md#provider-oauth-what-actually-protects-the-authorization-code).

---

## Limited Use compliance

Google's Limited Use requirements, and how each is met:

1. **Use only to provide or improve user-facing features.** Mail data drives
   the briefing, priority, commitments and follow-ups. Nothing else.
2. **No transfer except as necessary.** Only to the model provider for
   analysis, under contract, with no user identity attached.
3. **No advertising.** There is no advertising SDK in the build, and no
   advertising business.
4. **No human reading,** except the narrow cases Google's own wording allows —
   the user's explicit permission, a legal obligation, security investigation,
   or aggregated anonymised data. Routine support access is closed by
   construction, not by policy: the staff console reads only the 16 `bo_*`
   views, none of which selects a message body, subject, summary, address,
   attendee, capture text, assistant turn or approval payload. Addresses reach
   an operator only through `bo_redact_email()` (`y•••@example.com`) and
   provider errors only through `bo_error_code()`, which reduces anything
   sentence-shaped to the literal `unstructured`. `0017_backoffice.sql` names
   every excluded column, and `validate-supabase.mjs` re-derives the views'
   column dependencies from `pg_depend` on every push. A reviewer can confirm
   this by reading one migration.
5. **No training on user data.** Neither we nor our model providers train on
   it; the provider agreements say so explicitly.

The privacy policy states all five at `https://dijitalasistan.app/privacy`,
section 4 (_Google izinleri ve Sınırlı Kullanım_).

---

## The submission itself

**Consent screen.** App name, logo, and support email must match the app in
the store listing exactly. The homepage, privacy policy and terms URLs must be
on the verified domain and must be reachable without a login.

**Scope justification.** One paragraph per scope, in the form: _this feature,
which the video shows at this timestamp, needs this scope because the narrower
alternative gives us X and the feature needs Y._

**Demonstration video.** Unlisted YouTube, no editing, showing:

1. The OAuth consent screen with the scopes visible and readable.
2. Signing in, and where the data appears in the app.
3. Each requested scope actually being used — the briefing for read, an
   approval card being approved for send.
4. The approval card at full size, so the reviewer can see nothing is sent
   automatically.
5. Settings → Privacy → Delete account, run to completion.

The most common rejection is a video that shows the feature but never shows
the consent screen, or shows a scope being requested that the video never
exercises.

**Privacy policy.** Must name Google user data specifically, describe the
Limited Use commitment, and be on the same verified domain.

---

## While the review is pending

- **Unverified apps are capped at 100 users** and show an unverified warning.
  That is enough for a private beta and not enough for a launch.
- **Testing mode** allows 100 named test accounts with no warning, and tokens
  that expire after 7 days.
- The app is usable without Google throughout: Microsoft accounts work, and so
  does demo mode.

Do not launch on the assumption that verification will complete on schedule.
It routinely does not.
