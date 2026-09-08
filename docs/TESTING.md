# Testing

## What is tested, and why that

The suite is not aiming at a coverage number. It aims at the failures that are
worst if they ship: something sent without consent, a private address in a
telemetry event, a refresh token readable from a database dump, a deadline the
sender never wrote, a briefing that arrives an hour late twice a year.

```
Vitest       shared packages, edge-function helpers, the demo API client,
             and the console's pure decisions
Jest + RNTL  React Native components
Playwright   the console, end to end, against a real Postgres
Maestro      12 flows, on a device, against demo mode
Node         nine product and security guards, all in CI
```

Exact test counts are deliberately not written down here. They move with
ordinary work, and a number nobody re-derives is worse than no number — the
figures this file used to carry were stale by a factor of three. `pnpm test`
prints the real ones. What is written down is what each suite _pins_, because
that does not drift without someone deciding it should.

---

## Unit and integration — Vitest

`pnpm test`. Node environment, no DOM, no mocks of our own code.

| Area              | File                                                | What it pins                                                                                                                                                                                                                                                                                                       |
| ----------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Approval machine  | `packages/domain/src/approval.test.ts`              | No path from any state to `executing` except through `approved`; terminal states are terminal; an edit cannot retarget the recipient or the account; idempotency keys are stable and bounded                                                                                                                       |
| Analytics privacy | `packages/domain/src/analytics-events.test.ts`      | Every forbidden key and its `*_email` suffix form; any string that is not a known enum, whatever the key is called; violations reported in full, not just the first                                                                                                                                                |
| Token encryption  | `supabase/tests/crypto.test.ts`                     | Round trip; a different ciphertext every time; tamper detection on both ciphertext and nonce; the wrong key version fails; rotation reads rows written under either key; RFC 4231 HMAC and RFC 7636 PKCE vectors — note that `pkceChallenge` is tested but unused: the OAuth flow does not send a `code_challenge` |
| SSRF              | `packages/validation/src/ssrf.test.ts`              | 70 cases: schemes, loopback and metadata names, internal suffixes, every private IPv4 range, IPv6 including the canonicalised `::ffff:` and NAT64 forms, DNS rebinding, embedded credentials, non-web ports                                                                                                        |
| AI grounding      | `packages/validation/src/ai-schemas.test.ts`        | A deadline with an invented quote is stripped; a commitment without a quote is rejected by the schema; the summary survives; a proposed action can only be proposed                                                                                                                                                |
| Date extraction   | `packages/domain/src/date-extraction.test.ts`       | Explicit dates in both languages; vague phrases yield nothing; a proposal absent from the source is refused; DST correctness                                                                                                                                                                                       |
| Time and zones    | `packages/domain/src/clock.test.ts`                 | Local day boundaries; adding a day keeps the wall clock across a DST change; a 23-hour and a 25-hour day; half-hour zones                                                                                                                                                                                          |
| Priority          | `packages/domain/src/priority.test.ts`              | A mute beats everything; an explicit rule beats a maximally confident model; bands never overlap; learning off means learning off                                                                                                                                                                                  |
| Calendar          | `packages/domain/src/calendar-intelligence.test.ts` | `findFreeBlocks`, `detectConflicts`, `summarizeDayLoad`, `suggestFocusBlock` — 24 cases                                                                                                                                                                                                                            |
| Triage            | `packages/domain/src/triage.test.ts`                | Bulk filters; a VIP is never dropped by a provider label; fingerprints ignore reformatting                                                                                                                                                                                                                         |
| Entitlements      | `packages/domain/src/entitlements.test.ts`          | Grace period keeps Pro; a real subscription outranks a referral bonus; referral rejection reasons; bonuses stack rather than reset                                                                                                                                                                                 |
| Retention         | `packages/domain/src/triage.test.ts`                | OAuth connections are never swept; audit rows are anonymised, not deleted; an unreadable timestamp is never treated as expired                                                                                                                                                                                     |
| Reminders         | `packages/domain/src/reminders.test.ts`             | Quiet hours across midnight; "this evening" never silently means tomorrow; a smart slot is never inside a meeting or quiet hours                                                                                                                                                                                   |
| Messages          | `packages/i18n/src/messages.test.ts`                | Locale parity; placeholder parity; no unfinished copy; **no end-to-end-encryption claim**                                                                                                                                                                                                                          |

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

Four suites, 55 tests: `ApprovalCard.test.tsx`, `Button.test.tsx`,
`Layout.test.tsx` and `States.test.tsx`.

