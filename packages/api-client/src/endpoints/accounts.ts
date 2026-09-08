import type { AccountKind, ConnectedAccount } from '@da/domain'
import {
  accountsDisconnectRequest,
  ackResponse,
  oauthCompleteRequest,
  oauthCompleteResponse,
  oauthStartRequest,
  oauthStartResponse,
} from '@da/validation'
import { parseRequest } from '../http'
import { mapConnectedAccount } from '../mappers'
import type { ConnectedAccountRow, EndpointContext, OAuthStartResult, ScopeGroup } from '../types'

/**
 * A row the function already selected and RLS already scoped.
 *
 * The contract pins the envelope around it — that is what drifts — and leaves
 * the row permissive, so the mapper is what narrows it into a domain entity.
 */
function rowOf<T>(value: Record<string, unknown>): T {
  return value as unknown as T
}

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
  /** Hand back what the redirect carried; the server does the exchange. */
  completeOAuth(input: { code: string; state: string }): Promise<ConnectedAccount>
  disconnect(input: { connectedAccountId: string; revoke?: boolean }): Promise<void>
  /** Progressive authorization: ask for a scope group only when it is needed. */
  requestScopes(input: RequestScopesInput): Promise<OAuthStartResult>
}

export function createAccountsApi(ctx: EndpointContext): AccountsApi {
  function start(input: {
    provider: 'google' | 'microsoft'
    kinds: AccountKind[]
    scopeGroups: ScopeGroup[]
    redirectTo: string
    /** The account being widened, or null for a new connection. */
    connectedAccountId: string | null
  }): Promise<OAuthStartResult> {
    const request = parseRequest(oauthStartRequest, {
      provider: input.provider,
      kinds: input.kinds,
      additionalScopeGroups: input.scopeGroups,
      redirectTo: input.redirectTo,
      connectedAccountId: input.connectedAccountId,
    })
    return ctx.http.callFunction('oauth-start', request, oauthStartResponse, { retry: false })
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
        scopeGroups: input.additionalScopeGroups ?? [],
        redirectTo: input.redirectTo,
        connectedAccountId: null,
      })
    },

    async completeOAuth(input) {
      const request = parseRequest(oauthCompleteRequest, input)
      const result = await ctx.http.callFunction(
        'oauth-complete',
        request,
        oauthCompleteResponse,
        // The code is single-use: a retry would exchange a code the provider
        // has already burned and report a failure over a working connection.
        { retry: false },
      )
      return mapConnectedAccount(rowOf<ConnectedAccountRow>(result.account))
    },

    async disconnect(input) {
      const request = parseRequest(accountsDisconnectRequest, {
        connectedAccountId: input.connectedAccountId,
        revoke: input.revoke ?? true,
      })
      await ctx.http.callFunction('accounts-disconnect', request, ackResponse, { retry: false })
    },

    requestScopes(input) {
      return start({
        provider: input.provider,
        kinds: input.kinds,
        scopeGroups: input.scopeGroups,
        redirectTo: input.redirectTo,
        // Carried through to the state row, so the callback widens this grant
        // instead of writing a second connection for the same mailbox.
        connectedAccountId: input.connectedAccountId,
      })
    },
  }
}
