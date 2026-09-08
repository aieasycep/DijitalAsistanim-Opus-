/**
 * The approvals area's components.
 *
 * Server components by default. The three client ones — `ReviewForm`,
 * `RefreshForm` and the `SubmitButton` they share — are client only because a
 * form that gives no feedback while it is in flight gets submitted twice, and a
 * duplicate here is a duplicate audit row. None of them touches the database:
 * they post to a Server Action, which is the only code path in this area that
 * can reach one.
 *
 * The Server Actions themselves live beside the routes, in
 * `app/(dash)/approvals/actions.ts`, and are threaded into these components as
 * props — a client module that imported one directly would pull `@/lib/db` and
 * the service-role key into its graph.
 */

export { ActionTypeTable, type ActionTypeTableProps } from './ActionTypeTable'
export { FailedApprovalTable, type FailedApprovalTableProps } from './FailedApprovalTable'
export { FailureCodeTable, type FailureCodeTableProps } from './FailureCodeTable'
export { FunnelStats, type FunnelStatsProps } from './FunnelStats'
export { Pager, type PagerProps } from './Pager'
export { PendingQueueTable, type PendingQueueTableProps } from './PendingQueueTable'
export { RateBar, CountBar, type RateBarProps } from './RateBar'
export { RefreshForm, type RefreshFormProps } from './RefreshForm'
export { ResultBanner, type ResultBannerProps } from './ResultBanner'
export { ReviewForm, type ReviewFormProps } from './ReviewForm'
export { SubmitButton, type SubmitButtonProps } from './SubmitButton'
export { TimingPanel, type TimingPanelProps } from './TimingPanel'
export { TrendTable, type TrendTableProps } from './TrendTable'

export {
  APPROVALS_FAILURES_PATH,
  APPROVALS_PATH,
  APPROVAL_PARAMS,
  APPROVAL_RESULT_PARAMS,
  APPROVAL_RETURN_PATHS,
  APPROVAL_WINDOW_DAYS,
  APPROVAL_WINDOW_KEYS,
  DASHBOARD_CODE_LIMIT,
  DEFAULT_APPROVAL_WINDOW,
  FAILURE_CODE_LIMIT,
  FAILURE_PAGE_SIZE,
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  QUEUE_PREVIEW_SIZE,
  RATE_BASIS_POINTS,
  REFRESH_FIELDS,
  REVIEW_AUDIT_ACTIONS,
  REVIEW_ENTITY_TYPES,
  REVIEW_FIELDS,
  REVIEW_OUTCOMES,
  REVIEW_SCOPES,
  isApprovalActionType,
  isApprovalWindowKey,
  isFailureCode,
  isReviewOutcome,
  isReviewScope,
  isSourceType,
  userDetailHref,
  type ApprovalReturnPath,
  type ApprovalWindowKey,
  type ReviewOutcome,
  type ReviewScope,
} from './contract'

export {
  formatRate,
  formatRateDelta,
  rejectionRateTone,
  type RateDelta,
  type RateTone,
} from './format'
export {
  REVIEW_OUTCOME_MESSAGE,
  actionTypeLabels,
  approvalMessages,
  sourceTypeLabels,
} from './messages'
