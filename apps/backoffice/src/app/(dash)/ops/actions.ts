'use server'

import { uuidSchema } from '@da/validation'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  OPS_PATH,
  OPS_RESULT_PARAMS,
  OPS_RETURN_PATHS,
  REFRESH_FIELDS,
  RESYNC_AUDIT_ACTION,
  RESYNC_FIELDS,
  type ResyncOutcome,
} from '@/components/ops/contract'
import { isValidReason, recordStaffAction } from '@/lib/audit'
import { requireStaffAction, type StaffSession } from '@/lib/auth'
import { readEnv } from '@/lib/env'
import { isResyncableResource } from '@/lib/queries/ops'

/**
 * The two Server Actions the ops area exposes.
 *
 * `resyncAccountAction` is the only outward-facing thing this whole area can
 * do: it asks the `sync-start` edge function to run one connected account's
 * sync now. Three properties make it safe to put behind a button in a table:
 *
 *   1. It is `ops`-gated. `requireStaffAction` throws rather than redirecting,
 *      and a support-tier operator never even sees the control because the
 *      pages that render it are `ops`-gated too.
 *
 *   2. It writes an `audit_logs` row before it reports anything, naming the
 *      staff member, the account, the resource, the typed reason and the *real*
 *      outcome — including when the call failed. An action whose audit row did
 *      not land reports a failure, because the trail is the only evidence.
 *
 *   3. It sends and receives identifiers and codes only. The request body is a
 *      uuid and a resource name; the reply is read for `started`, a failure
 *      count and an `ErrorCode`. No message, address or provider string is ever
 *      parsed out of it, so nothing content-shaped can reach the screen through
 *      this path.
 *
 * The redirect target is checked against a two-entry allowlist rather than
 * trusted from the form, so a crafted `donus` field cannot turn a staff button
 * into an open redirect.
 */

/** Matches the 20s pg_cron uses for the same function in migration 0014. */
const SYNC_START_TIMEOUT_MS = 20_000

/** Only used to parse a relative path; never fetched, never rendered. */
const RELATIVE_BASE = 'https://backoffice.invalid'

export async function resyncAccountAction(formData: FormData): Promise<void> {
  const returnTo = safeReturnTo(field(formData, RESYNC_FIELDS.returnTo))
  const accountIdRaw = field(formData, RESYNC_FIELDS.accountId)
  const userIdRaw = field(formData, RESYNC_FIELDS.userId)
  const provider = field(formData, RESYNC_FIELDS.provider)
  const resourceRaw = field(formData, RESYNC_FIELDS.resource)
  const reason = String(formData.get(RESYNC_FIELDS.reason) ?? '')

  let session: StaffSession
  try {
    session = await requireStaffAction('ops')
  } catch {
    redirect(withResult(returnTo, 'forbidden', null, accountIdRaw))
  }

  const accountId = uuidSchema.safeParse(accountIdRaw)
  const userId = uuidSchema.safeParse(userIdRaw)
  if (!accountId.success || !userId.success || !isValidReason(reason)) {
    redirect(withResult(returnTo, 'invalid', null, accountIdRaw))
  }

  // `contacts` is an account kind with no sync path — `sync-start` skips it —
  // so a state recorded against it falls back to the two resources that do run.
  const resources = isResyncableResource(resourceRaw) ? [resourceRaw] : ['mail', 'calendar']

  const call = await callSyncStart(accountId.data, resources)

  try {
    await recordStaffAction({
      actor: { userId: session.userId, role: session.role },
      action: RESYNC_AUDIT_ACTION,
      subjectUserId: userId.data,
      entityType: 'connected_account',
      entityId: accountId.data,
      reason,
      outcome: call.outcome,
      detail: {
        provider,
        resource: resourceRaw,
        resources_requested: resources.join('+'),
        response_status: call.status,
        error_code: call.code,
        started: call.started,
        failure_count: call.failureCount,
      },
    })
  } catch {
    // The sync may well have run, but with no trail we cannot claim it did.
    redirect(withResult(returnTo, 'failed', 'audit_failed', accountId.data))
  }

  revalidatePath(returnTo.pathname)
  redirect(withResult(returnTo, call.outcome, call.code, accountId.data))
}

/** Re-runs every query on the current ops page. */
export async function refreshOpsAction(formData: FormData): Promise<void> {
  await requireStaffAction('ops')
  const returnTo = safeReturnTo(field(formData, REFRESH_FIELDS.returnTo))
  revalidatePath(returnTo.pathname)
  redirect(`${returnTo.pathname}${returnTo.search}`)
}

