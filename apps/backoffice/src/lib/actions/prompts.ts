'use server'

import { AppError, isAppError, systemClock, type ErrorCode } from '@da/domain'
import { uuidSchema } from '@da/validation'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  BODY_MAX,
  BODY_MIN,
  FEATURE_MAX,
  FEATURE_PATTERN,
  MODEL_MAX,
  MODEL_PATTERN,
  NOTES_MAX,
  PROMPTS_PATH,
  PROMPT_FIELDS,
  PROMPT_REASON_MAX,
  PROMPT_REASON_MIN,
  initialPromptFormState,
  promptPath,
  withOutcome,
  type PromptFormState,
  type PromptOutcome,
} from '@/components/prompts/contract'
import { MIN_REASON_LENGTH, runAdminAction, type AdminActionSpec } from '@/lib/admin-action'
import { writeAudit } from '@/lib/audit'
import { assertPermissionAtSource, requirePermissionAction, type AdminSession } from '@/lib/auth'
import { resolveAdminById, insertRow, updateRows } from '@/lib/db'
import { promptFailureMessage, promptMessages, promptOutcomeMessages } from '@/lib/messages/prompts'
import { MAX_REASON_LENGTH } from '@/lib/permissions'
import {
  PROMPT_ENTITY_TYPE,
  loadActiveRecord,
  loadPromptRecord,
  nextVersionFor,
} from '@/lib/queries/prompts'
import { adminBucket, assertRateLimit } from '@/lib/rate-limit'

/**
 * The four privileged operations of the prompt-version area.
 *
 * ---------------------------------------------------------------------------
 * WHICH ONE GOES THROUGH `runAdminAction`, AND WHY THE OTHERS CANNOT
 * ---------------------------------------------------------------------------
 *
 * Activation goes through it. That is the moment a new instruction starts
 * reaching every user of a feature; migration 0019 seeded `prompt.activated`
 * into `admin_sensitive_actions` with `requires_reason = true`, and the runner
 * refuses to act until a written reason has arrived, asks
 * `admin_role_permissions` rather than the rendered menu, and writes the audit
 * row itself on both the success and the failure path.
 *
 * The other three cannot use it, and the reason is structural rather than a
 * preference: `AdminActionSpec.action` is typed `AdminAuditAction`, a closed
 * union of the twenty-six names 0019 seeded, and `prompt.activated` is the only
 * prompt name in it. Widening that union means editing `@/lib/db`,
 * `@/lib/permissions` and the migration's seed together — a change this module
 * does not own. So they follow the precedent `@/lib/actions/announcements.ts`
 * set: a local runner that borrows every guarantee rather than reimplementing
 * one.
 *
 *   - `requirePermissionAction` (auth.ts) — session, same-origin and CSRF, then
 *     the permission decision;
 *   - `assertPermissionAtSource` (auth.ts) — the same question asked of the
 *     database at the moment of acting, so a role changed while the operator
 *     had the page open takes effect on this click;
 *   - `assertRateLimit` (rate-limit.ts) — counted atomically in Postgres;
 *   - `writeAudit` (audit.ts) — the one call site for an audit row.
 *
 * `admin.prompt_archived` sits in the `admin.` namespace on purpose.
 * `audit_logs_enforce_accountability()` treats every action in that namespace
 * as sensitive and refuses the insert unless it names an acting admin and
 * carries a written reason — so retiring a version is accountable by the
 * database's rule rather than by this file remembering to be. Creating and
 * editing a draft are `prompt.draft_created` / `prompt.draft_updated`, outside
 * that namespace, because a draft reaches nobody: the row still names who did
 * it and when, and demanding a paragraph before a typo can be fixed would buy
 * nothing.
 *
 * ---------------------------------------------------------------------------
 * THE SINGLE-ACTIVE-VERSION RULE IS NOT ENFORCED HERE
 * ---------------------------------------------------------------------------
 *
 * `prompt_versions_one_active_per_feature` is a partial unique index. Two
 * activations racing lose one of them in Postgres, which is the only place that
 * can be true. This module therefore does not pre-check "is something else
 * active"; it performs the swap — archive the outgoing version, promote the
 * draft — with the expected status written into each statement's own filter, so
 * a row that moved underneath matches nothing and the operation reports a
 * conflict instead of overwriting somebody else's decision. If the promotion
 * loses that race the archive is put back, so the feature is not left without a
 * prompt because of a lost race.
 *
 * ---------------------------------------------------------------------------
 * A NON-DRAFT VERSION IS NOT EDITABLE, AND THAT IS IN THE WRITE
 * ---------------------------------------------------------------------------
 *
 * Changing the body of an active or archived version would mean the usage rows
 * attributed to it measured a different text — which is precisely the link this
 * whole area exists to keep. So the edit path's `UPDATE` carries
 * `status = 'draft'` in its own filter: anything else matches no rows and the
 * operator is told the record changed. That is a condition in the statement
 * rather than an `if` above it, which is what makes it hold against an
 * activation that landed while the form was open.
 *
 * ---------------------------------------------------------------------------
 * WHAT TRAVELS
 * ---------------------------------------------------------------------------
 *
 * A uuid, a feature name and a model name (both token-shaped identifiers the
 * company chose), the prompt body and its notes — company-authored text bounded
 * by this module's own ceilings — and an operator's written reason. The audit
 * rows carry identifiers, lengths and the md5 fingerprint only: the body itself
 * lives in `prompt_versions`, where the next operator reads it, and never in
 * `audit_logs.metadata`.
 */

