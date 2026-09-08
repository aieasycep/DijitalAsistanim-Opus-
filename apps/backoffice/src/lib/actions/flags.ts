'use server'

import { AppError } from '@da/domain'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  runAdminAction,
  type AdminActionResult,
  type AdminActionSpec,
} from '@/lib/admin-action'
import { requirePermissionAction, type AdminSession } from '@/lib/auth'
import { deleteRows, insertRow, resolveAdminById, updateRows, type AdminActor } from '@/lib/db'
import { expiresAfterDaysOrNever } from '@/lib/expiry'
import {
  FLAG_ENTITY_TYPE,
  loadFlag,
  loadFlagByKey,
  loadOverride,
  loadOverrideById,
  userExists,
} from '@/lib/queries/flags'
import { flagFailureMessage, flagMessages, flagOutcomeMessages } from '@/lib/messages/flags'
import {
  APP_VERSION_PATTERN,
  BOOLEAN_TRUE,
  FLAGS_PATH,
  FLAG_DESCRIPTION_MAX,
  FLAG_DESCRIPTION_MIN,
  FLAG_FIELDS,
  FLAG_KEY_MAX,
  FLAG_KEY_PATTERN,
  FLAG_PLANS,
  FLAG_PLATFORMS,
  KILL_FIELDS,
  OVERRIDE_FIELDS,
  ROLLOUT_MAX,
  ROLLOUT_MIN,
  TOGGLE_FIELDS,
  compareAppVersions,
  flagPath,
  initialFlagFormState,
  isOverrideDuration,
  isUuidParam,
  targetingEquals,
  withOutcome,
  type FlagFormState,
  type FlagOutcome,
} from '@/components/flags/contract'

/**
 * The six privileged operations of the feature-flag area.
 *
 * ---------------------------------------------------------------------------
 * EVERY ONE OF THEM GOES THROUGH `runAdminAction`
 * ---------------------------------------------------------------------------
 *
 * Not one handler below checks a permission, applies a rate limit or writes an
 * audit row by hand. `runAdminAction` does all three, in that order, and it
 * cannot be called without a branded `AdminActor` — which only `@/lib/db` can
 * mint, and only by re-reading `admin_users` with `status = 'active'`, so an
 * operator disabled between the render and the click is refused here rather
 * than at their next page load. It writes the audit row on the success path
 * *and* on the failure path, so an operation that threw halfway still leaves a
 * record that it was attempted.
 *
 * The three action names — `feature_flag.changed`, `feature_flag.override_set`,
 * `feature_flag.override_removed` — are seeded in `admin_sensitive_actions`
 * with `requires_reason = true`. That is why every form here has a reason
 * field: `audit_logs_enforce_accountability()` refuses the row without one, and
 * the runner refuses the operation before it gets that far so the operator sees
 * a field error instead of a database exception.
 *
 * ---------------------------------------------------------------------------
 * THIS MODULE EDITS THE RECORD. IT DOES NOT EVALUATE IT
 * ---------------------------------------------------------------------------
 *
 * `feature_flag_is_enabled()` is the single evaluator and the mobile app is its
 * caller. Nothing here decides whether a user sees a feature; every write is an
 * `insert` or an `update` against `feature_flags` / `feature_flag_overrides`,
 * and the precedence — kill switch, per-user pin, global switch, targeting,
 * bucket — is applied in exactly one place, in Postgres.
 *
 * ---------------------------------------------------------------------------
 * WHAT TRAVELS
 * ---------------------------------------------------------------------------
 *
 * Uuids, members of `app_platform` and `app_plan`, a bounded integer, a
 * `major.minor.patch` triple, a flag key the company chose, and an operator's
 * own written reason. No user content passes through any field here, and
 * `AuditDetail` admits scalars only. The redirect target is rebuilt from a uuid
 * this module validated rather than trusted from the form, so there is no field
 * a crafted post could turn into an open redirect.
 */

// ===========================================================================
// Bounds
// ===========================================================================

/**
 * Flag writes per operator.
 *
 * A person editing targeting types a reason each time; 120 an hour is far past
 * what that allows and stops a script cold. The scope matches
 * `admin_rate_limits_scope_shape` in 0019.
 */
