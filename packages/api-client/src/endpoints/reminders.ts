import type { IsoInstant, Reminder, ReminderPreset, ResolvedReminder } from '@da/domain'
import {
  reminderCreateRequest,
  reminderCreateResponse,
  type ReminderEntityType,
} from '@da/validation'
import { parseRequest } from '../http'
import { mapReminder } from '../mappers'
import type { Filter } from '../supabase'
import type { EndpointContext, ReminderRow } from '../types'

/**
 * A row the function already selected and RLS already scoped.
 *
 * The contract pins the envelope around it and leaves the row itself
 * permissive — adding a column must not require a contract change — so the
 * mapper is what narrows a row into a domain entity.
 */
function rowOf<T>(value: Record<string, unknown>): T {
  return value as unknown as T
}

export interface CreateReminderInput {
  title: string
  body?: string | null
  preset: ReminderPreset
  /**
   * The instant the user picked. Required for the `custom` preset and ignored
   * by the others: every other preset is resolved against the user's own
   * morning, evening and quiet hours, which only the server knows.
   */
  customAt?: IsoInstant | null
  /** The zone the preset's "evening" and "morning" are measured in. */
  timeZone?: string
  relatedEntityType?: ReminderEntityType | null
  relatedEntityId?: string | null
}

/**
 * A reminder that was just set, together with the domain's account of the time
 * it chose — the app renders `explanationKey` so a reminder pushed out of
 * quiet hours can say so instead of silently firing hours late.
 */
export interface CreatedReminder {
  reminder: Reminder
  resolution: ResolvedReminder
}

export interface RemindersApi {
  list(input?: { status?: Reminder['status']; limit?: number }): Promise<Reminder[]>
  create(input: CreateReminderInput): Promise<CreatedReminder>
  cancel(reminderId: string): Promise<Reminder>
}

export function createRemindersApi(ctx: EndpointContext): RemindersApi {
  return {
    async list(input = {}) {
      const filters: Filter[] = []
      filters.push({ column: 'status', op: 'eq', value: input.status ?? 'scheduled' })
      const rows = await ctx.db.selectMany<ReminderRow>('reminders', {
        filters,
        order: { column: 'remind_at', ascending: true },
        limit: input.limit ?? 100,
      })
      return rows.map(mapReminder)
    },

    async create(input) {
      const request = parseRequest(reminderCreateRequest, {
        title: input.title,
        body: input.body ?? null,
        preset: input.preset,
        customAt: input.customAt ?? null,
        ...(input.timeZone === undefined ? {} : { timeZone: input.timeZone }),
        relatedEntityType: input.relatedEntityType ?? null,
        relatedEntityId: input.relatedEntityId ?? null,
      })
      const result = await ctx.http.callFunction(
        'reminder-create',
        request,
        reminderCreateResponse,
        {
          // A retried create would set a second reminder for the same thing.
          retry: false,
        },
      )
      return {
        reminder: mapReminder(rowOf<ReminderRow>(result.reminder)),
        resolution: result.resolution,
      }
    },

    async cancel(reminderId) {
      const row = await ctx.db.updateOne<ReminderRow>('reminders', reminderId, {
        status: 'cancelled',
      })
      return mapReminder(row)
    },
  }
}
