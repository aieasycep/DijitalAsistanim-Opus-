# OAuth setup

Two providers, both optional. With neither configured the app runs in demo
mode; with one configured it works fully for that provider.

The design principle throughout: **request the least, as late as possible.**
Read scopes at connect time, write scopes only when the person first takes an
action that needs one.

---

## Scopes, and when each is asked for

### Google

| Group                      | Scopes                       | Asked                              |
| -------------------------- | ---------------------------- | ---------------------------------- |
| `identity`                 | `openid`, `email`, `profile` | At connect                         |
| `mailRead`                 | `gmail.readonly`             | At connect                         |
| `calendarRead`             | `calendar.readonly`          | At connect                         |
| `mailSend`                 | `gmail.send`                 | First time a reply is approved     |
| `calendarWrite`            | `calendar.events`            | First time an event is approved    |
| `tasksRead` / `tasksWrite` | `tasks.readonly`, `tasks`    | When tasks are turned on           |
| `contactsRead`             | `contacts.readonly`          | When contact matching is turned on |

`gmail.readonly` is a **restricted** scope: it requires a Google security
assessment. See [GOOGLE_OAUTH_VERIFICATION.md](GOOGLE_OAUTH_VERIFICATION.md).

Note what is _not_ requested: `gmail.modify` and `gmail.compose` are never
asked for. The app does not mark mail read, does not label, does not archive,
and cannot draft into someone's Gmail drafts folder. `gmail.send` sends the
one message the user approved and nothing else.

### Microsoft

| Group                      | Scopes                                                      | Asked                              |
| -------------------------- | ----------------------------------------------------------- | ---------------------------------- |
| `identity`                 | `openid`, `email`, `profile`, `offline_access`, `User.Read` | At connect                         |
| `mailRead`                 | `Mail.Read`                                                 | At connect                         |
| `calendarRead`             | `Calendars.Read`                                            | At connect                         |
| `mailSend`                 | `Mail.Send`                                                 | First approved reply               |
| `calendarWrite`            | `Calendars.ReadWrite`                                       | First approved event               |
| `tasksRead` / `tasksWrite` | `Tasks.Read`, `Tasks.ReadWrite`                             | When tasks are turned on           |
| `contactsRead`             | `Contacts.Read`                                             | When contact matching is turned on |

`Mail.ReadWrite` is deliberately not requested. `Mail.Read` cannot modify the
mailbox, which is what the app wants to be true.

---

## Google Cloud Console

1. **Create a project** at <https://console.cloud.google.com>.

2. **Enable APIs**: Gmail API, Google Calendar API, and — only if you are
   enabling those features — Google Tasks API and People API.

3. **OAuth consent screen**
   - User type: External.
   - App name, logo, support email, and the homepage, privacy policy and terms
     URLs. These must be reachable and must actually describe this app; the
     marketing site serves `/privacy` and `/terms` for exactly this.
   - Authorised domain: your production domain.
   - Add the scopes above. The console will mark `gmail.readonly` restricted.

