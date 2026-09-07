# Data model

38 tables, 16 migrations, PostgreSQL 16. Every user table has RLS enabled and
forced; every one carries `user_id`, `created_at` and `updated_at`.

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

| Table                | Holds                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `connected_accounts` | Provider, address, granted scope groups, status (`connected` / `expired` / `revoked` / `error`).                       |
| `oauth_credentials`  | `refresh_token_ciphertext`, `access_token_ciphertext`, `nonce`, `key_version`, expiry. **Never readable by a client.** |
| `oauth_states`       | Single-use PKCE verifier and `state`, 10-minute expiry.                                                                |
| `sync_states`        | Per account and resource: cursor, `last_run_at`, error, backoff.                                                       |

`oauth_credentials` has an RLS policy that grants nothing to the authenticated
role. Only the service role reads it, and only inside the function about to
make a provider call.

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

| Table                  | Holds                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `audit_logs`           | Every external write, token decryption, export and deletion. 400 days, then anonymised. |
| `data_export_requests` | Status, storage path, expiry.                                                           |
| `rate_limit_counters`  | Per user, per endpoint, sliding window.                                                 |

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

Every foreign key to a user-owned row is `on delete cascade`, so account
deletion is one statement rather than a script that can miss a table.

## Enums

Postgres enums mirror TypeScript unions in `packages/domain/src/enums.ts`.
The two are checked against each other in CI: adding a value to one and not
the other fails the build, which is the failure mode that otherwise shows up
as a runtime cast error months later.

`approval_status`, `approval_action_type`, `email_category`, `importance`,
`commitment_direction`, `commitment_status`, `subscription_status`,
`retention_window`, `provider`, `account_status`, `capture_kind`,
`life_event_type`, `briefing_type`, `reminder_preset`, `priority_rule_kind`,
`reply_tone`, `notification_category`, `sync_resource`.

## Indexes

Written against the queries that actually run: the Today feed
(`user_id, priority_score desc` partial on unresolved), the flow list
(`user_id, last_message_at desc`), follow-ups due
(`user_id, due_at` partial on open), approvals pending
(`user_id, status` partial on `pending`), and the vector index on
`memory_chunks`.

Partial indexes are used wherever the query has a constant predicate — an
index over resolved follow-ups nobody queries is a write cost with no reader.
