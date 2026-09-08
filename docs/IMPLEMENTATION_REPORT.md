# Implementation report

What was built, where it lives, and what it does not do.

---

## By the numbers

Every figure below is a count you can reproduce; the command is given where it
is not obvious.

|                            |                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| Mobile routes              | 51, plus 17 `_layout.tsx` files — 68 `.tsx` under `apps/mobile/app`                        |
| Shared components          | 28 under `apps/mobile/src/components`                                                      |
| Hook modules               | 12 in `apps/mobile/src/hooks`, exporting 44 `use*` functions                               |
| Message keys               | 2,014 per locale, Turkish and English at exact parity                                      |
| Database tables            | 39, RLS enabled **and** forced on every one                                                |
| Postgres enums             | 30                                                                                         |
| Migrations                 | 18, re-runnable, verified against real PostgreSQL in CI                                    |
| Edge functions             | 48 (`ls supabase/functions \| grep -v _shared \| grep -v deno \| wc -l`)                   |
| Backoffice views           | 16 `bo_*`, service-role only, none reading a content column                                |
| Website routes             | 10 pages plus `not-found`, `robots`, `sitemap`, an OG image and two `.well-known` handlers |
| Backoffice routes          | 3 (`/`, `/giris`, `/yetkisiz`)                                                             |
| Unit and integration tests | 389 across 13 files                                                                        |
| Component tests            | 55 across 4 files                                                                          |
| End-to-end flows           | 12 (A–L), none executed in this environment                                                |
| Automated guards           | 6 — five in `pnpm verify` and CI, plus `scripts/check-wiring.mjs`, which is in neither     |

---

## Feature matrix

### Core product

| Feature                                 | Built | Where                                                       |
| --------------------------------------- | ----- | ----------------------------------------------------------- |
| Morning briefing                        | ✅    | `briefing-generate`, `app/briefing/index.tsx`               |
| Midday, evening, weekly briefings       | ✅    | Same, driven by `user_preferences`                          |
| Audio briefing                          | ✅    | `briefing-audio`; device TTS when no provider is configured |
| Today: five things that matter          | ✅    | `today-feed`, `app/(tabs)/today.tsx`                        |
| Flow: prioritised threads               | ✅    | `app/(tabs)/flow.tsx`                                       |
| Thread detail and summary               | ✅    | `app/thread/[id].tsx`                                       |
| Reply draft, tone, regenerate           | ✅    | `reply-draft`, `app/reply/[threadId].tsx`                   |
| Commitments, both directions            | ✅    | `commitment-create`, `app/commitment/*`                     |
| Follow-ups with nudges                  | ✅    | `detect-followups`, `app/followups/index.tsx`               |
| Plan: day and week                      | ✅    | `plan-day`, `plan-week`, `app/(tabs)/plan.tsx`              |
| Conflict detection                      | ✅    | `packages/domain/src/calendar-intelligence.ts`              |
| Meeting prep and notes                  | ✅    | `meeting-prep`, `app/meeting/[id]/*`                        |
| Person view                             | ✅    | `app/person/[id].tsx`                                       |
| Life events (travel, delivery, payment) | ✅    | `life_events`, cards on Today                               |
| Universal capture                       | ✅    | `capture-create`, `app/capture.tsx`                         |
| Assistant                               | ✅    | `assistant-ask`, `app/(tabs)/assistant.tsx`                 |
| Voice input                             | ✅    | `transcribe`, `app/voice.tsx`                               |
| Search                                  | ✅    | `search`, `app/search.tsx`                                  |
| Reminders with quiet hours              | ✅    | `reminder-create`, `packages/domain/src/reminders.ts`       |

### The approval contract

|                                            | Built | Where                                                 |
| ------------------------------------------ | ----- | ----------------------------------------------------- |
| Every external write goes through approval | ✅    | `approval_actions`, `packages/domain/src/approval.ts` |
| Exact payload shown before sending         | ✅    | `ApprovalCard` `PayloadPreview`                       |
| Editable fields restricted per action type | ✅    | `EDITABLE_FIELDS`, `validateEdit`                     |
| Idempotency across devices and retries     | ✅    | `buildIdempotencyKey` + unique constraint             |
| Two-day expiry, bounded retries            | ✅    | `APPROVAL_TTL_MS`, `MAX_APPROVAL_ATTEMPTS`            |
| Mail never sent automatically              | ✅    | No code path exists                                   |
| Calendar never changed silently            | ✅    | Same                                                  |

