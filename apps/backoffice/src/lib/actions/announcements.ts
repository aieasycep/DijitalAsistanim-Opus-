'use server'

import { AppError, isAppError, systemClock, type ErrorCode } from '@da/domain'
import { isoInstantSchema, uuidSchema } from '@da/validation'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  ANNOUNCEMENTS_PATH,
  ANNOUNCEMENT_ENTITY_TYPE,
  ANNOUNCEMENT_FIELDS,
  ANNOUNCEMENT_PLATFORMS,
  ANNOUNCEMENT_REASON_MAX,
  ANNOUNCEMENT_REASON_MIN,
  BODY_MAX_LENGTH,
  MIN_VERSION_PATTERN,
  TITLE_MAX_LENGTH,
  announcementPath,
  initialAnnouncementFormState,
  isAnnouncementAudience,
  isAnnouncementLocale,
  isAnnouncementPlatform,
  isPlatformAudience,
  withOutcome,
  type AnnouncementAudienceValue,
  type AnnouncementFormState,
  type AnnouncementLocaleValue,
  type AnnouncementPlatformValue,
} from '@/components/announcements/contract'
import { fromLocalInput } from '@/components/announcements/datetime'
import { MIN_REASON_LENGTH, runAdminAction, type AdminActionSpec } from '@/lib/admin-action'
import { writeAudit } from '@/lib/audit'
import { assertPermissionAtSource, requirePermissionAction, type AdminSession } from '@/lib/auth'
import { insertRow, resolveAdminById, updateRows, type AnnouncementTableRow } from '@/lib/db'
import {
  announcementFailureMessage,
  announcementMessages,
  type AnnouncementOutcome,
} from '@/lib/messages/announcements'
import { MAX_REASON_LENGTH } from '@/lib/permissions'
import { estimateReach, loadAnnouncement } from '@/lib/queries/announcements'
import { adminBucket, assertRateLimit } from '@/lib/rate-limit'

/**
 * The four privileged operations of the announcements area.
 *
 * ---------------------------------------------------------------------------
 * WHICH ONES GO THROUGH `runAdminAction`, AND WHY THE OTHERS CANNOT
 * ---------------------------------------------------------------------------
 *
 * Publishing goes through `runAdminAction`. It is the moment a notice reaches
 * users, migration 0019 seeded `announcement.published` into
 * `admin_sensitive_actions` with `requires_reason = true`, and the runner
 * refuses to run the operation until a written reason has arrived, checks the
 * permission against `admin_role_permissions` rather than against the rendered
 * menu, and writes the audit row itself on both the success and the failure
 * path.
 *
 * The other three cannot use it, and the reason is structural rather than a
 * preference: `AdminActionSpec.action` is typed `AdminAuditAction`, a closed
 * union of the twenty-six names 0019 seeded, and `announcement.published` is
 * the only announcement name in it. Widening that union means editing
 * `@/lib/db`, `@/lib/permissions` and the migration's seed together — a change
 * this module does not own. So they follow the precedent
 * `@/lib/actions/tickets.ts` already set: a local runner that borrows every
 * guarantee rather than reimplementing one.
 *
 *   - `requirePermissionAction` (auth.ts) — session, same-origin and CSRF, then
 *     the permission decision;
 *   - `assertPermissionAtSource` (auth.ts) — the same question asked of the
 *     database at the moment of acting, so a role changed while the operator
 *     had the page open takes effect on this click;
 *   - `assertRateLimit` (rate-limit.ts) — counted atomically in Postgres;
 *   - `writeAudit` (audit.ts) — the one call site for an audit row.
 *
 * `admin.announcement_unpublished` sits in the `admin.` namespace on purpose.
 * `audit_logs_enforce_accountability()` treats every action in that namespace
 * as sensitive and refuses the insert unless it names an acting admin and
 * carries a written reason — so taking a live notice down is accountable by the
 * database's rule, not by this file remembering to be. Creating and editing a
 * draft are `announcement.created` / `announcement.updated`, outside that
 * namespace, because a draft reaches nobody: the row names who did it and when,
 * and demanding a paragraph before a title can be corrected would buy nothing.
 *
 * ---------------------------------------------------------------------------
 * A PUBLISHED ANNOUNCEMENT IS NOT EDITABLE, AND THAT IS ENFORCED IN THE WRITE
 * ---------------------------------------------------------------------------
 *
 * Changing the text of a live notice would mean the sentence users are reading
 * is not the sentence anybody wrote a reason for. So the edit path's `UPDATE`
 * carries `published_at is null` in its own filter: a published row matches no
 * rows and the operation fails as a conflict. That is a condition in the
 * statement rather than an `if` above it, which is what makes it hold against a
 * publish that landed while the form was open.
 *
 * ---------------------------------------------------------------------------
 * WHAT TRAVELS
 * ---------------------------------------------------------------------------
 *
 * A uuid, members of three Postgres enums, a dotted version number, two
 * instants, a boolean, and company-authored announcement text bounded by this
 * module's own ceilings. The audit rows carry identifiers and counts only — the
 * announcement's title and body are in `announcements`, where the next operator
 * reads them, and never in `audit_logs.metadata`.
 */

