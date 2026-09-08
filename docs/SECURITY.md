# Security

## What is actually protected, and from whom

The app holds a read of somebody's entire professional life: who they talk to,
what they owe, when they will be where. The threat model that matters is not a
nation state — it is the ordinary ways this kind of data leaks:

1. A refresh token in a database dump.
2. One user's rows returned to another.
3. A secret compiled into a shipped binary.
4. Mail content in an analytics event, a crash report or a log line.
5. A server-side fetcher used to reach the internal network.

Each is addressed below with the mechanism that addresses it.

---

## 1 · Provider tokens

A Google refresh token is a permanent key to a mailbox. It is:

- **Never stored in plaintext.** `oauth_credentials.encrypted_refresh_token` is
  AES-256-GCM ciphertext with the GCM tag appended, sealed under its own 96-bit
  random nonce in `refresh_nonce`. A tampered ciphertext fails to decrypt rather
  than yielding chosen bytes.
- **Never sent to a client.** No endpoint returns it, in any shape. The mobile
  app has no code path that could hold one.
- **Encrypted with an environment secret.** `OAUTH_ENCRYPTION_KEY` is a
  function secret, not a database value, so a database dump alone is inert.
- **Versioned per ciphertext.** `refresh_key_version` records which key sealed
  the refresh token and `key_version` which key sealed the access token. The two
  are separate columns because the two ciphertexts are rewritten on different
  schedules — see `0018_refresh_key_version.sql`, which exists because one
  shared column mislabelled the refresh ciphertext after a rotation.
- **Decrypted only in memory,** inside the function that is about to make the
  provider call, never written back in the clear.

Access tokens are cached in `encrypted_access_token` under their own `nonce` and
encrypted the same way. Every decryption of a **refresh** token appends an
`account.token_decrypted` row to `audit_logs` naming the account, the provider,
the key version and the reason — never the token. Reading a still-valid cached
access token is not audited; it is a decryption of a short-lived credential the
server minted minutes earlier, not of the standing key to the mailbox.

```bash
# Generate a key
openssl rand -base64 32

# Rotate
supabase secrets set OAUTH_ENCRYPTION_KEY_V2="$(openssl rand -base64 32)"
supabase secrets set OAUTH_ENCRYPTION_KEY_VERSION=2
```

Rotation is lazy and has no sweep behind it: both keys stay configured, new
writes use the new one, and a row written under the old key is re-encrypted the
next time its own lifecycle rewrites it — hourly for an access token, only on a
provider-issued rotation for a refresh token. **Do not retire an old key** until
you have confirmed no row still names its version; nothing in the codebase
migrates rows for you.

Tests: `supabase/tests/crypto.test.ts` covers the round trip, nonce
uniqueness, tamper detection, cross-version failure and the rotation path.

---

## 2 · Row-level security

All 39 tables have RLS **enabled and forced**. `FORCE` is the part people
forget: without it, the table owner bypasses its own policies, and the owner is
the role migrations run as.

The policy shape is uniform — every policy is scoped to the signed-in user, and
every one uses `(select auth.uid())` so the check is an InitPlan evaluated once
per statement rather than once per row:

```sql
alter table public.email_threads enable row level security;
alter table public.email_threads force row level security;

create policy email_threads_select on public.email_threads
  for select to authenticated
  using ((select auth.uid()) = user_id);
```

### What a client may write, and what it may not

`0011_rls_policies.sql` grants three different levels of access, and the split
is the actual security boundary. **It is not true that a client cannot write at
all.**

**Tier 1 — client-writable (14 tables).** `authenticated` holds `insert`,
`update` and `delete`, each `using`/`with check`-scoped to its own `user_id`
(`profiles` to its own `id`, which _is_ the auth user id):

`profiles`, `user_preferences`, `notification_preferences`, `contacts`,
`vip_people`, `priority_rules`, `learned_preferences`, `captures`,
`ai_feedback`, `assistant_threads`, `push_tokens`, `reminders`, `tasks`,
`commitments`.

These are things the human authored. The user owns them outright, so the app
writes them directly through PostgREST; RLS is what confines each write to the
writer's own rows.

**Tier 2 — client-readable, service-role-writable (18 tables).**
`authenticated` holds `select` and nothing else:

`connected_accounts`, `sync_states`, `email_threads`, `email_messages`,
`calendar_events`, `insights`, `life_events`, `follow_ups`, `briefings`,
`briefing_items`, `approval_actions`, `assistant_messages`, `memory_chunks`,
`subscriptions`, `referrals`, `referral_credits`, `data_export_requests`,
`device_notifications`.

This is the tier the product's integrity rests on. Every row here is either
synced provider data or something the model derived from it, and the client
cannot create or alter one. That is what makes three things structurally true
rather than merely intended: an insight always traces back to a real synced
source, an `approval_action` can only reach `approved` through the decide
endpoint (which records who approved it, when, and the payload diff), and
subscription status comes from the RevenueCat webhook rather than from the
device.

**Tier 3 — service role only (7 tables).** RLS is on with no policy granting
`authenticated` anything, so PostgREST returns nothing and rejects every write:

