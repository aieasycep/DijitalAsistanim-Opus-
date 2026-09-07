# Implementation report

What was built, where it lives, and what it does not do.

---

## By the numbers

|                            |                                                         |
| -------------------------- | ------------------------------------------------------- |
| Mobile routes              | 68                                                      |
| Shared components          | 31                                                      |
| Hooks                      | 12                                                      |
| Message keys               | 2,014 per locale, Turkish and English at exact parity   |
| Database tables            | 38, RLS enabled **and** forced on every one             |
| Migrations                 | 16, re-runnable, verified against real PostgreSQL in CI |
| Edge functions             | 47                                                      |
| Website routes             | 17                                                      |
| Unit and integration tests | 389                                                     |
| Component tests            | 45                                                      |
| End-to-end flows           | 12 (A–L)                                                |
| Automated guards           | 5                                                       |

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
| Commitments, both directions            | ✅    | `commitments`, `app/commitment/*`                           |
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
| Reminders with quiet hours              | ✅    | `packages/domain/src/reminders.ts`                          |

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

|                                                    | Built | Where                                            |
| -------------------------------------------------- | ----- | ------------------------------------------------ |
| Refresh tokens AES-256-GCM, never sent to a client | ✅    | `supabase/functions/_shared/crypto.ts`           |
| Key rotation without downtime                      | ✅    | Per-row `key_version`                            |
| RLS enabled and forced everywhere                  | ✅    | Verified in CI                                   |
| Analytics carries no content, name or address      | ✅    | Type + runtime guard, event dropped on violation |
| SSRF-safe URL fetcher                              | ✅    | `packages/validation/src/ssrf.ts`, 70 tests      |
| Android OTP notifications never persisted          | ✅    | `modules/da-native` filter                       |
| Notification content needs a second opt-in         | ✅    | `device-notifications`                           |
| Data export                                        | ✅    | `data-export-request`, JSON + files              |
| Delete history                                     | ✅    | `delete-history`                                 |
| Delete account                                     | ✅    | `delete-account`, cascading, tokens revoked      |
| Retention, user-chosen                             | ✅    | `retention-cleanup`, nightly                     |
| Audit log of everything done on the user's behalf  | ✅    | `audit_logs`                                     |
| No end-to-end-encryption claim                     | ✅    | Two automated checks                             |

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

Writing the tests found four real bugs, all in code that had been written
earlier in this session:

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

---

## Honest limitations

- Provider integrations are tested against recorded fixtures, not live APIs.
- The Kotlin and Swift in `modules/da-native` is compiled by CI but not
  unit-tested.
- Store purchases are exercised through webhook payloads; a sandbox purchase is
  a manual pre-release step.
- Push payload construction is tested; delivery through APNs and FCM is not.
- The Maestro suite has not been executed on a physical device in this
  environment — there is no simulator here. `verify:e2e-ids` proves every
  element the flows reach for exists; running them is the first step on a
  machine with a device attached.

Platform constraints, as opposed to gaps, are in
[KNOWN_PLATFORM_LIMITATIONS.md](KNOWN_PLATFORM_LIMITATIONS.md).
