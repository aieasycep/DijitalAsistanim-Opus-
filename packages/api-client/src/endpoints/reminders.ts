import type { IsoInstant, Reminder, ReminderPreset, SourceType } from '@da/domain'
import { reminderCreatePayloadSchema } from '@da/validation'
import { z } from 'zod'
import { parseRequest, rowOf } from '../http'
import { mapReminder } from '../mappers'
import type { Filter } from '../supabase'
import type { EndpointContext, ReminderRow } from '../types'

const reminderEnvelopeSchema = z.object({ reminder: rowOf<ReminderRow>() })

export interface CreateReminderInput {
  title: string
  body?: string | null
  remindAt: IsoInstant
  preset: ReminderPreset
  relatedEntityType?: Exclude<SourceType, 'user_input'> | null
  relatedEntityId?: string | null
}

export interface RemindersApi {
  list(input?: { status?: Reminder['status']; limit?: number }): Promise<Reminder[]>
  create(input: CreateReminderInput): Promise<Reminder>
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
      const request = parseRequest(reminderCreatePayloadSchema, {
        kind: 'reminder_create',
        title: input.title,
        body: input.body ?? null,
        remindAt: input.remindAt,
        preset: input.preset,
        relatedEntityType: input.relatedEntityType ?? null,
        relatedEntityId: input.relatedEntityId ?? null,
      })
      const result = await ctx.http.callFunction(
        'reminder-create',
        request,
        reminderEnvelopeSchema,
        {
          retry: false,
        },
      )
      return mapReminder(result.reminder)
    },

    async cancel(reminderId) {
      const row = await ctx.db.updateOne<ReminderRow>('reminders', reminderId, {
        status: 'cancelled',
      })
      return mapReminder(row)
    },
  }
}