// ===========================================================================
// Bounds
// ===========================================================================

/**
 * Draft writes per operator.
 *
 * Not `RATE_LIMITS.destructive`: saving a draft changes nothing anyone can see,
 * and somebody iterating on wording legitimately saves many times in a sitting.
 * What this stops is a script. The scope matches
 * `admin_rate_limits_scope_shape`.
 */
const DRAFT_WRITE_LIMIT = {
  scope: 'admin.prompt_write',
  limit: 120,
  windowSeconds: 60 * 60,
} as const

/**
 * Activating and archiving are decisions, and share the destructive budget
 * every other irreversible console action is held to.
 *
 * The same rule twice, because the two runners spell a window differently:
 * `runAdminAction` takes a Postgres interval and `assertRateLimit` takes
 * seconds. Both name the same scope, so they count into the same bucket — an
 * activation and an archive cannot each get thirty.
 */
const DECISION_RATE_LIMIT = { scope: 'admin.destructive', limit: 30, window: '5 minutes' } as const

const DECISION_BUCKET_LIMIT = {
  scope: DECISION_RATE_LIMIT.scope,
  limit: DECISION_RATE_LIMIT.limit,
  windowSeconds: 5 * 60,
} as const

/**
 * The reason bounds, restated as a compiler-checked equality.
 *
 * `@/components/prompts/contract` declares them for the dialog, which is a
 * Client Component and cannot import a `server-only` module. These two
 * assignments keep the declarations honest: if the console's floor in
 * `@/lib/admin-action` or the ceiling `writeAudit` slices to ever moves, this
 * file stops compiling instead of leaving a form that accepts reasons the
 * server refuses.
 */
const REASON_MIN = PROMPT_REASON_MIN
const REASON_MAX = PROMPT_REASON_MAX

const _floorMatchesTheRunner: typeof REASON_MIN = MIN_REASON_LENGTH
const _ceilingMatchesTheTrail: typeof REASON_MAX = MAX_REASON_LENGTH

// ===========================================================================
// Input
// ===========================================================================

const reasonSchema = z
  .string()
  .trim()
  .min(REASON_MIN, { message: `Gerekçe en az ${REASON_MIN} karakter olmalıdır.` })
  .max(REASON_MAX, { message: `Gerekçe en fazla ${REASON_MAX} karakter olabilir.` })

const featureSchema = z
  .string()
  .trim()
  .min(1, { message: promptMessages.form.featureRequired })
  .max(FEATURE_MAX, { message: promptMessages.form.featureShape })
  .regex(FEATURE_PATTERN, { message: promptMessages.form.featureShape })

const modelSchema = z
  .string()
  .trim()
  .max(MODEL_MAX, { message: promptMessages.form.modelShape })
  .regex(MODEL_PATTERN, { message: promptMessages.form.modelShape })
  .nullable()

const bodySchema = z
  .string()
  // Only the ends are trimmed. Indentation inside a prompt is part of the
  // instruction, and a "helpful" normalisation here would silently rewrite what
  // the model is told.
  .trim()
  .min(1, { message: promptMessages.form.bodyRequired })
  .min(BODY_MIN, { message: promptMessages.form.bodyTooShort(BODY_MIN) })
  .max(BODY_MAX, { message: promptMessages.form.bodyTooLong(BODY_MAX) })

