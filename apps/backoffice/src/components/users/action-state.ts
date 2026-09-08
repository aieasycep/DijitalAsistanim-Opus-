import type { BriefingKind } from '@da/domain'

/**
 * The shape the briefing regeneration Server Action hands back to its form.
 *
 * It lives outside `actions.ts` because a `'use server'` module may export
 * nothing but async functions — the initial value below would be a build error
 * there. Same reason as `@/lib/sign-in-state`.
 */
export interface RegenerateBriefingState {
  status: 'idle' | 'success' | 'error'
  /** A Turkish sentence from `userMessages.regenerate`, or null before submit. */
  message: string | null
  /** The user's local date the request was recorded for, on success. */
  forDate: string | null
  kind: BriefingKind | null
}

export const initialRegenerateBriefingState: RegenerateBriefingState = {
  status: 'idle',
  message: null,
  forDate: null,
  kind: null,
}
