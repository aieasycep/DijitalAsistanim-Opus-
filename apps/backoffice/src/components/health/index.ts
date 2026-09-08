/**
 * The system-health area's components.
 *
 * Server Components by default. The three client ones — `CheckForm`,
 * `RefreshForm` and the `SubmitButton` they share — are client only because a
 * form that gives no feedback while seven outbound probes are in flight gets
 * pressed twice, and the second press is a second set of connections. None of
 * them touches the database: they post to a Server Action, which is the only
 * code path in this area that can.
 *
 * A Client Component must import from the leaf modules rather than from this
 * barrel: it re-exports the server components too, and those reach
 * `@/lib/queries/health` and through it `@/lib/db` and the service-role key.
 * The error boundary in `app/(dash)/health/error.tsx` imports `./contract`
 * directly for exactly that reason.
 */

export { CheckForm, type CheckFormProps } from './CheckForm'
export { DependencyTable, type DependencyTableProps } from './DependencyTable'
export { HistoryStrip } from './HistoryStrip'
export { RefreshForm } from './RefreshForm'
export { ResultBanner, type ResultBannerProps } from './ResultBanner'
export { ScheduledJobTable, type ScheduledJobTableProps } from './ScheduledJobTable'
export { SecretTable, type SecretRow, type SecretTableProps } from './SecretTable'
export { HealthConfigSkeleton, HealthDashboardSkeleton } from './Skeletons'
export { SubmitButton, type SubmitButtonProps } from './SubmitButton'

export {
  CHECK_FIELDS,
  CHECK_OUTCOMES,
  CHECK_SCOPE_ALL,
  HEALTH_AUDIT_ACTION,
  HEALTH_CONFIG_PATH,
  HEALTH_ENTITY_TYPE,
  HEALTH_PATH,
  HEALTH_RESULT_PARAMS,
  HEALTH_RETURN_PATHS,
  HEALTH_TARGETS,
  HEALTH_TARGET_SPECS,
  JOB_EVIDENCE_KINDS,
  PLATFORM_SECRETS,
  PROBE_KINDS,
  REFRESH_FIELDS,
  SCHEDULED_JOBS,
  SECRET_GROUPS,
  firstParam,
  healthTargetSpec,
  isAnsweringStatus,
  isCheckOutcome,
  isHealthTarget,
  withoutResult,
  type CheckOutcome,
  type EffectiveHealth,
  type HealthReturnPath,
  type HealthTarget,
  type HealthTargetSpec,
  type JobEvidenceKind,
  type ProbeKind,
  type ScheduledJob,
  type SecretGroup,
  type SecretSpec,
} from './contract'

export { healthLabel, healthTone, observerLabel, windowOf, type HealthWindow } from './presentation'