const notesSchema = z
  .string()
  .trim()
  .max(NOTES_MAX, { message: promptMessages.form.notesTooLong(NOTES_MAX) })
  .nullable()

const createSchema = z.object({
  feature: featureSchema,
  model: modelSchema,
  notes: notesSchema,
  body: bodySchema,
})

const updateSchema = z.object({
  promptId: uuidSchema,
  model: modelSchema,
  notes: notesSchema,
  body: bodySchema,
})

const activateSchema = z.object({
  promptId: uuidSchema,
  reason: reasonSchema,
})

type ActivateInput = z.infer<typeof activateSchema>

// ===========================================================================
// Reading the form
// ===========================================================================

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim()
}

/** A field that is meaningful when absent: no model recorded, no note written. */
function optionalField(formData: FormData, name: string): string | null {
  const value = field(formData, name)
  return value === '' ? null : value
}

/** The body, kept as typed apart from its outer whitespace. */
function bodyField(formData: FormData): string {
  return String(formData.get(PROMPT_FIELDS.body) ?? '')
}

// ===========================================================================
// Form results
// ===========================================================================

function formFailure(message: string): PromptFormState {
  return { ...initialPromptFormState, status: 'error', message }
}

function formIssues(
  issues: Readonly<Record<string, string>>,
  message: string | null = null,
): PromptFormState {
  return { ...initialPromptFormState, status: 'error', message, issues }
}

/** Zod paths are dotted; only the head names a control. */
function issueField(path: string): string | null {
  const head = path.split('.')[0] ?? ''
  switch (head) {
    case 'feature':
      return PROMPT_FIELDS.feature
    case 'model':
      return PROMPT_FIELDS.model
    case 'notes':
      return PROMPT_FIELDS.notes
    case 'body':
      return PROMPT_FIELDS.body
    default:
      return null
  }
}

function fromZodError(error: z.ZodError): PromptFormState {
  const issues: Record<string, string> = {}
  let general: string | null = null
  for (const issue of error.issues) {
    const name = issueField(issue.path.map((part) => String(part)).join('.'))
    if (name === null) general ??= issue.message
    else issues[name] ??= issue.message
  }
  return formIssues(
    issues,
    general ??
      (Object.keys(issues).length === 0 ? promptFailureMessage('validation_failed') : null),
  )
}

/** A domain error code, as the sentence the banner will render. */
function outcomeForCode(code: ErrorCode): PromptOutcome {
  switch (code) {
    case 'forbidden':
    case 'unauthorized':
      return 'forbidden'
    case 'not_found':
      return 'notfound'
    case 'sync_conflict':
      return 'conflict'
    case 'rate_limited':
      return 'ratelimited'
    case 'validation_failed':
      return 'invalid'
    default:
      return 'failed'
  }
}

function failureOutcome(error: unknown): PromptOutcome {
  return isAppError(error) ? outcomeForCode(error.code) : 'failed'
}

/**
 * A thrown failure as the sentence a form renders.
 *
 * `sync_conflict` from an insert is a duplicate version number — the unique
 * constraint on `(feature, version)` losing a race with another operator — and
 * it gets its own sentence, because "kayıt değişti" would send somebody looking
 * for a change that did not happen.
 */
function failureState(error: unknown, conflictIsDuplicate = false): PromptFormState {
  if (isAppError(error)) {
    if (conflictIsDuplicate && error.code === 'sync_conflict') {
      return formFailure(promptOutcomeMessages.duplicate.body)
    }
    return formFailure(promptFailureMessage(error.code))
  }
  return formFailure(promptFailureMessage('unknown'))
}

// ===========================================================================
// The local runner's gates
// ===========================================================================

/**
 * Session, CSRF, rate limit and the permission — asked twice, the second time
 * of the database at the moment of acting.
 *
 * Throws rather than returning a token: every caller's answer to a refusal is
 * the same sentence, and a helper that returned `null` would be a helper a
 * caller could forget to check.
 */