// ===========================================================================
// Bounds
// ===========================================================================

/**
 * Draft writes per operator.
 *
 * Not `RATE_LIMITS.destructive`: saving a draft destroys nothing, and an
 * editor iterating on wording legitimately saves many times in a sitting. What
 * this stops is a script. The scope matches `admin_rate_limits_scope_shape`.
 */
const DRAFT_WRITE_LIMIT = {
  scope: 'admin.announcement_write',
  limit: 120,
  windowSeconds: 60 * 60,
} as const

/**
 * Publishing and unpublishing are decisions, and share the destructive budget
 * every other irreversible console action is held to.
 *
 * The same rule twice, because the two runners spell a window differently:
 * `runAdminAction` takes a Postgres interval and `assertRateLimit` takes
 * seconds. Both name the same scope, so they count into the same bucket — a
 * publish and an unpublish cannot each get thirty.
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
 * `@/components/announcements/contract` declares them for the dialog, which is
 * a Client Component and cannot import a `server-only` module. These two
 * assignments are how the two declarations are kept honest: if the console's
 * floor in `@/lib/admin-action` or the ceiling `writeAudit` slices to ever
 * moves, this file stops compiling instead of leaving a form that accepts
 * reasons the server refuses.
 */
const REASON_MIN = ANNOUNCEMENT_REASON_MIN
const REASON_MAX = ANNOUNCEMENT_REASON_MAX

const _floorMatchesTheRunner: typeof REASON_MIN = MIN_REASON_LENGTH
const _ceilingMatchesTheTrail: typeof REASON_MAX = MAX_REASON_LENGTH

// ===========================================================================
// Input
// ===========================================================================

const audienceSchema = z.custom<AnnouncementAudienceValue>(
  (value) => typeof value === 'string' && isAnnouncementAudience(value),
  { message: announcementMessages.form.unknownAudience },
)

const platformSchema = z.custom<AnnouncementPlatformValue>(
  (value) => typeof value === 'string' && isAnnouncementPlatform(value),
  { message: announcementMessages.form.unknownPlatform },
)

const localeSchema = z.custom<AnnouncementLocaleValue>(
  (value) => typeof value === 'string' && isAnnouncementLocale(value),
  { message: announcementMessages.form.unknownLocale },
)

const reasonSchema = z
  .string()
  .trim()
  .min(REASON_MIN, { message: `Gerekçe en az ${REASON_MIN} karakter olmalıdır.` })
  .max(REASON_MAX, { message: `Gerekçe en fazla ${REASON_MAX} karakter olabilir.` })

const draftSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, { message: announcementMessages.form.titleRequired })
      .max(TITLE_MAX_LENGTH, {
        message: announcementMessages.form.titleTooLong(TITLE_MAX_LENGTH),
      }),
    body: z
      .string()
      .trim()
      .min(1, { message: announcementMessages.form.bodyRequired })
      .max(BODY_MAX_LENGTH, { message: announcementMessages.form.bodyTooLong(BODY_MAX_LENGTH) }),
    audience: audienceSchema,
    platforms: z.array(platformSchema).max(ANNOUNCEMENT_PLATFORMS.length),
    locale: localeSchema,
    minAppVersion: z
      .string()
      .trim()
      .regex(MIN_VERSION_PATTERN, { message: announcementMessages.form.minVersionShape })
      .nullable(),
    startsAt: isoInstantSchema,
    endsAt: isoInstantSchema.nullable(),
    dismissible: z.boolean(),
  })
  .superRefine((value, ctx) => {
    // `announcements_one_platform_filter` refuses a row that filters by
    // platform twice. Refused here as a field error so the operator sees which
    // control to change, and refused again by Postgres if it ever gets past.
    if (isPlatformAudience(value.audience) && value.platforms.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['platforms'],
        message: announcementMessages.form.platformConflict,
      })
    }
    // `announcements_window_ordered`, mirrored for the same reason.
    if (value.endsAt !== null && Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: announcementMessages.form.endsBeforeStart,
      })
    }
  })

type DraftInput = z.infer<typeof draftSchema>

const publishSchema = z.object({
  announcementId: uuidSchema,
  reason: reasonSchema,
})

type PublishInput = z.infer<typeof publishSchema>

// ===========================================================================
// Reading the form
// ===========================================================================

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim()
}

/** A field that is meaningful when absent: an empty version is "no floor". */
function optionalField(formData: FormData, name: string): string | null {
  const value = field(formData, name)
  return value === '' ? null : value
}

interface RawDraft {
  values: Record<string, unknown>
  /** Field-level problems found before the schema ran — bad wall-clock times. */
  issues: Record<string, string>
}

/**
 * The posted form, converted into the shape the schema validates.
 *
 * The two window fields arrive as Europe/Istanbul wall-clock readings and leave
 * as instants; a reading that is not a moment (`2026-02-30T09:00`) becomes a
 * field issue here rather than a silently corrected date.
 */
function readDraft(formData: FormData, now: Date): RawDraft {
  const issues: Record<string, string> = {}

  const startsRaw = field(formData, ANNOUNCEMENT_FIELDS.startsAt)
  // An empty start means "from now", which is also the column's own default.
  const startsAt = startsRaw === '' ? now : fromLocalInput(startsRaw)
  if (startsAt === null)
    issues[ANNOUNCEMENT_FIELDS.startsAt] = announcementMessages.form.startsInvalid

  const endsRaw = field(formData, ANNOUNCEMENT_FIELDS.endsAt)
  const endsAt = endsRaw === '' ? null : fromLocalInput(endsRaw)
  if (endsRaw !== '' && endsAt === null) {
    issues[ANNOUNCEMENT_FIELDS.endsAt] = announcementMessages.form.endsInvalid
  }

  return {
    values: {
      title: String(formData.get(ANNOUNCEMENT_FIELDS.title) ?? ''),
      body: String(formData.get(ANNOUNCEMENT_FIELDS.body) ?? ''),
      audience: field(formData, ANNOUNCEMENT_FIELDS.audience),
      platforms: formData.getAll(ANNOUNCEMENT_FIELDS.platform).map((value) => String(value)),
      locale: field(formData, ANNOUNCEMENT_FIELDS.locale),
      minAppVersion: optionalField(formData, ANNOUNCEMENT_FIELDS.minVersion),
      startsAt: (startsAt ?? now).toISOString(),
      endsAt: endsAt === null ? null : endsAt.toISOString(),
      // An unchecked checkbox posts nothing at all, which is the `false`.
      dismissible: formData.get(ANNOUNCEMENT_FIELDS.dismissible) !== null,
    },
    issues,
  }
}

