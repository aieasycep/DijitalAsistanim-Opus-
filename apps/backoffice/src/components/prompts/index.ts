/**
 * The prompt-version area's building blocks, in one import.
 *
 * The contract is re-exported alongside the components because both sides of
 * the client boundary need it: a page reads the query parameters from it and a
 * form posts the field names from it, and one import means the two can never be
 * looking at different copies.
 *
 * A Client Component must import `./contract`, `./diff` and `./presentation`
 * directly rather than through this barrel — the barrel also re-exports the
 * server components, and those reach `@/lib/db` and its service-role key.
 */

export * from './contract'
export {
  DIFF_CONTEXT_LINES,
  MAX_DIFF_CELLS,
  diffPromptBodies,
  diffScale,
  splitLines,
  type DiffHunk,
  type DiffRow,
  type DiffRowKind,
  type DiffScale,
  type PromptDiff,
} from './diff'
export {
  adminLabel,
  costPerCall,
  outcomeTone,
  promptStatusTone,
  shortFingerprint,
  type NamedAdmin,
} from './presentation'

export { ActionsPanel } from './ActionsPanel'
export { DiffView } from './DiffView'
export { FeatureRosterTable } from './FeatureRosterTable'
export { PromptBody, PromptNotes } from './PromptBody'
export { PromptFacts } from './PromptFacts'
export { PromptForm, type PromptFormProps, type PromptFormValues } from './PromptForm'
export { PromptResultBanner } from './PromptResultBanner'
export { PromptTable } from './PromptTable'
export { PromptDetailSkeleton, PromptFormSkeleton, PromptListSkeleton } from './Skeletons'
export { StatusBadge } from './StatusBadge'
export { TrailTable } from './TrailTable'
export { ModelUsagePanel, UsagePanel } from './UsagePanel'
export { VersionsTable } from './VersionsTable'
