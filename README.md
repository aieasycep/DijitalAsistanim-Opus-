# Dijital Asistan

**Bugün bilmen gerekenleri, sen sormadan söyler.**

A personal command centre for people whose day arrives by email. It reads the
mail, the calendar and the promises buried in both, decides what actually
matters today, and says so — before anyone has to go looking.

It is not another inbox. There is no folder tree, no unread count, no list of
everything. There are five things that matter today, and a way to act on each
of them.

---

## What it does

|                               |                                                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Morning briefing**          | The five things that matter, written as sentences, ready before you wake up. Also available as audio.                  |
| **Priority that you control** | A strict tier order: rules you wrote beat what the model thinks, every time. Each item says _why_ it is where it is.   |
| **Promises, both ways**       | Commitments made in your threads — yours and theirs — tracked without anyone having to file them.                      |
| **Follow-ups**                | Threads you are waiting on, surfaced when the wait becomes notable. Weekends do not count as silence.                  |
| **Plan**                      | The day and the week: conflicts, free blocks, and suggestions you can apply.                                           |
| **Assistant**                 | Ask about your own data. Answers cite what they were read from, and say "kaynakta kesinleşmiyor" rather than guessing. |
| **Capture**                   | A link, a photo, a document, a note. Analysed on arrival and filed against the right person or thread.                 |

Every external write — a sent mail, a calendar change, a task — goes through an
approval card that shows the exact request first. Nothing leaves the app
without a person pressing approve.

## What it will not do

- Send anything on your behalf without approval.
- Change your calendar silently.
- State a date, a price or an attendee that is not written in the source.
- Send your mail content, contact names or addresses to an analytics vendor.
- Claim end-to-end encryption. Data is encrypted in transit and at rest; the
  server can read it, because reading it is the product.

---

## Repository layout

```
apps/
  mobile/            Expo SDK 57 · React Native 0.86 · Expo Router
    app/             68 .tsx files: 51 routes and 17 layouts —
                     tabs, details, settings, onboarding
    modules/da-native/  Local Expo module — Android widget, notification
                     listener, share intake; iOS widget + share bridges
    plugins/         Four config plugins: iOS share extension and widget,
                     Android widget and notification listener
    .maestro/        End-to-end flows A–L
  web/               Next.js 16 marketing site, legal pages, deep links
  backoffice/        Next.js 16 staff console. Reads the database only
                     through the content-blind bo_* views

packages/
  design-tokens/     Palette, type scale, spacing, light and dark themes
  domain/            Priority, triage, approvals, commitments, follow-ups,
                     calendar intelligence, retention, entitlements, clock
  validation/        Zod schemas for the API and for every model response,
                     plus the SSRF guard
  i18n/              Turkish (canonical) and English catalogues, 2,014 keys
                     per locale
  api-client/        Typed endpoint layer, query keys, demo-mode client

supabase/
  migrations/        18 migrations · 39 tables · RLS enabled and forced
  functions/         48 Deno edge functions
  tests/             Tests for the shared function helpers

scripts/             Verifiers that run in CI and in `pnpm verify`
docs/                Architecture, data model, AI pipeline, security,
                     privacy, deployment, store checklists
```

Shared packages are consumed as **TypeScript source**, not as built artefacts.
One `.ts` file compiles under `tsc`, Metro, Next's bundler, Vitest and Deno —
which is why relative imports carry explicit `.ts` extensions.

---

## Getting started

```bash
pnpm install
pnpm verify              # everything below, in one command
pnpm --filter @da/mobile start
pnpm --filter @da/web dev
pnpm run dev:backoffice  # staff console, port 3100 — needs a Supabase project
```

**Nothing external is required to run it.** With no Supabase project
configured, the app boots into demo mode against deterministic local fixtures:
a full day of mail, meetings, commitments and approvals, entirely offline.
Every integration has a working fallback — device text-to-speech instead of a
speech provider, full-text search instead of embeddings, and so on.

When you do have credentials, copy `.env.example` to `.env` and fill in what
you have. See [`docs/OAUTH_SETUP.md`](docs/OAUTH_SETUP.md) and
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

