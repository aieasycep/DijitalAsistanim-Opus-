import { defineConfig } from '@playwright/test'

/**
 * The console's end-to-end suite.
 *
 * ---------------------------------------------------------------------------
 * IT RUNS AGAINST A REAL DATABASE
 * ---------------------------------------------------------------------------
 *
 * `e2e/harness` creates a scratch PostgreSQL database per run, applies all
 * nineteen migrations to it, seeds fixture data, starts a small stand-in for the
 * Supabase HTTP surface on top of that database, and serves a production build
 * of the console against it. Nothing is mocked at the application boundary: the
 * views are the content-blind views, the four-eyes rule is the check constraint,
 * and the audit rows the specs read are the ones the triggers wrote.
 *
 * ---------------------------------------------------------------------------
 * ONE WORKER, ON PURPOSE
 * ---------------------------------------------------------------------------
 *
 * The specs approve a Support Access grant, reveal under it and read the log it
 * left. That is shared, ordered state in one database; running two workers
 * against it would trade a suite that means something for a suite that finishes
 * twenty seconds sooner.
 */
export default defineConfig({
  testDir: './e2e/specs',
  testMatch: '**/*.spec.ts',
  globalSetup: './e2e/harness/global-setup.ts',
  globalTeardown: './e2e/harness/global-teardown.ts',

  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // A `.only` left in a spec silently shrinks the suite to one test, and the
  // green tick looks identical.
  forbidOnly: process.env['CI'] === 'true',

  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',

  use: {
    browserName: 'chromium',
    viewport: { width: 1280, height: 900 },
    // The traces are the artefact a CI failure is diagnosed from; keeping them
    // only for failures keeps a green run from uploading a hundred megabytes.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    // The console is served over plain HTTP on a loopback port.
    ignoreHTTPSErrors: false,
  },
})