async function authoriseDraftWrite(formData: FormData): Promise<AdminSession> {
  const session = await requirePermissionAction('prompt.write', formData)
  await assertRateLimit(DRAFT_WRITE_LIMIT, adminBucket(session.adminUserId))
  await assertPermissionAtSource(session, 'prompt.write')
  return session
}

// ===========================================================================
// 1. Create a draft
// ===========================================================================

/**
 * Write a new version of a feature's prompt, always as a draft.
 *
 * There is no "create and activate": `status` is left at the column's default
 * whatever the form said, so what leaves this page reaches no model call until
 * somebody makes that decision separately and writes a reason for it.
 *
 * The version number is read a moment before the insert and is therefore
 * optimistic. `prompt_versions_unique_version` is what actually decides; two
 * operators drafting the same feature at once means one of them is told the
 * number was taken and to try again, which is a better failure than a reserved
 * number nobody used.
 */
export async function createPromptDraftAction(
  _previous: PromptFormState,
  formData: FormData,
): Promise<PromptFormState> {
  let session: AdminSession
  try {
    session = await authoriseDraftWrite(formData)
  } catch (error) {
    return failureState(error)
  }

  const parsed = createSchema.safeParse({
    feature: field(formData, PROMPT_FIELDS.feature),
    model: optionalField(formData, PROMPT_FIELDS.model),
    notes: optionalField(formData, PROMPT_FIELDS.notes),
    body: bodyField(formData),
  })
  if (!parsed.success) return fromZodError(parsed.error)

  let created: { id: string; version: number; body_fingerprint: string; body_length: number }
  try {
    const version = await nextVersionFor(parsed.data.feature)
    created = await insertRow(
      'prompt_versions',
      {
        feature: parsed.data.feature,
        version,
        status: 'draft',
        body: parsed.data.body,
        notes: parsed.data.notes,
        model: parsed.data.model,
        created_by: session.adminUserId,
        // A draft has never served and has never been retired. Spelled out so
        // the row cannot inherit anything from a form that posted more than it
        // was asked for.
        activated_by: null,
        activated_at: null,
        archived_at: null,
      },
      ['id', 'version', 'body_fingerprint', 'body_length'],
    )
  } catch (error) {
    return failureState(error, true)
  }

  // The trail is written after the effect, so it records what happened rather
  // than what was attempted. A draft reaches nobody, so a failed trail here is
  // reported to the operator rather than treated as a live change with no
  // record — but it is still reported, never swallowed.
  const audited = await tryAudit({
    adminUserId: session.adminUserId,
    action: 'prompt.draft_created',
    promptId: created.id,
    reason: null,
    detail: {
      feature: parsed.data.feature,
      version: created.version,
      model: parsed.data.model,
      body_length: created.body_length,
      body_fingerprint: created.body_fingerprint,
      has_notes: parsed.data.notes !== null,
    },
  })

  revalidatePath(PROMPTS_PATH)
  revalidatePath(promptPath(created.id))
  redirect(
    withOutcome(promptPath(created.id), audited ? 'created' : 'auditMissing', {
      feature: parsed.data.feature,
      version: created.version,
    }),
  )
}

// ===========================================================================
// 2. Edit a draft
// ===========================================================================

/**
 * Rewrite a draft's body, model or notes.
 *
 * The feature is not editable and is not read from the form: moving a draft
 * between features would take its version number with it into a sequence that
 * already uses it, and the record's identity — "the fourth version of
 * briefing.compose" — is the thing every usage row is attributed to.
 */
