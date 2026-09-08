# Privacy: what is collected, where it goes, how long it stays

Written to be checkable. Every claim here corresponds to code, and most
correspond to a test.

---

## What is collected

| Data                         | Source                                | Why                                          | Where it is stored                      |
| ---------------------------- | ------------------------------------- | -------------------------------------------- | --------------------------------------- |
| Email metadata and body text | Gmail / Microsoft Graph, with consent | Summaries, priority, commitments, follow-ups | `email_threads`, `email_messages`       |
| Calendar events              | Google / Microsoft Calendar           | The day's plan, conflicts, meeting prep      | `calendar_events`                       |
| Contacts                     | Optional, on request                  | Matching names to addresses                  | `contacts`                              |
| Tasks                        | Optional                              | One list instead of three                    | `tasks`                                 |
| Captures                     | The user, deliberately                | Analysis of a link, photo, document or note  | `captures`, Supabase Storage            |
| Device notifications         | Android only, opt-in                  | Delivery, banking and booking alerts         | `device_notifications`                  |
| Usage events                 | The app                               | Product decisions                            | Analytics vendor — **no content, ever** |
| Subscription state           | RevenueCat                            | Entitlements                                 | `subscriptions`                         |

## What is never collected

- Passwords. Authentication is OTP and identity tokens.
- Location. No location permission is requested on either platform.
- The contents of other apps. iOS has no such API; on Android the notification
  listener is opt-in, filtered, and never reads app content.
- Anything for advertising. There is no advertising SDK in the build.

---

## Where it goes

```
Device ──TLS 1.3──► Supabase (eu-central-1)
                      │
                      ├──► Postgres, encrypted at rest (AES-256)
                      ├──► Storage, encrypted at rest, signed URLs only
                      │
                      ├──TLS──► Google / Microsoft   (fetch mail and calendar)
                      ├──TLS──► Anthropic / OpenAI   (analysis; no training)
                      ├──TLS──► RevenueCat           (subscription state only)
                      └──TLS──► Expo Push            (notification title/body)
```

**The model providers** receive message text for analysis, under agreements
that forbid training on it. They do not receive the user's identity — requests
carry an opaque id, not an address.

**The analytics vendor** receives counts, booleans and the 46 strings of a
closed enum, on 21 named events and no others. It never receives a subject, a
body, a name, an address or anything the assistant wrote. This is enforced
twice: by the type system, and at runtime by a validator that drops the entire
event on any violation rather than sending a redacted one.

