import { redeemReferralRequestSchema, redeemReferralResponseSchema } from '@da/validation'
import { z } from 'zod'
import { parseRequest } from '../http'
import type { EndpointContext, ReferralSummary } from '../types'

const referralCodeResponseSchema = z.object({
  code: z.string().nullable(),
  redemptionCount: z.number().int().min(0),
  /** Latest expiry across every unrevoked bonus; null when none is active. */
  bonusExpiresAt: z.string().nullable().default(null),
  activeBonuses: z.number().int().min(0).default(0),
})

export type ReferralRedemption = z.infer<typeof redeemReferralResponseSchema>

export interface ReferralApi {
  getCode(): Promise<ReferralSummary>
  redeem(code: string): Promise<ReferralRedemption>
}

export function createReferralApi(ctx: EndpointContext): ReferralApi {
  return {
    async getCode() {
      const result = await ctx.http.callFunction('referral-code', {}, referralCodeResponseSchema)
      return {
        code: result.code ?? '',
        redemptionCount: result.redemptionCount,
        bonusExpiresAt: result.bonusExpiresAt,
        activeBonuses: result.activeBonuses,
      }
    },

    async redeem(code) {
      const request = parseRequest(redeemReferralRequestSchema, { code })
      return ctx.http.callFunction('referral-redeem', request, redeemReferralResponseSchema, {
        retry: false,
      })
    },
  }
}