export async function updatePromptDraftAction(
  _previous: PromptFormState,
  formData: FormData,
): Promise<PromptFormState> {
  const promptId = field(formData, PROMPT_FIELDS.promptId)
  if (!uuidSchema.safeParse(promptId).success) {
    return formFailure(promptFailureMessage('not_found'))
  }

  let session: AdminSession
  try {
    session = await authoriseDraftWrite(formData)
  } catch (error) {
    return failureState(error)
  }

  const parsed = updateSchema.safeParse({
    promptId,
    model: optionalField(formData, PROMPT_FIELDS.model),
    notes: optionalField(formData, PROMPT_FIELDS.notes),
    body: bodyField(formData),
  })
  if (!parsed.success) return fromZodError(parsed.error)

  let updated: {
    id: string
    feature: string
    version: number
    body_fingerprint: string
    body_length: number
  }
  try {
    // `status = 'draft'` is part of the statement, not a check above it: a
    // version activated while this form was open matches no rows, and the
    // operator is told the record changed instead of quietly rewriting the text
    // a week of usage rows were attributed to.
    const rows = await updateRows(
      'prompt_versions',
      {
        body: parsed.data.body,
        notes: parsed.data.notes,
        model: parsed.data.model,
      },
      [
        { column: 'id', op: 'eq', value: promptId },
        { column: 'status', op: 'eq', value: 'draft' },
      ],
      ['id', 'feature', 'version', 'body_fingerprint', 'body_length'],
    )
    const row = rows[0]
    if (row === undefined) {
      const existing = await loadPromptRecord(promptId)
      if (existing === null) return formFailure(promptFailureMessage('not_found'))
      return formFailure(promptOutcomeMessages.locked.body)
    }
    updated = row
  } catch (error) {
    return failureState(error)
  }

  const audited = await tryAudit({
    adminUserId: session.adminUserId,
    action: 'prompt.draft_updated',
    promptId,
    reason: null,
    detail: {
      feature: updated.feature,
      version: updated.version,
      model: parsed.data.model,
      body_length: updated.body_length,
      body_fingerprint: updated.body_fingerprint,
      has_notes: parsed.data.notes !== null,
    },
  })

  revalidatePath(PROMPTS_PATH)
  revalidatePath(promptPath(promptId))
  redirect(
    withOutcome(promptPath(promptId), audited ? 'saved' : 'auditMissing', {
      feature: updated.feature,
      version: updated.version,
    }),
  )
}

// ===========================================================================
// 3. Activate
// ===========================================================================

interface ActivateResult {
  feature: string
  version: number
  model: string | null
  bodyLength: number
  fingerprint: string
  /** The version this one replaced, or null when the feature had none. */
  replacedVersionId: string | null
  replacedVersion: number | null
  /** True when the new body is byte-identical to the one it replaced. */
  identicalToReplaced: boolean
}

const activateSpec: AdminActionSpec<ActivateInput, ActivateResult> = {
  action: 'prompt.activated',
  permission: 'prompt.activate',
  input: activateSchema,
  rateLimit: DECISION_RATE_LIMIT,
  entityType: PROMPT_ENTITY_TYPE,
  subject: (input) => ({ entityId: input.promptId }),
  detail: (_input, result) => ({
    feature: result.feature,
    version: result.version,
    model: result.model,
    body_length: result.bodyLength,
    // The md5 the generated column stores. Two audit rows carrying the same
    // fingerprint are two activations of the same text, which is how a
    // "rollback" is recognised as one months later.
    body_fingerprint: result.fingerprint,
    replaced_version: result.replacedVersion,
    replaced_version_id: result.replacedVersionId,
    identical_body: result.identicalToReplaced,
  }),
  run: async (context, input) => {
    const target = await loadPromptRecord(input.promptId)
    if (target === null) {
      throw new AppError('not_found', {
        status: 404,
        detail: `no prompt version ${input.promptId}`,
      })
    }
    if (target.status !== 'draft') {
      throw new AppError('sync_conflict', {
        status: 409,
        detail: `prompt version ${input.promptId} is ${target.status}, not a draft`,
      })
    }

    const nowIso = context.now.toISOString()
    const current = await loadActiveRecord(target.feature)

    // Step one: retire the outgoing version. `status = 'active'` in the filter
    // means a version somebody else activated a moment ago is not silently
    // overwritten — the update matches nothing and this reports a conflict.
    if (current !== null) {
      const demoted = await updateRows(
        'prompt_versions',
        { status: 'archived', archived_at: nowIso },
        [
          { column: 'id', op: 'eq', value: current.id },
          { column: 'status', op: 'eq', value: 'active' },
        ],
        ['id'],
      )
      if (demoted.length === 0) {
        throw new AppError('sync_conflict', {
          status: 409,
          detail: `active version of ${target.feature} changed during activation`,
        })
      }
    }

    // Step two: promote the draft. The partial unique index is now satisfiable,
    // and if it still refuses — because a third version went active between the
    // two statements — Postgres raises 23505 and `mapPostgrestError` turns it
    // into the same conflict.
    const promoted = await updateRows(
      'prompt_versions',
      {
        status: 'active',
        activated_at: nowIso,
        activated_by: context.actor.adminUserId,
        archived_at: null,
      },
      [
        { column: 'id', op: 'eq', value: input.promptId },
        { column: 'status', op: 'eq', value: 'draft' },
      ],
      ['id', 'feature', 'version', 'model', 'body_length', 'body_fingerprint'],
    )

    const row = promoted[0]
    if (row === undefined) {
      // The draft moved underneath us. Put the outgoing version back, so a lost
      // race costs an error message rather than leaving the feature with no
      // prompt at all. The restore is filtered on the state this function left
      // it in, so it cannot trample a third party either.
      if (current !== null) {
        await updateRows(
          'prompt_versions',
          { status: 'active', archived_at: null },
          [
            { column: 'id', op: 'eq', value: current.id },
            { column: 'status', op: 'eq', value: 'archived' },
          ],
          ['id'],
        )
      }
      throw new AppError('sync_conflict', {
        status: 409,
        detail: `prompt version ${input.promptId} was no longer a draft`,
      })
    }

    return {
      feature: row.feature,
      version: row.version,
      model: row.model,
      bodyLength: row.body_length,
      fingerprint: row.body_fingerprint,
      replacedVersionId: current?.id ?? null,
      replacedVersion: current?.version ?? null,
      identicalToReplaced: current !== null && current.body_fingerprint === row.body_fingerprint,
    }
  },
}