4. **Credentials** — create the OAuth client IDs:

   | Type    | Used by                                               | Configure                                                        |
   | ------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
   | iOS     | The connect flow on iOS, and native sign-in           | Bundle ID: `com.dijitalasistan.app`; redirect `<scheme>://oauth` |
   | Android | The connect flow on Android, and native sign-in       | Package name + SHA-1 of your signing certificate                 |
   | Web     | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` for native sign-in | No redirect URI is needed for the connect flow                   |

   The redirect URI is the **app's own deep link**, not a Supabase function URL.
   The provider redirects to the device; the app then posts the code to
   `oauth-complete`. `GOOGLE_REDIRECT_URI` must be byte-identical to what
   `AuthSession.makeRedirectUri({ scheme, path: 'oauth' })` produces —
   `dijitalasistan://oauth` with the default `APP_SCHEME` — because
   `buildAuthorizeUrl` puts the environment value in the authorize URL while the
   app waits on the computed one.

   Because the token exchange runs server-side with a client secret, the client
   registered for it must be one Google will issue a secret for. If your console
   setup requires a Web application client for that, register the same
   `<scheme>://oauth` redirect on it and use its id and secret for
   `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

5. **Environment**

   ```bash
   # Server-side only. The client secret never reaches a bundle.
   supabase secrets set GOOGLE_CLIENT_ID=...
   supabase secrets set GOOGLE_CLIENT_SECRET=...
   supabase secrets set GOOGLE_REDIRECT_URI=dijitalasistan://oauth

   # Public by design — these identify the app, they do not authorise anything.
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...
   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...
   EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=...
   ```

6. **Optional: Gmail push.** Create a Pub/Sub topic, grant
   `gmail-api-push@system.gserviceaccount.com` the Publisher role, and point
   the push subscription at `.../functions/v1/webhook-gmail`. Without it the
   app polls, which works and is only less immediate.

---

## Microsoft Entra

1. **Register an application** at <https://entra.microsoft.com> → App
   registrations. Supported account types: personal _and_ work/school, unless
   you are shipping to one tenant.

2. **Redirect URI** — register `dijitalasistan://oauth` (i.e.
   `<APP_SCHEME>://oauth`) as a **Mobile and desktop applications** redirect.
   It is the app's deep link; there is no `oauth-microsoft-callback` function
   and never has been.

3. **API permissions** — delegated Microsoft Graph permissions from the table
   above. `Mail.Read` needs admin consent in most tenants; that is the tenant
   admin's decision, and the app degrades to calendar-only without it.

4. **Certificates & secrets** — create a client secret and note the _value_,
   which is shown once. The exchange is server-side, so this app registration is
   a confidential client despite the mobile redirect.

5. **Environment**

   ```bash
   supabase secrets set MICROSOFT_CLIENT_ID=...
   supabase secrets set MICROSOFT_CLIENT_SECRET=...
   supabase secrets set MICROSOFT_REDIRECT_URI=dijitalasistan://oauth
   supabase secrets set MICROSOFT_TENANT=common   # default when unset
   ```

6. **Optional: Graph subscriptions.** `webhook-microsoft` accepts change
   notifications and verifies their `clientState` against
   `MICROSOFT_WEBHOOK_SECRET` in constant time.

   Be aware of what is **not** wired up: Graph subscriptions last about three
   days, and nothing in this repository creates or renews one.
   `createSubscription` and `renewSubscription` exist in
   `_shared/providers/microsoft.ts` but have no caller, and there is no renewal
   cron job in `0014_cron_jobs.sql`. Until that is built, Outlook accounts stay
   current through the 15-minute `da_sync_incremental` poll, and any subscription
   you create by hand will lapse after three days.

---

## The flow, as implemented

There are exactly two OAuth functions, `oauth-start` and `oauth-complete`, and
both require the caller's own Supabase JWT. Nothing in the flow is a browser
callback into Supabase.

```
App                    oauth-start              Provider           oauth-complete
 │  POST /oauth-start      │                        │                    │
 │  { provider, kinds,     │                        │                    │
 │    scopeGroups,         │                        │                    │
 │    redirectTo }         │                        │                    │
 ├────────────────────────►│                        │                    │
 │                         │ 32 random bytes = state│                    │
 │                         │ insert oauth_states    │                    │
 │                         │ (user, provider,       │                    │
 │                         │  scopes, expires_at    │                    │
 │  { authorizeUrl, state }│  = now + 10 min)       │                    │
 │◄────────────────────────┤                        │                    │
 │                                                  │                    │
 │  open authorizeUrl in an ephemeral browser ─────►│                    │
 │                                                  │                    │
 │◄── redirect: dijitalasistan://oauth?code&state ──┤                    │
 │                                                                       │
 │  the app compares the returned state with the one it started with     │
 │                                                                       │
 │  POST /oauth-complete { code, state }                                 │
 ├──────────────────────────────────────────────────────────────────────►│
 │                                     consumeState: DELETE … RETURNING  │
 │                                     (single use) + expiry check;      │
 │                                     reject if state.user ≠ JWT user;  │
 │                                     exchange the code with the client │
 │                                     secret; read the provider profile;│
 │                                     upsert connected_accounts;        │
 │                                     AES-256-GCM the tokens and store  │
 │◄─────────────────────── { account: <connected_accounts row> } ────────┤
```

