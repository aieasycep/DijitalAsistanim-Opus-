/**
 * The operations area's components.
 *
 * Server components by default; the two client ones (`ResyncForm` and
 * `RefreshForm`, plus the `SubmitButton` they share) are client only because a
 * form that gives no feedback while it is in flight gets pressed twice. Neither
 * of them touches the database: they post to a Server Action, which is the only
 * code path in this area that can.
 *
 * The Server Actions themselves live beside the routes, in
 * `app/(dash)/ops/actions.ts`, and are threaded into these components as props.
 */

export { ActionResultBanner, type ActionResultBannerProps } from './ActionResultBanner'
export { AutoRefreshMeta } from './AutoRefreshMeta'
export { ErrorCodeTable, type ErrorCodeTableProps } from './ErrorCodeTable'
export { ErrorRateTable } from './ErrorRateTable'
export { FailingSyncTable, type FailingSyncTableProps } from './FailingSyncTable'
export { ProviderHealthTable } from './ProviderHealthTable'
export { RefreshForm } from './RefreshForm'
export { ResyncForm, type ResyncFormProps } from './ResyncForm'
export { SparkBar, type SparkBarProps } from './SparkBar'
export { SubmitButton, type SubmitButtonProps } from './SubmitButton'
export { ThroughputTable } from './ThroughputTable'

export {
  AUTO_REFRESH_OPTIONS,
  AUTO_REFRESH_PARAM,
  DASHBOARD_QUEUE_SIZE,
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  OPS_PATH,
  OPS_QUEUE_PATH,
  OPS_RESULT_PARAMS,
  OPS_RETURN_PATHS,
  QUEUE_PAGE_SIZE,
  QUEUE_PARAMS,
  REFRESH_FIELDS,
  RESYNC_AUDIT_ACTION,
  RESYNC_FIELDS,
  RESYNC_OUTCOMES,
  isAutoRefreshKey,
  isResyncOutcome,
  isSuccessfulOutcome,
  type AutoRefreshKey,
  type OpsReturnPath,
  type ResyncOutcome,
} from './contract'

export { opsMessages, type OpsMessages } from './messages'
