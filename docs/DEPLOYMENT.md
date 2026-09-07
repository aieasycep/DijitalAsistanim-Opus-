# Deployment

Four things ship independently: the database, the edge functions, the mobile
apps and the website. Nothing here requires the others to be deployed first,
except that the functions expect the migrations to have run.

---

## 1 · Database

```bash
supabase link --project-ref <ref>
supabase db push
```

Migrations are re-runnable, so a failed push can be re-run rather than
restored. Before pushing to production, prove them against a throwaway
database — which is exactly what CI does on every commit:

```bash
pnpm run verify:supabase
```

It applies all 16 migrations from empty, applies them again to prove
idempotency, checks every Postgres enum against its TypeScript union, and
asserts RLS is enabled **and** forced on every user table.

### Extensions

`pgvector` (assistant memory), `pg_cron` (scheduled jobs), `pg_net` (calling
functions from cron). All three are enabled by `0001_extensions_and_enums.sql`;
on Supabase they are available without a support request.

### Scheduled jobs

`0014_cron_jobs.sql` registers them. They call edge functions over `pg_net`,
so the logic lives in one place:

| Job                        | Schedule        | Does                                                                     |
| -------------------------- | --------------- | ------------------------------------------------------------------------ |
| `briefing-morning`         | every 15 min    | Generates briefings for users whose local time has reached their setting |
| `briefing-evening`         | every 15 min    | The evening close                                                        |
| `sync-poll`                | every 10 min    | Polls accounts without a working webhook                                 |
| `detect-followups`         | hourly          | Surfaces threads that have gone quiet                                    |
| `approvals-expire`         | hourly          | Expires proposals past their TTL                                         |
| `retention-cleanup`        | daily 03:00 UTC | Applies each user's retention window                                     |
| `subscription-refresh`     | daily           | Reconciles with RevenueCat                                               |
| `graph-subscription-renew` | every 12 h      | Renews Microsoft change subscriptions before they lapse                  |

The briefing jobs run every fifteen minutes rather than hourly because
briefing times are per user and per time zone; the job selects the users whose
local clock has just crossed their configured time.

---

## 2 · Edge functions

```bash
supabase functions deploy --no-verify-jwt oauth-google-callback
supabase functions deploy --no-verify-jwt oauth-microsoft-callback
supabase functions deploy --no-verify-jwt webhook-gmail
supabase functions deploy --no-verify-jwt webhook-microsoft
supabase functions deploy --no-verify-jwt revenuecat-webhook

# Everything else verifies the caller's JWT.
supabase functions deploy
```

The five above are called by a provider, not by the app, so they cannot
require a user JWT. Each verifies its caller by its own means instead: the
OAuth callbacks by single-use `state`, the webhooks by signature
(constant-time comparison), RevenueCat by its shared secret.

### Secrets

```bash
supabase secrets set \
  OAUTH_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  OAUTH_ENCRYPTION_KEY_VERSION=1 \
  GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... \
  MICROSOFT_CLIENT_ID=... MICROSOFT_CLIENT_SECRET=... \
  ANTHROPIC_API_KEY=... \
  REVENUECAT_WEBHOOK_SECRET=...
```

`supabase secrets list` shows names only, never values. See `.env.example` for
the full list with comments, and [SECURITY.md](SECURITY.md) for the key
rotation procedure.

Every one of these is optional. A missing key disables its feature and nothing
else — no key means device TTS instead of a speech provider, full-text search
instead of embeddings, everyone on the free tier instead of a crash.

---

## 3 · Mobile

### Builds

```bash
eas build --platform ios --profile production
eas build --platform android --profile production
```

`eas.json` defines `development` (dev client, simulator), `preview` (internal
distribution) and `production` (store).

### Before the first build

- **iOS**: an Apple Developer account, an App ID with the App Groups
  capability, and an App Group matching `APP_IOS_APP_GROUP` — the widget and
  share extension read it, so a mismatch produces a widget that renders
  nothing.
- **Android**: an upload keystore. EAS manages it, or supply your own; the
  SHA-1 must match the one in the Google OAuth Android client, or native
  sign-in fails with a message that does not say so.

### The native pieces

`expo prebuild` regenerates `ios/` and `android/` from `app.config.ts` and the
config plugins. Neither directory is checked in. The custom native code is a
local Expo module at `apps/mobile/modules/da-native`, picked up by
autolinking; the plugins only edit the Xcode project and the merged manifest.

Deployment target is iOS 16.4 across the app, the widget and the share
extension — Expo SDK 57's floor, and the app config will not even resolve
below it.

### Over-the-air updates

```bash
eas update --branch production --message "..."
```

JavaScript only. A change to `app.config.ts`, a plugin, or any native
dependency needs a new binary; `runtimeVersion` is `appVersion`, so an OTA
cannot land on an incompatible build.

---

## 4 · Website

```bash
pnpm run build:web
```

Static except `/l/[[...target]]` and `/davet/[code]`, which are dynamic
because they read the request. Deploy to any Node host; Vercel needs no
configuration.

### Deep links

Two routes must be served at the apex domain, over HTTPS, with no redirect:

- `/.well-known/apple-app-site-association` — `application/json`, no extension
- `/.well-known/assetlinks.json` — with the SHA-256 of the release signing key

Both are route handlers in `apps/web/src/app`, so they are generated from
config rather than pasted. They claim `/l/*` and `/davet/*` only — deliberately
not the legal or support pages, because a universal link on those would open
the app when somebody taps "Privacy Policy" in a browser, which is the opposite
of what they asked for.

Verify with Apple's CDN (`https://app-site-association.cdn-apple.com/a/v1/<domain>`)
and Google's Digital Asset Links tester before announcing anything.

---

## Environments

|             | Supabase                 | Bundle id                        | Website                      |
| ----------- | ------------------------ | -------------------------------- | ---------------------------- |
| Development | Local (`supabase start`) | `com.dijitalasistan.app.dev`     | `localhost:3000`             |
| Staging     | Staging project          | `com.dijitalasistan.app.staging` | `staging.dijitalasistan.app` |
| Production  | Production project       | `com.dijitalasistan.app`         | `dijitalasistan.app`         |

Every identifier in `app.config.ts` is environment-overridable, so the three
coexist on one device without editing a file.

---

## Rollback

| Broken thing  | Rollback                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Edge function | `supabase functions deploy <name>` from the previous commit — functions are versioned per deploy                                            |
| OTA update    | `eas update:rollback`                                                                                                                       |
| Binary        | Halt the phased release; submit a build with the previous JS                                                                                |
| Migration     | Migrations are forward-only. Write a compensating migration. This is why `verify:supabase` runs on every push and not just before a deploy. |

## Monitoring

- Function logs: `supabase functions logs <name> --tail`.
- `audit_logs` is the record of what was actually done on users' behalf.
- `ai_usage_events` for spend per user per day.
- The error adapter reports crashes with PII scrubbed; a build without a
  reporting key logs locally and does not crash.