const FLAG_WRITE_LIMIT = { scope: 'admin.flag_write', limit: 120, window: '1 hour' } as const

/**
 * The kill switch and the per-user pins share the console's destructive
 * bucket, matching the rule `@/lib/rate-limit` declares for the same scope.
 */
const DESTRUCTIVE_LIMIT = { scope: 'admin.destructive', limit: 30, window: '5 minutes' } as const

// ===========================================================================
// Input
// ===========================================================================

const uuid = z.string().uuid({ message: 'Geçerli bir kimlik (UUID) değil.' })

const reasonSchema = z
  .string()
  .trim()
  .min(MIN_REASON_LENGTH, { message: `Gerekçe en az ${MIN_REASON_LENGTH} karakter olmalıdır.` })
  .max(MAX_REASON_LENGTH, { message: `Gerekçe en fazla ${MAX_REASON_LENGTH} karakter olabilir.` })

const versionSchema = z
  .string()
  .trim()
  .regex(APP_VERSION_PATTERN, { message: flagMessages.form.versionInvalid })
  .nullable()

const targetingShape = {
  description: z
    .string()
    .trim()
    .min(FLAG_DESCRIPTION_MIN, {
      message: flagMessages.form.descriptionTooShort(FLAG_DESCRIPTION_MIN),
    })
    .max(FLAG_DESCRIPTION_MAX, {
      message: `Açıklama en fazla ${FLAG_DESCRIPTION_MAX} karakter olabilir.`,
    }),
  enabled: z.boolean(),
  rolloutPercentage: z
    .number({ invalid_type_error: flagMessages.form.rolloutInvalid })
    .int({ message: flagMessages.form.rolloutInvalid })
    .min(ROLLOUT_MIN, { message: flagMessages.form.rolloutInvalid })
    .max(ROLLOUT_MAX, { message: flagMessages.form.rolloutInvalid }),
  platforms: z.array(z.enum(FLAG_PLATFORMS)).max(FLAG_PLATFORMS.length),
  plans: z.array(z.enum(FLAG_PLANS)).max(FLAG_PLANS.length),
  minAppVersion: versionSchema,
  maxAppVersion: versionSchema,
  reason: reasonSchema,
}

/**
 * The one rule this module checks that the database does not.
 *
 * 0019 constrains the *shape* of each version but has no cross-column check
 * that the floor sits below the ceiling — a pair the wrong way round is a valid
 * row that silently matches nobody, which is the kind of flag somebody spends
 * an afternoon on. Refused here with a field error rather than shipped.
 */
function checkVersionOrder(
  value: { minAppVersion: string | null; maxAppVersion: string | null },
  ctx: z.RefinementCtx,
): void {
  if (value.minAppVersion === null || value.maxAppVersion === null) return
  if (compareAppVersions(value.minAppVersion, value.maxAppVersion) === 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['maxAppVersion'],
      message: flagMessages.form.versionOrder,
    })
  }
}

const createSchema = z
  .object({
    flagId: uuid,
    key: z
      .string()
      .trim()
      .max(FLAG_KEY_MAX, { message: `Anahtar en fazla ${FLAG_KEY_MAX} karakter olabilir.` })
      .regex(FLAG_KEY_PATTERN, { message: flagMessages.form.keyInvalid }),
    ...targetingShape,
  })
  .superRefine(checkVersionOrder)

type CreateInput = z.infer<typeof createSchema>

const targetingSchema = z.object({ flagId: uuid, ...targetingShape }).superRefine(checkVersionOrder)

type TargetingInput = z.infer<typeof targetingSchema>

const switchSchema = z.object({
  flagId: uuid,
  /** The state being moved to, not a delta: two clicks cannot both apply. */
  next: z.boolean(),
  reason: reasonSchema,
})

type SwitchInput = z.infer<typeof switchSchema>

const overrideSchema = z.object({
  flagId: uuid,
  userId: uuid,
  enabled: z.boolean(),
  durationDays: z
    .number({ invalid_type_error: 'Süre seçilmedi.' })
    .int()
    .refine(isOverrideDuration, { message: 'Süre seçilmedi.' }),
  reason: reasonSchema,
})

