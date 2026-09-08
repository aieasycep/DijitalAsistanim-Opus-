import { LOCALES } from '@da/domain'
import { z } from 'zod'
import { updatePreferencesRequestSchema } from '../api-schemas.ts'
import { timeZoneSchema } from '../primitives.ts'
import { rowSchema } from './common.ts'

/**
 * The `settings` group — `preferences-update`, `profile-update` and `feedback`.
 *
 * The notification half of the settings screen lives in `./notifications.ts`
 * (`notification-preferences-update`); `packages/api-client/src/endpoints/settings.ts`
 * imports both, because one client module fronts the two tables.
 *
 * Four decisions here, one per way this group used to drift:
 *
 *  1. **The envelope carries a row, and the row is never null.** Both updates
 *     answer the row they just wrote — `{ preferences }` and `{ profile }` —
 *     because that is what `updatePreferences(): Promise<UserPreferences>` and
 *     `updateProfile(): Promise<Profile>` have always promised the screens.
 *     `preferences-update` used to `update` a row that the signup trigger may
 *     never have created — writing nothing — and then answer
 *     `{ preferences: {} }` merged with a stray time zone, which
 *     `mapUserPreferences` turned into a `UserPreferences` of `undefined`s that
 *     no gate and no screen could tell from a saved setting. It now upserts and
 *     reads back in one statement, and `profile-update` raises `not_found`
 *     instead of answering a null the contract does not allow.
 *
 *  2. **The time zone belongs to the profile.** `user_preferences` has no
 *     `time_zone` column, so the function used to graft one onto its answer.
 *     Nothing read it — `mapUserPreferences` never looked, and `UserPreferences`
 *     has no such field — while it quietly implied the row had a shape it does
 *     not. A zone patch sent to `preferences-update` still lands on `profiles`,
 *     which is where every scheduled job reads it from; the profile is what
 *     reports it back.
 *
 *  3. **`avatarUrl` is real.** The client has always accepted it in a profile
 *     patch and the function's own schema silently dropped it, so `profiles`
 *     has an `avatar_url` column that nothing on the wire could ever set. The
 *     column is the source of truth and the field stays; the function now
 *     writes it.
 *
 *  4. **`onboardingCompleted` is `true` or absent.** The server stamps
 *     `onboarding_completed_at` when it arrives; there is no un-completing an
 *     onboarding, so `false` is not a request anyone can make. The function used
 *     to accept a boolean and ignore `false`, which is the same rule stated
 *     where nobody could see it.
 *
 * `feedback` is the fourth function in this group and is deliberately absent
 * from the schemas below. Its request is `feedbackRequestSchema` in
 * `../api-schemas.ts`, which both sides already import — there is nothing to
 * unify — and its response is `ackResponse` from `./common.ts`: a recorded
 * signal has nothing to describe. It used to answer `{ recorded: true, id }`
 * while its caller parsed `{ ok }`, so every "not important" and every "make
 * this person VIP" was written, acted on, and then reported as a failure.
 */

// ── preferences-update ──────────────────────────────────────────────────────

/**
 * A partial patch of `user_preferences`, plus the profile's `timeZone`.
 *
 * An alias, not a copy: `api-schemas.ts` has always owned this schema and both
 * sides already import it. Re-declaring it here would create the second
 * definition this module exists to abolish.
 */
export const preferencesUpdateRequest = updatePreferencesRequestSchema

export type PreferencesUpdateRequest = z.infer<typeof preferencesUpdateRequest>

export const preferencesUpdateResponse = z.object({
  /**
   * The `user_preferences` row after the patch — always present, never null,
   * and never carrying a column the table does not have.
   */
  preferences: rowSchema,
})

export type PreferencesUpdateResponse = z.infer<typeof preferencesUpdateResponse>

// ── profile-update ──────────────────────────────────────────────────────────

/**
 * A partial patch of `profiles`.
 *
 * The email address is deliberately absent: it is the identity the auth
 * provider issued and the key every connected account is matched on, so editing
 * it here would break the connections rather than change the address. The
 * profile screen renders it read-only for the same reason.
 */
export const profileUpdateRequest = z
  .object({
    displayName: z.string().min(1).max(120).nullable(),
    givenName: z.string().min(1).max(60).nullable(),
    /** Null clears the picture; the column is nullable and starts that way. */
    avatarUrl: z.string().url().max(2000).nullable(),
    timeZone: timeZoneSchema,
    /** The language the server generates briefings and drafts in. */
    locale: z.enum(LOCALES),
    /** Set once, when the onboarding flow finishes; the server stamps the time. */
    onboardingCompleted: z.literal(true),
  })
  .partial()

export type ProfileUpdateRequest = z.infer<typeof profileUpdateRequest>

export const profileUpdateResponse = z.object({
  /**
   * The `profiles` row after the patch. A caller with no profile row gets a
   * `not_found` error rather than a null: the session store keeps this row as
   * the signed-in user, and replacing it with nothing would sign them out of a
   * screen that was only meant to save a name.
   */
  profile: rowSchema,
})

export type ProfileUpdateResponse = z.infer<typeof profileUpdateResponse>
