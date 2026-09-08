/**
 * The wire contract between the announcements routes, their forms and their
 * Server Actions.
 *
 * A `'use server'` module may export nothing but async functions, and a client
 * form cannot import from one without dragging the action's module graph — and
 * with it `@/lib/db` and the service-role key — across the client boundary. So
 * every name both sides have to agree on lives here, in a plain module with no
 * imports at all: route paths, query parameters, form field names, the
 * vocabulary the enums use, the bounds a field is held to, and the tokens an
 * action reports back.
 *
 * The three enum vocabularies below mirror the Postgres types
 * `announcement_audience`, `app_platform` and `app_locale` from migrations 0001
 * and 0019. They are re-declared rather than imported because `@/lib/db` is
 * `server-only`; `@/lib/queries/announcements.ts` carries a compile-time proof
 * that the two declarations still name the same members, so a member added to
 * the database without being added here fails `tsc`.
 */

// ===========================================================================
// Routes
// ===========================================================================

export const ANNOUNCEMENTS_PATH = '/announcements'
export const ANNOUNCEMENT_NEW_PATH = '/announcements/new'

export function announcementPath(id: string): string {
  return `${ANNOUNCEMENTS_PATH}/${id}`
}

// ===========================================================================
// The database's vocabulary
// ===========================================================================

/** `announcement_audience`, in declaration order. */
export const ANNOUNCEMENT_AUDIENCES = ['all', 'free', 'pro', 'ios', 'android'] as const
export type AnnouncementAudienceValue = (typeof ANNOUNCEMENT_AUDIENCES)[number]

/**
 * The two audiences that are themselves a platform filter.
 *
 * `announcements_one_platform_filter` refuses a row that carries both, because
 * two overlapping platform filters is how a notice reaches nobody.
 */
export const PLATFORM_AUDIENCES = ['ios', 'android'] as const
export type PlatformAudience = (typeof PLATFORM_AUDIENCES)[number]

export function isPlatformAudience(value: string): value is PlatformAudience {
  return (PLATFORM_AUDIENCES as readonly string[]).includes(value)
}

/** `app_platform`, in declaration order. */
export const ANNOUNCEMENT_PLATFORMS = ['ios', 'android', 'web'] as const
export type AnnouncementPlatformValue = (typeof ANNOUNCEMENT_PLATFORMS)[number]

/**
 * The platforms a device registration can name.
 *
 * `push_tokens.platform` is constrained to these two, so they are the only
 * platforms the reach estimate can count. A `web` target is real targeting the
 * console cannot size, and the estimate says so rather than reporting zero.
 */
export const DEVICE_PLATFORMS = ['ios', 'android'] as const
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number]

export function isDevicePlatform(value: string): value is DevicePlatform {
  return (DEVICE_PLATFORMS as readonly string[]).includes(value)
}

/** `app_locale`. */
export const ANNOUNCEMENT_LOCALES = ['tr', 'en'] as const
export type AnnouncementLocaleValue = (typeof ANNOUNCEMENT_LOCALES)[number]

export function isAnnouncementAudience(value: string): value is AnnouncementAudienceValue {
  return (ANNOUNCEMENT_AUDIENCES as readonly string[]).includes(value)
}

export function isAnnouncementPlatform(value: string): value is AnnouncementPlatformValue {
  return (ANNOUNCEMENT_PLATFORMS as readonly string[]).includes(value)
}

export function isAnnouncementLocale(value: string): value is AnnouncementLocaleValue {
  return (ANNOUNCEMENT_LOCALES as readonly string[]).includes(value)
}

// ===========================================================================
// Bounds
//
// The database constrains the title and the body only to "not blank". These are
// the console's own ceilings, chosen for the surface the notice is rendered on:
// a phone banner with a three-line title is a phone banner nobody reads.
// ===========================================================================

export const TITLE_MAX_LENGTH = 120
export const BODY_MAX_LENGTH = 1000

/**
 * The written justification a publish or an unpublish demands.
 *
 * Ten is the console's floor, declared in `MIN_REASON_LENGTH` in
 * `@/lib/admin-action`; 280 is the ceiling `writeAudit` slices to. Both are
 * restated here because a Client Component cannot import a `server-only`
 * module, and `@/lib/actions/announcements.ts` carries a compile-time proof
 * that the two declarations still agree — so a change to the console's floor
 * fails `tsc` here rather than silently leaving a dialog that accepts reasons
 * the server will refuse.
 */
export const ANNOUNCEMENT_REASON_MIN = 10
export const ANNOUNCEMENT_REASON_MAX = 280

/** `announcements_min_version_shape`, mirrored so a typo is a field error. */
export const MIN_VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/

export function isMinVersionShape(value: string): boolean {
  return MIN_VERSION_PATTERN.test(value)
}

