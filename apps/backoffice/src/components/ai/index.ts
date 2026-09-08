/**
 * The AI area's components.
 *
 * Server components by default. The three client ones — `QuotaReviewForm`,
 * `RefreshForm` and the `SubmitButton` they share — are client only because a
 * form that gives no feedback while it is in flight gets pressed twice, and a
 * second press here would write a second audit row. None of them touches the
 * database: they post to a Server Action, which is the only code path in this
 * area that can.
 *
 * The Server Actions live beside the routes, in `app/(dash)/ai/actions.ts`, and
 * are threaded into these components as props.
 *
 * Client files import from the leaf modules (`./contract`, `./messages`) rather
 * than from this barrel: the barrel also re-exports server components that
 * reach `@/lib/db`, and importing it across the client boundary would drag the
 * service-role key's module graph with it.
 */

export { AiTabs } from './AiTabs'
export { Bar, type BarProps } from './Bar'
export { BreakdownTable } from './BreakdownTable'
export {
  CapNote,
  CeilingTable,
  CeilingTiles,
  isNearCap,
  type CeilingTableProps,
} from './CeilingTable'
export { DailySpendTable } from './DailySpendTable'
export { Pager } from './Pager'
export {
  BriefingQualityTable,
  BriefingTrendTable,
  CaptureQualityTable,
  DraftQualityTable,
  DraftTrendTable,
  QualityTiles,
} from './QualityTables'
export { QuotaReviewForm, type QuotaReviewFormProps } from './QuotaReviewForm'
export { RefreshForm } from './RefreshForm'
export { ReviewResultBanner, type ReviewResultBannerProps } from './ReviewResultBanner'
export {
  LoadingAnnouncement,
  PageHeaderSkeleton,
  PanelSkeleton,
  TileGridSkeleton,
} from './Skeletons'
export { SpendTotalsTiles, SpenderTiles } from './SpendTiles'
export { SubmitButton, type SubmitButtonProps } from './SubmitButton'
export { TopSpenderTable } from './TopSpenderTable'
export { TriagePanel } from './TriagePanel'

export {
  AI_CEILING_PATH,
  AI_PARAMS,
  AI_PATH,
  AI_QUALITY_PATH,
  AI_RETURN_PATHS,
  CAP_CRITICAL_RATIO,
  CAP_WARNING_RATIO,
  CEILING_PAGE_SIZE,
  CEILING_SORTS,
  DAILY_EVENT_CAP,
  DAY_WINDOWS,
  DEFAULT_CEILING_SORT,
  DEFAULT_DAY_WINDOW,
  DEFAULT_SPEND_WINDOW,
  MAX_REASON_LENGTH,
  MIN_COST_OPTIONS,
  MIN_REASON_LENGTH,
  OPEN_RATE_CRITICAL_RATIO,
  OPEN_RATE_WARNING_RATIO,
  PRO_STATUSES,
  QUALITY_TREND_DAYS,
  QUOTA_DECISIONS,
  QUOTA_REVIEW_ACTION,
  QUOTA_REVIEW_ENTITY_TYPE,
  QUOTA_REVIEW_FIELDS,
  REFRESH_FIELDS,
  REJECTION_CRITICAL_RATIO,
  REJECTION_WARNING_RATIO,
  REVIEW_OUTCOMES,
  REVIEW_RESULT_PARAMS,
  SPEND_WINDOWS,
  TOP_SPENDER_LIMIT,
  capTierFor,
  isAiReturnPath,
  isCeilingSort,
  isDayWindowKey,
  isMinCostOption,
  isQuotaDecision,
  isReviewOutcome,
  isSpendWindowKey,
  type AiReturnPath,
  type CapTier,
  type CeilingSort,
  type DayWindowKey,
  type MinCostOption,
  type QuotaDecision,
  type ReviewOutcome,
  type SpendWindowKey,
} from './contract'

export {
  deltaOf,
  formatAverage,
  formatCostPerEvent,
  formatRatio,
  formatSeconds,
  ratioOf,
  type Delta,
  type DeltaDirection,
} from './format'

export { aiMessages, operationLabel, type AiMessages } from './messages'
