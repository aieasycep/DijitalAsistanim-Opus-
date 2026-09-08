import { startStack, stopStack } from './stack.ts'

/**
 * Playwright's entry into the harness.
 *
 * The only thing it adds to `stack.ts` is the cleanup path: a setup that fails
 * half way has usually already created a database and started a process, and
 * Playwright does not run `globalTeardown` when `globalSetup` throws. Without
 * this, a broken migration would leave a scratch database and two listeners
 * behind on every attempt to fix it.
 */
export default async function globalSetup(): Promise<void> {
  try {
    await startStack()
  } catch (error) {
    await stopStack()
    throw error
  }
}