### Priority and personalisation

|                                               | Built | Where                                 |
| --------------------------------------------- | ----- | ------------------------------------- |
| Ten-band priority, rules above the model      | ✅    | `packages/domain/src/priority.ts`     |
| Every ranking explains itself                 | ✅    | i18n keys in `PriorityResult.reasons` |
| User rules: sender, domain, keyword, mute     | ✅    | `app/settings/rules.tsx`              |
| VIP list                                      | ✅    | `app/settings/vip.tsx`                |
| Learned preferences, individually forgettable | ✅    | `app/settings/personalization.tsx`    |
| Learning can be turned off entirely           | ✅    | Tested, not merely asserted           |

### Privacy and security

|                                                    | Built | Where                                               |
| -------------------------------------------------- | ----- | --------------------------------------------------- |
| Refresh tokens AES-256-GCM, never sent to a client | ✅    | `supabase/functions/_shared/crypto.ts`              |
| Key rotation without downtime                      | ✅    | Per-row `key_version` and `refresh_key_version`     |
| RLS enabled and forced everywhere                  | ✅    | Verified in CI on all 39 tables                     |
| Provider data unwritable by any client             | ✅    | `0011_rls_policies.sql` tiers 2 and 3               |
| Support tooling cannot see message content         | ✅    | 16 `bo_*` views, column dependencies asserted in CI |
| Analytics carries no content, name or address      | ✅    | Type + runtime guard, event dropped on violation    |
| SSRF-safe URL fetcher                              | ✅    | `packages/validation/src/ssrf.ts`, 70 tests         |
| Android OTP notifications never persisted          | ✅    | `modules/da-native` filter                          |
| Notification content needs a second opt-in         | ✅    | `device-notifications`                              |
| Data export                                        | ✅    | `data-export-request`, JSON + files                 |
| Delete history                                     | ✅    | `delete-history`                                    |
| Delete account                                     | ✅    | `delete-account`, cascading, tokens revoked         |
| Retention, user-chosen                             | ✅    | `retention-cleanup`, nightly                        |
| Audit log of everything done on the user's behalf  | ✅    | `audit_logs`                                        |
| No end-to-end-encryption claim                     | ✅    | Two automated checks                                |

### Platform and native

|                                                | Built | Where                                               |
| ---------------------------------------------- | ----- | --------------------------------------------------- |
| iOS share extension                            | ✅    | `plugins/withIosShareExtension.js`                  |
| iOS WidgetKit widget                           | ✅    | `plugins/withIosWidget.js`, `modules/da-native/ios` |
| Android app widget                             | ✅    | `modules/da-native/android`                         |
| Android notification listener                  | ✅    | Same, opt-in and filtered                           |
| Android share intake                           | ✅    | Same                                                |
| Graceful degradation without the native module | ✅    | `requireOptionalNativeModule`                       |
| Deep links, universal links, app links         | ✅    | `app.config.ts`, `/l` and `/davet` routes           |
| Push notifications                             | ✅    | `push-token-register`, `notification-scheduler`     |

### Commercial

|                                      | Built | Where                                        |
| ------------------------------------ | ----- | -------------------------------------------- |
| RevenueCat subscriptions             | ✅    | `subscription-refresh`, `revenuecat-webhook` |
| Paywall with a way past it           | ✅    | `app/paywall.tsx`                            |
| Restore purchases                    | ✅    | Same                                         |
| Referral codes and bonus days        | ✅    | `referral-code`, `referral-redeem`           |
| Entitlements, trial and grace period | ✅    | `packages/domain/src/entitlements.ts`        |
| Works with no RevenueCat key         | ✅    | Everyone on the free tier, no crash          |

### Craft

|                                                              | Built |
| ------------------------------------------------------------ | ----- |
| Turkish default, English at exact key parity                 | ✅    |
| Dark mode throughout, tokens only                            | ✅    |
| Reduce motion, from OS and in-app                            | ✅    |
| Dynamic type, 44pt touch targets, screen-reader labels       | ✅    |
| Offline: cached reads, queued writes, honest messaging       | ✅    |
| Demo mode with deterministic fixtures                        | ✅    |
| No dead controls — enforced by the type system and a checker | ✅    |
| Brand assets generated from the design tokens                | ✅    |

---

## What needs something external

None of these blocks the build, and each has a working fallback. This is the
complete list of what a person deploying this must obtain themselves.