`oauth_credentials`, `audit_logs`, `ai_usage_events`, `rate_limit_counters`,
`notification_deliveries`, `oauth_states`, and `staff_members` — the last of
which has a single self-select policy so a staff member can see their own
roster row and no one else's.

Storage follows the same shape: object keys are `<user_id>/<…>`, the `captures`
bucket is fully client-managed, and the `exports` bucket is read-only to the
client because only the export worker may create or remove an archive.

### What the edge functions add on top

Writes that leave the app or confer an entitlement go through a function
running with the service role, which derives `user_id` from the verified JWT —
never from the request body — validates against a Zod schema, applies the
domain rules, and appends to `audit_logs` when the write has an external
effect. RLS is the floor; the functions are the ceiling. Neither alone is the
whole story, and this document previously claimed only the ceiling existed.

`scripts/validate-supabase.mjs` applies all 18 migrations to a throwaway
PostgreSQL, applies them a second time to prove they are re-runnable, checks
every Postgres enum against its TypeScript union, asserts that every user table
has RLS enabled _and_ forced, and re-derives the column dependencies of all 16
backoffice views from `pg_depend` to prove none of them reads a content column.
It runs in CI on every push. A new table without RLS fails the build.

---

## 3 · Secrets and the client bundle

Only `EXPO_PUBLIC_*` and `NEXT_PUBLIC_*` reach a bundle. Everything else is a
server secret set with `supabase secrets set`.

`scripts/check-secrets.mjs` enforces this on every push. It reads the variable
names out of `.env.example`, and fails if any of them is referenced from
`apps/mobile/{app,src,modules}`, `apps/web/src` or any shared package — those
all compile into the binary. Next.js files that only ever run on the server
(`route.ts`, `sitemap.ts`, `robots.ts`, `opengraph-image.tsx`) are exempt, and
`apps/backoffice/src` is not a client tree at all: it is a server-rendered staff
console that never ships its env to a browser. The checker also fails on a
committed credential (private key blocks, AWS/Google/Slack/Stripe/OpenAI/GitHub
key shapes, service-role JWTs), on a name like `EXPO_PUBLIC_..._SECRET`, and on
a `.env.example` that ships with a credential filled in.

The Supabase anon key _is_ public by design — RLS is what protects the data,
not the key's obscurity.

---

## 4 · PII in telemetry

Analytics properties are a closed vocabulary: numbers, booleans, and the 46
strings of the `AnalyticsEnum` union. Only the 21 events in `ANALYTICS_EVENTS`
may be sent at all. The type system refuses anything else.

Because a cast can defeat a type, `findAnalyticsViolations` re-checks at
runtime and the adapter **drops the whole event** rather than sending a
redacted one — a partially scrubbed payload is still a payload somebody has to
audit. It rejects:

- a forbidden key (`email`, `subject`, `body`, `name`, `sender`, `title`,
  `query`, `url`, `location`, `phone`, …) and any `*_email`-style suffix;
- any string value that is not one of the known enums, whatever the key is
  called — which is what catches a subject line smuggled through `bucket`.

Crash reports scrub the same fields, and network logs redact `Authorization`,
`Cookie` and anything matching a token shape. Tests:
`packages/domain/src/analytics-events.test.ts`.

---

## 5 · Server-side request forgery

The app fetches URLs people paste, from a server inside a private network with
a database and a metadata endpoint. `assertUrlAllowed` runs before every fetch
**and again after every redirect hop** — a public URL that 302s to
`169.254.169.254` is the whole attack.

It rejects:

|             |                                                                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Schemes     | anything but `http:` and `https:` — no `file:`, `gopher:`, `data:`                                                                 |
| Hostnames   | `localhost`, `metadata.google.internal`, `instance-data`, …                                                                        |
| Suffixes    | `.local`, `.internal`, `.lan`, `.home`, `.corp`, `.intranet`                                                                       |
| Bare labels | a hostname with no dot is an intranet name                                                                                         |
| IPv4        | RFC1918, loopback, link-local, CGNAT, multicast, broadcast, `0.0.0.0/8`                                                            |
| IPv6        | `::1`, `::`, `fc00::/7`, `fe80::/10`                                                                                               |
| Mapped IPv6 | `::ffff:a9fe:a9fe` and NAT64 `64:ff9b::/96` — the canonicalised forms `new URL()` produces, which the dotted-quad check never sees |
| DNS answers | resolved addresses are re-checked, so a rebinding record fails                                                                     |
| Credentials | `https://user:pass@host` is a redirection trick more often than a need                                                             |
| Ports       | anything but 80 and 443                                                                                                            |

Plus a 10-second timeout, at most 3 redirects, and a 2 MB response cap.
Tests: `packages/validation/src/ssrf.test.ts`, 70 cases.

---

## Notifications on Android

`NotificationListenerService` can read every notification on the device. That
is a lot of trust, and the app spends as little of it as possible:

- **Opt-in.** Off until the user turns it on, in the OS settings screen, after
  a plain-language explanation.
- **OTP and authenticator notifications are never persisted.** A package on the
  known password-manager and authenticator list is dropped before any
  processing, as is any notification whose text matches a one-time-code shape.