export async function activatePromptVersionAction(formData: FormData): Promise<void> {
  const promptId = field(formData, PROMPT_FIELDS.promptId)

  let session: AdminSession
  try {
    // The route gate. The specific permission is checked again by
    // `runAdminAction`, which audits the refusal — an operator reaching for an
    // activation they may not make leaves a `failure` row on the version they
    // aimed it at, which is exactly what the trail is for.
    session = await requirePermissionAction('prompt.activate', formData)
  } catch {
    finish(promptId, 'forbidden')
  }

  const actor = await resolveAdminById(session.adminUserId, session.sessionId).catch(() => null)
  if (actor === null) finish(promptId, 'forbidden')

  const result = await runAdminAction(actor, activateSpec, {
    promptId,
    reason: String(formData.get(PROMPT_FIELDS.reason) ?? ''),
  })

  if (result.status === 'success') {
    finish(promptId, 'activated', {
      feature: result.data.feature,
      version: result.data.version,
    })
  }
  if (result.status === 'denied') finish(promptId, 'forbidden')
  if (result.status === 'invalid') finish(promptId, 'invalid')
  if (result.status === 'rate_limited') finish(promptId, 'ratelimited')
  if (result.effectApplied && !result.auditWritten) finish(promptId, 'auditMissing')
  finish(promptId, outcomeForCode(result.code))
}

// ===========================================================================
// 4. Archive
// ===========================================================================

export async function archivePromptVersionAction(formData: FormData): Promise<void> {
  const promptId = field(formData, PROMPT_FIELDS.promptId)
  const outcome = await archive(promptId, formData)
  finish(promptId, outcome.outcome, outcome.reference)
}

interface ArchiveAnswer {
  outcome: PromptOutcome
  reference: { feature?: string | null; version?: number | null }
}

