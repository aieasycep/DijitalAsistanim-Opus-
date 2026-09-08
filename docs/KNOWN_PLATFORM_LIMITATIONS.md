# Known platform limitations

Things the product would do if the platforms allowed it, and what it does
instead. Every entry here is a genuine platform constraint, not a shortcut —
the distinction matters, because a reader should be able to tell which is
which.

---

## iOS cannot read other apps' notifications

There is no public API. `UNNotificationServiceExtension` can modify _this_
app's own notifications before display and nothing else. Any app claiming
otherwise on iOS is either using a private API or describing an Android
feature.

**Instead**: the iOS build reads mail, calendar and tasks through the
providers' APIs, which is where that information originates anyway. The
notification-access setting is not shown on iOS, and no copy on either
platform implies the feature exists there.

## iOS widgets cannot refresh on demand

WidgetKit budgets timeline reloads — roughly 40–70 a day, at the system's
discretion. A widget cannot poll, and `reloadTimelines` from the app is a
request rather than a command.

**Instead**: the app writes a snapshot to the shared App Group container
whenever the Today feed changes, and asks for a reload. The widget renders
from the snapshot, so it is correct as of the last app foreground or push,
and it shows a relative timestamp so a stale reading is visibly stale rather
than quietly wrong.

## iOS background execution is not a schedule

`BGAppRefreshTask` runs when iOS decides, based on usage patterns. A 07:30
briefing cannot be generated on the device at 07:30.

**Instead**: briefings are generated server-side on a cron schedule and
delivered by push. The device does no background work, which also means the
briefing is ready on a phone that was off overnight.

## Android notification access is a special permission

`BIND_NOTIFICATION_LISTENER_SERVICE` cannot be requested from a dialog. The
user must enable it in a system settings screen, and Play reviews the
justification.

**Instead**: the app explains what it reads and what it never reads, then
opens the settings screen. It stays fully functional with the permission off.
OTP and authenticator notifications are dropped before processing, content
requires a second separate opt-in, and retention is a fixed 30 days regardless
of the user's own setting.

## Android background restrictions vary by manufacturer

Several OEMs kill background services aggressively regardless of the standard
Android rules, and the behaviour is not consistently documented.

**Instead**: nothing time-critical runs on the device. Notifications are
scheduled server-side; the local scheduler is a redundant fallback, not the
mechanism.

## Gmail does not have a real-time push for everything

Gmail's Pub/Sub push covers mailbox changes but needs a Cloud project, a topic
and a subscription, and it is not available to every account type.

**Instead**: push where it works, polling every **fifteen** minutes where it
does not — `da_sync_incremental` in `0014_cron_jobs.sql`, `*/15 * * * *`. The
user sees a "last synced" time either way, so the difference is visible rather
than hidden.

## Microsoft Graph subscriptions expire

Change notification subscriptions last three days at most, and renewal can
fail while a tenant is unreachable.

**Instead**: the same fifteen-minute incremental sync covers Outlook, and a
lapsed subscription degrades latency rather than correctness.

Stated plainly because this document previously claimed otherwise: **there is no
renewal job.** `createSubscription` and `renewSubscription` exist in
`supabase/functions/_shared/providers/microsoft.ts` and have no caller;
`0014_cron_jobs.sql` schedules six jobs and none of them renews a Graph
subscription. `webhook-microsoft` will accept and verify a notification if a
subscription is created out of band, but nothing in this repository creates one.
This is a gap, not a platform limit — it belongs on the list in
[IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md#honest-limitations) rather
than here, and it is recorded in both places until it is built.

## Restricted Google scopes need an assessment

`gmail.readonly` requires a security assessment costing $15,000–$75,000 and
taking six to eight weeks. Until it completes, an unverified app is capped at
100 users and shows a warning.

**Instead**: Microsoft accounts work fully throughout, and demo mode needs no
account at all. See [GOOGLE_OAUTH_VERIFICATION.md](GOOGLE_OAUTH_VERIFICATION.md).

## Speech recognition on device is language-limited

`expo-speech` and the platform recognisers vary in Turkish quality, and
on-device recognition is unavailable on older hardware.

**Instead**: recording goes to a server-side transcription provider when one is
configured, and falls back to the platform recogniser when it is not. The
transcript is always shown before the question is asked, so a mis-hearing is
caught by the person rather than answered confidently.

## App Store rules about the paywall

Digital subscriptions must use in-app purchase, and the app may not link out
to an external purchase page.

**Instead**: RevenueCat over StoreKit and Play Billing. The referral system
grants bonus _days_, never a discount on the store price, which keeps it
inside both stores' rules.

## Web push is not supported

The website is marketing only. Push requires the app.

**Instead**: the site says so plainly rather than collecting an address for a
notification it cannot send.

---

## Not on this list

Two things a reader might expect to find here, which are product decisions
rather than platform limits:

- **The app never sends mail automatically.** That is a choice, and it would
  be technically possible to do otherwise.
- **The app never marks mail read or archives it.** Also a choice — the scopes
  that would allow it are deliberately not requested.
