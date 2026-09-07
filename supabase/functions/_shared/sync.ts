import { AppError, type Provider, systemClock } from './domain.ts'
import { audit } from './audit.ts'
import { dbError, serviceClient } from './db.ts'
import { getAccessToken, type OAuthProvider } from './oauth.ts'
import { type DecodedLike, ingestMessages, loadIngestContext } from './ingest.ts'
import * as google from './providers/google.ts'
import * as microsoft from './providers/microsoft.ts'

/**
 * Provider synchronisation.
 *
 * An edge invocation has a wall-clock limit, so a sync is explicitly
 * resumable: each run processes a bounded page, writes the cursor it reached,
 * and leaves the rest for the next run. A large mailbox therefore converges
 * over several passes rather than timing out on the first.
 */

/** Messages processed per invocation. Sized to finish inside the time budget. */
const MESSAGE_PAGE_LIMIT = 200

export interface SyncOutcome {
  resource: 'mail' | 'calendar' | 'tasks'
  processed: number
  inserted: number
  analyzed: number
  skipped: number
  cursor: string | null
  complete: boolean
}

interface AccountRow {
  id: string
  provider: Provider
  kinds: string[]
  email: string | null
  status: string
}

export async function listSyncableAccounts(
  userId: string,
  kind: 'mail' | 'calendar' | 'tasks',
): Promise<AccountRow[]> {
  const { data, error } = await serviceClient()
    .from('connected_accounts')
    .select('id, provider, kinds, email, status')
    .eq('user_id', userId)
    .eq('status', 'connected')
    .contains('kinds', [kind])

  if (error) throw dbError(error)
  return (data ?? []) as AccountRow[]
}

interface SyncState {
  cursor: string | null
  backfillCursor: string | null
  consecutiveFailures: number
}

async function readSyncState(
  userId: string,
  connectedAccountId: string,
  resource: string,
): Promise<SyncState> {
  const { data } = await serviceClient()
    .from('sync_states')
    .select('cursor, backfill_cursor, consecutive_failures')
    .eq('user_id', userId)
    .eq('connected_account_id', connectedAccountId)
    .eq('resource', resource)
    .maybeSingle()

  return {
    cursor: (data?.cursor as string | null) ?? null,
    backfillCursor: (data?.backfill_cursor as string | null) ?? null,
    consecutiveFailures: (data?.consecutive_failures as number | null) ?? 0,
  }
}

async function writeSyncState(
  userId: string,
  connectedAccountId: string,
  resource: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await serviceClient().from('sync_states').upsert(
    {
      user_id: userId,
      connected_account_id: connectedAccountId,
      resource,
      ...patch,
    },
    { onConflict: 'connected_account_id,resource' },
  )
}

/** Exponential backoff, capped so a persistently broken account is still retried daily. */
function backoffMinutes(failures: number): number {
  return Math.min(1440, 15 * 2 ** Math.max(0, failures))
}

// ── Mail ─────────────────────────────────────────────────────────────────────

