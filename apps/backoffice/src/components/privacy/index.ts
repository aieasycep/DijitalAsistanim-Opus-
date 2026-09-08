/**
 * The privacy area's components.
 *
 * Server components by default. The three client ones — `RerunForm`,
 * `RefreshForm` and the `SubmitButton` they share — are client only because a
 * form that gives no feedback while it is in flight gets submitted twice, and a
 * duplicate here is a duplicate re-run order against somebody's mailbox. None of
 * them touches the database: they post to a Server Action, which is the only
 * code path in this area that can reach one.
 *
 * The Server Actions live beside the routes, in `app/(dash)/privacy/actions.ts`,
 * and are threaded into these components as props — a client module that
 * imported one directly would pull `@/lib/db` and the service-role key into its
 * bundle. For the same reason a client file imports `./contract` and
 * `./messages` directly rather than through this barrel, which also re-exports
 * the server components.
 */

export { DeadlineStats, type DeadlineStatsProps } from './DeadlineStats'
export {
  DeletionEventTable,
  DeletionMarkTable,
  DeletionSummary,
  type DeletionEventTableProps,
  type DeletionMarkTableProps,
  type DeletionSummaryProps,
} from './DeletionPanels'
export { FulfilmentPanel, type FulfilmentPanelProps } from './FulfilmentPanel'
export { Pager, type PagerProps } from './Pager'
export { RefreshForm, type RefreshFormProps } from './RefreshForm'
export { RequestTable, type RequestTableProps } from './RequestTable'
export { RerunForm, type RerunFormProps } from './RerunForm'
export { ResultBanner, type ResultBannerProps } from './ResultBanner'
export {
  RetentionTable,
  SweepRunTable,
  type RetentionTableProps,
  type SweepRunTableProps,
} from './RetentionPanels'
export { StatCell, type StatCellProps } from './StatCell'
export { StatusBreakdownTable, type StatusBreakdownTableProps } from './StatusBreakdownTable'
export { SubmitButton, type SubmitButtonProps } from './SubmitButton'
export { LoadingAnnouncement, PageSkeletonHeader, PanelSkeleton } from './Skeletons'

export {
  BOARD_SIZE,
  DEADLINE_BUCKETS,
  DEFAULT_PRIVACY_WINDOW,
  DELETION_EVENT_LIMIT,
  DELETION_MARK_LIMIT,
  DUE_SOON_DAYS,
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  OPEN_EXPORT_STATUSES,
  PRIVACY_PARAMS,
  PRIVACY_PATH,
  PRIVACY_RESULT_PARAMS,
  PRIVACY_RETENTION_PATH,
  PRIVACY_REQUESTS_PATH,
  PRIVACY_RETURN_PATHS,
  PRIVACY_WINDOW_DAYS,
  PRIVACY_WINDOW_KEYS,
  QUEUE_PARAMS,
  REFRESH_FIELDS,
  RERUNNABLE_EXPORT_STATUSES,
  RERUN_AUDIT_ACTION,
  RERUN_DEDUPE_MINUTES,
  RERUN_ENTITY_TYPE,
  RERUN_FIELDS,
  RERUN_OUTCOMES,
  REQUEST_PAGE_SIZE,
  STATUTORY_DAYS,
  STUCK_HOURS,
  SWEEP_GRACE_HOURS,
  SWEEP_INTERVAL_HOURS,
  SWEEP_RUN_LIMIT,
  isDeadlineBucket,
  isExportStatus,
  isOrderedOutcome,
  isPrivacyWindowKey,
  isRerunOutcome,
  isRerunnableStatus,
  userDetailHref,
  type DeadlineBucket,
  type PrivacyReturnPath,
  type PrivacyWindowKey,
  type RerunOutcome,
} from './contract'

export {
  daysToDeadline,
  deadlineBucketOf,
  deadlineTone,
  formatRemaining,
  isOpenRequest,
  isStuckRequest,
  requestRowTone,
} from './deadline'

export { DEADLINE_BUCKET_LABEL, RERUN_OUTCOME_MESSAGE, privacyMessages } from './messages'