/** The values an insert or an update writes. Shared, so the two cannot drift. */
function draftColumns(input: DraftInput): Partial<AnnouncementTableRow> {
  return {
    title: input.title,
    body: input.body,
    audience: input.audience,
    platforms: [...input.platforms],
    min_app_version: input.minAppVersion,
    locale: input.locale,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    dismissible: input.dismissible,
  }
}

// ===========================================================================
// Form results
// ===========================================================================

function formFailure(message: string): AnnouncementFormState {
  return { ...initialAnnouncementFormState, status: 'error', message }
}

function formIssues(
  issues: Readonly<Record<string, string>>,
  message: string | null = null,
): AnnouncementFormState {
  return { ...initialAnnouncementFormState, status: 'error', message, issues }
}

/** Zod paths are dotted; `platforms.1` belongs under the `platform` control. */
function issueField(path: string): string | null {
  const head = path.split('.')[0] ?? ''
  switch (head) {
    case 'title':
      return ANNOUNCEMENT_FIELDS.title
    case 'body':
      return ANNOUNCEMENT_FIELDS.body
    case 'audience':
      return ANNOUNCEMENT_FIELDS.audience
    case 'platforms':
      return ANNOUNCEMENT_FIELDS.platform
    case 'locale':
      return ANNOUNCEMENT_FIELDS.locale
    case 'minAppVersion':
      return ANNOUNCEMENT_FIELDS.minVersion
    case 'startsAt':
      return ANNOUNCEMENT_FIELDS.startsAt
    case 'endsAt':
      return ANNOUNCEMENT_FIELDS.endsAt
    case 'dismissible':
      return ANNOUNCEMENT_FIELDS.dismissible
    default:
      return null
  }
}

function fromZodError(error: z.ZodError): AnnouncementFormState {
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
      (Object.keys(issues).length === 0 ? announcementFailureMessage('validation_failed') : null),
  )
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
async function authoriseWrite(formData: FormData): Promise<AdminSession> {
  const session = await requirePermissionAction('announcement.write', formData)
  await assertRateLimit(DRAFT_WRITE_LIMIT, adminBucket(session.adminUserId))
  await assertPermissionAtSource(session, 'announcement.write')
  return session
}