The substantive one is `ApprovalCard.test.tsx`. It asserts the consent
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
| B   | Onboarding, all seven steps                                                 |
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

Flow B walks all **seven** onboarding steps — `connect`, `permissions`,
`personalization`, `vip`, `preferences`, `analysis`, `done`, the order in
`ONBOARDING_STEPS`.

**Every flow runs against demo mode.** The app boots with deterministic local
fixtures and no network, so the suite needs no Supabase project, no OAuth
client and no test mailbox — and nothing in it can send mail to a real person.

## The console, end to end — Playwright

`pnpm run test:backoffice-e2e`. 33 specs, about two and a half minutes, against
a **real Postgres with the real migrations applied** — not a mock of the
database and not a mock of Supabase.

Each run creates a scratch database, applies every migration in order, seeds
five admins across five roles plus users, tickets, flags, an announcement, a
prompt, an entitlement grant and a pending Support Access grant, starts a
fixture Supabase server, builds and starts the console, and tears the whole lot
down afterwards.

### Why there is a fixture Supabase, and what makes it honest

The console talks to Supabase over HTTP: GoTrue for sign-in, PostgREST for every
read. Testing it against a hand-written mock would prove the mock agrees with
the console and nothing about whether either agrees with Postgres. So the
fixture is a translator, not a stand-in: it reads relations, columns, types and
function signatures out of `pg_class` and `pg_proc` at boot, validates every
identifier against that catalogue before it becomes SQL, binds every value as a
parameter, and renders rows through `to_jsonb` in Postgres rather than in the
driver — which is why an `account_kind[]` arrives as a JSON array and a `bigint`
as a number, exactly as PostgREST sends them.

**Nothing degrades.** A filter, operator, projection or endpoint it cannot
translate raises a named error, is counted, and answers 501. It never returns an
empty result to paper over a gap — a shim that quietly answers `[]` turns a real
regression into a green test, which is worse than having no test. One spec
asserts the counter is still zero at the end of the run, so the suite fails if
it ever started guessing.

### What the specs pin

| Spec              | What it pins                                                                                                                                                                                                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in           | Correct credentials land; a wrong password does not; the refusal says nothing about which half was wrong; a non-admin is refused; guessing at one address is stopped before the password is checked                                                                                                                                                            |
| Session guard     | An unauthenticated route redirects; a session revoked in the database is refused on the very next request                                                                                                                                                                                                                                                      |
| RBAC              | Every role sees only the sidebar entries it holds, read from `admin_role_permissions` in the database rather than from the TypeScript mirror, and is refused the pages it does not                                                                                                                                                                             |
| Content-blindness | A sentinel string is written into a user's mail body and subject, then every route the highest-privileged role can reach is crawled and asserted not to contain it                                                                                                                                                                                             |
| Support Access    | A request under the minimum reason length is refused; a real one is opened, pending and audited; the requester is offered no approval and the database refuses one anyway; a second admin can approve; a reveal returns content, writes a log row, and the console shows the row without showing what was seen; an ungranted scope is refused and logs nothing |
| Accessibility     | Every interactive control has an accessible name, and every button does something when pressed                                                                                                                                                                                                                                                                 |
| Shim fidelity     | Every list screen shows the row seeded for it, and a count on screen is the count in the database                                                                                                                                                                                                                                                              |

The content-blindness spec is the one that matters most: it is the product's
public promise, checked end to end rather than argued from the schema.

### Two defects it found on its first run

Both were caught by "every button does something when pressed", which is the
kind of assertion that sounds trivial until it earns its keep:

- **Sign-out did nothing.** Radix unmounted the menu before the form could
  submit, so the browser cancelled the submission of a form no longer connected
  to the document.
- **"Sıfırla" navigated to the page you were already on.** It rendered on an
  unfiltered list, because pages pass their _defaults_ into the filter
  component, and the button could not tell a default from a choice.

## Guards

Nine checks that are not tests but fail the build the same way. All nine run in
`pnpm verify` and in CI.

