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
      // The backoffice authorization layer. Only its pure modules are covered
      // here — `permissions.ts`, `redact.ts` and `session-cookies.ts` — which is
      // deliberate: those three hold every decision the guards make, and they
      // import neither `server-only` nor `next/*`, so the whole permission
      // matrix, the expiry rules and the Support Access gate are testable
      // outside a request context. The modules that do touch Postgres are thin
      // wrappers around them.
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