/** A domain error code, as the sentence the banner will render. */
function outcomeForCode(code: ErrorCode): AnnouncementOutcome {
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

function failureOutcome(error: unknown): AnnouncementOutcome {
  return isAppError(error) ? outcomeForCode(error.code) : 'failed'
}

function failureState(error: unknown): AnnouncementFormState {
  if (isAppError(error)) return formFailure(announcementFailureMessage(error.code))
  return formFailure(announcementFailureMessage('unknown'))
}

// ===========================================================================
// 1. Create a draft
// ===========================================================================

/**
 * Create an announcement, always as a draft.
 *
 * There is no "create and publish": `published_at` and `published_by` are left
 * null here whatever the form said, so the row reaches nobody until somebody
 * makes that decision separately and writes a reason for it.
 */
export async function createAnnouncementAction(
  _previous: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  let session: AdminSession
  try {
    session = await authoriseWrite(formData)
  } catch (error) {
    return failureState(error)
  }

  const now = systemClock.now()
  const raw = readDraft(formData, now)
  if (Object.keys(raw.issues).length > 0) return formIssues(raw.issues)

  const parsed = draftSchema.safeParse(raw.values)
  if (!parsed.success) return fromZodError(parsed.error)

  let created: { id: string }
  try {
    created = await insertRow(
      'announcements',
      {
        ...draftColumns(parsed.data),
        created_by: session.adminUserId,
        published_at: null,
        published_by: null,
      },
      ['id'],
    )
  } catch (error) {
    return failureState(error)
  }

  // The trail is written after the effect, so it records what happened rather
  // than what was attempted. A draft reaches nobody, so a failed trail here is
  // reported to the operator rather than treated as a live change with no
  // record — but it is still reported, never swallowed.
  const audited = await tryAudit({
    adminUserId: session.adminUserId,
    action: 'announcement.created',
    announcementId: created.id,
    reason: null,
    detail: auditDetail(parsed.data),
  })

  revalidatePath(ANNOUNCEMENTS_PATH)
  revalidatePath(announcementPath(created.id))
  redirect(withOutcome(announcementPath(created.id), audited ? 'created' : 'auditMissing'))
}

// ===========================================================================
// 2. Edit a draft
// ===========================================================================

export async function updateAnnouncementAction(
  _previous: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  const announcementId = field(formData, ANNOUNCEMENT_FIELDS.announcementId)
  if (!uuidSchema.safeParse(announcementId).success) {
    return formFailure(announcementFailureMessage('not_found'))
  }

  let session: AdminSession
  try {
    session = await authoriseWrite(formData)
  } catch (error) {
    return failureState(error)
  }

  const now = systemClock.now()
  const raw = readDraft(formData, now)
  if (Object.keys(raw.issues).length > 0) return formIssues(raw.issues)

  const parsed = draftSchema.safeParse(raw.values)
  if (!parsed.success) return fromZodError(parsed.error)

  try {
    // `published_at is null` is part of the statement, not a check above it: a
    // notice that went live while this form was open matches no rows, and the
    // operator is told the record changed instead of quietly rewriting what
    // people are already reading.
    const updated = await updateRows(
      'announcements',
      draftColumns(parsed.data),
      [
        { column: 'id', op: 'eq', value: announcementId },
        { column: 'published_at', op: 'is', value: null },
      ],
      ['id'],
    )
    if (updated.length === 0) {
      const existing = await loadAnnouncement(announcementId)
      if (existing === null) return formFailure(announcementFailureMessage('not_found'))
      return formFailure(announcementMessages.form.lockedBody)
    }
  } catch (error) {
    return failureState(error)
  }

  const audited = await tryAudit({
    adminUserId: session.adminUserId,
    action: 'announcement.updated',
    announcementId,
    reason: null,
    detail: auditDetail(parsed.data),
  })

  revalidatePath(ANNOUNCEMENTS_PATH)
  revalidatePath(announcementPath(announcementId))
  redirect(withOutcome(announcementPath(announcementId), audited ? 'saved' : 'auditMissing'))
}

// ===========================================================================
// 3. Publish
// ===========================================================================

interface PublishResult {
  audience: AnnouncementAudienceValue
  platforms: readonly AnnouncementPlatformValue[]
  locale: string
  minAppVersion: string | null
  startsAt: string
  endsAt: string | null
  dismissible: boolean
  /** What the targeting resolved to when the button was pressed, or null. */
  estimatedReach: number | null
}

const publishSpec: AdminActionSpec<PublishInput, PublishResult> = {
  action: 'announcement.published',
  permission: 'announcement.write',
  input: publishSchema,
  rateLimit: DECISION_RATE_LIMIT,
  entityType: ANNOUNCEMENT_ENTITY_TYPE,
  subject: (input) => ({ entityId: input.announcementId }),
  detail: (_input, result) => ({
    audience: result.audience,
    // Hyphen-joined rather than comma-joined: `bo_identifier()` and its
    // TypeScript twin collapse anything that is not token-shaped, and a comma
    // is not in that shape. A detail key that reads `unstructured` is a detail
    // key that told nobody anything.
    platforms: result.platforms.length === 0 ? 'all' : result.platforms.join('-'),
    locale: result.locale,
    min_app_version: result.minAppVersion,
    starts_at: result.startsAt,
    ends_at: result.endsAt,
    dismissible: result.dismissible,
    estimated_reach: result.estimatedReach,
  }),
  run: async (context, input) => {
    const row = await loadAnnouncement(input.announcementId)
    if (row === null) {
      throw new AppError('not_found', {
        status: 404,
        detail: `no announcement ${input.announcementId}`,
      })
    }

    // The estimate the operator was shown is recomputed here so the number in
    // the trail is the number that was true at the moment of publishing, not
    // the one that was true when the page rendered. It is best effort: a count
    // that cannot be taken must not stop a publish that was authorised, so the
    // trail records `null` and says so rather than inventing a figure.
    const estimatedReach = await estimateReach(
      {
        audience: row.audience,
        platforms: row.platforms,
        locale: row.locale,
        minAppVersion: row.min_app_version,
      },
      context.clock,
    )
      .then((reach) => reach.targeted)
      .catch(() => null)

    const updated = await updateRows(
      'announcements',
      { published_at: context.now.toISOString(), published_by: context.actor.adminUserId },
      [
        { column: 'id', op: 'eq', value: input.announcementId },
        // Losing this race is the correct outcome: a second publish would
        // rewrite who published and when, over a notice already on screens.
        { column: 'published_at', op: 'is', value: null },
      ],
      ['id'],
    )
    if (updated.length === 0) {
      throw new AppError('sync_conflict', {
        status: 409,
        detail: `announcement ${input.announcementId} was already published`,
      })
    }

    return {
      audience: row.audience,
      platforms: row.platforms,
      locale: row.locale,
      minAppVersion: row.min_app_version,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      dismissible: row.dismissible,
      estimatedReach,
    }
  },
}

export async function publishAnnouncementAction(formData: FormData): Promise<void> {
  const announcementId = field(formData, ANNOUNCEMENT_FIELDS.announcementId)

  let session: AdminSession
  try {
    // The route gate. The specific permission is checked again by
    // `runAdminAction`, which audits the refusal — an operator reaching for a
    // publish they may not make leaves a `failure` row on the announcement they
    // aimed it at, which is exactly what the trail is for.
    session = await requirePermissionAction('announcement.write', formData)
  } catch {
    finish(announcementId, 'forbidden')
  }

  const actor = await resolveAdminById(session.adminUserId, session.sessionId).catch(() => null)
  if (actor === null) finish(announcementId, 'forbidden')

  const result = await runAdminAction(actor, publishSpec, {
    announcementId,
    reason: String(formData.get(ANNOUNCEMENT_FIELDS.reason) ?? ''),
  })

  if (result.status === 'success') finish(announcementId, 'published')
  if (result.status === 'denied') finish(announcementId, 'forbidden')
  if (result.status === 'invalid') finish(announcementId, 'invalid')
  if (result.status === 'rate_limited') finish(announcementId, 'ratelimited')
  if (result.effectApplied && !result.auditWritten) finish(announcementId, 'auditMissing')
  finish(announcementId, outcomeForCode(result.code))
}

// ===========================================================================
// 4. Unpublish
// ===========================================================================

export async function unpublishAnnouncementAction(formData: FormData): Promise<void> {
  const announcementId = field(formData, ANNOUNCEMENT_FIELDS.announcementId)
  const outcome = await unpublish(announcementId, formData)
  finish(announcementId, outcome)
}

async function unpublish(announcementId: string, formData: FormData): Promise<AnnouncementOutcome> {
  if (!uuidSchema.safeParse(announcementId).success) return 'invalid'

  let session: AdminSession
  try {
    session = await requirePermissionAction('announcement.write', formData)
  } catch {
    return 'forbidden'
  }

  try {
    await assertRateLimit(DECISION_BUCKET_LIMIT, adminBucket(session.adminUserId))
    await assertPermissionAtSource(session, 'announcement.write')
  } catch (error) {
    return failureOutcome(error)
  }

  const reason = reasonSchema.safeParse(String(formData.get(ANNOUNCEMENT_FIELDS.reason) ?? ''))
  if (!reason.success) return 'invalid'

  let row: AnnouncementTableRow | null
  try {
    row = await loadAnnouncement(announcementId)
  } catch (error) {
    return failureOutcome(error)
  }
  if (row === null) return 'notfound'

  try {
    // Both columns move together: `announcements_published_needs_admin` is a
    // check constraint requiring `(published_at is null) = (published_by is
    // null)`, so a half-cleared row is refused by Postgres rather than left.
    const updated = await updateRows(
      'announcements',
      { published_at: null, published_by: null },
      [
        { column: 'id', op: 'eq', value: announcementId },
        { column: 'published_at', op: 'is_not', value: null },
      ],
      ['id'],
    )
    if (updated.length === 0) return 'conflict'
  } catch (error) {
    // A refusal inside the write is still an attempt on a sensitive action, so
    // it leaves a trail.
    await tryAudit({
      adminUserId: session.adminUserId,
      action: 'admin.announcement_unpublished',
      announcementId,
      reason: reason.data,
      outcome: 'failure',
      detail: { failure_code: isAppError(error) ? error.code : 'unknown' },
    })
    return failureOutcome(error)
  }

  const audited = await tryAudit({
    adminUserId: session.adminUserId,
    action: 'admin.announcement_unpublished',
    announcementId,
    reason: reason.data,
    detail: {
      audience: row.audience,
      platforms: row.platforms.length === 0 ? 'all' : row.platforms.join('-'),
      locale: row.locale,
      was_published_at: row.published_at,
    },
  })

  // The change happened. If the trail did not land the operator is told so
  // plainly rather than reassured: an unrecorded decision about what users see
  // cannot be explained six months later.
  return audited ? 'unpublished' : 'auditMissing'
}

// ===========================================================================
// The trail
// ===========================================================================

interface AuditAttempt {
  adminUserId: string
  action: string
  announcementId: string
  reason: string | null
  outcome?: 'success' | 'failure'
  detail: Record<string, string | number | boolean | null>
}

/**
 * Write one audit row, reporting whether it landed instead of throwing.
 *
 * The caller's answer differs by operation — a failed trail on a draft save is
 * a warning, a failed trail on an unpublish is a hole in the record — so the
 * decision belongs to them and not to this helper.
 */
async function tryAudit(attempt: AuditAttempt): Promise<boolean> {
  try {
    await writeAudit({
      actor: { adminUserId: attempt.adminUserId },
      action: attempt.action,
      // An announcement is about a cohort, never about one person. Naming a
      // subject user here would be both wrong and a privacy regression.
      subjectUserId: null,
      entityType: ANNOUNCEMENT_ENTITY_TYPE,
      entityId: attempt.announcementId,
      reason: attempt.reason,
      outcome: attempt.outcome ?? 'success',
      detail: attempt.detail,
    })
    return true
  } catch {
    return false
  }
}

/** Identifiers, enum members and counts. Never the announcement's own text. */
function auditDetail(input: DraftInput): Record<string, string | number | boolean | null> {
  return {
    audience: input.audience,
    platforms: input.platforms.length === 0 ? 'all' : input.platforms.join('-'),
    locale: input.locale,
    min_app_version: input.minAppVersion,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    dismissible: input.dismissible,
    title_length: input.title.length,
    body_length: input.body.length,
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
function finish(announcementId: string, outcome: AnnouncementOutcome): never {
  revalidatePath(ANNOUNCEMENTS_PATH)
  if (uuidSchema.safeParse(announcementId).success) {
    revalidatePath(announcementPath(announcementId))
    redirect(withOutcome(announcementPath(announcementId), outcome))
  }
  redirect(withOutcome(ANNOUNCEMENTS_PATH, outcome))
}
