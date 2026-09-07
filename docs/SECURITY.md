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

- **Never stored in plaintext.** `oauth_credentials.refresh_token_ciphertext`
  is AES-256-GCM, with a 96-bit random nonce per row and the GCM tag appended.
  A tampered ciphertext fails to decrypt rather than yielding chosen bytes.
- **Never sent to a client.** No endpoint returns it, in any shape. The mobile
  app has no code path that could hold one.
- **Encrypted with an environment secret.** `OAUTH_ENCRYPTION_KEY` is a
  function secret, not a database value, so a database dump alone is inert.
- **Versioned per row.** `key_version` lets a rotation re-encrypt lazily: set
  `OAUTH_ENCRYPTION_KEY_V2`, bump `OAUTH_ENCRYPTION_KEY_VERSION`, and rows
  written under either key keep opening while the sweep catches up.
- **Decrypted only in memory,** inside the function that is about to make the
  provider call, never written back in the clear.

Access tokens are short-lived and encrypted the same way. Every decryption
appends to `audit_logs` with the function, the account and the reason — never
the token.

```bash
# Generate a key
openssl rand -base64 32

# Rotate
supabase secrets set OAUTH_ENCRYPTION_KEY_V2="$(openssl rand -base64 32)"
supabase secrets set OAUTH_ENCRYPTION_KEY_VERSION=2
# Old rows keep working; the retention sweep re-encrypts them.
```

Tests: `supabase/tests/crypto.test.ts` covers the round trip, nonce
uniqueness, tamper detection, cross-version failure and the rotation path.

---

## 2 · Row-level security

Every user table has RLS **enabled and forced**. `FORCE` is the part people
forget: without it, the table owner bypasses its own policies, and the owner is
the role migrations run as.

The policy shape is uniform:

```sql
alter table public.email_threads enable row level security;
alter table public.email_threads force row level security;

create policy "own rows" on public.email_threads
  for select using (user_id = auth.uid());
```

Clients get `select` and nothing else. Every insert, update and delete goes
through an edge function running with the service role, which derives
`user_id` from the verified JWT — never from the request body.

`scripts/validate-supabase.mjs` applies all 16 migrations to a throwaway
PostgreSQL and asserts that every user table has RLS enabled _and_ forced, and
that every client-readable table has a policy. It runs in CI on every push. A
new table without RLS fails the build.

---

## 3 · Secrets and the client bundle

Only `EXPO_PUBLIC_*` and `NEXT_PUBLIC_*` reach a bundle. Everything else is a
server secret set with `supabase secrets set`.

`scripts/check-secrets.mjs` enforces this on every push. It reads the variable
names out of `.env.example`, and fails if any of them is referenced from
`apps/mobile/{app,src,modules}`, `apps/web/src` or any shared package — those
all compile into the binary. It also fails on a committed credential (private
key blocks, AWS/Google/Slack/Stripe/OpenAI/GitHub key shapes, service-role
JWTs), on a name like `EXPO_PUBLIC_..._SECRET`, and on a `.env.example` that
ships with a credential filled in.

The Supabase anon key _is_ public by design — RLS is what protects the data,
not the key's obscurity.

---

## 4 · PII in telemetry

Analytics properties are a closed vocabulary: numbers, booleans, and a fixed
enum of about fifty strings. The type system refuses anything else.

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
- OAuth uses PKCE S256 with a random `state`, verified on return; a mismatch
  aborts before any token exchange. `oauth_states` rows are single-use and
  expire in 10 minutes.
- Sign-out revokes the session server-side and clears the local store.

## Rate limiting

`rate_limit_counters` is a per-user, per-endpoint sliding window enforced in
the function, not the client. AI endpoints are additionally bounded by
`ai_usage_events`, so a runaway loop costs a rejection rather than a bill.

## Auditing

`audit_logs` records every external write, every token decryption, every
export and every deletion: who, what, when, and the outcome. It is retained
400 days — longer than user content on purpose — and anonymised rather than
deleted at the end, so the record of what the assistant did outlives the data
it did it to.

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
