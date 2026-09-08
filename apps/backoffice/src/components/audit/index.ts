/**
 * The audit area's public surface: what the two routes compose from.
 *
 * Server components import from here. A *client* component must import from the
 * leaf modules instead — this barrel also re-exports the server components,
 * which reach `@/lib/queries/audit` and through it the service-role client, so
 * a barrel import across the client boundary would drag that whole graph into
 * the browser bundle. `error.tsx` in this area does exactly that and imports
 * `./contract` and `./messages` directly, as does `@/lib/queries/audit`.
 */

export {
  ACTION_COUNT_LIMIT,
  ACTION_DISCOVERY_LIMIT,
  ACTOR_BUCKETS,
  AUDIT_ACTIONS_PATH,
  AUDIT_PATH,
  CANONICAL_ACTIONS,
  ENTRY_REVIEW_LIMIT,
  LOG_PAGE_SIZE,
  LOG_PARAMS,
  OUTCOME_BUCKETS,
  RESET_PARAMS,
  RESULT_PARAMS,
  buildScopeKey,
  decodeCursor,
  isActorBucket,
  isOutcomeBucket,
  isPageDirection,
  isReviewOutcome,
  isUuid,
  type ActorBucket,
  type AuditCursor,
  type OutcomeBucket,
  type PageDirection,
  type RangePreset,
  type ReviewOutcome,
} from './contract'

export { ACTOR_LABEL, OUTCOME_LABEL, actionLabel, auditMessages } from './messages'

export { dismissResultHref, withParams, type ParamValues } from './href'

export { AccessReceipt, type AccessReceiptProps } from './AccessReceipt'
export { AuditTable, type AuditTableProps } from './AuditTable'
export { AuditTabs, type AuditTabsProps } from './AuditTabs'
export {
  ActionBreakdownPanel,
  ActorBreakdownPanel,
  GroupBreakdownPanel,
  OutcomeBreakdownPanel,
  groupTotals,
} from './BreakdownTables'
export { KeysetPager, type KeysetPagerProps } from './KeysetPager'
export { RangePicker, type RangePickerProps, type RangePresetChoice } from './RangePicker'
export { RefreshForm, type RefreshFormProps } from './RefreshForm'
export { ResultBanner, type ResultBannerProps } from './ResultBanner'
export { RetentionPanel, type RetentionPanelProps } from './RetentionPanel'
export { ReviewPanel, type ReviewPanelProps } from './ReviewPanel'
export { SummaryTiles, type SummaryTilesProps } from './SummaryTiles'
export { LoadingAnnouncement, PageSkeletonHeader, PanelSkeleton, TableSkeleton } from './Skeletons'
