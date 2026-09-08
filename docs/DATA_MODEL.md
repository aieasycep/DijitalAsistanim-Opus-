# Data model

39 tables, 18 migrations. The local stack pins Postgres 15
(`supabase/config.toml`); CI validates against `postgres:16` and the validator
requires 15 or newer.

Every table has RLS enabled **and** forced. Almost every one carries `user_id`,
`created_at` and `updated_at`; the exceptions are worth knowing because they are
the ones a generic query will trip over:

- `profiles` is keyed on `id`, which _is_ the auth user id — there is no
  `user_id` column.
- `audit_logs`, `oauth_states` and `staff_members` have no `updated_at`. The
  first two are append-then-delete by nature and the third is a roster.

Migrations are re-runnable: applying the whole set twice is a no-op, which is
what makes a partial failure recoverable rather than a restore.
`scripts/validate-supabase.mjs` proves it on every push.

---

## Identity and preferences

| Table                      | Holds                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `profiles`                 | Display name, avatar, time zone, working hours and days, onboarding state. One row per auth user.                   |
| `user_preferences`         | Briefing times and sections, tone, summary length, aggressiveness, learning on/off, retention window, read sources. |
| `notification_preferences` | Per-category channel, quiet hours, lock-screen content.                                                             |
| `push_tokens`              | One row per device: Expo token, platform, last seen.                                                                |

## Connections

| Table                | Holds                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `connected_accounts` | Provider, address, `external_account_id` (the OIDC `sub`), granted scopes, kinds, primary flag, status (`connected` / `expired` / `revoked` / `error` / `disconnected`). |
| `oauth_credentials`  | `encrypted_refresh_token` + `refresh_nonce` + `refresh_key_version`, `encrypted_access_token` + `nonce` + `key_version`, expiry, scopes. **Never readable by a client.** |
| `oauth_states`       | Single-use `state` (primary key), the user, provider, scopes, redirect and account being widened, with a 10-minute `expires_at`.                                         |
| `sync_states`        | Per account and resource: cursor, `last_run_at`, error, backoff.                                                                                                         |

The two ciphertexts in `oauth_credentials` carry **separate** nonces and
**separate** key versions on purpose: the access token is re-encrypted on every
refresh and the refresh token only when the provider issues a new one, so one
shared version column silently mislabelled the refresh ciphertext after a
rotation. `0018_refresh_key_version.sql` is the fix.

