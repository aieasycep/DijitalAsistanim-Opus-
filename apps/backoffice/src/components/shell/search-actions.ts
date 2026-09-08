'use server'

import { z } from 'zod'
import { assertSameOriginRequest, hasPermission } from '@/lib/auth'
import { queryView } from '@/lib/db'

/**
 * The command palette's lookup.
 *
 * ---------------------------------------------------------------------------
 * WHAT AN OPERATOR CAN SEARCH BY, AND WHY IT IS SO LITTLE
 * ---------------------------------------------------------------------------
 *
 * A user id, and an email domain. That is the whole vocabulary, and it is a
 * consequence of the console being content-blind rather than an omission:
 * `bo_users` exposes `email_redacted` and `email_domain`, and there is no
 * column anywhere that holds a searchable address. A palette that could find a
 * person by typing their email would be a palette that had a copy of everyone's
 * email — which is the thing section 7 exists to prevent.
 *
 * So the two real support workflows are the two that are supported: a ticket
 * quotes a user id and the operator jumps to it, or a customer reports a
 * company-wide problem and the operator lists that domain.
 *
 * ---------------------------------------------------------------------------
 * THE PALETTE READS. IT NEVER WRITES.
 * ---------------------------------------------------------------------------
 *
 * There is one action in this module and it is a `select`. No destructive
 * operation is reachable from the palette — not disable, not disconnect, not
 * resync — because every one of those needs a written reason, and a reason
 * cannot be typed into a search box. They live behind `ConfirmDialog`, on the
 * page that owns them.
 *
 * Each section is gated on the permission its own page requires, checked here
 * rather than assumed from the caller: a `finance` operator gets the accounts
 * they may see and no sync rows at all, and the palette simply has one fewer
 * group rather than an error.
 */

const querySchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  // A search term reaches Postgres as a pattern, so the character set is a
  // closed one: identifiers, dots, dashes and the `@` an operator will paste
  // by habit. `%` and `_` are not on it, and cannot become wildcards.
  .regex(/^[A-Za-z0-9@._-]+$/u)

const consoleUuidSchema = z.string().uuid()

export interface ConsoleSearchUser {
  readonly userId: string
  readonly emailRedacted: string | null
  readonly emailDomain: string | null
  readonly subscriptionStatus: string
  readonly accountErrorCount: number
  readonly isDeleted: boolean
}

export interface ConsoleSearchJob {
  readonly syncStateId: string
  readonly userId: string
  readonly provider: string
  readonly resource: string
  readonly status: string
  readonly lastErrorCode: string | null
  readonly isStalled: boolean
}

export type ConsoleSearchResult =
  | {
      readonly ok: true
      readonly query: string
      readonly users: readonly ConsoleSearchUser[]
      readonly jobs: readonly ConsoleSearchJob[]
    }
  | { readonly ok: false; readonly reason: 'too_short' | 'unavailable' }

const LIMIT = 8

export async function searchConsole(rawQuery: string): Promise<ConsoleSearchResult> {
  await assertSameOriginRequest()

  const parsed = querySchema.safeParse(rawQuery)
  if (!parsed.success) return { ok: false, reason: 'too_short' }
  const query = parsed.data

  const asUuid = consoleUuidSchema.safeParse(query.toLowerCase())
  const userId = asUuid.success ? asUuid.data : null
  // A domain, or the tail of one an operator pasted with the local part still
  // attached. Anchored so the pattern can use the index.
  const domain = query.includes('@') ? (query.split('@').pop() ?? '') : query

  const [mayReadUsers, mayReadIntegrations] = await Promise.all([
    hasPermission('users.read'),
    hasPermission('integration.read'),
  ])

  try {
    const [users, jobs] = await Promise.all([
      mayReadUsers ? findUsers(userId, domain) : Promise.resolve([]),
      mayReadIntegrations && userId !== null ? findJobs(userId) : Promise.resolve([]),
    ])
    return { ok: true, query, users, jobs }
  } catch {
    // The palette is opened from every page; a lookup failure must not become
    // an unhandled rejection in the shell.
    return { ok: false, reason: 'unavailable' }
  }
}

async function findUsers(
  userId: string | null,
  domain: string,
): Promise<readonly ConsoleSearchUser[]> {
  const columns = [
    'user_id',
    'email_redacted',
    'email_domain',
    'subscription_status',
    'account_error_count',
    'is_deleted',
  ] as const

  // An exact id is an exact answer: one row, no scan.
  const rows =
    userId !== null
      ? await queryView('bo_users', {
          columns,
          filters: [{ column: 'user_id', op: 'eq', value: userId }],
          limit: 1,
        })
      : domain.length < 2
        ? []
        : await queryView('bo_users', {
            columns,
            filters: [{ column: 'email_domain', op: 'ilike', value: `${domain}%` }],
            order: { column: 'created_at', ascending: false },
            limit: LIMIT,
          })

  return rows.map((row) => ({
    userId: row.user_id,
    emailRedacted: row.email_redacted,
    emailDomain: row.email_domain,
    subscriptionStatus: row.subscription_status,
    accountErrorCount: row.account_error_count,
    isDeleted: row.is_deleted,
  }))
}

async function findJobs(userId: string): Promise<readonly ConsoleSearchJob[]> {
  const rows = await queryView('bo_sync_health', {
    columns: [
      'sync_state_id',
      'user_id',
      'provider',
      'resource',
      'status',
      'last_error_code',
      'is_stalled',
    ],
    filters: [{ column: 'user_id', op: 'eq', value: userId }],
    order: { column: 'updated_at', ascending: false },
    limit: LIMIT,
  })

  return rows.map((row) => ({
    syncStateId: row.sync_state_id,
    userId: row.user_id,
    provider: row.provider,
    resource: row.resource,
    status: row.status,
    lastErrorCode: row.last_error_code,
    isStalled: row.is_stalled,
  }))
}
