import { stopStack } from './stack.ts'

/**
 * Ends the console, the fixture Supabase and the scratch database.
 *
 * It runs even when the suite failed, which is what keeps a red run from leaving
 * a database and two listeners behind for the next one to trip over.
 */
export default async function globalTeardown(): Promise<void> {
  await stopStack()
}