type OverrideInput = z.infer<typeof overrideSchema>

const removeOverrideSchema = z.object({
  flagId: uuid,
  overrideId: uuid,
  /** Carried for the audit row's subject column; null when the pin is gone. */
  userId: uuid.nullable(),
  reason: reasonSchema,
})

type RemoveOverrideInput = z.infer<typeof removeOverrideSchema>

// ===========================================================================
// Reading a form
// ===========================================================================

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim()
}

function optionalField(formData: FormData, name: string): string | null {
  const value = field(formData, name)
  return value === '' ? null : value
}

function boolField(formData: FormData, name: string): boolean {
  return field(formData, name) === BOOLEAN_TRUE
}

function numberField(formData: FormData, name: string): number {
  const raw = field(formData, name)
  return raw === '' ? Number.NaN : Number(raw)
}

function listField(formData: FormData, name: string): readonly string[] {
  return formData.getAll(name).map((value) => String(value).trim())
}

/** The targeting half of a create or edit form, unvalidated. */
function readTargeting(formData: FormData): Record<string, unknown> {
  return {
    description: field(formData, FLAG_FIELDS.description),
    enabled: boolField(formData, FLAG_FIELDS.enabled),
    rolloutPercentage: numberField(formData, FLAG_FIELDS.rollout),
    platforms: listField(formData, FLAG_FIELDS.platform),
    plans: listField(formData, FLAG_FIELDS.plan),
    minAppVersion: optionalField(formData, FLAG_FIELDS.minVersion),
    maxAppVersion: optionalField(formData, FLAG_FIELDS.maxVersion),
    reason: String(formData.get(FLAG_FIELDS.reason) ?? ''),
  }
}

// ===========================================================================
// Audit detail
// ===========================================================================

/** Targeting as scalars, for the audit row. Arrays are comma-joined tokens. */
function targetingDetail(
  prefix: string,
  targeting: {
    enabled: boolean
    kill_switch: boolean
    rollout_percentage: number
    platforms: readonly string[]
    plans: readonly string[]
    min_app_version: string | null
    max_app_version: string | null
  },
): Record<string, string | number | boolean | null> {
  return {
    [`${prefix}enabled`]: targeting.enabled,
    [`${prefix}kill_switch`]: targeting.kill_switch,
    [`${prefix}rollout_percentage`]: targeting.rollout_percentage,
    [`${prefix}platforms`]: targeting.platforms.join(',') || 'all',
    [`${prefix}plans`]: targeting.plans.join(',') || 'all',
    [`${prefix}min_app_version`]: targeting.min_app_version,
    [`${prefix}max_app_version`]: targeting.max_app_version,
  }
}

// ===========================================================================
// The gate
// ===========================================================================

/**
 * Session, CSRF, same origin, permission — then a branded actor.
 *
 * Two checks, and the split is deliberate. This one refuses an operator who is
 * not in this workflow at all, before any lookup runs. The permission is then
 * asked *again* by `runAdminAction`, against `admin_role_permissions` at the
 * moment of acting, and that second refusal is audited — an operator reaching
 * for a kill switch they may not pull leaves a `failure` row on the flag they
 * aimed it at, which is exactly what the trail is for.
 */
async function authorize(formData: FormData): Promise<AdminActor | null> {
  let session: AdminSession
  try {
    session = await requirePermissionAction('flags.write', formData)
  } catch {
    return null
  }
  return resolveAdminById(session.adminUserId, session.sessionId).catch(() => null)
}

/** The outcome token for anything that is not a success. */
function reduceFailure<T>(result: AdminActionResult<T>): FlagOutcome {
  switch (result.status) {
    case 'denied':
      return 'forbidden'
    case 'invalid':
      return 'invalid'
    case 'rate_limited':
      return 'ratelimited'
    case 'failed':
      if (result.effectApplied && !result.auditWritten) return 'auditMissing'
      if (result.code === 'not_found') return 'notfound'
      if (result.code === 'forbidden') return 'forbidden'
      // The only unique index on `feature_flags` is its key, but a `23505` is
      // not the only way to a conflict: every switch update filters on the
      // value it is moving *from*, so a second operator clicking at the same
      // moment matches no row and lands here too. "Bu anahtar zaten var" is
      // only said where the key has been confirmed to exist, by the create
      // action itself; everything else reads as what it is — a stale page.
      if (result.code === 'sync_conflict') return 'conflict'
      return 'failed'
    default:
      return 'failed'
  }
}

