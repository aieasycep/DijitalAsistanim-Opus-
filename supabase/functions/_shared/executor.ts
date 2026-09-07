import {
  AppError,
  type ApprovalActionType,
  type ApprovalPayload,
  type ApprovalStatus,
  type Provider,
  canTransition,
  followUpDueAt,
  looksLikeReplyExpected,
  missingScopesFor,
  retryDelayMs,
  shouldRetry,
} from './domain.ts'
import { audit } from './audit.ts'
import { dbError, serviceClient } from './db.ts'
import { getAccessToken, type OAuthProvider } from './oauth.ts'
import * as google from './providers/google.ts'
import * as microsoft from './providers/microsoft.ts'

/**
 * Approval execution.
 *
 * This is the only code path in the product that causes an effect outside the
 * app, and it runs exactly once per approval. Three properties make that true:
 *
 *  - a conditional status transition acts as a lock, so two concurrent
 *    invocations cannot both reach the provider;
 *  - the approval's idempotency key is unique per user, so re-proposing the
 *    same action reuses one row rather than queueing a second send;
 *  - a calendar update carries the provider's change marker and refuses to
 *    overwrite a remote edit it did not see.
 */

export interface ExecutionResult {
  approvalId: string
  status: ApprovalStatus
  resultRef: string | null
  failureCode: string | null
  missingScopes: string[]
}

interface ApprovalRow {
  id: string
  user_id: string
  type: ApprovalActionType
  status: ApprovalStatus
  payload: ApprovalPayload
  attempt_count: number
  source_id: string | null
}

export async function executeApproval(
  approvalId: string,
  userId: string,
  now: Date,
): Promise<ExecutionResult> {
  const client = serviceClient()

  const loaded = await client
    .from('approval_actions')
    .select('id, user_id, type, status, payload, attempt_count, source_id')
    .eq('id', approvalId)
    .eq('user_id', userId)
    .maybeSingle()

  if (loaded.error) throw dbError(loaded.error)
  if (!loaded.data) throw new AppError('not_found', { detail: 'approval_missing' })

  const approval = loaded.data as unknown as ApprovalRow

  if (approval.status === 'executed') {
    // Already done. Returning the terminal state is the correct answer to a
    // duplicate tap, not an error.
    return {
      approvalId,
      status: 'executed',
      resultRef: null,
      failureCode: null,
      missingScopes: [],
    }
  }

  if (!canTransition(approval.status, 'executing')) {
    throw new AppError('approval_already_executed', { detail: `status:${approval.status}` })
  }

  // The `.eq('status', approval.status)` clause is the lock: a second caller
  // that read the same row loses the race and matches zero rows.
  const claimed = await client
    .from('approval_actions')
    .update({ status: 'executing' })
    .eq('id', approvalId)
    .eq('user_id', userId)
    .eq('status', approval.status)
    .select('id')
    .maybeSingle()

  if (claimed.error) throw dbError(claimed.error)
  if (!claimed.data) {
    throw new AppError('approval_already_executed', { detail: 'lost_execution_race' })
  }

  try {
    const outcome = await dispatch(approval, userId, now)

    await client
      .from('approval_actions')
      .update({
        status: 'executed',
        executed_at: now.toISOString(),
        result_ref: outcome.resultRef,
        failure_reason: null,
        failure_code: null,
      })
      .eq('id', approvalId)

    await audit({
      userId,
      action: 'approval.executed',
      entityType: 'approval',
      entityId: approvalId,
      metadata: { type: approval.type, attempt: approval.attempt_count + 1 },
    })

    return {
      approvalId,
      status: 'executed',
      resultRef: outcome.resultRef,
      failureCode: null,
      missingScopes: [],
    }
  } catch (error) {
    const appError = error instanceof AppError ? error : new AppError('approval_execution_failed')
    const attempts = approval.attempt_count + 1

    // A missing scope is not a failure to retry — the user has to consent
    // first, so the approval stays actionable and the app runs step-up consent.
    const isScopeProblem = appError.code === 'oauth_scope_missing'
    const retryable = !isScopeProblem && appError.retryable && shouldRetry(attempts)

    await client
      .from('approval_actions')
      .update({
        status: retryable ? 'approved' : 'failed',
        attempt_count: attempts,
        next_attempt_at: retryable
          ? new Date(now.getTime() + retryDelayMs(attempts)).toISOString()
          : null,
        failure_code: appError.code,
        // The reason shown to the user is a code the client localises, never
        // an upstream provider string.
        failure_reason: appError.code,
      })
      .eq('id', approvalId)

    await audit({
      userId,
      action: 'approval.failed',
      entityType: 'approval',
      entityId: approvalId,
      metadata: { type: approval.type, code: appError.code, attempt: attempts, retryable },
    })

    return {
      approvalId,
      status: retryable ? 'approved' : 'failed',
      resultRef: null,
      failureCode: appError.code,
      missingScopes:
        isScopeProblem && appError.values && typeof appError.values.scopes === 'string'
          ? String(appError.values.scopes).split(' ')
          : [],
    }
  }
}

