import {
  referralCodeRequest,
  referralCodeResponse,
  referralRedeemRequest,
  referralRedeemResponse,
  type ReferralRedeemResponse,
} from '@da/validation'
import { parseRequest } from '../http'
import type { EndpointContext, ReferralSummary } from '../types'

/**
 * The answer to a redemption attempt.
 *
 * A discriminated union rather than four independent fields: the caller has to
 * look at `granted` before it can read anything else, which is what stops a
 * refusal being rendered as a celebration. On the refusal side `reason` is
 * always present, so there is no "declined for no stated reason" branch for a
 * screen to invent copy for.
 */
export type ReferralRedemption = ReferralRedeemResponse

export interface ReferralApi {
  getCode(): Promise<ReferralSummary>
  redeem(code: string): Promise<ReferralRedemption>
}

export function createReferralApi(ctx: EndpointContext): ReferralApi {
  return {
    async getCode() {
      const request = parseRequest(referralCodeRequest, {})
      // The contract guarantees a non-empty code, so there is no `?? ''` here
      // any more: a server that answered without one now fails at this parse
      // instead of leaving the screen with a blank code to copy and share.
      return ctx.http.callFunction('referral-code', request, referralCodeResponse)
    },

    async redeem(code) {
      const request = parseRequest(referralRedeemRequest, { code })
      // Not retried: a retry after a timeout could land a second insert whose
      // unique violation reads back as `already_redeemed` for a redemption
      // that actually succeeded.
      return ctx.http.callFunction('referral-redeem', request, referralRedeemResponse, {
        retry: false,
      })
    },
  }
}