/** Zod paths are dotted; `platforms.0` belongs under the platform control. */
function issuePath(path: string): string | null {
  const head = path.split('.')[0] ?? ''
  switch (head) {
    case 'key':
      return FLAG_FIELDS.key
    case 'description':
      return FLAG_FIELDS.description
    case 'enabled':
      return FLAG_FIELDS.enabled
    case 'rolloutPercentage':
      return FLAG_FIELDS.rollout
    case 'platforms':
      return FLAG_FIELDS.platform
    case 'plans':
      return FLAG_FIELDS.plan
    case 'minAppVersion':
      return FLAG_FIELDS.minVersion
    case 'maxAppVersion':
      return FLAG_FIELDS.maxVersion
    case 'userId':
      return OVERRIDE_FIELDS.userId
    case 'durationDays':
      return OVERRIDE_FIELDS.durationDays
    case 'reason':
      return FLAG_FIELDS.reason
    default:
      return null
  }
}

/** A failed result, as the multi-field forms render it. */
function formFailure<T>(result: AdminActionResult<T>): FlagFormState {
  if (result.status === 'invalid') {
    const issues: Record<string, string> = {}
    let general: string | null = null
    for (const issue of result.issues) {
      const target = issuePath(issue.path)
      if (target === null) general ??= issue.message
      else issues[target] ??= issue.message
    }
    return {
      status: 'error',
      message: general ?? (Object.keys(issues).length === 0 ? flagFailureMessage('unknown') : null),
      issues,
    }
  }

  const outcome = reduceFailure(result)
  return {
    ...initialFlagFormState,
    status: 'error',
    message: flagOutcomeMessages[outcome].body,
  }
}

function formMessage(
  message: string | null,
  issues: Readonly<Record<string, string>> = {},
): FlagFormState {
  return { status: 'error', message, issues }
}

// ===========================================================================
// Where an action lands
// ===========================================================================

/**
 * Re-query the pages this changed and send the operator back with the answer
 * on the URL.
 *
 * The destination is built from a uuid this module validated, never from a
 * posted path.
 */
function finish(flagId: string, outcome: FlagOutcome, key: string | null): never {
  revalidatePath(FLAGS_PATH)
  if (isUuidParam(flagId)) {
    revalidatePath(flagPath(flagId))
    redirect(withOutcome(flagPath(flagId), outcome, key))
  }
  redirect(withOutcome(FLAGS_PATH, outcome, key))
}

// ===========================================================================
// 1. Create
// ===========================================================================

const createSpec: AdminActionSpec<CreateInput, { flagId: string; key: string }> = {
  action: 'feature_flag.changed',
  permission: 'flags.write',
  input: createSchema,
  rateLimit: FLAG_WRITE_LIMIT,
  entityType: FLAG_ENTITY_TYPE,
  // The id is minted by the action rather than by `gen_random_uuid()`, so the
  // audit row's `entity_id` — read off the input before the handler runs — and
  // the row that was written are provably the same object.
  subject: (input) => ({ entityId: input.flagId }),
  detail: (input) => ({
    change: 'created',
    flag_key: input.key,
    ...targetingDetail('', {
      enabled: input.enabled,
      kill_switch: false,
      rollout_percentage: input.rolloutPercentage,
      platforms: input.platforms,
      plans: input.plans,
      min_app_version: input.minAppVersion,
      max_app_version: input.maxAppVersion,
    }),
  }),
  run: async (context, input) => {
    const row = await insertRow(
      'feature_flags',
      {
        id: input.flagId,
        key: input.key,
        description: input.description,
        enabled: input.enabled,
        // A new flag is never born killed: the kill switch is an intervention,
        // and a flag that has never been on has nothing to stop.
        kill_switch: false,
        rollout_percentage: input.rolloutPercentage,
        platforms: [...input.platforms],
        plans: [...input.plans],
        min_app_version: input.minAppVersion,
        max_app_version: input.maxAppVersion,
        created_by: context.actor.adminUserId,
        updated_by: context.actor.adminUserId,
      },
      ['id', 'key'],
    )
    return { flagId: row.id, key: row.key }
  },
}