### The verify loop

```bash
pnpm verify
```

runs, in order:

| Gate                  | What it protects                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `format:check`        | Prettier                                                                                                                                                                             |
| `lint`                | ESLint 9, flat config; bans `any`, `console.log`, bare `new Date()`                                                                                                                  |
| `typecheck`           | `tsc --noEmit` across every workspace package                                                                                                                                        |
| `test`                | Vitest, 389 tests: domain, validation, i18n, edge-function helpers                                                                                                                   |
| `test:mobile`         | Jest + Testing Library, 55 tests across 4 suites: React Native components                                                                                                            |
| `verify:supabase`     | Applies every migration to a real Postgres, twice; checks enums against their TypeScript unions; asserts RLS is enabled **and** forced; proves no `bo_*` view reads a content column |
| `verify:i18n`         | Locale parity, placeholder parity, no unfinished copy, no end-to-end-encryption claim                                                                                                |
| `verify:e2e-ids`      | Every testID a Maestro flow reaches for exists in the source. It does **not** run a flow — see [TESTING.md](docs/TESTING.md#what-the-gates-do-and-do-not-prove)                      |
| `verify:no-dead-code` | No TODO/FIXME, no control that looks pressable and is not, no stray debug output                                                                                                     |
| `verify:secrets`      | No committed credential, no server secret referenced from a client bundle                                                                                                            |

`verify:supabase` skips with a message if no PostgreSQL is reachable, so a
contributor without a database can still run the whole loop.

One more verifier exists and is **not** yet in `pnpm verify` or in CI. Run it by
hand:

```bash
node scripts/check-wiring.mjs
```

It resolves names against the filesystem: every edge-function slug a cron job,
the API client or the app reaches for has a `supabase/functions/<slug>/index.ts`,
and every literal `router.push`/`replace`/`navigate` target matches a route file
under `apps/mobile/app`. Neither is a type error — a string naming something
absent type-checks exactly like a string naming something present — and both
have shipped past every other gate here before.

---

## Documentation

| Document                                                            |                                                                   |
| ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)                             | How the pieces fit, and why                                       |
| [DATA_MODEL.md](docs/DATA_MODEL.md)                                 | 39 tables, their relationships, and the RLS model                 |
| [AI_PIPELINE.md](docs/AI_PIPELINE.md)                               | Three-stage triage, grounding, and what stops a hallucinated date |
| [SECURITY.md](docs/SECURITY.md)                                     | Token encryption, key rotation, RLS, SSRF, threat model           |
| [PRIVACY_DATA_FLOW.md](docs/PRIVACY_DATA_FLOW.md)                   | What is collected, where it goes, how long it stays               |
| [OAUTH_SETUP.md](docs/OAUTH_SETUP.md)                               | Google and Microsoft, scope by scope                              |
| [GOOGLE_OAUTH_VERIFICATION.md](docs/GOOGLE_OAUTH_VERIFICATION.md)   | The restricted-scope review, and what it asks for                 |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md)                                 | Database, functions, mobile builds, website                       |
| [TESTING.md](docs/TESTING.md)                                       | What is tested, at which level, and why                           |
| [APP_STORE_CHECKLIST.md](docs/APP_STORE_CHECKLIST.md)               | App Store and Play submission, answer by answer                   |
| [DESIGN_SOURCE_MAPPING.md](docs/DESIGN_SOURCE_MAPPING.md)           | Which screen came from which design source                        |
| [KNOWN_PLATFORM_LIMITATIONS.md](docs/KNOWN_PLATFORM_LIMITATIONS.md) | What the platforms genuinely will not allow                       |
| [IMPLEMENTATION_REPORT.md](docs/IMPLEMENTATION_REPORT.md)           | Feature matrix: what is built, and where it lives                 |

---

## Licence

Proprietary. The bundled Geist and Lora typefaces are used under the SIL Open
Font License 1.1; see `apps/mobile/assets/fonts/LICENSE.md`.
