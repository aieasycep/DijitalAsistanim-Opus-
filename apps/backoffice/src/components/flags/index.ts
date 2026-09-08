/**
 * The feature-flag area's building blocks, in one import.
 *
 * The contract is re-exported alongside the components because both sides of
 * the client boundary need it: a page reads the query parameters from it and a
 * form posts the field names from it, and one import means the two can never be
 * looking at different copies.
 *
 * A Client Component must import `./contract` and `./presentation` directly
 * rather than through this barrel — the barrel also re-exports the server
 * components, and those reach `@/lib/db` and its service-role key.
 */

export * from './contract'
export {
  adminLabel,
  audienceLine,
  audienceNote,
  describeAudience,
  describeVersionRange,
  flagStateTone,
  outcomeTone,
  overrideValueTone,
  type NamedAdmin,
} from './presentation'

export { FlagFacts } from './FlagFacts'
export { FlagForm, type FlagFormProps, type FlagFormValues } from './FlagForm'
export { FlagResultBanner } from './FlagResultBanner'
export { FlagTable } from './FlagTable'
export { OverrideForm, type OverrideFormProps } from './OverrideForm'
export { OverrideTable } from './OverrideTable'
export { FlagDetailSkeleton, FlagFormSkeleton, FlagListSkeleton } from './Skeletons'
export { StateBadge } from './StateBadge'
export { SwitchPanel } from './SwitchPanel'
export { TargetingSummary } from './TargetingSummary'
export { TrailTable } from './TrailTable'