**Company staff** reach user records only through the 16 `bo_*` database views,
none of which selects a column that can carry message content. Addresses are
projected through `bo_redact_email()` and provider errors through
`bo_error_code()`. The views are granted to `service_role` alone, and CI
re-derives their column dependencies from `pg_depend` on every push, so this is
a schema property rather than an access policy. See
[SECURITY.md](SECURITY.md#the-backoffice-and-the-no-human-reads-your-mail-guarantee).

**Push notifications** carry a title and body which may contain a sender name
or a subject fragment — that is what makes a notification useful.
`lock_screen_privacy` has three values and defaults to `title_only`: `full`
sends both, `title_only` sends the title and drops the body, `generic` replaces
the title with "Dijital Asistan" too. The setting is read from
`notification_preferences` in `_shared/push.ts` and applied before the payload
is built, so the device is never sent content it was told to hide.

The hosting region and the negotiated TLS version are deployment facts, not
properties of this codebase — everything else on this page can be checked
against the source.

---

## How long it stays

Every row below is `RETENTION_TABLES` in `packages/domain/src/retention.ts`,
swept daily at 03:15 UTC by `da_retention_cleanup`.

| Data                                                                                                   | Retention                                         | Set by                                                                |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------- |
| Mail, calendar analysis, insights, life events, briefings, captures, assistant messages, memory chunks | 30 days / 90 days / 1 year / until deleted        | The user. Default 90 days.                                            |
| Device notifications                                                                                   | 30 days, fixed                                    | Not user-adjustable — deliberately short                              |
| Approval actions                                                                                       | 365 days, fixed                                   | The record of what was done on the user's behalf                      |
| Audit logs                                                                                             | 400 days, then `entity_id` and `metadata` blanked | Outlives content on purpose                                           |
| Export request rows                                                                                    | 30 days, fixed                                    | Then removed with the sweep                                           |
| A ready export archive                                                                                 | 7 days                                            | `expires_at`; `da_export_cleanup` marks it expired daily at 03:45 UTC |
| An export download link                                                                                | 1 hour                                            | The signed URL's own lifetime                                         |

**A deleted account is gone immediately.** There is no 30-day recovery window
and this document previously claimed one. `delete-account` revokes the provider
tokens, deletes the Storage objects, and then deletes the auth user, whose
cascade clears every table — in that order, so a failure part-way through leaves
the user better off rather than worse. Typing the account's own email address is
the confirmation gate; a mismatch is a refusal.

A retention change applies going forward: shortening the window schedules old
rows for the next sweep rather than deleting anything while the user is still
on the settings screen. OAuth connections are **never** swept — disconnecting
an account is an explicit action, not a side effect of a window elapsing.

---

## What the user can do about it

Every one of these is a working screen, not a support address:

| Control                                                      | Where                               |
| ------------------------------------------------------------ | ----------------------------------- |
| See everything that has been learned, and forget any of it   | Settings → AI personalisation       |
| Choose which mailboxes and calendars are read                | Settings → What we read             |
| Choose the retention window                                  | Settings → What we read             |
| Export everything, as JSON, by email                         | Settings → Privacy → Export         |
| Delete all analysis, keeping the account                     | Settings → Privacy → Delete history |
| Delete the account and everything in it                      | Settings → Privacy → Delete account |
| Disconnect an account, optionally deleting what came from it | Settings → Connected accounts       |
| Turn off learning entirely                                   | Settings → AI personalisation       |

**Export** produces a JSON archive of every row belonging to the user, plus the
captured files, written to the `exports` bucket and handed back as a signed link
valid for **one hour**. Asking again re-signs it, up to seven days after the
archive was written. Fulfilled within 30 days as the GDPR requires, in practice
within the request itself.

**Deletion** revokes provider tokens with Google (Microsoft Graph has no revoke
endpoint, and the local credentials are deleted either way), deletes the
`captures` and `exports` objects, then deletes the auth user — whose foreign-key
cascade clears every table, scheduled notifications and push tokens included. It
leaves one audit row with a null `user_id`, so the record of the deletion
outlives the account. **It is irreversible immediately.**

---

## Legal basis (GDPR / KVKK)

| Purpose                       | Basis                                    |
| ----------------------------- | ---------------------------------------- |
| Providing the service         | Contract, Art. 6(1)(b)                   |
| Reading mail and calendar     | Explicit consent, Art. 6(1)(a) / 9(2)(a) |
| Security and abuse prevention | Legitimate interest, Art. 6(1)(f)        |
| Billing records               | Legal obligation, Art. 6(1)(c)           |

Consent is per data source and withdrawable per source, without affecting the
rest. Data is processed in the EU (eu-central-1); the model providers are US
entities operating under Standard Contractual Clauses.

Controller: Dijital Asistan Yazılım A.Ş. · gizlilik@dijitalasistan.app

---

## The two sentences we use, and the one we do not

Approved, and true:

> Veriler aktarım sırasında ve saklanırken şifrelenir.
> Verilerin reklamverenlere satılmaz.

Never used: any claim of end-to-end encryption. The server decrypts and reads
mail in order to analyse it — that is the product, and saying otherwise would
be a lie a reader cannot check. Two automated checks fail the build on any
string matching _uçtan uca_ or _end-to-end_.