Points worth stating plainly:

- The client never sees the client secret or the refresh token. Both live only
  server-side, and the response body is the `connected_accounts` row, which
  holds no credential.
- **PKCE is not used, and is not needed here.** PKCE protects a public client
  that cannot hold a secret; this exchange happens in an edge function with the
  client secret, so it is a confidential client. No `code_challenge` is sent and
  `oauth_states` has no verifier column.
- The `state` is what binds the response to the request. It is 32 random bytes,
  stored server-side (not signed into the URL, which would be replayable),
  redeemed exactly once by an atomic `delete … returning` on its primary key,
  and rejected after ten minutes. The app also compares the returned state with
  the one `oauth-start` handed it, before it posts anything.
- The provider, the user and the account being widened all come from the stored
  state, never from the request body — so a caller holding a stolen code cannot
  say whose account it belongs to.
- `oauth-complete` does **not** start a sync, whatever an earlier revision of
  this diagram said. It returns the account row and stops. First-run backfill is
  the onboarding screen calling `initial-analysis`; the accounts settings screen
  has a per-account sync button calling `sync-start`; and `da_sync_incremental`
  picks the account up within fifteen minutes regardless.
- The browser session is ephemeral (`preferEphemeralSession: true`), so an
  account chooser does not silently reuse a session the user forgot about.
- Progressive scopes reuse the same flow with `include_granted_scopes`, so
  granting `gmail.send` later does not invalidate the read grant. `oauth-start`
  re-derives the read groups from the account kinds and merges them with the
  requested ones, so a step-up never drops a scope on a provider that does not
  merge previous grants.
- The kinds an account is recorded with come from what the provider actually
  granted, not from what was asked for: un-ticking mail on the consent screen
  produces an account that is not listed as a mailbox, rather than one that
  fails on every sync. Declining everything is refused outright.

---

## When it goes wrong

| Symptom                                    | Cause                                                                                                                     | Fix                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `redirect_uri_mismatch`                    | Console URI differs from `GOOGLE_REDIRECT_URI` / `MICROSOFT_REDIRECT_URI`, or one of them still points at a function URL  | Register `<APP_SCHEME>://oauth` and set the secret to exactly that                                                           |
| Consent screen returns but nothing happens | `GOOGLE_REDIRECT_URI` is not the deep link the app is listening on                                                        | It must equal `makeRedirectUri({ scheme, path: 'oauth' })` byte for byte                                                     |
| `oauth_failed: provider_not_configured`    | One of `*_CLIENT_ID`, `*_CLIENT_SECRET`, `*_REDIRECT_URI` is unset — `oauth-start` refuses before opening a broken screen | `supabase secrets list`                                                                                                      |
| `oauth_failed: unknown_state`              | The state was already redeemed, or a retry re-posted a burned code                                                        | Start the connect again; `completeOAuth` is deliberately not retried                                                         |
| `oauth_failed: state_expired`              | More than ten minutes between opening consent and finishing it                                                            | Start the connect again                                                                                                      |
| `invalid_client`                           | Secret not set on the function, or set on the wrong project                                                               | `supabase secrets list`                                                                                                      |
| `oauth_scope_missing`                      | Every data permission was un-ticked on the consent screen                                                                 | Reconnect and grant at least one read scope                                                                                  |
| No refresh token                           | Google only issues one on the first consent                                                                               | `access_type=offline` and `prompt=consent` are already sent on every authorize; revoke at myaccount.google.com and reconnect |
| `Mail.Read` refused                        | Tenant requires admin consent                                                                                             | Ask the admin, or continue calendar-only                                                                                     |
| Token revoked while syncing                | User revoked access                                                                                                       | Account is marked `revoked`, the user is told which one, everything else keeps working                                       |
