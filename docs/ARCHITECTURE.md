# Architecture

## The shape of it

```
┌─────────────────────────┐     ┌──────────────────────────┐
│  iOS / Android app      │     │  Marketing site          │
│  Expo SDK 57 · RN 0.86  │     │  Next.js 16 · App Router │
│  Expo Router · TanStack │     │  Static + two dynamic    │
└───────────┬─────────────┘     └──────────────────────────┘
            │ HTTPS, bearer token
            ▼
┌───────────────────────────────────────────────────────────┐
│  Supabase                                                 │
│                                                           │
│  ┌─────────────┐   ┌──────────────────────────────────┐  │
│  │  GoTrue     │   │  49 Deno edge functions          │  │
│  │  auth       │   │  the only writer of user data    │  │
│  └─────────────┘   └───────────────┬──────────────────┘  │
│                                    │ service role         │
│  ┌─────────────────────────────────▼──────────────────┐  │
│  │  PostgreSQL 16 · 38 tables · RLS enabled + forced  │  │
│  │  pgvector · pg_cron · pg_net                       │  │
│  └────────────────────────────────────────────────────┘  │
└───────────┬───────────────────────────────────────────────┘
            │ server-side only, never from the client
            ▼
  Google (Gmail, Calendar, Tasks) · Microsoft (Graph)
  Anthropic / OpenAI · RevenueCat · Expo Push
```

The client reads through RLS and writes through functions. There is no path by
which a phone holds a provider refresh token, and no path by which one user's
row is returned to another.

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

### Edge functions as the only writer

Every table is readable through RLS by its owner and writable by nobody. All
writes go through a function running with the service role, which:

1. verifies the caller's JWT and derives `user_id` from it, never from the body;
2. validates the request against a Zod schema;
3. applies the domain rules — the same module the client uses to render them;
4. writes, and appends to `audit_logs` when the write has an external effect.

This is what makes "the assistant cannot do anything behind your back" a
structural property rather than a promise. There is no client code path that
reaches a provider.

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

The point of steps 2–3 is cost and latency, and of step 5 is truth. Roughly
four in five messages never reach a model.

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