- **Content does not reach the server without a second, separate opt-in.** With
  it off, classification happens on the device and only the category is stored.
- **30-day fixed retention,** regardless of the user's own retention setting.

iOS has no equivalent API, and the app does not pretend otherwise. See
[KNOWN_PLATFORM_LIMITATIONS.md](KNOWN_PLATFORM_LIMITATIONS.md).

---

## Authentication

- Email OTP and Apple/Google identity tokens through GoTrue. No passwords, so
  no password database.
- Sessions in `expo-secure-store` — Keychain on iOS, EncryptedSharedPreferences
  on Android. Never in AsyncStorage or MMKV.
- Sign-out revokes the session server-side and clears the local store.

### Provider OAuth: what actually protects the authorization code

PKCE is **not** used and is not required here. PKCE exists to protect a _public_
client that cannot keep a secret; this flow's token exchange happens in an edge
function holding `GOOGLE_CLIENT_SECRET` / `MICROSOFT_CLIENT_SECRET`, so it is a
confidential client and RFC 6749's client authentication is what binds the
exchange. No `code_challenge` is sent, `oauth_states` has no verifier column,
and neither should be described as present. (`pkceChallenge` exists in
`_shared/crypto.ts` and is exercised against the RFC 7636 vector, but nothing in
the OAuth flow calls it.)

What does protect the round trip, in `_shared/oauth.ts`:

- **A single-use `state`.** 32 bytes from `crypto.getRandomValues`, stored
  server-side rather than signed into the URL — a signed-but-unstored state can
  be replayed against a different account. `consumeState` redeems it with a
  single `delete … where state = $1 returning …` on the primary key, so the
  redemption is atomic and a replay finds nothing.
- **A 10-minute expiry,** written into `oauth_states.expires_at` at mint time
  and re-checked after the row is claimed.
- **Binding to the user.** The state row carries the `user_id`, the provider,
  the scopes and the account being widened. `oauth-complete` rejects the
  exchange when the caller's JWT is not that user, so a stolen code cannot be
  attached to somebody else's mailbox — and the client cannot name the provider
  or the target account at all, because both come from the stored state.
- **A confidential client.** The code is redeemed server-to-server with the
  client secret, which never reaches a bundle.

Constant-time comparison (`timingSafeEqual`) is used where a secret really is
compared byte by byte — the Gmail Pub/Sub token, the Graph `clientState`, the
RevenueCat auth header and the machine-to-machine service secret. The OAuth
state is not compared that way; it is redeemed by primary key.

## Rate limiting

`rate_limit_counters` is a per-user, per-endpoint sliding window enforced in
the function, not the client. AI endpoints are additionally bounded by
`ai_usage_events`, so a runaway loop costs a rejection rather than a bill.

## Auditing

`audit_logs` records every external write, every refresh-token decryption,
every export and every deletion: who, what, when, and the outcome. The action
vocabulary is closed (`AUDIT_ACTIONS` in `_shared/audit.ts`) and metadata values
are restricted to strings, numbers, booleans and null, so a mail body or an
address cannot be written into an audit row even by accident.

It is retained 400 days — longer than user content on purpose. At the end it is
anonymised rather than deleted: `retention.ts` blanks `entity_id` and
`metadata`, so the row still records that a user did a thing on a date while
losing the link to the thing itself. Deleting an account leaves its final audit
row with a null `user_id`, precisely so the record outlives the account it
describes.

## The backoffice, and the "no human reads your mail" guarantee

Support tooling is `apps/backoffice`, a separate Next.js app that reads the
database through 16 `bo_*` views defined in `0017_backoffice.sql` and nothing
else. The migration is written to be audited: it lists, by name, every column
that could carry what a person wrote or received, and no view depends on one.

Three mechanisms hold it up, and all three are asserted by
`scripts/validate-supabase.mjs` on every push:

1. Every address an operator sees passes through `bo_redact_email()`, which
   renders `yunus.emre@example.com` as `y•••@example.com`.
2. Every free-text provider error passes through `bo_error_code()`. Only a
   token-shaped label survives; anything sentence-shaped — the kind of message
   that quotes the offending payload back at you — collapses to the literal
   `unstructured`. Operators get the failure class, never the narrative.
3. Every view is revoked from `anon` and `authenticated` and granted only to
   `service_role`. Supabase grants new objects in `public` to the client roles by
   default, so the revoke is load-bearing.

The validator re-derives each view's column dependencies from `pg_depend`, so a
view edited to select a content column fails the build rather than shipping.

## What is _not_ claimed

The architecture is **not** end-to-end encrypted, and no string in the product
says it is. The server decrypts and reads mail in order to analyse it; that is
the product. The two claims that are made, and are true:

> Veriler aktarım sırasında ve saklanırken şifrelenir.
> Verilerin reklamverenlere satılmaz.

`scripts/check-i18n-keys.mjs` and `packages/i18n/src/messages.test.ts` both
fail the build on any string matching _uçtan uca_ or _end-to-end_.

## Reporting a vulnerability

security@dijitalasistan.app. We respond within two working days and will not
pursue a good-faith reporter.