| Command                        | In `pnpm verify` and CI | Fails on                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run verify:supabase`     | yes                     | A migration that does not apply, is not re-runnable, an enum that has drifted from its TypeScript union, a table without RLS forced, or a `bo_*` view that reads a content column                                                                                                                                                                                          |
| `pnpm run verify:i18n`         | yes                     | A key one locale defines and the other does not, a placeholder mismatch, unfinished copy, or an end-to-end-encryption claim                                                                                                                                                                                                                                                |
| `pnpm run verify:no-dead-code` | yes                     | TODO/FIXME, a handler wired to `() => {}`, an `href="#"`, or stray debug output                                                                                                                                                                                                                                                                                            |
| `pnpm run verify:secrets`      | yes                     | A committed credential, a server secret referenced from a client bundle, a secret-sounding name behind a public prefix, or a filled-in `.env.example`                                                                                                                                                                                                                      |
| `pnpm run verify:e2e-ids`      | yes                     | A Maestro flow naming a testID that appears nowhere in the source                                                                                                                                                                                                                                                                                                          |
| `pnpm run verify:wiring`       | yes                     | A cron job, API-client call or app fetch naming an edge function with no directory; a `router.push` naming a route with no file; a workflow calling a script that does not exist; a console sidebar entry pointing at an unbuilt page or advertising a permission its page does not enforce; a package named in the mobile build config that the manifest does not declare |
| `pnpm run verify:rbac-doc`     | yes                     | `docs/BACKOFFICE_RBAC.md` disagreeing with the role/permission matrix in `0019_admin_platform.sql`, cell by cell                                                                                                                                                                                                                                                           |
| `pnpm run verify:readme`       | yes                     | A structural count in `README.md` — migrations, tables, views, functions, routes — that no longer matches the repository                                                                                                                                                                                                                                                   |

### `check-wiring.mjs`

Three classes of defect reached this repository past every other gate, because
each half of the system type-checked perfectly against its own idea of the
other half:

1. Five scheduled jobs POSTed to edge-function slugs that were never written
   (`briefing-dispatch`, `follow-up-detect`, …), so **no background work ran at
   all** — no briefing, no reminder, no push.
2. The API client called `reminder-create`, which did not exist.
3. The Today screen's largest tap target pushed `/briefing/morning`, a route
   with no file, landing the user on the router's not-found screen.

None of these is a type error. A string that names something absent looks
exactly like a string that names something present. The script resolves three
kinds of name against the filesystem:

- **Edge-function slugs.** `format(v_invoke, '<slug>')` in
  `supabase/migrations`, `callFunction('<slug>')` in `packages/api-client/src`,
  and `functions/v1/<slug>` in `apps/mobile/src` must each have a
  `supabase/functions/<slug>/index.ts`.
- **Navigation targets.** Every literal in `router.push` / `replace` /
  `navigate` — bare string, template literal, or `{ pathname: … }` — must match
  a route file under `apps/mobile/app`. Matching is forgiving about parameters
  and strict about structure: `` `/thread/${id}` `` matches `thread/[id].tsx`,
  while `/briefing/morning` does **not** match `briefing/index.tsx`, because
  that route has no second segment. `(group)` segments are normalised away, so
  `/(tabs)/today` and `/today` are one route.
- **What it cannot resolve, it says so.** A `router.push(someVariable)` is
  counted and reported as unresolvable rather than silently skipped.

Current output: 31 edge-function references across 48 functions and 124
navigation targets across 51 routes all resolve; 5 navigation calls take a
computed target and cannot be checked statically.

It is not in `package.json`'s `verify` script and not in `.github/workflows/ci.yml`.
Until it is, a dangling name can still land on `main`.

## What the gates do, and do not, prove

Worth being exact about, because two of these are easy to over-read.

**`verify:e2e-ids` does not prove a flow runs.** It parses the Maestro YAML for
the ids the flows reach for and checks that each appears in the app's source,
matching a flow's regex against the literal prefix of a template `testID`. That
is a static string check. It proves no flow names an id that nothing renders —
which is worth having, because otherwise a renamed testID surfaces as a device
timeout minutes into a CI run instead of a failed check in a second. It proves
**nothing** about whether the app launches, whether a screen reaches the state
the flow expects, whether a tap has an effect, or whether the flow passes. Only
`maestro test` on a real device or emulator proves that, and it has not been run
in this environment — there is no simulator here.

**`check-wiring.mjs` does not prove a call succeeds.** It proves the name
resolves to a file. A function that exists and returns a 500, or a route that
exists and renders an empty screen, passes.

**`verify:no-dead-code` does not prove a control is useful,** only that it has a
handler that is not empty and not a stub.

**`verify:supabase` skips silently-ish when no PostgreSQL is reachable** — it
prints a message and exits zero, so `pnpm verify` stays runnable for a
contributor without a database. A green local `pnpm verify` therefore does not
mean the migrations were checked. CI always provides a database, so a push is
always checked.

## Running everything

```bash
pnpm verify
node scripts/check-wiring.mjs   # not included above
```

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