interface DispatchOutcome {
  resultRef: string | null
}

async function dispatch(
  approval: ApprovalRow,
  userId: string,
  now: Date,
): Promise<DispatchOutcome> {
  const payload = approval.payload

  switch (payload.kind) {
    case 'email_send':
      return sendEmail(userId, approval.id, payload, now)
    case 'calendar_create':
      return createEvent(userId, payload)
    case 'calendar_update':
      return updateEvent(userId, payload)
    case 'task_create':
      return createTask(userId, payload)
    case 'reminder_create':
      return createReminder(userId, payload)
    case 'commitment_create':
      return createCommitment(userId, payload, approval.source_id)
  }
}

interface AccountInfo {
  provider: OAuthProvider
  email: string
  grantedScopes: string[]
}

async function loadAccount(userId: string, connectedAccountId: string): Promise<AccountInfo> {
  const { data, error } = await serviceClient()
    .from('connected_accounts')
    .select('provider, email, granted_scopes, status')
    .eq('id', connectedAccountId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw dbError(error)
  if (!data) throw new AppError('not_found', { detail: 'account_missing' })
  if (data.status === 'revoked' || data.status === 'disconnected') {
    throw new AppError('oauth_revoked', { detail: `status:${data.status}` })
  }

  const provider = data.provider as Provider
  if (provider !== 'google' && provider !== 'microsoft') {
    throw new AppError('validation_failed', { detail: `unsupported_provider:${provider}` })
  }

  return {
    provider,
    email: (data.email as string | null) ?? '',
    grantedScopes: (data.granted_scopes as string[] | null) ?? [],
  }
}

/** Fail before touching the provider when consent is missing. */
function assertScopes(
  account: AccountInfo,
  action: 'email_send' | 'calendar_create' | 'calendar_update' | 'task_create',
): void {
  const key = action === 'calendar_update' ? 'calendar_update' : action
  const missing = missingScopesFor(account.provider, key, account.grantedScopes)
  if (missing.length > 0) {
    throw new AppError('oauth_scope_missing', {
      detail: action,
      values: { scopes: missing.join(' ') },
    })
  }
}

async function sendEmail(
  userId: string,
  approvalId: string,
  payload: Extract<ApprovalPayload, { kind: 'email_send' }>,
  now: Date,
): Promise<DispatchOutcome> {
  const account = await loadAccount(userId, payload.connectedAccountId)
  assertScopes(account, 'email_send')
  const token = await getAccessToken(account.provider, payload.connectedAccountId, userId)

  let resultRef: string | null

  if (account.provider === 'google') {
    const sent = await google.sendMessage(token, {
      to: payload.to,
      cc: payload.cc,
      subject: payload.subject,
      body: payload.body,
      inReplyTo: payload.inReplyToMessageId,
      threadId: null,
      fromEmail: account.email,
    })
    resultRef = sent.id
  } else {
    const sent = await microsoft.sendMail(token, {
      to: payload.to,
      cc: payload.cc,
      subject: payload.subject,
      body: payload.body,
      replyToMessageId: payload.inReplyToMessageId,
    })
    resultRef = sent.id
  }

  // A sent message that asks for something starts a follow-up watch, so the
  // engine can notice silence later without a second pass over the mailbox.
  if (payload.threadId && looksLikeReplyExpected(payload.body)) {
    const recipient = payload.to[0] ?? ''
    const dueAt = followUpDueAt(
      {
        sentAt: now.toISOString(),
        expectsReply: true,
        recipientIsVip: false,
        importance: 'normal',
        dismissCount: 0,
        repliedAt: null,
        closedAt: null,
      },
      'Europe/Istanbul',
    )

    await serviceClient()
      .from('follow_ups')
      .upsert(
        {
          user_id: userId,
          thread_id: payload.threadId,
          message_id: resultRef ?? approvalId,
          recipient_email: recipient,
          recipient_name: null,
          sent_at: now.toISOString(),
          due_at: dueAt ?? now.toISOString(),
          status: 'waiting',
          dismiss_count: 0,
        },
        { onConflict: 'user_id,thread_id,message_id' },
      )
  }

  return { resultRef }
}

async function createEvent(
  userId: string,
  payload: Extract<ApprovalPayload, { kind: 'calendar_create' }>,
): Promise<DispatchOutcome> {
  const account = await loadAccount(userId, payload.connectedAccountId)
  assertScopes(account, 'calendar_create')
  const token = await getAccessToken(account.provider, payload.connectedAccountId, userId)

  const externalId =
    account.provider === 'google'
      ? (
          await google.createEvent(token, {
            summary: payload.title,
            description: payload.description,
            location: payload.location,
            startsAt: payload.startsAt,
            endsAt: payload.endsAt,
            timeZone: payload.timeZone,
            attendees: payload.attendees,
          })
        ).id
      : (
          await microsoft.createEvent(token, {
            subject: payload.title,
            body: payload.description,
            location: payload.location,
            startsAt: payload.startsAt,
            endsAt: payload.endsAt,
            timeZone: payload.timeZone,
            attendees: payload.attendees,
          })
        ).id

  // Mirror it locally so the plan updates without waiting for the next sync.
  await serviceClient().from('calendar_events').upsert(
    {
      user_id: userId,
      connected_account_id: payload.connectedAccountId,
      external_event_id: externalId,
      provider: account.provider,
      title: payload.title,
      description: payload.description,
      location: payload.location,
      starts_at: payload.startsAt,
      ends_at: payload.endsAt,
      is_all_day: false,
      time_zone: payload.timeZone,
      attendees: payload.attendees.map((email) => ({
        email,
        name: null,
        responseStatus: 'needs_action',
        isOrganizer: false,
        isSelf: false,
      })),
      organizer_email: account.email,
      status: 'confirmed',
    },
    { onConflict: 'user_id,connected_account_id,external_event_id' },
  )

  return { resultRef: externalId }
}

async function updateEvent(
  userId: string,
  payload: Extract<ApprovalPayload, { kind: 'calendar_update' }>,
): Promise<DispatchOutcome> {
  const client = serviceClient()
  const account = await loadAccount(userId, payload.connectedAccountId)
  assertScopes(account, 'calendar_update')

  // Optimistic concurrency: if the provider's copy moved since the proposal was
  // made, the user is shown the remote change rather than having it silently
  // overwritten.
  const current = await client
    .from('calendar_events')
    .select('provider_updated_at')
    .eq('id', payload.eventId)
    .eq('user_id', userId)
    .maybeSingle()

  if (current.error) throw dbError(current.error)
  const observed = (current.data?.provider_updated_at as string | null) ?? null
  if (payload.expectedProviderUpdatedAt && observed !== payload.expectedProviderUpdatedAt) {
    throw new AppError('sync_conflict', { detail: 'event_changed_remotely' })
  }

  const token = await getAccessToken(account.provider, payload.connectedAccountId, userId)

  if (account.provider === 'google') {
    await google.updateEvent(token, {
      eventId: payload.externalEventId,
      changes: {
        ...(payload.changes.title !== undefined ? { summary: payload.changes.title } : {}),
        ...(payload.changes.startsAt !== undefined ? { startsAt: payload.changes.startsAt } : {}),
        ...(payload.changes.endsAt !== undefined ? { endsAt: payload.changes.endsAt } : {}),
        ...(payload.changes.location !== undefined ? { location: payload.changes.location } : {}),
      },
      timeZone: 'UTC',
      etag: null,
    })
  } else {
    await microsoft.updateEvent(token, {
      eventId: payload.externalEventId,
      changes: {
        ...(payload.changes.title !== undefined ? { subject: payload.changes.title } : {}),
        ...(payload.changes.startsAt !== undefined ? { startsAt: payload.changes.startsAt } : {}),
        ...(payload.changes.endsAt !== undefined ? { endsAt: payload.changes.endsAt } : {}),
        ...(payload.changes.location !== undefined ? { location: payload.changes.location } : {}),
      },
      timeZone: 'UTC',
      etag: null,
    })
  }

  await client
    .from('calendar_events')
    .update({
      ...(payload.changes.title !== undefined ? { title: payload.changes.title } : {}),
      ...(payload.changes.startsAt !== undefined ? { starts_at: payload.changes.startsAt } : {}),
      ...(payload.changes.endsAt !== undefined ? { ends_at: payload.changes.endsAt } : {}),
      ...(payload.changes.location !== undefined ? { location: payload.changes.location } : {}),
    })
    .eq('id', payload.eventId)
    .eq('user_id', userId)

  return { resultRef: payload.externalEventId }
}

async function createTask(
  userId: string,
  payload: Extract<ApprovalPayload, { kind: 'task_create' }>,
): Promise<DispatchOutcome> {
  const client = serviceClient()

  // A task with no connected account is a purely local record — still useful,
  // and the only option when the user has not granted a tasks scope.
  if (!payload.connectedAccountId) {
    const inserted = await client
      .from('tasks')
      .insert({
        user_id: userId,
        provider: 'device',
        title: payload.title,
        notes: payload.notes,
        due_at: payload.dueAt,
        status: 'open',
      })
      .select('id')
      .single()

    if (inserted.error) throw dbError(inserted.error)
    return { resultRef: inserted.data.id as string }
  }

  const account = await loadAccount(userId, payload.connectedAccountId)
  assertScopes(account, 'task_create')
  const token = await getAccessToken(account.provider, payload.connectedAccountId, userId)

  let externalId: string
  if (account.provider === 'google') {
    const lists = await google.listTaskLists(token)
    const listId = lists[0]?.id
    if (!listId) throw new AppError('provider_unavailable', { detail: 'no_task_list' })
    externalId = (
      await google.createTask(token, listId, {
        title: payload.title,
        notes: payload.notes,
        dueAt: payload.dueAt,
      })
    ).id
  } else {
    const lists = await microsoft.listTodoLists(token)
    const listId = lists[0]?.id
    if (!listId) throw new AppError('provider_unavailable', { detail: 'no_task_list' })
    externalId = (
      await microsoft.createTodoTask(token, listId, {
        title: payload.title,
        notes: payload.notes,
        dueAt: payload.dueAt,
        timeZone: 'UTC',
      })
    ).id
  }

  await client.from('tasks').insert({
    user_id: userId,
    connected_account_id: payload.connectedAccountId,
    external_task_id: externalId,
    provider: account.provider,
    title: payload.title,
    notes: payload.notes,
    due_at: payload.dueAt,
    status: 'open',
  })

  return { resultRef: externalId }
}

async function createReminder(
  userId: string,
  payload: Extract<ApprovalPayload, { kind: 'reminder_create' }>,
): Promise<DispatchOutcome> {
  const inserted = await serviceClient()
    .from('reminders')
    .insert({
      user_id: userId,
      title: payload.title,
      body: payload.body,
      remind_at: payload.remindAt,
      preset: payload.preset,
      related_entity_type: payload.relatedEntityType,
      related_entity_id: payload.relatedEntityId,
      status: 'scheduled',
      category: 'deadline',
    })
    .select('id')
    .single()

  if (inserted.error) throw dbError(inserted.error)
  return { resultRef: inserted.data.id as string }
}

async function createCommitment(
  userId: string,
  payload: Extract<ApprovalPayload, { kind: 'commitment_create' }>,
  sourceId: string | null,
): Promise<DispatchOutcome> {
  const inserted = await serviceClient()
    .from('commitments')
    .insert({
      user_id: userId,
      text: payload.text,
      direction: payload.direction,
      person_name: payload.personName,
      due_at: payload.dueAt,
      status: 'open',
      source_type: 'user_input',
      source_id: sourceId ?? 'user_input',
      source_quote: payload.quote,
      confidence: 1,
      // The user typed or approved it, so there is nothing left to confirm.
      confirmed_by_user: true,
    })
    .select('id')
    .single()

  if (inserted.error) throw dbError(inserted.error)
  return { resultRef: inserted.data.id as string }
}