export async function createFlagAction(
  _previous: FlagFormState,
  formData: FormData,
): Promise<FlagFormState> {
  const actor = await authorize(formData)
  if (actor === null) return formMessage(flagOutcomeMessages.forbidden.body)

  const key = field(formData, FLAG_FIELDS.key).toLowerCase()
  const flagId = crypto.randomUUID()

  const result = await runAdminAction(actor, createSpec, {
    flagId,
    key,
    ...readTargeting(formData),
  })

  if (result.status === 'success') {
    revalidatePath(FLAGS_PATH)
    revalidatePath(flagPath(result.data.flagId))
    redirect(withOutcome(flagPath(result.data.flagId), 'created', result.data.key))
  }

  // `feature_flags_key_unique` is the only unique index on the table, so a
  // conflict here has exactly one cause. It is confirmed against the database
  // rather than assumed, and only to choose which sentence the operator reads:
  // the write has already been refused.
  if (result.status === 'failed' && result.code === 'sync_conflict') {
    const existing = await loadFlagByKey(key).catch(() => null)
    if (existing !== null) {
      return formMessage(flagOutcomeMessages.duplicate.body, {
        [FLAG_FIELDS.key]: flagMessages.form.keyTaken,
      })
    }
  }

  return formFailure(result)
}

// ===========================================================================
// 2. Targeting
// ===========================================================================

const targetingSpec: AdminActionSpec<TargetingInput, { flagId: string; key: string }> = {
  action: 'feature_flag.changed',
  permission: 'flags.write',
  input: targetingSchema,
  rateLimit: FLAG_WRITE_LIMIT,
  entityType: FLAG_ENTITY_TYPE,
  subject: (input) => ({ entityId: input.flagId }),
  detail: (input, result) => ({
    change: 'targeting',
    flag_key: result.key,
    ...targetingDetail('new_', {
      enabled: input.enabled,
      kill_switch: false,
      rollout_percentage: input.rolloutPercentage,
      platforms: input.platforms,
      plans: input.plans,
      min_app_version: input.minAppVersion,
      max_app_version: input.maxAppVersion,
    }),
  }),
  run: async (context, input) => {
    const previous = await loadFlag(input.flagId)
    if (previous === null) {
      throw new AppError('not_found', { status: 404, detail: `no feature flag ${input.flagId}` })
    }

    // The kill switch is not in this form. It is its own audited action with
    // its own confirmation, and a targeting save that quietly released one
    // would be the most dangerous accident this screen could offer.
    const updated = await updateRows(
      'feature_flags',
      {
        description: input.description,
        enabled: input.enabled,
        rollout_percentage: input.rolloutPercentage,
        platforms: [...input.platforms],
        plans: [...input.plans],
        min_app_version: input.minAppVersion,
        max_app_version: input.maxAppVersion,
        updated_by: context.actor.adminUserId,
      },
      [{ column: 'id', op: 'eq', value: input.flagId }],
      ['id', 'key'],
    )
    const row = updated[0]
    if (row === undefined) {
      throw new AppError('not_found', {
        status: 404,
        detail: `feature flag ${input.flagId} vanished between read and write`,
      })
    }
    return { flagId: row.id, key: row.key }
  },
}