// ---------------------------------------------------------------------------
// The outward call
// ---------------------------------------------------------------------------

interface SyncStartCall {
  outcome: ResyncOutcome
  /** HTTP status, or 0 when the request never got a reply. */
  status: number
  /** Our own `ErrorCode`, never an upstream message. Null on success. */
  code: string | null
  started: boolean
  failureCount: number
}

async function callSyncStart(
  connectedAccountId: string,
  resources: readonly string[],
): Promise<SyncStartCall> {
  let env: { supabaseUrl: string; serviceRoleKey: string }
  try {
    env = readEnv()
  } catch {
    return {
      outcome: 'unreachable',
      status: 0,
      code: 'server_unavailable',
      started: false,
      failureCount: 0,
    }
  }

  let response: Response
  try {
    response = await fetch(`${env.supabaseUrl}/functions/v1/sync-start`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: env.serviceRoleKey,
        authorization: `Bearer ${env.serviceRoleKey}`,
        // The same marker migration 0014 puts on the scheduled invocation, so
        // an operator-triggered run is distinguishable in the function logs.
        'x-da-trigger': 'backoffice',
      },
      body: JSON.stringify({ connectedAccountId, resources }),
      signal: AbortSignal.timeout(SYNC_START_TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return {
      outcome: 'unreachable',
      status: 0,
      code: timedOut ? 'network_timeout' : 'server_unavailable',
      started: false,
      failureCount: 0,
    }
  }

  const payload = await readJson(response)

  if (!response.ok) {
    return {
      outcome: 'rejected',
      status: response.status,
      code: errorCodeOf(payload),
      started: false,
      failureCount: 0,
    }
  }

  const started = payload !== null && payload['started'] === true
  const failures = payload === null ? null : payload['failures']
  const failureCount = Array.isArray(failures) ? failures.length : 0

  if (!started) {
    return { outcome: 'noop', status: response.status, code: null, started: false, failureCount }
  }
  return {
    outcome: failureCount > 0 ? 'partial' : 'success',
    status: response.status,
    code: failureCount > 0 ? firstFailureCode(failures) : null,
    started: true,
    failureCount,
  }
}

/**
 * Reads the reply as JSON, bounded.
 *
 * A body this application cannot parse is discarded rather than surfaced: the
 * only things it is allowed to learn from an edge function are the flags and
 * the code, and a "helpful" fallback that showed the raw text would be exactly
 * the leak the whole tool is built to prevent.
 */
async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const text = (await response.text()).slice(0, 4096)
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function errorCodeOf(payload: Record<string, unknown> | null): string | null {
  const envelope = payload?.['error']
  if (typeof envelope !== 'object' || envelope === null) return null
  const code = (envelope as Record<string, unknown>)['code']
  return typeof code === 'string' ? code : null
}

function firstFailureCode(failures: unknown): string | null {
  if (!Array.isArray(failures)) return null
  const first: unknown = failures[0]
  if (typeof first !== 'object' || first === null) return null
  const code = (first as Record<string, unknown>)['code']
  return typeof code === 'string' ? code : null
}

// ---------------------------------------------------------------------------
// Redirect targets
// ---------------------------------------------------------------------------

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim()
}

/**
 * The posted return path, if it is one of ours; the dashboard otherwise.
 *
 * Parsing against a fixed base means an absolute URL to another host lands on a
 * different origin and is rejected, and a path we do not own is rejected by the
 * allowlist. Any previous result parameters are stripped so a second action
 * cannot stack its answer on top of the first one's.
 */
function safeReturnTo(raw: string): URL {
  const fallback = new URL(OPS_PATH, RELATIVE_BASE)
  if (raw === '') return fallback

  let url: URL
  try {
    url = new URL(raw, RELATIVE_BASE)
  } catch {
    return fallback
  }

  if (url.origin !== RELATIVE_BASE) return fallback
  if (!(OPS_RETURN_PATHS as readonly string[]).includes(url.pathname)) return fallback

  for (const param of Object.values(OPS_RESULT_PARAMS)) url.searchParams.delete(param)
  return url
}

function withResult(
  returnTo: URL,
  outcome: ResyncOutcome,
  code: string | null,
  accountId: string,
): string {
  const url = new URL(returnTo.toString())
  url.searchParams.set(OPS_RESULT_PARAMS.outcome, outcome)
  if (code !== null) url.searchParams.set(OPS_RESULT_PARAMS.code, code)
  if (accountId !== '') url.searchParams.set(OPS_RESULT_PARAMS.account, accountId.slice(0, 36))
  return `${url.pathname}${url.search}`
}
