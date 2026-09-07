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

4. **Credentials** — create three OAuth client IDs:

   | Type            | Used by                                       | Configure                                                                            |
   | --------------- | --------------------------------------------- | ------------------------------------------------------------------------------------ |
   | Web application | The token exchange in `oauth-google-callback` | Redirect URI: `https://<project-ref>.supabase.co/functions/v1/oauth-google-callback` |
   | iOS             | Native sign-in                                | Bundle ID: `com.dijitalasistan.app`                                                  |
   | Android         | Native sign-in                                | Package name + SHA-1 of your signing certificate                                     |

5. **Environment**

   ```bash
   # Server-side only. The client secret never reaches a bundle.
   supabase secrets set GOOGLE_CLIENT_ID=...
   supabase secrets set GOOGLE_CLIENT_SECRET=...
   supabase secrets set GOOGLE_REDIRECT_URI=https://<ref>.supabase.co/functions/v1/oauth-google-callback

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

2. **Redirect URI** (Web):
   `https://<project-ref>.supabase.co/functions/v1/oauth-microsoft-callback`

3. **API permissions** — delegated Microsoft Graph permissions from the table
   above. `Mail.Read` needs admin consent in most tenants; that is the tenant
   admin's decision, and the app degrades to calendar-only without it.

4. **Certificates & secrets** — create a client secret and note the _value_,
   which is shown once.

5. **Environment**

   ```bash
   supabase secrets set MICROSOFT_CLIENT_ID=...
   supabase secrets set MICROSOFT_CLIENT_SECRET=...
   supabase secrets set MICROSOFT_REDIRECT_URI=https://<ref>.supabase.co/functions/v1/oauth-microsoft-callback
   supabase secrets set MICROSOFT_TENANT=common
   ```

6. **Optional: Graph subscriptions.** `webhook-microsoft` accepts change
   notifications; subscriptions expire every 3 days and are renewed by a cron
   job. Without them the app polls.

---

## The flow, as implemented

```
App                    oauth-start              Provider           oauth-complete
 │  POST /oauth-start      │                        │                    │
 ├────────────────────────►│                        │                    │
 │                         │ generate state + PKCE  │                    │
 │                         │ store in oauth_states  │                    │
 │  { authUrl, state }     │  (single use, 10 min)  │                    │
 │◄────────────────────────┤                        │                    │
 │                                                  │                    │
 │  open in an ephemeral browser session ──────────►│                    │
 │                                                  │                    │
 │◄── redirect: dijitalasistan://oauth?code&state ──┤                    │
 │                                                                       │
 │  POST /oauth-complete { code, state }                                 │
 ├──────────────────────────────────────────────────────────────────────►│
 │                                             verify state (constant    │
 │                                             time), exchange code with │
 │                                             the client secret,        │
 │                                             AES-256-GCM the refresh   │
 │                                             token, store, start sync  │
 │◄──────────────────── { accountId, email, scopes } ────────────────────┤
```

Points worth stating plainly:

- The client never sees the client secret or the refresh token. Both live only
  server-side.
- `state` is compared in constant time; a mismatch aborts before any exchange.
- The browser session is ephemeral (`preferEphemeralSession: true`), so an
  account chooser does not silently reuse a session the user forgot about.
- Progressive scopes reuse the same flow with `include_granted_scopes`, so
  granting `gmail.send` later does not invalidate the read grant.

---

## When it goes wrong

| Symptom                     | Cause                                                                        | Fix                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `redirect_uri_mismatch`     | Console URI differs from `GOOGLE_REDIRECT_URI`, including the trailing slash | Make them identical                                                                    |
| `invalid_client`            | Secret not set on the function, or set on the wrong project                  | `supabase secrets list`                                                                |
| No refresh token            | Google only issues one on the first consent                                  | Add `prompt=consent`, or revoke at myaccount.google.com and reconnect                  |
| `Mail.Read` refused         | Tenant requires admin consent                                                | Ask the admin, or continue calendar-only                                               |
| Token revoked while syncing | User revoked access                                                          | Account is marked `revoked`, the user is told which one, everything else keeps working |
