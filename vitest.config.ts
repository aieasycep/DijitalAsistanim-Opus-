import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@da/design-tokens': r('./packages/design-tokens/src/index.ts'),
      '@da/domain': r('./packages/domain/src/index.ts'),
      '@da/validation': r('./packages/validation/src/index.ts'),
      '@da/i18n': r('./packages/i18n/src/index.ts'),
      '@da/api-client': r('./packages/api-client/src/index.ts'),
      // The backoffice's own `@/*`, as its tsconfig declares it. The pure
      // modules under test are written against that specifier — a contract
      // module reaches for `@/lib/permissions`, a presentation module for
      // `@/lib/messages/...` — so without it the modules that hold the
      // decisions could only be tested by rewriting their imports.
      //
      // Only the backoffice is under `apps/` here; `apps/web` declares the same
      // specifier and has no tests. A web test added later would resolve
      // through this line and fail to find the module, loudly, which is the
      // direction to be wrong in.
      '@/': `${r('./apps/backoffice/src')}/`,
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: [
      'packages/*/src/**/*.test.ts',
      'packages/*/tests/**/*.test.ts',
      'supabase/tests/**/*.test.ts',
      'apps/web/src/**/*.test.ts',
      // The backoffice. Only its pure modules are covered here — the guards in
      // `permissions.ts`, `redact.ts` and `session-cookies.ts`, and each
      // feature area's `contract.ts` / `presentation.ts` — which is deliberate:
      // those modules hold every decision the pages and the Server Actions
      // make, and they import neither `server-only` nor `next/*`, so the
      // permission matrix, the Support Access gate, the health verdicts, the
      // flag targeting and the announcement window are all testable outside a
      // request context. The modules that do touch Postgres are thin wrappers
      // around them, and a decision found inside one is moved out here rather
      // than tested through a stubbed database.
      'apps/backoffice/src/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', 'apps/mobile/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary'],
      include: ['packages/*/src/**/*.ts', 'supabase/functions/_shared/**/*.ts'],
    },
  },
})
