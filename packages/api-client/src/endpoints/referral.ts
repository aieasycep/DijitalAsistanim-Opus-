import { redeemReferralRequestSchema, redeemReferralResponseSchema } from '@da/validation'
import { z } from 'zod'
import { parseRequest } from '../http'
import type { EndpointContext, ReferralSummary } from '../types'

const referralCodeResponseSchema = z.object({
  code: z.string(),
  redemptionCount: z.number().int().min(0),
  bonusDaysEarned: z.number().int().min(0),
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
        code: result.code,
        redemptionCount: result.redemptionCount,
        bonusDaysEarned: result.bonusDaysEarned,
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
