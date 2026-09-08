# Deployment

Five things ship independently: the database, the edge functions, the mobile
apps, the website and the staff backoffice. Nothing here requires the others to
be deployed first, except that the functions and the backoffice both expect the
migrations to have run.

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

It applies all 18 migrations from empty, applies them again to prove
idempotency, checks every Postgres enum against its TypeScript union, asserts
RLS is enabled **and** forced on every user table, and proves that no backoffice
view reads a content column.

### Extensions

`0001_extensions_and_enums.sql` creates `pgcrypto`, `pg_trgm`, `unaccent`,
`vector` (assistant memory) and `citext`, each inside a `do` block that survives
the extension being unavailable.

It does **not** create `pg_cron` or `pg_net`. Enable those on the project
yourself — on Supabase, Database → Extensions, no support request needed.
`0014_cron_jobs.sql` checks `pg_extension` for both and degrades rather than
failing: without `pg_cron` it schedules nothing at all, and without `pg_net` it
schedules only the jobs that have a pure-SQL implementation. A database without
`pg_cron` therefore runs no background work whatsoever — no sync, no briefing,
no push — while migrating perfectly cleanly.

### Scheduled jobs

`0014_cron_jobs.sql` registers six jobs. Each prefers an HTTP call to the
matching edge function over `pg_net`, so the logic lives in one place; the
function base URL and service key are read at fire time from
`app.settings.supabase_url` and `app.settings.service_role_key`, so no secret
is committed or visible in a schema dump.

| Job                      | Schedule                 | Calls                    | Without `pg_net`                      |
| ------------------------ | ------------------------ | ------------------------ | ------------------------------------- |
| `da_sync_incremental`    | `*/15 * * * *`           | `sync-start`             | Not scheduled — syncing needs HTTP    |
| `da_briefing_dispatch`   | `*/5 * * * *`            | `notification-scheduler` | Not scheduled — push needs HTTP       |
| `da_follow_up_detection` | `0 * * * *` (hourly)     | `detect-followups`       | Not scheduled — needs HTTP            |
| `da_approval_expiry`     | `*/10 * * * *`           | `approvals-expire`       | `public.expire_stale_approvals()`     |
| `da_retention_cleanup`   | `15 3 * * *` (03:15 UTC) | `retention-cleanup`      | `public.cleanup_expired_retention()`  |
| `da_export_cleanup`      | `45 3 * * *` (03:45 UTC) | — (pure SQL always)      | Marks ready-but-stale exports expired |

`da_briefing_dispatch` is the only caller of push delivery in the whole system.
It runs every five minutes rather than hourly because briefing times are per
user and per time zone: `notification-scheduler` selects the users whose local
clock has just crossed their configured time and the reminders now due, which
keeps the schedule timezone-agnostic and serves any offset within five minutes.

`da_approval_expiry` and `da_retention_cleanup` are the two with a real SQL
fallback, because an approval must never outlive its TTL and retention must
apply even on a database that cannot make outbound calls.

There is **no** job that renews Microsoft Graph change subscriptions.
`createSubscription` and `renewSubscription` exist in
`_shared/providers/microsoft.ts` but nothing calls them; Outlook accounts stay
current through `da_sync_incremental` every fifteen minutes.

The migration unschedules each job by name before scheduling it, so it is
re-runnable and a renamed schedule cannot leave an orphan firing on the old
cadence.

---

## 2 · Edge functions

There are 48 of them (`ls supabase/functions | grep -v _shared | grep -v deno`).

```bash
supabase functions deploy --no-verify-jwt webhook-gmail
supabase functions deploy --no-verify-jwt webhook-microsoft
supabase functions deploy --no-verify-jwt revenuecat-webhook

# Everything else verifies the caller's JWT.
supabase functions deploy
```

Exactly three functions are called by a provider rather than by the app, so
they cannot require a user JWT. Each verifies its caller by its own means, all
three with `timingSafeEqual`: `webhook-gmail` against
`GOOGLE_PUBSUB_VERIFICATION_TOKEN`, `webhook-microsoft` against the Graph
`clientState` (`MICROSOFT_WEBHOOK_SECRET`), and `revenuecat-webhook` against
`REVENUECAT_WEBHOOK_AUTH_HEADER`.

Four more — `approvals-expire`, `detect-followups`, `notification-scheduler` and
`retention-cleanup` — take no user JWT either, but they are invoked by `pg_cron`
with the service-role key as their bearer token, so the platform's JWT
verification passes and they keep it. Do not deploy them with `--no-verify-jwt`.

Both OAuth functions **do** require a user JWT: the flow terminates in the app,
not in a browser redirect to the server, so `oauth-start` and `oauth-complete`
are ordinary authenticated calls. There is no `oauth-google-callback` or
`oauth-microsoft-callback`; earlier revisions of this document named functions
that have never existed. See [OAUTH_SETUP.md](OAUTH_SETUP.md).

### Secrets

```bash
supabase secrets set \
  OAUTH_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  OAUTH_ENCRYPTION_KEY_VERSION=1 \
  GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... \
  GOOGLE_REDIRECT_URI=dijitalasistan://oauth \
  MICROSOFT_CLIENT_ID=... MICROSOFT_CLIENT_SECRET=... \
  MICROSOFT_REDIRECT_URI=dijitalasistan://oauth \
  ANTHROPIC_API_KEY=... \
  REVENUECAT_WEBHOOK_AUTH_HEADER=...
```

The redirect URIs are the app's own deep link, not a function URL — the
provider redirects to the device and the app posts the code to
`oauth-complete`. `MICROSOFT_TENANT` defaults to `common` when unset.

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

Ten pages (`/`, `/pricing`, `/privacy`, `/terms`, `/support`, `/licenses`,
`/data-deletion`, `/oauth`, `/l/[[...target]]`, `/davet/[code]`) plus
`not-found`, `robots.ts`, `sitemap.ts`, an Open Graph image route and the two
`.well-known` handlers. Static except `/l/[[...target]]` and `/davet/[code]`,
which are dynamic because they read route params. Deploy to any Node host;
Vercel needs no configuration.

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

## 5 · Staff backoffice

```bash
pnpm run build:backoffice   # or pnpm run dev:backoffice, port 3100
```

`apps/backoffice` needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and an anon
key (`SUPABASE_ANON_KEY`, falling back to `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
Any missing one is a 500 naming the variable, not a silent degradation.

The anon key only signs staff in through GoTrue and refreshes their token; every
data read goes through the `bo_*` views with the service role. A session counts
only when the access-token cookie verifies, the user has a `staff_members` row,
and that row's `disabled_at` is null — checked on every protected request, so
revoking access takes effect immediately rather than at the next cookie expiry.
Roles are ordered `support` < `ops` < `admin`.

**Do not expose this app publicly.** It holds the service role, which bypasses
RLS; put it behind whatever network boundary you would put a database console
behind.

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