export async function updateFlagTargetingAction(
  _previous: FlagFormState,
  formData: FormData,
): Promise<FlagFormState> {
  const actor = await authorize(formData)
  if (actor === null) return formMessage(flagOutcomeMessages.forbidden.body)

  const flagId = field(formData, FLAG_FIELDS.flagId)
  const raw = { flagId, ...readTargeting(formData) }

  // A save that changes nothing is refused before it becomes an audit row: a
  // trail full of "changed nothing" entries is a trail nobody reads. The
  // comparison is made against the row the database currently holds, not
  // against the values the form was rendered from.
  const parsed = targetingSchema.safeParse(raw)
  if (parsed.success) {
    const current = await loadFlag(flagId).catch(() => null)
    if (current !== null) {
      const proposed = {
        enabled: parsed.data.enabled,
        kill_switch: current.kill_switch,
        rollout_percentage: parsed.data.rolloutPercentage,
        platforms: parsed.data.platforms,
        plans: parsed.data.plans,
        min_app_version: parsed.data.minAppVersion,
        max_app_version: parsed.data.maxAppVersion,
      }
      if (targetingEquals(current, proposed) && current.description === parsed.data.description) {
        return formMessage(flagMessages.form.unchanged)
      }
    }
  }

  const result = await runAdminAction(actor, targetingSpec, raw)

  if (result.status === 'success') {
    revalidatePath(FLAGS_PATH)
    revalidatePath(flagPath(result.data.flagId))
    return { status: 'success', message: flagMessages.form.saved, issues: {} }
  }

  return formFailure(result)
}

// ===========================================================================
// 3. The main switch
// ===========================================================================

const toggleSpec: AdminActionSpec<SwitchInput, { key: string; enabled: boolean }> = {
  action: 'feature_flag.changed',
  permission: 'flags.write',
  input: switchSchema,
  rateLimit: FLAG_WRITE_LIMIT,
  entityType: FLAG_ENTITY_TYPE,
  subject: (input) => ({ entityId: input.flagId }),
  detail: (input, result) => ({
    change: 'enabled',
    flag_key: result.key,
    previous_enabled: !input.next,
    new_enabled: input.next,
  }),
  run: async (context, input) => {
    // The filter names the value being moved *from*, so two operators clicking
    // at the same moment do not both apply: the second matches no row and is
    // reported as a conflict rather than silently re-applying the first.
    const updated = await updateRows(
      'feature_flags',
      { enabled: input.next, updated_by: context.actor.adminUserId },
      [
        { column: 'id', op: 'eq', value: input.flagId },
        { column: 'enabled', op: 'is', value: !input.next },
      ],
      ['id', 'key', 'enabled'],
    )
    const row = updated[0]
    if (row === undefined) {
      throw new AppError('sync_conflict', {
        status: 409,
        detail: `feature flag ${input.flagId} was not ${input.next ? 'off' : 'on'}`,
      })
    }
    return { key: row.key, enabled: row.enabled }
  },
}

export async function toggleFlagAction(formData: FormData): Promise<void> {
  const flagId = field(formData, TOGGLE_FIELDS.flagId)
  const next = boolField(formData, TOGGLE_FIELDS.enabled)

  const actor = await authorize(formData)
  if (actor === null) finish(flagId, 'forbidden', null)

  const current = await loadFlag(flagId).catch(() => null)
  if (current !== null && current.enabled === next) finish(flagId, 'noop', current.key)

  const result = await runAdminAction(actor, toggleSpec, {
    flagId,
    next,
    reason: String(formData.get(TOGGLE_FIELDS.reason) ?? ''),
  })

  if (result.status === 'success') {
    finish(flagId, next ? 'enabled' : 'disabled', result.data.key)
  }
  finish(flagId, reduceFailure(result), current?.key ?? null)
}

// ===========================================================================
// 4. The kill switch
// ===========================================================================

const killSwitchSpec: AdminActionSpec<SwitchInput, { key: string; killSwitch: boolean }> = {
  action: 'feature_flag.changed',
  permission: 'flags.write',
  input: switchSchema,
  rateLimit: DESTRUCTIVE_LIMIT,
  entityType: FLAG_ENTITY_TYPE,
  subject: (input) => ({ entityId: input.flagId }),
  detail: (input, result) => ({
    change: 'kill_switch',
    flag_key: result.key,
    previous_kill_switch: !input.next,
    new_kill_switch: input.next,
  }),
  run: async (context, input) => {
    const updated = await updateRows(
      'feature_flags',
      { kill_switch: input.next, updated_by: context.actor.adminUserId },
      [
        { column: 'id', op: 'eq', value: input.flagId },
        { column: 'kill_switch', op: 'is', value: !input.next },
      ],
      ['id', 'key', 'kill_switch'],
    )
    const row = updated[0]
    if (row === undefined) {
      throw new AppError('sync_conflict', {
        status: 409,
        detail: `feature flag ${input.flagId} kill switch was already ${input.next}`,
      })
    }
    return { key: row.key, killSwitch: row.kill_switch }
  },
}