export async function syncMail(
  userId: string,
  account: AccountRow,
  historyDays: number,
  now: Date,
): Promise<SyncOutcome> {
  const provider = account.provider
  if (provider !== 'google' && provider !== 'microsoft') {
    throw new AppError('validation_failed', { detail: `unsupported_provider:${provider}` })
  }

  const state = await readSyncState(userId, account.id, 'mail')
  await writeSyncState(userId, account.id, 'mail', {
    status: 'syncing',
    last_run_at: now.toISOString(),
  })

  try {
    const token = await getAccessToken(provider as OAuthProvider, account.id, userId)
    const since = new Date(now.getTime() - historyDays * 86_400_000).toISOString()

    const decoded: DecodedLike[] = []
    let nextCursor: string | null = state.cursor
    let complete = true

    if (provider === 'google') {
      let ids: string[] = []

      if (state.cursor) {
        const history = await google.listHistory(token, state.cursor)
        if (history.expired) {
          // The history id aged out of Gmail's window; fall back to a bounded
          // full list so the account does not silently stop syncing.
          const listed = await google.listMessages(token, {
            query: `-in:spam -in:trash -in:drafts after:${Math.floor(new Date(since).getTime() / 1000)}`,
            maxResults: MESSAGE_PAGE_LIMIT,
          })
          ids = listed.messages.map((m) => m.id)
          nextCursor = listed.historyId
        } else {
          ids = history.addedMessageIds.slice(0, MESSAGE_PAGE_LIMIT)
          nextCursor = history.historyId ?? state.cursor
          complete = history.addedMessageIds.length <= MESSAGE_PAGE_LIMIT
        }
      } else {
        const listed = await google.listMessages(token, {
          query: `-in:spam -in:trash -in:drafts after:${Math.floor(new Date(since).getTime() / 1000)}`,
          maxResults: MESSAGE_PAGE_LIMIT,
        })
        ids = listed.messages.map((m) => m.id)
        nextCursor = listed.historyId
        complete = listed.nextPageToken === null
      }

      const messages = await google.getMessages(token, ids)
      for (const message of messages) {
        const parsed = google.decodeMessage(message)
        decoded.push({
          externalMessageId: message.id,
          externalThreadId: message.threadId,
          fromEmail: parsed.fromEmail,
          fromName: parsed.fromName,
          to: parsed.to,
          cc: parsed.cc,
          subject: parsed.subject,
          bodyText: parsed.bodyText,
          sentAt: parsed.sentAt,
          headers: parsed.headers,
          externalUrl: null,
          hasAttachments: parsed.attachments.length > 0,
          attachments: parsed.attachments,
          labels: message.labelIds ?? [],
        })
      }
    } else {
      const listed = await microsoft.listMessages(token, {
        deltaLink: state.cursor,
        since: state.cursor ? undefined : since,
      })
      nextCursor = listed.deltaLink ?? state.cursor
      complete = listed.nextLink === null

      for (const message of listed.messages.slice(0, MESSAGE_PAGE_LIMIT)) {
        const parsed = microsoft.decodeMessage(message)
        decoded.push({
          externalMessageId: message.id,
          externalThreadId: message.conversationId ?? message.id,
          fromEmail: parsed.fromEmail,
          fromName: parsed.fromName,
          to: parsed.to,
          cc: parsed.cc,
          subject: parsed.subject,
          bodyText: parsed.bodyText,
          sentAt: parsed.sentAt,
          headers: parsed.headers,
          externalUrl: parsed.externalUrl,
          hasAttachments: Boolean(message.hasAttachments),
          attachments: [],
          labels: message.categories ?? [],
        })
      }
    }

    const context = await loadIngestContext(userId, account.id, provider, now)
    const result = await ingestMessages(context, decoded)

    await writeSyncState(userId, account.id, 'mail', {
      status: complete ? 'idle' : 'syncing',
      cursor: nextCursor,
      consecutive_failures: 0,
      last_error: null,
      next_run_at: new Date(now.getTime() + (complete ? 15 : 1) * 60_000).toISOString(),
      ...(complete ? { backfill_completed_at: now.toISOString() } : {}),
    })

    await serviceClient()
      .from('connected_accounts')
      .update({ last_synced_at: now.toISOString() })
      .eq('id', account.id)

    return {
      resource: 'mail',
      processed: decoded.length,
      inserted: result.inserted,
      analyzed: result.analyzed,
      skipped: result.skipped,
      cursor: nextCursor,
      complete,
    }
  } catch (error) {
    const code = error instanceof AppError ? error.code : 'provider_unavailable'
    const failures = state.consecutiveFailures + 1

    await writeSyncState(userId, account.id, 'mail', {
      status: 'error',
      consecutive_failures: failures,
      last_error: code,
      next_run_at: new Date(now.getTime() + backoffMinutes(failures) * 60_000).toISOString(),
    })

    await audit({
      userId,
      action: 'sync.failed',
      entityType: 'connected_account',
      entityId: account.id,
      metadata: { resource: 'mail', code, failures },
    })

    throw error
  }
}

// ── Calendar ─────────────────────────────────────────────────────────────────