| Needs                                     | Without it                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| Apple Developer account + App Group       | No iOS build; the widget cannot share data                                     |
| Google OAuth client + security assessment | No Gmail; Microsoft and demo mode work                                         |
| Microsoft Entra app registration          | No Outlook; Google and demo mode work                                          |
| Supabase project                          | Demo mode only                                                                 |
| Anthropic or OpenAI key                   | Deterministic triage only, no summaries; nothing is fabricated to fill the gap |
| RevenueCat key                            | Everyone on the free tier                                                      |
| A domain                                  | Deep links do not verify; the app works                                        |
| Speech provider                           | Device text-to-speech                                                          |
| Embedding model                           | Full-text search instead of vector retrieval                                   |

`.env.example` documents every variable with the reason it exists and where to
get it.

---

## Defects found and fixed while testing

### Found by writing tests

Four real bugs, all in code that had been written earlier in this session:

1. **SSRF bypass** — `new URL()` canonicalises `[::ffff:169.254.169.254]` to
   `[::ffff:a9fe:a9fe]`, so the dotted-quad IPv4-mapped check never fired and
   the cloud metadata endpoint was reachable through an IPv6 literal. The hex
   form and NAT64's `64:ff9b::/96` are now decoded and checked as IPv4.
2. **Dead control** — an empty `onPress` on the push-to-talk button in
   `app/voice.tsx`, left over from before the press-in/press-out wiring.
3. **Invalid iOS deployment target** — `16.0` where Expo SDK 57 requires
   `16.4`. The app config would not resolve at all, which meant `expo prebuild`
   could never have run.
4. **A universal link that hijacked the legal pages** — the
   `apple-app-site-association` claimed paths the app cannot handle, so tapping
   "Privacy Policy" in a browser would have opened the app.

### Found by resolving names against the filesystem

Three more, none of which is a type error, which is why
`scripts/check-wiring.mjs` now exists:

5. **No background work ran at all.** Five scheduled jobs POSTed to edge-function
   slugs that had never been written (`briefing-dispatch`, `follow-up-detect`,
   …). No briefing, no reminder, no push, on a database that migrated cleanly.
   `0014_cron_jobs.sql` now names the six functions that exist.
6. **The API client called `reminder-create`,** which did not exist.
7. **The Today screen's largest tap target pushed `/briefing/morning`,** a route
   with no file, landing the user on the router's not-found screen.

### Found by checking the documentation against the code

The documents themselves carried false statements, including two in the file
prepared for the Google restricted-scope assessment. They are listed with their
corrections in the git history of this directory; the substantive ones were the
claim that clients "cannot write at all" (they may write 14 tables), a
scheduled-jobs table matching nothing in the migration, two named edge functions
that have never existed (`oauth-google-callback`, `oauth-microsoft-callback`),
five Postgres enums that do not exist, and a claim of PKCE S256 in a flow that
sends no `code_challenge`.

---

## Honest limitations

- Provider integrations are tested against recorded fixtures, not live APIs.
- The Kotlin and Swift in `modules/da-native` is compiled by CI but not
  unit-tested.
- Store purchases are exercised through webhook payloads; a sandbox purchase is
  a manual pre-release step.
- Push payload construction is tested; delivery through APNs and FCM is not.
- The Maestro suite has not been executed on a physical device or emulator in
  this environment — there is no simulator here. `verify:e2e-ids` is a static
  string check: it proves no flow names a testID that appears nowhere in the
  source. It proves nothing about whether the app launches, whether a screen
  reaches the state a flow expects, or whether any flow passes. Running
  `maestro test .maestro` on a machine with a device attached is the first step.
- **Microsoft Graph change subscriptions are not wired up.**
  `createSubscription` and `renewSubscription` exist in
  `_shared/providers/microsoft.ts` with no caller, and no cron job renews them.
  `webhook-microsoft` will accept and verify a notification if a subscription is
  created out of band, but nothing creates one. Outlook accounts stay current
  through the 15-minute incremental sync.
- **`scripts/check-wiring.mjs` is not in `pnpm verify` or in CI.** It passes
  today; nothing stops the next dangling name from landing.
- **`apps/backoffice` is outside two guards.** `check-no-dead-code.mjs` does not
  scan it, and it has no component tests.

Platform constraints, as opposed to gaps, are in
[KNOWN_PLATFORM_LIMITATIONS.md](KNOWN_PLATFORM_LIMITATIONS.md).