async function archive(promptId: string, formData: FormData): Promise<ArchiveAnswer> {
  const empty: ArchiveAnswer['reference'] = {}
  if (!uuidSchema.safeParse(promptId).success) return { outcome: 'invalid', reference: empty }

  let session: AdminSession
  try {
    session = await requirePermissionAction('prompt.write', formData)
  } catch {
    return { outcome: 'forbidden', reference: empty }
  }

  try {
    await assertRateLimit(DECISION_BUCKET_LIMIT, adminBucket(session.adminUserId))
    await assertPermissionAtSource(session, 'prompt.write')
  } catch (error) {
    return { outcome: failureOutcome(error), reference: empty }
  }

  const reason = reasonSchema.safeParse(String(formData.get(PROMPT_FIELDS.reason) ?? ''))
  if (!reason.success) return { outcome: 'invalid', reference: empty }

  let record: Awaited<ReturnType<typeof loadPromptRecord>>
  try {
    record = await loadPromptRecord(promptId)
  } catch (error) {
    return { outcome: failureOutcome(error), reference: empty }
  }
  if (record === null) return { outcome: 'notfound', reference: empty }

  const reference = { feature: record.feature, version: record.version }
  if (record.status === 'archived') return { outcome: 'conflict', reference }

  // Retiring the version that is serving traffic leaves the feature with no
  // versioned prompt at all, so it is held to the activation permission rather
  // than the drafting one. Asked of the database at the moment of acting, and
  // audited as a refusal when the answer is no.
  if (record.status === 'active') {
    try {
      await assertPermissionAtSource(session, 'prompt.activate')
    } catch (error) {
      await tryAudit({
        adminUserId: session.adminUserId,
        action: 'admin.prompt_archived',
        promptId,
        reason: reason.data,
        outcome: 'failure',
        detail: {
          feature: record.feature,
          version: record.version,
          denied_permission: 'prompt.activate',
        },
      })
      return { outcome: failureOutcome(error), reference }
    }
  }

  const nowIso = systemClock.now().toISOString()

  try {
    const rows = await updateRows(
      'prompt_versions',
      { status: 'archived', archived_at: nowIso },
      [
        { column: 'id', op: 'eq', value: promptId },
        // A version somebody archived while this dialog was open matches
        // nothing, and the operator is told the record moved.
        { column: 'status', op: 'neq', value: 'archived' },
      ],
      ['id'],
    )
    if (rows.length === 0) return { outcome: 'conflict', reference }
  } catch (error) {
    // A refusal inside the write is still an attempt on a sensitive action, so
    // it leaves a trail.
    await tryAudit({
      adminUserId: session.adminUserId,
      action: 'admin.prompt_archived',
      promptId,
      reason: reason.data,
      outcome: 'failure',
      detail: {
        feature: record.feature,
        version: record.version,
        failure_code: isAppError(error) ? error.code : 'unknown',
      },
    })
    return { outcome: failureOutcome(error), reference }
  }

  const audited = await tryAudit({
    adminUserId: session.adminUserId,
    action: 'admin.prompt_archived',
    promptId,
    reason: reason.data,
    detail: {
      feature: record.feature,
      version: record.version,
      previous_status: record.status,
      body_fingerprint: record.body_fingerprint,
      // Archiving the live version is the consequential case, and the trail
      // says which one this was without anybody having to join two tables.
      was_active: record.status === 'active',
    },
  })

  // The change happened. If the trail did not land the operator is told so
  // plainly rather than reassured: an unrecorded decision about what a model is
  // told cannot be explained six months later.
  return { outcome: audited ? 'archived' : 'auditMissing', reference }
}

// ===========================================================================
// The trail
// ===========================================================================

interface AuditAttempt {
  adminUserId: string
  action: string
  promptId: string
  reason: string | null
  outcome?: 'success' | 'failure'
  detail: Record<string, string | number | boolean | null>
}

/**
 * Write one audit row, reporting whether it landed instead of throwing.
 *
 * The caller's answer differs by operation — a failed trail on a draft save is
 * a warning, a failed trail on an archive is a hole in the record — so the
 * decision belongs to them and not to this helper.
 */
async function tryAudit(attempt: AuditAttempt): Promise<boolean> {
  try {
    await writeAudit({
      actor: { adminUserId: attempt.adminUserId },
      action: attempt.action,
      // A prompt version is about a feature, never about one person. Naming a
      // subject user here would be both wrong and a privacy regression.
      subjectUserId: null,
      entityType: PROMPT_ENTITY_TYPE,
      entityId: attempt.promptId,
      reason: attempt.reason,
      outcome: attempt.outcome ?? 'success',
      detail: attempt.detail,
    })
    return true
  } catch {
    return false
  }
}

// ===========================================================================
// Where an operator lands afterwards
// ===========================================================================

/**
 * Re-query the two pages this changed and send the operator back to the record
 * with the answer on the URL.
 *
 * The destination is built from a uuid this module validated, never from a
 * posted path, so there is no field here a crafted form could turn into an open
 * redirect.
 */
function finish(
  promptId: string,
  outcome: PromptOutcome,
  reference: { feature?: string | null; version?: number | null } = {},
): never {
  revalidatePath(PROMPTS_PATH)
  if (uuidSchema.safeParse(promptId).success) {
    revalidatePath(promptPath(promptId))
    redirect(withOutcome(promptPath(promptId), outcome, reference))
  }
  redirect(withOutcome(PROMPTS_PATH, outcome, reference))
}