// ===========================================================================
// The list's query string
// ===========================================================================

export const ANNOUNCEMENT_PARAMS = {
  state: 'state',
  audience: 'audience',
  locale: 'locale',
  dismissible: 'dismissible',
  search: 'q',
} as const

export const ANNOUNCEMENT_RESULT_PARAMS = {
  outcome: 'outcome',
} as const

/** The five list filters, each one predicate set the database can answer. */
export const ANNOUNCEMENT_STATE_FILTERS = [
  'draft',
  'scheduled',
  'live',
  'open_ended',
  'ended',
] as const
export type AnnouncementStateFilter = (typeof ANNOUNCEMENT_STATE_FILTERS)[number]

export const DISMISSIBLE_FILTERS = ['yes', 'no'] as const
export type DismissibleFilter = (typeof DISMISSIBLE_FILTERS)[number]

/** Columns the list may be ordered by. Every one is a real table column. */
export const ANNOUNCEMENT_SORT_KEYS = [
  'title',
  'audience',
  'locale',
  'starts_at',
  'ends_at',
  'published_at',
  'created_at',
  'updated_at',
] as const
export type AnnouncementSortKey = (typeof ANNOUNCEMENT_SORT_KEYS)[number]

export const ANNOUNCEMENT_PAGE_SIZE = 25
export const ANNOUNCEMENT_PAGE_SIZES: readonly number[] = [25, 50, 100]

/** `entity_type` on every audit row this module writes. */
export const ANNOUNCEMENT_ENTITY_TYPE = 'announcement'

/** How many audit rows the detail page's trail shows. */
export const ANNOUNCEMENT_TRAIL_LIMIT = 20

// ===========================================================================
// Form fields
// ===========================================================================

export const ANNOUNCEMENT_FIELDS = {
  announcementId: 'announcementId',
  title: 'title',
  body: 'body',
  audience: 'audience',
  platform: 'platform',
  locale: 'locale',
  minVersion: 'minVersion',
  startsAt: 'startsAt',
  endsAt: 'endsAt',
  dismissible: 'dismissible',
  reason: 'reason',
} as const

/**
 * What a create or edit submission hands back.
 *
 * A state rather than a redirect: the form has nine fields, and an operator who
 * mistyped a version number should not lose the paragraph they just wrote.
 */
export interface AnnouncementFormState {
  status: 'idle' | 'error' | 'success'
  /** A form-level sentence, when the failure is not about one field. */
  message: string | null
  /** Field name → the message to render under that control. */
  issues: Readonly<Record<string, string>>
  /** Set on success, so the form can send the operator to the record. */
  announcementId: string | null
}

export const initialAnnouncementFormState: AnnouncementFormState = Object.freeze({
  status: 'idle',
  message: null,
  issues: {},
  announcementId: null,
})

// ===========================================================================
// The draft an editor is holding
//
// The shape both the form and the preview read. It is deliberately not the
// database row: the form works in `datetime-local` strings and a platform
// array, and the row works in ISO instants and a Postgres array.
// ===========================================================================

export interface AnnouncementDraft {
  title: string
  body: string
  audience: AnnouncementAudienceValue
  platforms: readonly AnnouncementPlatformValue[]
  locale: AnnouncementLocaleValue
  minAppVersion: string
  /** `YYYY-MM-DDTHH:mm`, in Europe/Istanbul, as `datetime-local` spells it. */
  startsAtLocal: string
  endsAtLocal: string
  dismissible: boolean
}

// ===========================================================================
// Targeting
// ===========================================================================

/** The dimensions a notice is narrowed by, and what the reach estimate reads. */
export interface AnnouncementTargeting {
  audience: AnnouncementAudienceValue
  platforms: readonly AnnouncementPlatformValue[]
  locale: string
  minAppVersion: string | null
}

/**
 * The platforms the targeting actually narrows by.
 *
 * The `ios` and `android` audiences *are* a platform filter — the
 * `announcements_one_platform_filter` constraint refuses a row that carries
 * both kinds — so they resolve here to the same thing an explicit `platforms`
 * array would. Written once, because a preview that read the audience and an
 * estimate that read only the array would disagree about who a notice reaches,
 * and the estimate is the number the publish dialog states.
 */
export function targetedPlatforms(
  targeting: AnnouncementTargeting,
): readonly AnnouncementPlatformValue[] {
  if (targeting.audience === 'ios') return ['ios']
  if (targeting.audience === 'android') return ['android']
  return targeting.platforms
}

// ===========================================================================
// Result links
// ===========================================================================

export function withOutcome(path: string, outcome: string): string {
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}${ANNOUNCEMENT_RESULT_PARAMS.outcome}=${outcome}`
}
