import type { ReminderPreset, ResolvedReminder, SourceType } from '@da/domain'
import { REMINDER_PRESETS } from '@da/domain'
import { z } from 'zod'
import { isoInstantSchema, timeZoneSchema } from '../primitives.ts'
import { rowSchema } from './common.ts'

/**
 * The `reminders` group — `reminder-create`.
 *
 * Four decisions are worth stating:
 *
 *  1. **One function, one contract.** Listing a reminder and cancelling one are
 *     PostgREST reads and writes against `reminders` under RLS — no envelope
 *     between the two sides, so nothing to pin. Creating one is the only call
 *     that crosses a function boundary, and it is the only thing defined here.
 *
 *  2. **The server picks the instant, so the request carries the *preset*.**
 *     `resolveReminderTime` in `@da/domain` is the one reminder-time
 *     calculator, and it needs three things the device does not reliably have:
 *     the user's morning and evening hours, the quiet hours their push
 *     delivery actually enforces, and — for `smart` — their calendar. So the
 *     wire carries what the user chose (`preset`, plus `customAt` when they
 *     picked a time themselves) and the answer comes back resolved. A client
 *     that computed `remindAt` itself would be guessing, and the previous
 *     client did: it hardcoded 19:00 and 09:00 for every user on earth.
 *
 *  3. **The resolution travels whole, under the domain's own names.**
 *     `resolution` is `ResolvedReminder` exactly as `resolveReminderTime`
 *     returns it, which `satisfies z.ZodType<ResolvedReminder>` below turns
 *     into a compile error rather than a convention. It carries the instant
 *     *and* the i18n key explaining the choice, because a reminder moved out
 *     of quiet hours fires at a time the user never asked for, and a screen
 *     that cannot say so leaves them wondering. `resolution.remindAt` and the
 *     row's `remind_at` are the same instant by construction — the function
 *     inserts the one it resolved — so this is not two sources of truth, it is
 *     the domain's answer alongside the record it produced.
 *
 *  4. **No user-facing sentence crosses the wire.** The explanation is a key
 *     plus its values, rendered in the reader's language by the app.
 */

/**
 * Values interpolated into an i18n message — the wire form of `MessageValues`
 * in `@da/i18n`. Kept structural rather than imported so `@da/validation` does
 * not depend on the catalogue.
 */
const messageValuesSchema = z.record(z.string(), z.union([z.string(), z.number()]))

/** Which preset produced the time; `custom` when the user picked one. */
export const reminderPreset = z.enum(REMINDER_PRESETS) satisfies z.ZodType<ReminderPreset>

/**
 * What a reminder can be attached to.
 *
 * `reminders.related_entity_type` is the full `SourceType` enum, but
 * `user_input` is not a record the app can open from the reminder, so the wire
 * does not accept it: a link that leads nowhere is worse than no link.
 */
export const REMINDER_ENTITY_TYPES = [
  'email',
  'calendar_event',
  'task',
  'capture',
  'commitment',
  'contact',
  'notification',
] as const satisfies readonly SourceType[]

export const reminderEntityType = z.enum(REMINDER_ENTITY_TYPES)

export type ReminderEntityType = z.infer<typeof reminderEntityType>

// ── reminder-create ─────────────────────────────────────────────────────────

/**
 * A reminder to set. The limits are the column widths, so a body that parses
 * here cannot be rejected by the table afterwards.
 */
export const reminderCreateRequest = z
  .object({
    title: z.string().min(1).max(300),
    body: z.string().max(1000).nullable().default(null),
    preset: reminderPreset,
    /**
     * The instant the user picked. Required by — and only read for — the
     * `custom` preset; every other preset is resolved from the user's own
     * hours, which live on the server.
     */
    customAt: isoInstantSchema.nullable().default(null),
    /**
     * The zone the preset's "evening" and "morning" are measured in. Optional:
     * the function falls back to the caller's profile zone, which is the one
     * the app renders every other time in.
     */
    timeZone: timeZoneSchema.optional(),
    relatedEntityType: reminderEntityType.nullable().default(null),
    relatedEntityId: z.string().min(1).max(100).nullable().default(null),
  })
  .refine((value) => value.preset !== 'custom' || value.customAt !== null, {
    message: 'The custom preset requires customAt',
    path: ['customAt'],
  })

export type ReminderCreateRequest = z.infer<typeof reminderCreateRequest>

/**
 * The domain's answer: when the reminder will fire, and why then.
 *
 * `values` is optional because `resolveReminderTime` only fills it when the
 * explanation needs something the key cannot carry; the placeholders that
 * describe the reminder's own time are filled by the app, which is the side
 * that knows the reader's locale.
 */
export const reminderResolution = z.object({
  remindAt: isoInstantSchema,
  /** Resolves against `reminder.preset.*`, `reminder.smart.*` or `reminder.quietHoursShifted`. */
  explanationKey: z.string().min(1),
  values: messageValuesSchema.optional(),
}) satisfies z.ZodType<ResolvedReminder>

export type ReminderResolution = z.infer<typeof reminderResolution>

/**
 * The stored row, so the app can show the reminder it just set without waiting
 * for a refetch, plus the resolution that produced it.
 *
 * The row stays permissive — its columns are pinned by the migration and
 * narrowed by the mapper — while the envelope around it is fixed here, because
 * the envelope is what drifts.
 */
export const reminderCreateResponse = z.object({
  reminder: rowSchema,
  resolution: reminderResolution,
})

export type ReminderCreateResponse = z.infer<typeof reminderCreateResponse>
