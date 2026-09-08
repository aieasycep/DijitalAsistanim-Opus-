# Architecture

## The shape of it

```
┌─────────────────────────┐  ┌──────────────────────┐  ┌───────────────────┐
│  iOS / Android app      │  │  Marketing site      │  │  Staff backoffice │
│  Expo SDK 57 · RN 0.86  │  │  Next.js 16 ·        │  │  Next.js 16,      │
│  Expo Router · TanStack │  │  App Router          │  │  service role     │
└───────────┬─────────────┘  └──────────────────────┘  └─────────┬─────────┘
            │ HTTPS, bearer token                                │ bo_* views
            ▼                                                    │ only
┌────────────────────────────────────────────────────────────────▼──────────┐
│  Supabase                                                                 │
│                                                                           │
│  ┌─────────────┐   ┌──────────────────────────────────┐                  │
│  │  GoTrue     │   │  48 Deno edge functions          │                  │
│  │  auth       │   │  every write that leaves the app │                  │
│  └─────────────┘   └───────────────┬──────────────────┘                  │
│                                    │ service role                         │
│  ┌─────────────────────────────────▼──────────────────┐                  │
│  │  PostgreSQL · 39 tables · RLS enabled + forced     │                  │
│  │  pgvector · pg_cron · pg_net                       │                  │
│  └────────────────────────────────────────────────────┘                  │
└───────────┬───────────────────────────────────────────────────────────────┘
            │ server-side only, never from the client
            ▼
  Google (Gmail, Calendar, Tasks) · Microsoft (Graph)
  Anthropic / OpenAI · RevenueCat · Expo Push
```

The local stack in `supabase/config.toml` pins Postgres 15; CI validates the
migrations against the `postgres:16` image, and `validate-supabase.mjs` needs
15 or newer. `pgvector` is created by `0001_extensions_and_enums.sql`;
`pg_cron` and `pg_net` are **not** — `0014_cron_jobs.sql` detects them and
degrades if they are absent, so they must be enabled on the project.

There is no path by which a phone holds a provider refresh token, and no path
by which one user's row is returned to another.

## Why the pieces are what they are

### Shared packages, as source

`packages/*` are consumed as TypeScript source with no build step. The same
file is compiled by five different toolchains — `tsc`, Metro, Next's bundler,
Vitest and Deno — which is why every relative import carries an explicit `.ts`
extension and `allowImportingTsExtensions` is on.

The alternative, publishing built artefacts, buys nothing here: there is one
consumer repository, and a build step would mean a stale `dist/` is possible.
It also means the edge functions and the app share _the actual same code_ for
priority, approvals and validation, rather than two implementations that agree
until they do not.

### Who may write what

The write model has two halves, and only describing one of them would be
misleading.

**RLS decides who may write directly.** `0011_rls_policies.sql` splits the 39
tables three ways. Fourteen are client-writable: the app inserts, updates and
deletes its own rows in `profiles`, `user_preferences`,
`notification_preferences`, `contacts`, `vip_people`, `priority_rules`,
`learned_preferences`, `captures`, `ai_feedback`, `assistant_threads`,
`push_tokens`, `reminders`, `tasks` and `commitments`, each policy scoped to
`(select auth.uid())`. These are things the human authored, and routing a VIP
toggle through an edge function would buy nothing.

Eighteen are read-only to the client — everything the assistant produced or that
encodes an entitlement, from `email_threads` and `insights` to
`approval_actions` and `subscriptions`. Seven have no client policy at all
(`oauth_credentials`, `audit_logs`, `ai_usage_events`, `rate_limit_counters`,
`notification_deliveries`, `oauth_states`, `staff_members`).

**Edge functions own everything else.** Every write that reaches a provider,
confers an entitlement, or produces evidence the client could otherwise
fabricate goes through a function running with the service role, which:

1. verifies the caller's JWT and derives `user_id` from it, never from the body;
2. validates the request against a Zod schema;
3. applies the domain rules — the same module the client uses to render them;
4. writes, and appends to `audit_logs` when the write has an external effect.

That division is what makes "the assistant cannot do anything behind your back"
a structural property rather than a promise: a client can edit its own VIP list,
and it categorically cannot mint an insight, pre-approve an action that sends
mail, or grant itself Pro. There is no client code path that reaches a provider.