export async function toggleKillSwitchAction(formData: FormData): Promise<void> {
  const flagId = field(formData, KILL_FIELDS.flagId)
  const next = boolField(formData, KILL_FIELDS.killSwitch)

  const actor = await authorize(formData)
  if (actor === null) finish(flagId, 'forbidden', null)

  const current = await loadFlag(flagId).catch(() => null)
  if (current !== null && current.kill_switch === next) finish(flagId, 'noop', current.key)

  const result = await runAdminAction(actor, killSwitchSpec, {
    flagId,
    next,
    reason: String(formData.get(KILL_FIELDS.reason) ?? ''),
  })

  if (result.status === 'success') {
    finish(flagId, next ? 'killed' : 'unkilled', result.data.key)
  }
  finish(flagId, reduceFailure(result), current?.key ?? null)
}

// ===========================================================================
// 5. Pinning one user
// ===========================================================================

const overrideSpec: AdminActionSpec<
  OverrideInput,
  { overrideId: string; key: string; replaced: boolean; expiresAt: string | null }
> = {
  action: 'feature_flag.override_set',
  permission: 'flags.write',
  input: overrideSchema,
  rateLimit: DESTRUCTIVE_LIMIT,
  entityType: FLAG_ENTITY_TYPE,
  // The entity is the flag, so the flag's trail holds every pin ever set on
  // it; the user the pin is about is the audit row's subject, so the account's
  // own history holds it too.
  subject: (input) => ({ userId: input.userId, entityId: input.flagId }),
  detail: (input, result) => ({
    change: 'override_set',
    flag_key: result.key,
    override_id: result.overrideId,
    override_enabled: input.enabled,
    duration_days: input.durationDays,
    expires_at: result.expiresAt,
    replaced_existing: result.replaced,
  }),
  run: async (context, input) => {
    const flag = await loadFlag(input.flagId)
    if (flag === null) {
      throw new AppError('not_found', { status: 404, detail: `no feature flag ${input.flagId}` })
    }

    // A duration rather than a posted timestamp: the instant is computed here
    // from the injected clock, so the operator's browser timezone cannot move
    // an expiry three hours.
    const expiresAt =
      expiresAfterDaysOrNever(context.now, input.durationDays)?.toISOString() ?? null

    const existing = await loadOverride(input.flagId, input.userId)

    if (existing !== null) {
      const updated = await updateRows(
        'feature_flag_overrides',
        {
          enabled: input.enabled,
          reason: input.reason,
          expires_at: expiresAt,
          created_by: context.actor.adminUserId,
        },
        [{ column: 'id', op: 'eq', value: existing.id }],
        ['id'],
      )
      const row = updated[0]
      if (row === undefined) {
        throw new AppError('sync_conflict', {
          status: 409,
          detail: `override ${existing.id} vanished between read and write`,
        })
      }
      return { overrideId: row.id, key: flag.key, replaced: true, expiresAt }
    }

    const inserted = await insertRow(
      'feature_flag_overrides',
      {
        flag_id: input.flagId,
        user_id: input.userId,
        enabled: input.enabled,
        reason: input.reason,
        expires_at: expiresAt,
        created_by: context.actor.adminUserId,
      },
      ['id'],
    )
    return { overrideId: inserted.id, key: flag.key, replaced: false, expiresAt }
  },
}

