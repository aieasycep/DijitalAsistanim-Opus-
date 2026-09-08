/**
 * The wire contract between the ops routes, their forms and their Server
 * Action.
 *
 * A `'use server'` module may export nothing but async functions, and a client
 * form cannot import from one without pulling the action's module graph into
 * the bundle. So the names both sides have to agree on — form fields, query
 * parameters, allowed redirect targets — live here, in a plain module both can
 * import. Getting one of these strings wrong is then a type error rather than a
 * form that silently posts a field nobody reads.
 */

/** Routes in the ops area. Also the redirect allowlist for the resync action. */
export const OPS_PATH = '/ops'
export const OPS_QUEUE_PATH = '/ops/senkronizasyon'

export const OPS_RETURN_PATHS = [OPS_PATH, OPS_QUEUE_PATH] as const
export type OpsReturnPath = (typeof OPS_RETURN_PATHS)[number]

/** Fields the resync form posts. */
export const RESYNC_FIELDS = {
  accountId: 'hesapId',
  userId: 'kullaniciId',
  provider: 'saglayiciAdi',
  resource: 'kaynakAdi',
  reason: 'gerekce',
  returnTo: 'donus',
} as const

/** Fields the refresh form posts. */
export const REFRESH_FIELDS = {
  returnTo: 'donus',
} as const

/**
 * What the resync action reports back through the URL.
 *
 * Only a code and an id travel here — never a provider message. `sonucKodu`
 * carries an `ErrorCode` from `@da/domain` or one of the tokens below, all of
 * which are our own vocabulary rather than anything an upstream service wrote.
 */
export const OPS_RESULT_PARAMS = {
  outcome: 'sonuc',
  code: 'sonucKodu',
  account: 'sonucHesap',
} as const

export const RESYNC_OUTCOMES = [
  'success',
  'partial',
  'noop',
  'rejected',
  'unreachable',
  'failed',
  'invalid',
  'forbidden',
] as const

export type ResyncOutcome = (typeof RESYNC_OUTCOMES)[number]

export function isResyncOutcome(value: string): value is ResyncOutcome {
  return (RESYNC_OUTCOMES as readonly string[]).includes(value)
}

/** Outcomes that mean the sync actually ran. */
export function isSuccessfulOutcome(outcome: ResyncOutcome): boolean {
  return outcome === 'success' || outcome === 'partial'
}

/** Filters and paging on the sync queue page. */
export const QUEUE_PARAMS = {
  provider: 'saglayici',
  resource: 'kaynak',
  code: 'kod',
  page: 'sayfa',
} as const

/** How often the dashboard reloads itself, if the operator asks it to. */
export const AUTO_REFRESH_PARAM = 'yenile'

export const AUTO_REFRESH_OPTIONS = {
  kapali: 0,
  '1dk': 60,
  '5dk': 300,
} as const

export type AutoRefreshKey = keyof typeof AUTO_REFRESH_OPTIONS

export function isAutoRefreshKey(value: string): value is AutoRefreshKey {
  return Object.prototype.hasOwnProperty.call(AUTO_REFRESH_OPTIONS, value)
}

/** The audit action token the resync writes. Matches `bo_identifier`'s shape. */
export const RESYNC_AUDIT_ACTION = 'sync.resync_requested'

/**
 * Reason bounds, mirroring `isValidReason` in `@/lib/audit`.
 *
 * They are repeated here rather than imported because `@/lib/audit` is
 * `server-only` and the form that enforces them in the browser is a client
 * component. The server re-checks with the real function, so this pair is a
 * courtesy to the operator, never the actual gate.
 */
export const MIN_REASON_LENGTH = 3
export const MAX_REASON_LENGTH = 280

/** Rows per page in the sync queue, and rows on the dashboard's short list. */
export const QUEUE_PAGE_SIZE = 25
export const DASHBOARD_QUEUE_SIZE = 8
