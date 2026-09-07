# Testing

## What is tested, and why that

The suite is not aiming at a coverage number. It aims at the failures that are
worst if they ship: something sent without consent, a private address in a
telemetry event, a refresh token readable from a database dump, a deadline the
sender never wrote, a briefing that arrives an hour late twice a year.

```
389 tests   Vitest       shared packages and edge-function helpers
 45 tests   Jest + RNTL  React Native components
 12 flows   Maestro      end to end, on a device, against demo mode
  5 checks  Node         product and security guards
```

---

## Unit and integration — Vitest

`pnpm test`. Node environment, no DOM, no mocks of our own code.

| Area              | File                                           | What it pins                                                                                                                                                                                                     |
| ----------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approval machine  | `packages/domain/src/approval.test.ts`         | No path from any state to `executing` except through `approved`; terminal states are terminal; an edit cannot retarget the recipient or the account; idempotency keys are stable and bounded                     |
| Analytics privacy | `packages/domain/src/analytics-events.test.ts` | Every forbidden key and its `*_email` suffix form; any string that is not a known enum, whatever the key is called; violations reported in full, not just the first                                              |
| Token encryption  | `supabase/tests/crypto.test.ts`                | Round trip; a different ciphertext every time; tamper detection on both ciphertext and nonce; the wrong key version fails; rotation reads rows written under either key; RFC 4231 HMAC and RFC 7636 PKCE vectors |
| SSRF              | `packages/validation/src/ssrf.test.ts`         | 70 cases: schemes, loopback and metadata names, internal suffixes, every private IPv4 range, IPv6 including the canonicalised `::ffff:` and NAT64 forms, DNS rebinding, embedded credentials, non-web ports      |
| AI grounding      | `packages/validation/src/ai-schemas.test.ts`   | A deadline with an invented quote is stripped; a commitment without a quote is rejected by the schema; the summary survives; a proposed action can only be proposed                                              |
| Date extraction   | `packages/domain/src/date-extraction.test.ts`  | Explicit dates in both languages; vague phrases yield nothing; a proposal absent from the source is refused; DST correctness                                                                                     |
| Time and zones    | `packages/domain/src/clock.test.ts`            | Local day boundaries; adding a day keeps the wall clock across a DST change; a 23-hour and a 25-hour day; half-hour zones                                                                                        |
| Priority          | `packages/domain/src/priority.test.ts`         | A mute beats everything; an explicit rule beats a maximally confident model; bands never overlap; learning off means learning off                                                                                |
| Triage            | `packages/domain/src/triage.test.ts`           | Bulk filters; a VIP is never dropped by a provider label; fingerprints ignore reformatting                                                                                                                       |
| Entitlements      | `packages/domain/src/entitlements.test.ts`     | Grace period keeps Pro; a real subscription outranks a referral bonus; referral rejection reasons; bonuses stack rather than reset                                                                               |
| Retention         | `packages/domain/src/triage.test.ts`           | OAuth connections are never swept; audit rows are anonymised, not deleted; an unreadable timestamp is never treated as expired                                                                                   |
| Reminders         | `packages/domain/src/reminders.test.ts`        | Quiet hours across midnight; "this evening" never silently means tomorrow; a smart slot is never inside a meeting or quiet hours                                                                                 |
| Messages          | `packages/i18n/src/messages.test.ts`           | Locale parity; placeholder parity; no unfinished copy; **no end-to-end-encryption claim**                                                                                                                        |

The edge-function helpers are tested by installing a minimal `Deno` stand-in
and importing the real module. The WebCrypto they use is the same
implementation in both runtimes, so the round trip proved here is the round
trip that runs in production.

## Components — Jest and Testing Library

`pnpm test:mobile`. Rendered through the real providers: the real theme, the
real message catalogue, the real domain logic. A test that passes against a
stubbed `t()` proves nothing about a screen whose key does not exist.

