import { AUDIT_PATH, LOG_PARAMS, RESET_PARAMS, RESULT_PARAMS, encodeCursor } from './contract'
import type { AuditCursor, PageDirection } from './contract'

/**
 * URL building for the audit area.
 *
 * Every filter, every pager step and every drill-in from the breakdown is a
 * link to this same page with different parameters, so they all go through one
 * function. Values are carried forward unless an override replaces them, and an
 * override of `null` removes the parameter — that is how "clear this filter"
 * and "go back to the newest page" are expressed without hand-assembling query
 * strings in six places.
 */

export type ParamValues = Readonly<Record<string, string>>

export function withParams(
  path: string,
  current: ParamValues,
  overrides: Readonly<Record<string, string | null>> = {},
): string {
  const params = new URLSearchParams()
  const merged: Record<string, string | null> = { ...current, ...overrides }
  for (const [key, value] of Object.entries(merged)) {
    if (value !== null && value !== '') params.set(key, value)
  }
  const query = params.toString()
  return query === '' ? path : `${path}?${query}`
}

/** The same view with the pager and the open review panel cleared. */
function withoutPaging(overrides: Record<string, string | null>): Record<string, string | null> {
  const next = { ...overrides }
  for (const param of RESET_PARAMS) next[param] = null
  return next
}

/** A filter drill-in: set one parameter, drop the cursor, keep the range. */
export function filterHref(
  current: ParamValues,
  param: string,
  value: string | null,
  path: string = AUDIT_PATH,
): string {
  return withParams(path, current, withoutPaging({ [param]: value }))
}

/** The newest page of the current filter set. */
export function firstPageHref(current: ParamValues, path: string = AUDIT_PATH): string {
  return withParams(path, current, withoutPaging({}))
}

/** A keyset step in either direction. */
export function pageHref(
  current: ParamValues,
  cursor: AuditCursor,
  direction: PageDirection,
  path: string = AUDIT_PATH,
): string {
  return withParams(path, current, {
    [LOG_PARAMS.cursor]: encodeCursor(cursor),
    [LOG_PARAMS.direction]: direction,
    [LOG_PARAMS.review]: null,
  })
}

/** Opens (or closes) the review panel for one entry, keeping the page in place. */
export function reviewHref(
  current: ParamValues,
  auditId: string | null,
  path: string = AUDIT_PATH,
): string {
  return withParams(path, current, {
    [LOG_PARAMS.review]: auditId,
    [RESULT_PARAMS.outcome]: null,
    [RESULT_PARAMS.entry]: null,
  })
}

/** The same view with the action result banner dismissed. */
export function dismissResultHref(current: ParamValues, path: string = AUDIT_PATH): string {
  return withParams(path, current, {
    [RESULT_PARAMS.outcome]: null,
    [RESULT_PARAMS.entry]: null,
  })
}

/** The range keeps travelling when an operator moves between the two pages. */
export function crossPageHref(current: ParamValues, path: string): string {
  return withParams(path, current, withoutPaging({}))
}