`oauth_states` holds no PKCE verifier, because the flow does not use PKCE — the
exchange is server-side with a client secret. See
[SECURITY.md](SECURITY.md#provider-oauth-what-actually-protects-the-authorization-code).

Neither `oauth_credentials` nor `oauth_states` has any policy at all: RLS is on
with zero policies, so PostgREST returns nothing to any signed-in user and
rejects every write. Only the service role reads them, and only inside the
function about to make a provider call.

## Mail and calendar

| Table             | Holds                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `email_threads`   | Subject, participants, last message, importance, category, summary, priority score, deadline. |
| `email_messages`  | Sender, recipients, body text, sent at, direction, provider ids.                              |
| `calendar_events` | Title, times, all-day flag, location, attendees, organiser, conference link.                  |
| `tasks`           | Title, notes, due date, completion, provider link.                                            |
| `contacts`        | Name, addresses, company, role, VIP flag, mute flag, relationship strength.                   |

Provider ids carry a unique constraint per account so a re-sync updates rather
than duplicating.

## Intelligence

| Table                 | Holds                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------- |
| `commitments`         | Text, direction (`user_owes` / `other_owes`), person, due date, status, source quote. |
| `follow_ups`          | Thread, sent at, expected-reply flag, due at, dismissal count, resolution.            |
| `insights`            | A surfaced observation, its evidence, and whether it was acted on or dismissed.       |
| `life_events`         | Travel, delivery, payment, subscription and renewal detected across sources.          |
| `priority_rules`      | User-written rules: sender, domain, keyword, mute.                                    |
| `learned_preferences` | Inferred preferences with a strength, each individually forgettable.                  |
| `vip_people`          | The explicit VIP list.                                                                |

`commitments.source_quote` is not decoration: a commitment whose quote is not
found in the message is never written.

## Briefings and approvals

| Table              | Holds                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `briefings`        | Type (`morning` / `midday` / `evening` / `weekly`), generated at, read at, audio url, stats.                                       |
| `briefing_items`   | The ordered items, each with its source reference and reason.                                                                      |
| `approval_actions` | Type, status, `what`, `why`, `payload`, `original_payload`, `idempotency_key`, expiry, attempts, failure reason, result reference. |

`payload` and `original_payload` are both kept so an edit is auditable: the
card can show what changed, and the executor can reject an edit that touched a
field the action type does not expose.

`idempotency_key` is unique per user, which is what makes a double tap across
two devices produce one send.

## Assistant and memory

| Table                | Holds                                                         |
| -------------------- | ------------------------------------------------------------- |
| `assistant_threads`  | A conversation.                                               |
| `assistant_messages` | Turns, citations, proposed action, grounded flag, confidence. |
| `memory_chunks`      | Text chunks with a pgvector embedding, for retrieval.         |
| `ai_feedback`        | Thumbs up/down against a specific output.                     |
| `ai_usage_events`    | Tokens per user per day, for the cost ceiling.                |

`memory_chunks` uses an IVFFlat index. With no embedding model configured the
retrieval path falls back to Postgres full-text search, so the assistant still
answers.

## Capture and notifications

| Table                     | Holds                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `captures`                | Kind (link, photo, document, text), source, storage path, extracted text, analysis. |
| `device_notifications`    | Android only: package, category, posted at. Fixed 30-day retention.                 |
| `notification_deliveries` | What was sent, when, and whether it was opened.                                     |
| `reminders`               | Title, body, remind at, preset, delivery state.                                     |

`device_notifications` stores content **only** when the second, separate opt-in
is on. Password-manager and authenticator packages are dropped before the row
is ever built.

## Billing and referral

| Table              | Holds                                                   |
| ------------------ | ------------------------------------------------------- |
| `subscriptions`    | RevenueCat entitlement, status, period, renewal, store. |
| `referrals`        | Code, referrer, referee, redeemed at.                   |
| `referral_credits` | Bonus days, expiry, revocation.                         |

## Audit, privacy and infrastructure

| Table                  | Holds                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `audit_logs`           | Every external write, refresh-token decryption, export and deletion. 400 days, then `entity_id` and `metadata` blanked. |
| `data_export_requests` | Status, storage path, `ready_at`, `expires_at` (7 days after the archive is written).                                   |
| `rate_limit_counters`  | Per user, per endpoint, sliding window.                                                                                 |
| `staff_members`        | The backoffice roster: auth user, `staff_role`, `disabled_at`. Not user data.                                           |

---

## Who may write what

`0011_rls_policies.sql` splits the tables three ways, and the split is the
security boundary — it is **not** the case that clients can only read.

| Tier                                                        | Count | Client may                                             |
| ----------------------------------------------------------- | ----- | ------------------------------------------------------ |
| Client-writable (user-authored)                             | 14    | `select`, `insert`, `update`, `delete` on its own rows |
| Client-readable (assistant-produced or entitlement-bearing) | 18    | `select` only                                          |
| Service role only                                           | 7     | nothing — RLS on, no policy                            |

Tier 1: `profiles`, `user_preferences`, `notification_preferences`, `contacts`,
`vip_people`, `priority_rules`, `learned_preferences`, `captures`,
`ai_feedback`, `assistant_threads`, `push_tokens`, `reminders`, `tasks`,
`commitments`.

Tier 3: `oauth_credentials`, `audit_logs`, `ai_usage_events`,
`rate_limit_counters`, `notification_deliveries`, `oauth_states`, and
`staff_members` (which has one self-select policy and nothing more).

Everything else is tier 2. Full reasoning in
[SECURITY.md](SECURITY.md#2--row-level-security).

## Backoffice views

`0017_backoffice.sql` adds 16 `bo_*` views — `bo_users`, `bo_user_detail`,
`bo_accounts`, `bo_sync_health`, `bo_approvals`, `bo_ai_spend`,
`bo_ai_spend_daily`, `bo_privacy_requests`, `bo_referrals`, `bo_audit`,
`bo_staff`, `bo_briefing_health`, `bo_notification_health`, `bo_capture_health`,
`bo_signup_daily`, `bo_platform_overview`. All are revoked from `anon` and
`authenticated` and granted to `service_role` only, and none selects a column
that can carry what a person wrote or received. `validate-supabase.mjs`
re-derives each view's column dependencies from `pg_depend` and fails the build
if one ever does.

---

## Relationships that matter

```
auth.users
    └── profiles ─── user_preferences
                 ├── notification_preferences
                 ├── push_tokens
                 └── connected_accounts
                         ├── oauth_credentials   (service role only)
                         ├── sync_states
                         ├── email_threads ── email_messages
                         │        ├── commitments
                         │        ├── follow_ups
                         │        └── approval_actions
                         ├── calendar_events
                         └── tasks

contacts ──┬── vip_people
           ├── commitments
           └── email_threads (by participant address)

briefings ── briefing_items ──► any source row
```

Every foreign key to a user-owned row is `on delete cascade`, so deleting the
`auth.users` row clears every table without a script that can miss one. Two
things no cascade reaches, which is why `delete-account` still has work to do:
provider tokens must be revoked at Google/Microsoft, and Storage objects in the
`captures` and `exports` buckets must be deleted explicitly. The function does
both **before** deleting the user, so a failure part-way through leaves the user
better off rather than worse.

## Enums

Postgres enums mirror TypeScript unions in `packages/domain/src/enums.ts`.
The two are checked against each other in CI: adding a value to one and not
the other fails the build, which is the failure mode that otherwise shows up
as a runtime cast error months later.

There are **30**. Twenty-nine come from `0001_extensions_and_enums.sql`, and
`staff_role` from `0017_backoffice.sql`:

`account_kind`, `app_locale`, `approval_action_type`, `approval_status`,
`briefing_kind`, `briefing_section`, `briefing_status`, `capture_intent`,
`capture_kind`, `capture_status`, `commitment_direction`, `commitment_status`,
`connection_status`, `email_category`, `export_status`, `feedback_signal`,
`importance_level`, `life_event_type`, `lock_screen_privacy`,
`notification_category`, `priority_rule_kind`, `provider_kind`,
`reminder_preset`, `reply_tone`, `retention_window`, `source_type`,
`staff_role`, `subscription_status`, `sync_status`, `task_status`.

Watch the names. Five that read naturally do not exist, and earlier revisions of
this document listed all five:

| Not a type       | The actual name     |
| ---------------- | ------------------- |
| `importance`     | `importance_level`  |
| `provider`       | `provider_kind`     |
| `account_status` | `connection_status` |
| `briefing_type`  | `briefing_kind`     |
| `sync_resource`  | `sync_status`       |

`provider_kind` is named that way to stay clear of the provider-named columns
it appears on.

## Indexes

Written against the queries that actually run: the Today feed
(`user_id, priority_score desc` partial on unresolved), the flow list
(`user_id, last_message_at desc`), follow-ups due
(`user_id, due_at` partial on open), approvals pending
(`user_id, status` partial on `pending`), and the vector index on
`memory_chunks`.

Partial indexes are used wherever the query has a constant predicate — an
index over resolved follow-ups nobody queries is a write cost with no reader.