export async function syncCalendar(
  userId: string,
  account: AccountRow,
  now: Date,
): Promise<SyncOutcome> {
  const provider = account.provider
  if (provider !== 'google' && provider !== 'microsoft') {
    throw new AppError('validation_failed', { detail: `unsupported_provider:${provider}` })
  }

  const state = await readSyncState(userId, account.id, 'calendar')
  const client = serviceClient()

  try {
    const token = await getAccessToken(provider as OAuthProvider, account.id, userId)
    // A week back for context, two months forward for planning.
    const windowStart = new Date(now.getTime() - 7 * 86_400_000).toISOString()
    const windowEnd = new Date(now.getTime() + 60 * 86_400_000).toISOString()

    const rows: Array<Record<string, unknown>> = []
    let nextCursor: string | null = state.cursor

    if (provider === 'google') {
      const listed = await google.listEvents(token, {
        syncToken: state.cursor,
        timeMin: state.cursor ? undefined : windowStart,
        timeMax: state.cursor ? undefined : windowEnd,
      })
      nextCursor = listed.expired ? null : (listed.nextSyncToken ?? state.cursor)

      for (const event of listed.events) {
        const start = event.start?.dateTime ?? event.start?.date
        const end = event.end?.dateTime ?? event.end?.date
        if (!start || !end) continue

        rows.push({
          user_id: userId,
          connected_account_id: account.id,
          external_event_id: event.id,
          provider,
          title: event.summary ?? '',
          description: event.description ?? null,
          location: event.location ?? null,
          starts_at: new Date(start).toISOString(),
          ends_at: new Date(end).toISOString(),
          is_all_day: Boolean(event.start?.date),
          time_zone: event.start?.timeZone ?? 'UTC',
          attendees: (event.attendees ?? []).map((a) => ({
            email: a.email ?? '',
            name: a.displayName ?? null,
            responseStatus: a.responseStatus ?? 'needs_action',
            isOrganizer: Boolean(a.organizer),
            isSelf: Boolean(a.self),
          })),
          organizer_email: event.organizer?.email ?? null,
          conference_url: google.conferenceUrlOf(event),
          status: event.status === 'cancelled' ? 'cancelled' : 'confirmed',
          provider_updated_at: event.updated ?? null,
          external_url: event.htmlLink ?? null,
        })
      }
    } else {
      const listed = await microsoft.listEvents(token, {
        deltaLink: state.cursor,
        start: state.cursor ? undefined : windowStart,
        end: state.cursor ? undefined : windowEnd,
      })
      nextCursor = listed.expired ? null : (listed.deltaLink ?? state.cursor)

      for (const event of listed.events) {
        const start = event.start?.dateTime
        const end = event.end?.dateTime
        if (!start || !end) continue

        rows.push({
          user_id: userId,
          connected_account_id: account.id,
          external_event_id: event.id,
          provider,
          title: event.subject ?? '',
          description: event.bodyPreview ?? null,
          location: event.location?.displayName ?? null,
          // Graph returns a naive local time plus a separate zone field.
          starts_at: new Date(`${start}Z`).toISOString(),
          ends_at: new Date(`${end}Z`).toISOString(),
          is_all_day: Boolean(event.isAllDay),
          time_zone: event.start?.timeZone ?? 'UTC',
          attendees: (event.attendees ?? []).map((a) => ({
            email: a.emailAddress?.address ?? '',
            name: a.emailAddress?.name ?? null,
            responseStatus: a.status?.response ?? 'needs_action',
            isOrganizer: false,
            isSelf: false,
          })),
          organizer_email: event.organizer?.emailAddress?.address ?? null,
          conference_url: microsoft.conferenceUrlOf(event),
          status: event.isCancelled ? 'cancelled' : 'confirmed',
          provider_updated_at: event.lastModifiedDateTime ?? null,
          external_url: event.webLink ?? null,
        })
      }
    }

    if (rows.length > 0) {
      const { error } = await client
        .from('calendar_events')
        .upsert(rows, { onConflict: 'user_id,connected_account_id,external_event_id' })
      if (error) throw dbError(error)
    }

    await writeSyncState(userId, account.id, 'calendar', {
      status: 'idle',
      cursor: nextCursor,
      consecutive_failures: 0,
      last_error: null,
      last_run_at: now.toISOString(),
      next_run_at: new Date(now.getTime() + 15 * 60_000).toISOString(),
    })

    return {
      resource: 'calendar',
      processed: rows.length,
      inserted: rows.length,
      analyzed: 0,
      skipped: 0,
      cursor: nextCursor,
      complete: true,
    }
  } catch (error) {
    const code = error instanceof AppError ? error.code : 'calendar_provider_unavailable'
    const failures = state.consecutiveFailures + 1
    await writeSyncState(userId, account.id, 'calendar', {
      status: 'error',
      consecutive_failures: failures,
      last_error: code,
      next_run_at: new Date(now.getTime() + backoffMinutes(failures) * 60_000).toISOString(),
    })
    throw error
  }
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export async function syncTasks(
  userId: string,
  account: AccountRow,
  now: Date,
): Promise<SyncOutcome> {
  const provider = account.provider
  if (provider !== 'google' && provider !== 'microsoft') {
    throw new AppError('validation_failed', { detail: `unsupported_provider:${provider}` })
  }

  const client = serviceClient()

  try {
    const token = await getAccessToken(provider as OAuthProvider, account.id, userId)
    const rows: Array<Record<string, unknown>> = []

    if (provider === 'google') {
      for (const list of await google.listTaskLists(token)) {
        for (const task of await google.listTasks(token, list.id)) {
          rows.push({
            user_id: userId,
            connected_account_id: account.id,
            external_task_id: task.id,
            provider,
            title: task.title ?? '',
            notes: task.notes ?? null,
            due_at: task.due ?? null,
            status: task.status === 'completed' ? 'done' : 'open',
            completed_at: task.completed ?? null,
            provider_updated_at: task.updated ?? null,
          })
        }
      }
    } else {
      for (const list of await microsoft.listTodoLists(token)) {
        for (const task of await microsoft.listTodoTasks(token, list.id)) {
          const due = task.dueDateTime?.dateTime
          rows.push({
            user_id: userId,
            connected_account_id: account.id,
            external_task_id: task.id,
            provider,
            title: task.title ?? '',
            notes: task.body?.content ?? null,
            due_at: due ? new Date(`${due}Z`).toISOString() : null,
            status: task.status === 'completed' ? 'done' : 'open',
            completed_at: task.completedDateTime?.dateTime
              ? new Date(`${task.completedDateTime.dateTime}Z`).toISOString()
              : null,
            provider_updated_at: task.lastModifiedDateTime ?? null,
          })
        }
      }
    }

    if (rows.length > 0) {
      const { error } = await client
        .from('tasks')
        .upsert(rows, { onConflict: 'user_id,connected_account_id,external_task_id' })
      if (error) throw dbError(error)
    }

    await writeSyncState(userId, account.id, 'tasks', {
      status: 'idle',
      consecutive_failures: 0,
      last_error: null,
      last_run_at: now.toISOString(),
      next_run_at: new Date(now.getTime() + 60 * 60_000).toISOString(),
    })

    return {
      resource: 'tasks',
      processed: rows.length,
      inserted: rows.length,
      analyzed: 0,
      skipped: 0,
      cursor: null,
      complete: true,
    }
  } catch (error) {
    const code = error instanceof AppError ? error.code : 'provider_unavailable'
    await writeSyncState(userId, account.id, 'tasks', {
      status: 'error',
      last_error: code,
      next_run_at: new Date(now.getTime() + 60 * 60_000).toISOString(),
    })
    throw error
  }
}

/** History window from the user's preferences, with the product default. */
export async function historyDaysFor(userId: string): Promise<number> {
  const { data } = await serviceClient()
    .from('user_preferences')
    .select('history_days')
    .eq('user_id', userId)
    .maybeSingle()
  return (data?.history_days as number | null) ?? 90
}

export { systemClock }
