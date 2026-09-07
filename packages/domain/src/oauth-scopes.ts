import type { Provider } from './enums.ts'

/**
 * Least-privilege OAuth. The app asks for read access at connect time and
 * requests each write scope only at the moment the user first tries the action
 * that needs it — so a user who never sends a reply is never asked for
 * send permission.
 */

export const GOOGLE_SCOPES = {
  identity: ['openid', 'email', 'profile'],
  mailRead: ['https://www.googleapis.com/auth/gmail.readonly'],
  calendarRead: ['https://www.googleapis.com/auth/calendar.readonly'],
  tasksRead: ['https://www.googleapis.com/auth/tasks.readonly'],
  mailSend: ['https://www.googleapis.com/auth/gmail.send'],
  calendarWrite: ['https://www.googleapis.com/auth/calendar.events'],
  tasksWrite: ['https://www.googleapis.com/auth/tasks'],
  contactsRead: ['https://www.googleapis.com/auth/contacts.readonly'],
} as const

export const MICROSOFT_SCOPES = {
  identity: ['openid', 'email', 'profile', 'offline_access', 'User.Read'],
  mailRead: ['Mail.Read'],
  calendarRead: ['Calendars.Read'],
  tasksRead: ['Tasks.Read'],
  mailSend: ['Mail.Send'],
  calendarWrite: ['Calendars.ReadWrite'],
  tasksWrite: ['Tasks.ReadWrite'],
  contactsRead: ['Contacts.Read'],
} as const

export type ScopeGroup = keyof typeof GOOGLE_SCOPES

/** Groups requested at first connect. Everything else is progressive. */
export const INITIAL_SCOPE_GROUPS: readonly ScopeGroup[] = ['identity', 'mailRead', 'calendarRead']

/** Which scope group an action needs before it may run. */
export const ACTION_SCOPE_REQUIREMENTS = {
  email_send: 'mailSend',
  calendar_create: 'calendarWrite',
  calendar_update: 'calendarWrite',
  task_create: 'tasksWrite',
} as const satisfies Record<string, ScopeGroup>

export function scopesFor(provider: Provider, groups: readonly ScopeGroup[]): string[] {
  const table =
    provider === 'microsoft'
      ? (MICROSOFT_SCOPES as Record<ScopeGroup, readonly string[]>)
      : (GOOGLE_SCOPES as Record<ScopeGroup, readonly string[]>)
  const out = new Set<string>()
  for (const g of groups) for (const s of table[g] ?? []) out.add(s)
  return [...out]
}

export function initialScopes(provider: Provider): string[] {
  return scopesFor(provider, INITIAL_SCOPE_GROUPS)
}

/**
 * Scopes still missing for an action, given what the account already granted.
 * An empty array means the action may proceed without a re-consent round trip.
 */
export function missingScopesFor(
  provider: Provider,
  action: keyof typeof ACTION_SCOPE_REQUIREMENTS,
  grantedScopes: readonly string[],
): string[] {
  const needed = scopesFor(provider, [ACTION_SCOPE_REQUIREMENTS[action]])
  const granted = new Set(grantedScopes.map((s) => s.toLowerCase()))
  return needed.filter((s) => !granted.has(s.toLowerCase()))
}

/** OAuth endpoints, kept beside the scopes they pair with. */
export const OAUTH_ENDPOINTS = {
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    revoke: 'https://oauth2.googleapis.com/revoke',
  },
  microsoft: {
    authorize: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    /** Graph has no revoke endpoint; sessions are ended via the account portal. */
    revoke: null,
  },
} as const

/**
 * Extra authorize-URL parameters. `prompt=consent` plus `access_type=offline`
 * is what actually makes Google hand back a refresh token on re-consent;
 * `include_granted_scopes` is what keeps previously granted scopes when we
 * step up incrementally.
 */
export const GOOGLE_AUTH_PARAMS = {
  access_type: 'offline',
  prompt: 'consent',
  include_granted_scopes: 'true',
} as const

export const MICROSOFT_AUTH_PARAMS = {
  response_mode: 'query',
} as const