See [SECURITY.md](SECURITY.md#2--row-level-security) for the full table-by-table
split.

### The approval machine

Six action types can leave the app: `email_send`, `calendar_create`,
`calendar_update`, `task_create`, `reminder_create`, `commitment_create`. The
last two are internal records and take effect immediately; the first four
touch a provider and go through `approval_actions`.

```
pending ──approve──► approved ──execute──► executing ──► executed
   │                     │                     │
   ├──reject──► rejected │                     └──fail──► failed ──┐
   └──expire──► expired  │                                          │
                         └◄─────────────── retry (≤3) ◄─────────────┘
```

`executed`, `rejected` and `expired` are terminal. There is no transition from
`pending` to `executing`, so an approval cannot be skipped by any sequence of
calls. The executor writes an idempotency key derived from
`(user, action type, target)` before it contacts the provider, so a duplicate
tap on two devices produces one send.

### Priority, as bands rather than weights

A weighted sum lets a confident model outvote a rule the user wrote. So the
scorer uses ten disjoint bands:

```
9000  explicit rule        ← what the user told us
8000  security
7000  deadline
6000  VIP
5000  awaiting reply
4000  commitment
3000  meeting relevance
2000  learned preference   ← what we inferred
1000  AI importance        ← what the model thinks
   0  promotion penalty
```

Each tier contributes within its own 900-point span, and lower tiers only
break ties inside the winning band. No amount of model confidence reaches the
floor of the band above. A muted sender short-circuits everything and returns
zero.

Every result carries an i18n key explaining itself, so the UI renders "Ahmet
VIP listende" rather than "score: 6432".

### State on the client

- **Server state** — TanStack Query v5. Query keys live in
  `packages/api-client/src/query-keys.ts` so an invalidation cannot miss a
  cache.
- **Session and preferences** — Zustand v5 with MMKV persistence. The token
  refresher is injected at startup rather than imported, so the store does not
  depend on the auth module.
- **Everything else** — component state. There is no global UI store.

### Demo mode

With no Supabase URL configured, `api-client` resolves to a demo client backed
by deterministic fixtures: a full day of mail, meetings, commitments,
approvals and insights, with stable UUIDs. It is not a mock layer bolted on for
tests — it is a first-class client, which is why the entire Maestro suite runs
against it with no network at all.

### Native code

Custom native work lives in `apps/mobile/modules/da-native`, a **local Expo
module** picked up by autolinking. Config plugins are used only for what they
are good at: editing the generated Xcode project and the merged Android
manifest.

The distinction matters. A config plugin that writes Kotlin into the prebuild
output produces a file no build system knows about; a local module with an
`expo-module.config.json` is compiled and registered. The JS side calls
`requireOptionalNativeModule`, so a build without the native module — Expo Go,
a web build, a Jest run — degrades to no-ops rather than throwing.

| Platform | What is native                                          | Why                                          |
| -------- | ------------------------------------------------------- | -------------------------------------------- |
| iOS      | Share extension, WidgetKit widget                       | No JS equivalent                             |
| Android  | App widget, `NotificationListenerService`, share intake | No JS equivalent                             |
| Both     | App Group / SharedPreferences bridge                    | The widget renders without launching the app |

### The staff backoffice

`apps/backoffice` is a third application: a Next.js 16 staff console on port
3100, with three routes (`/`, `/giris`, `/yetkisiz`). It does not talk to the
edge functions and it does not read the user tables. Its entire surface is the
16 `bo_*` views from `0017_backoffice.sql`, which are granted to `service_role`
alone and revoked from `anon` and `authenticated`.

Those views are the mechanism behind the claim that nobody at the company reads
user mail. Not one of them selects a column that can carry what a person wrote
or received; addresses are projected only through `bo_redact_email()`, and
free-text provider errors only through `bo_error_code()`, which collapses
anything sentence-shaped to `unstructured`. `scripts/validate-supabase.mjs`
re-derives every view's column dependencies from `pg_depend` and fails the build
if one ever reaches a content column, so the guarantee is checked rather than
asserted. Staff identity lives in `staff_members`, whose only client policy lets
a staff member see their own row.

## Request lifecycle, end to end

A mail arrives and becomes something on the Today screen:

1. **Ingest** — `webhook-gmail` receives a push (or `sync-start` polls),
   fetches the changed thread with the stored token, decrypted in memory.
2. **Triage stage 1** — deterministic bulk filters: provider labels,
   `Precedence`, `List-Unsubscribe`, automated senders. No model call. A VIP or
   an explicit rule bypasses all of it.
3. **Triage stage 2** — vocabulary that settles the category without a model:
   security, deadline, meeting, payment, travel, shipment.
4. **Stage 3** — what is left goes to the model, with a content fingerprint
   checked first so identical text is never classified twice.
5. **Grounding** — the response is parsed by a Zod schema; any deadline or
   commitment whose quote is not found verbatim in the source is stripped.
6. **Priority** — the same `evaluatePriority` the client uses, producing a
   score, a tier and a reason chain.
7. **Surface** — `today-feed` assembles the screen; the briefing generator
   writes the morning summary from the same rows.

The point of steps 2–3 is cost and latency, and of step 5 is truth. The design
target is that roughly four in five messages never reach a model — that is a
target the pipeline is shaped around, not a figure measured from production
traffic, and nothing in this repository can confirm it.

## Failure behaviour

- **No network** — TanStack Query serves the last successful response; writes
  queue and retry. The UI says it is showing cached data rather than pretending.
- **Provider token revoked** — the account is marked `revoked`, the user is
  told which account and what stopped, and everything else keeps working.
- **Model unavailable** — triage still runs; items appear with deterministic
  categories and no summary, rather than not appearing.
- **Missing integration** — every one is optional. No speech provider means
  device TTS. No embedding model means full-text search. No RevenueCat means
  everyone is on the free tier. Nothing crashes for a missing key.
