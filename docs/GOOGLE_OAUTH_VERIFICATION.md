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

| Area              | Our answer                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Data in transit   | TLS 1.3 everywhere. No plaintext endpoint exists.                                                                                                      |
| Data at rest      | AES-256 at the database and object-store level. Refresh tokens additionally AES-256-GCM with a key held as an environment secret, not in the database. |
| Access control    | RLS enabled _and_ forced on all 38 tables, verified in CI on every push. Client credentials can read only their own rows and cannot write at all.      |
| Key management    | `OAUTH_ENCRYPTION_KEY` as a function secret; per-row `key_version` supports rotation without downtime; every decryption is audited.                    |
| Deletion          | Self-service in the app. Cascades every table, revokes provider tokens with Google, deletes stored files, irreversible after 30 days.                  |
| Retention         | User-chosen, 30 days to indefinite, default 90. Enforced by a scheduled sweep, not by policy alone.                                                    |
| Incident response | Documented, with a named owner and a 72-hour notification commitment.                                                                                  |
| Third parties     | Model providers under agreements forbidding training on the data; they receive an opaque id, never a user identity.                                    |
| Employee access   | Production access is break-glass, audited, and requires a second approver.                                                                             |
| Pen test          | Annual third-party test; report available to the assessor.                                                                                             |

---

## Limited Use compliance

Google's Limited Use requirements, and how each is met:

1. **Use only to provide or improve user-facing features.** Mail data drives
   the briefing, priority, commitments and follow-ups. Nothing else.
2. **No transfer except as necessary.** Only to the model provider for
   analysis, under contract, with no user identity attached.
3. **No advertising.** There is no advertising SDK in the build, and no
   advertising business.
4. **No human reading.** Nobody reads user mail. Support cannot see message
   content; the support tooling exposes counts and error codes only.
5. **No training on user data.** Neither we nor our model providers train on
   it; the provider agreements say so explicitly.

The privacy policy states all five, in the same words, at
`https://dijitalasistan.app/privacy`.

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
