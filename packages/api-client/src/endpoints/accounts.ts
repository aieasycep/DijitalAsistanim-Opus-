import type { AccountKind, ConnectedAccount } from '@da/domain'
import {
  disconnectAccountRequestSchema,
  oauthCallbackQuerySchema,
  oauthStartRequestSchema,
  oauthStartResponseSchema,
} from '@da/validation'
import { z } from 'zod'
import { okSchema, parseRequest, rowOf } from '../http'
import { mapConnectedAccount } from '../mappers'
import type { ConnectedAccountRow, EndpointContext, OAuthStartResult, ScopeGroup } from '../types'

const accountEnvelopeSchema = z.object({ account: rowOf<ConnectedAccountRow>() })

export interface StartOAuthInput {
  provider: 'google' | 'microsoft'
  kinds: AccountKind[]
  additionalScopeGroups?: ScopeGroup[]
  redirectTo: string
}

export interface RequestScopesInput {
  connectedAccountId: string
  provider: 'google' | 'microsoft'
  kinds: AccountKind[]
  scopeGroups: ScopeGroup[]
  redirectTo: string
}

export interface AccountsApi {
  list(): Promise<ConnectedAccount[]>
  startOAuth(input: StartOAuthInput): Promise<OAuthStartResult>
  completeOAuth(input: { code: string; state: string }): Promise<ConnectedAccount>
  disconnect(input: { connectedAccountId: string; revoke?: boolean }): Promise<void>
  /** Progressive authorization: ask for a scope group only when it is needed. */
  requestScopes(input: RequestScopesInput): Promise<OAuthStartResult>
}

export function createAccountsApi(ctx: EndpointContext): AccountsApi {
  async function start(body: unknown): Promise<OAuthStartResult> {
    const request = parseRequest(oauthStartRequestSchema, body)
    const result = await ctx.http.callFunction('oauth-start', request, oauthStartResponseSchema, {
      retry: false,
    })
    return { authorizeUrl: result.authorizeUrl, state: result.state }
  }

  return {
    async list() {
      const rows = await ctx.db.selectMany<ConnectedAccountRow>('connected_accounts', {
        order: { column: 'created_at', ascending: true },
      })
      return rows.map(mapConnectedAccount)
    },

    startOAuth(input) {
      return start({
        provider: input.provider,
        kinds: input.kinds,
        additionalScopeGroups: input.additionalScopeGroups ?? [],
        redirectTo: input.redirectTo,
      })
    },

    async completeOAuth(input) {
      const request = parseRequest(oauthCallbackQuerySchema, input)
      const result = await ctx.http.callFunction('oauth-complete', request, accountEnvelopeSchema, {
        retry: false,
      })
      return mapConnectedAccount(result.account)
    },

    async disconnect(input) {
      const request = parseRequest(disconnectAccountRequestSchema, {
        connectedAccountId: input.connectedAccountId,
        revoke: input.revoke ?? true,
      })
      await ctx.http.callFunction('accounts-disconnect', request, okSchema, { retry: false })
    },

    requestScopes(input) {
      return start({
        provider: input.provider,
        kinds: input.kinds,
        additionalScopeGroups: input.scopeGroups,
        redirectTo: input.redirectTo,
      })
    },
  }
}
