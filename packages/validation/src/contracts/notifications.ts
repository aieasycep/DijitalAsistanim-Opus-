import { z } from 'zod'
import {
  registerPushTokenRequestSchema,
  updateNotificationPreferencesRequestSchema,
} from '../api-schemas.ts'
import { rowSchema } from './common.ts'

/**
 * The `notifications` group — `push-token-register`, `push-token-unregister`
 * and `notification-preferences-update`.
 *
 * Every endpoint in this group was broken, and each in a different way, so the
 * three decisions below are worth stating:
 *
 *  1. **Registration answers with the row.** It used to answer
 *     `{ registered: true, id }` while the client parsed a `{ pushToken }`
 *     envelope, so *every* push registration threw at the boundary after the
 *     row had already been written. The device was registered and the app
 *     believed it was not — and because `usePushRegistration` swallows the
 *     throw, nobody ever saw it. The row is what the client's public
 *     `registerToken(): Promise<PushToken>` has always promised and what the
 *     demo client already returns, so the function now sends the row it just
 *     upserted rather than a bespoke flag beside its id.
 *
 *  2. **Unregistration answers `ACK`.** It used to answer
 *     `{ unregistered: true }` while the client parsed `{ ok: boolean }` — the
 *     same shape of lie as `accounts-disconnect`: the row was deleted and the
 *     caller was told it had failed. Deleting a device token has nothing else
 *     to report, so it returns the one acknowledgement every such endpoint
 *     returns.
 *
 *  3. **The preferences envelope is `notificationPreferences`.** The function
 *     returned `{ preferences }` — the key `preferences-update` uses for the
 *     *user* preferences row — while this endpoint's caller required
 *     `{ notificationPreferences }`. So every toggle on the notification
 *     settings screen wrote the change, failed to parse the answer, and snapped
 *     back to its old position in front of the user. The two rows are different
 *     tables with different columns; they do not get to share an envelope name.
 */

// ── push-token-register ─────────────────────────────────────────────────────

/**
 * The device to register, keyed on `deviceId`.
 *
 * An alias, not a copy: `api-schemas.ts` has always owned this schema and both
 * sides already import it. Re-declaring it here would create the second
 * definition this module exists to abolish.
 */
export const pushTokenRegisterRequest = registerPushTokenRequestSchema

export type PushTokenRegisterRequest = z.infer<typeof pushTokenRegisterRequest>

export const pushTokenRegisterResponse = z.object({
  /**
   * The `push_tokens` row as it stands after the upsert.
   *
   * It carries the server's `last_seen_at` and the `disabled_at` that
   * re-registering clears, neither of which the client can know on its own —
   * which is why the answer is the row and not an acknowledgement.
   */
  pushToken: rowSchema,
})

export type PushTokenRegisterResponse = z.infer<typeof pushTokenRegisterResponse>

// ── push-token-unregister ───────────────────────────────────────────────────

/**
 * The device to forget.
 *
 * `deviceId` is borrowed from the register request rather than restated, so the
 * id you can unregister is exactly the id you were able to register.
 */
export const pushTokenUnregisterRequest = z.object({
  deviceId: registerPushTokenRequestSchema.shape.deviceId,
})

export type PushTokenUnregisterRequest = z.infer<typeof pushTokenUnregisterRequest>

// The response is `ackResponse` from `./common.ts`. A deleted token row leaves
// nothing to describe.

// ── notification-preferences-update ─────────────────────────────────────────

/**
 * A partial patch: every field is optional, and an absent field is left alone
 * rather than reset. Aliased from `api-schemas.ts` for the same reason as the
 * register request.
 */
export const notificationPreferencesUpdateRequest = updateNotificationPreferencesRequestSchema

export type NotificationPreferencesUpdateRequest = z.infer<
  typeof notificationPreferencesUpdateRequest
>

export const notificationPreferencesUpdateResponse = z.object({
  /**
   * The `notification_preferences` row after the patch — always present, never
   * null: the function upserts and reads back in one statement, so a user whose
   * signup trigger predates the table gets a row created by the first change
   * they make instead of an empty answer.
   */
  notificationPreferences: rowSchema,
})

export type NotificationPreferencesUpdateResponse = z.infer<
  typeof notificationPreferencesUpdateResponse
>