Only native modules are mocked, because they have no JavaScript to run under
Node — haptics, localization, secure store, the gradient, the router, and a
hand-written Reanimated stand-in (the library's own mock still loads the
worklets runtime and throws).

The substantive file is `ApprovalCard.test.tsx`. It asserts the consent
contract: the recipient, cc and subject are on screen before anything is sent;
a card in any status other than `pending` offers no approve, edit or reject; a
busy card does not fire twice; a failed card offers retry only when retries
remain.

Two notes for anyone adding tests here:

- `render` is asynchronous in Testing Library 14. Await it, and route presses
  through the `press` helper in `src/test-utils.tsx` — a press outside `act`
  leaves an open scope and the _next_ test in the file renders into a tree the
  queries cannot see.
- The library's `screen` global does not work under this project's module
  resolution. Query off the render result.

## End to end — Maestro

`pnpm --filter @da/mobile run e2e`, or one flow:

```bash
maestro test apps/mobile/.maestro/E-approval-approve.yaml
```

Twelve flows, A–L:

|     |                                                                             |
| --- | --------------------------------------------------------------------------- |
| A   | First run: every sign-in route, demo mode, all four tabs                    |
| B   | Onboarding, all six steps                                                   |
| C   | Today: briefing, events, commitments, the header actions                    |
| D   | Thread, summary feedback, reply draft, tone, regenerate, discard            |
| E   | **Approve** an outbound action, including the edit sheet                    |
| F   | **Reject** one, and confirm history offers no way to approve after the fact |
| G   | Plan: day, week, conflicts, applying a suggestion                           |
| H   | Commitments: open, add by hand, complete                                    |
| I   | Capture: a link and a note                                                  |
| J   | Assistant and search                                                        |
| K   | Settings: language, appearance, and every privacy control                   |
| L   | Paywall and the referral loop                                               |

**Every flow runs against demo mode.** The app boots with deterministic local
fixtures and no network, so the suite needs no Supabase project, no OAuth
client and no test mailbox — and nothing in it can send mail to a real person.

`scripts/check-maestro-ids.mjs` verifies that every element the flows reach for
is one the app actually renders, matching flow regexes against the literal
prefix of template testIDs. Without it, a renamed testID surfaces as a device
timeout minutes into a CI run instead of a failed check in a second.

## Guards

Five checks that are not tests but fail the build the same way:

| `pnpm run …`          | Fails on                                                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify:supabase`     | A migration that does not apply, is not re-runnable, an enum that has drifted from its TypeScript union, or a table without RLS forced                |
| `verify:i18n`         | A key one locale defines and the other does not, a placeholder mismatch, unfinished copy, or an end-to-end-encryption claim                           |
| `verify:no-dead-code` | TODO/FIXME, a handler wired to `() => {}`, an `href="#"`, or stray debug output                                                                       |
| `verify:secrets`      | A committed credential, a server secret referenced from a client bundle, a secret-sounding name behind a public prefix, or a filled-in `.env.example` |
| `verify:e2e-ids`      | A Maestro flow reaching for an element nothing renders                                                                                                |

Each has been probed with a deliberate offender to confirm it fails.

## Running everything

```bash
pnpm verify
```

`verify:supabase` skips with a message when no PostgreSQL is reachable, so the
loop still runs for a contributor without a database. CI provides one.

## What is not covered

Stated plainly rather than implied by a coverage percentage:

- **Provider integrations.** Gmail and Graph calls are exercised against
  recorded fixtures, not live APIs. A provider changing its response shape is
  caught by a schema failure in production, not by this suite.
- **Native module internals.** The Kotlin and Swift in `modules/da-native` is
  compiled by CI but not unit-tested; it is thin, and the JS boundary is
  tested through its degradation path.
- **Real purchases.** RevenueCat is exercised through its webhook payloads.
  Store sandbox purchases are a manual pre-release step, on the checklist.
- **Push delivery.** Payload construction is tested; the trip through APNs and
  FCM is not.