export async function setFlagOverrideAction(
  _previous: FlagFormState,
  formData: FormData,
): Promise<FlagFormState> {
  const actor = await authorize(formData)
  if (actor === null) return formMessage(flagOutcomeMessages.forbidden.body)

  const flagId = field(formData, OVERRIDE_FIELDS.flagId)
  const userId = field(formData, OVERRIDE_FIELDS.userId)

  // Resolved before the privileged operation so a mistyped id is a field error
  // rather than a foreign-key failure the operator cannot read. The lookup
  // grants nothing and sits behind the permission check above.
  if (isUuidParam(userId)) {
    let known: boolean
    try {
      known = await userExists(userId)
    } catch {
      return formMessage(flagFailureMessage('server_unavailable'))
    }
    if (!known) {
      return formMessage(null, {
        [OVERRIDE_FIELDS.userId]: flagMessages.overrides.userUnknown,
      })
    }
  }

  const result = await runAdminAction(actor, overrideSpec, {
    flagId,
    userId,
    enabled: boolField(formData, OVERRIDE_FIELDS.enabled),
    durationDays: numberField(formData, OVERRIDE_FIELDS.durationDays),
    reason: String(formData.get(OVERRIDE_FIELDS.reason) ?? ''),
  })

  if (result.status === 'success') {
    revalidatePath(FLAGS_PATH)
    revalidatePath(flagPath(flagId))
    return {
      status: 'success',
      message: flagOutcomeMessages.overrideSet.body,
      issues: {},
    }
  }

  return formFailure(result)
}

// ===========================================================================
// 6. Removing a pin
//
// The one row in the admin platform a console action may delete. Everything
// else is disabled, revoked or expired because the audit trail has to keep
// resolving; a stale per-user pin has no such history, and removing it is the
// documented remedy for a rollout that quietly became something else. The
// deletion is still audited — by this action, naming the user it was about.
// ===========================================================================

const removeOverrideSpec: AdminActionSpec<
  RemoveOverrideInput,
  { key: string; wasEnabled: boolean }
> = {
  action: 'feature_flag.override_removed',
  permission: 'flags.write',
  input: removeOverrideSchema,
  rateLimit: DESTRUCTIVE_LIMIT,
  entityType: FLAG_ENTITY_TYPE,
  subject: (input) => ({ userId: input.userId, entityId: input.flagId }),
  detail: (input, result) => ({
    change: 'override_removed',
    flag_key: result.key,
    override_id: input.overrideId,
    removed_enabled: result.wasEnabled,
  }),
  run: async (_context, input) => {
    const flag = await loadFlag(input.flagId)
    if (flag === null) {
      throw new AppError('not_found', { status: 404, detail: `no feature flag ${input.flagId}` })
    }

    const existing = await loadOverrideById(input.overrideId)
    if (existing === null || existing.flag_id !== input.flagId) {
      throw new AppError('not_found', {
        status: 404,
        detail: `override ${input.overrideId} does not belong to flag ${input.flagId}`,
      })
    }

    const removed = await deleteRows('feature_flag_overrides', [
      { column: 'id', op: 'eq', value: input.overrideId },
      { column: 'flag_id', op: 'eq', value: input.flagId },
    ])
    if (removed === 0) {
      throw new AppError('sync_conflict', {
        status: 409,
        detail: `override ${input.overrideId} was already gone`,
      })
    }

    return { key: flag.key, wasEnabled: existing.enabled }
  },
}

export async function removeFlagOverrideAction(formData: FormData): Promise<void> {
  const flagId = field(formData, OVERRIDE_FIELDS.flagId)
  const overrideId = field(formData, OVERRIDE_FIELDS.overrideId)

  const actor = await authorize(formData)
  if (actor === null) finish(flagId, 'forbidden', null)

  // Read once, before the operation, purely so the audit row can name the user
  // the removal was about. A pin that has already vanished still goes through
  // the runner with a null subject, so the attempt is recorded rather than
  // dropped.
  const existing = isUuidParam(overrideId)
    ? await loadOverrideById(overrideId).catch(() => null)
    : null

  const result = await runAdminAction(actor, removeOverrideSpec, {
    flagId,
    overrideId,
    userId: existing?.user_id ?? null,
    reason: String(formData.get(OVERRIDE_FIELDS.reason) ?? ''),
  })

  if (result.status === 'success') {
    finish(flagId, 'overrideRemoved', result.data.key)
  }
  finish(flagId, reduceFailure(result), null)
}
