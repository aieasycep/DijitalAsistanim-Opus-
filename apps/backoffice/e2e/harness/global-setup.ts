import { startStack } from './stack.ts'

/**
 * Playwright's entry into the harness.
 *
 * Kept to one line on purpose: `stack.ts` is ordinary Node and can be run or
 * debugged without a test runner in front of it.
 */
export default async function globalSetup(): Promise<void> {
  await startStack()
}
