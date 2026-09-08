import { AppError, type FollowUp, type FollowUpAction, type IsoInstant } from '@da/domain'
import {
  followupNudgeRequest,
  followupNudgeResponse,
  type FollowupNudgeResponse,
} from '@da/validation'
import { parseRequest } from '../http'
import { mapFollowUp } from '../mappers'
import type { Filter } from '../supabase'
import type { EndpointContext, FollowUpRow, NudgeDraft } from '../types'

/**
 * A row the function already selected and RLS already scoped. The contract
 * pins the envelope around it; the mapper narrows the row itself.
 */
function asRow<T>(value: Record<string, unknown>): T {
  return value as unknown as T
}

/**
 * The statuses a follow-up is still live in.
 *
 * `list()` used to default to `waiting` alone while the screen rendered
 * `waiting` and `nudged` together — so drafting a nudge, which moves the row
 * to `nudged`, made the card disappear on the next refetch. The two now agree.
 */
const OPEN_FOLLOW_UP_STATUSES = ['waiting', 'nudged'] as const

export interface FollowUpFilter {
  status?: FollowUp['status']
  dueBefore?: IsoInstant
  limit?: number
}

export interface FollowUpsApi {
  list(filter?: FollowUpFilter): Promise<FollowUp[]>
  /** Writes a nudge the user can approve; nothing leaves the device on its own. */
  nudgeDraft(followUpId: string): Promise<NudgeDraft>
  /**
   * Asks again at `until` and records the dismissal the engine backs off with.
   * The instant is the domain's `nextWorkingDay`, computed in the user's zone.
   */
  snooze(followUpId: string, until: IsoInstant): Promise<FollowUp>
  close(followUpId: string): Promise<FollowUp>
}

export function createFollowUpsApi(ctx: EndpointContext): FollowUpsApi {
  /**
   * One action, one envelope: `followup-nudge` answers every action with the
   * follow-up as it now stands, so the app shows what was stored rather than
   * what it assumed the write did.
   *
   * Retries are off because none of the three is safe to repeat: a nudge costs
   * a model call, and a dismissal increments the counter the engine gives up
   * on.
   */
  async function act(
    followUpId: string,
    action: FollowUpAction,
    remindAt: IsoInstant | null,
    timeoutMs?: number,
  ): Promise<FollowupNudgeResponse> {
    const request = parseRequest(followupNudgeRequest, { followUpId, action, remindAt })
    return ctx.http.callFunction('followup-nudge', request, followupNudgeResponse, {
      retry: false,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    })
  }

  return {
    async list(filter = {}) {
      const filters: Filter[] = []
      if (filter.status) filters.push({ column: 'status', op: 'eq', value: filter.status })
      if (filter.dueBefore) filters.push({ column: 'due_at', op: 'lte', value: filter.dueBefore })
      const rows = await ctx.db.selectMany<FollowUpRow>('follow_ups', {
        filters,
        ...(filter.status
          ? {}
          : { inFilter: { column: 'status', values: OPEN_FOLLOW_UP_STATUSES } }),
        order: { column: 'due_at', ascending: true },
        limit: filter.limit ?? 50,
      })
      return rows.map(mapFollowUp)
    },

    async nudgeDraft(followUpId) {
      // The model call is the slow one, so it gets the long timeout the other
      // two actions have no use for.
      const result = await act(followUpId, 'draft_nudge', null, 45_000)
      if (!result.draft) {
        throw new AppError('ai_invalid_output', { detail: 'followup-nudge: draft missing' })
      }
      return {
        followUpId: result.draft.followUpId,
        subject: result.draft.subject,
        body: result.draft.body,
        // A nudge becomes an approval only once the user sends it for one; the
        // draft itself is never stored as a pending action.
        approvalId: null,
      }
    },

    async snooze(followUpId, until) {
      const result = await act(followUpId, 'remind_tomorrow', until)
      return mapFollowUp(asRow<FollowUpRow>(result.followUp))
    },

    async close(followUpId) {
      const result = await act(followUpId, 'close', null)
      return mapFollowUp(asRow<FollowUpRow>(result.followUp))
    },
  }
}
