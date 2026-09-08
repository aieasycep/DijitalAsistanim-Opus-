/**
 * The announcements area's public surface.
 *
 * One import per page. `contract.ts` is re-exported wholesale because both the
 * routes and the Server Actions read from it, and a page that imported half of
 * it from here and half from the file would eventually import two different
 * spellings of the same field name.
 */

export * from './contract'
export { fromLocalInput, nextRoundFiveMinutes, toLocalInput } from './datetime'
export { AnnouncementForm, type AnnouncementFormProps } from './AnnouncementForm'
export { AnnouncementPreview, type AnnouncementPreviewProps } from './AnnouncementPreview'
export { AnnouncementTable, type AnnouncementTableProps } from './AnnouncementTable'
export { PublishPanel, type PublishPanelProps } from './PublishPanel'
export { ReachPanel, type ReachPanelProps } from './ReachPanel'
export { ResultBanner, type ResultBannerProps } from './ResultBanner'
export { StateBadge } from './StateBadge'
export { TargetingSummary, type TargetingSummaryProps } from './TargetingSummary'
export { TrailTable, type TrailTableProps } from './TrailTable'
export {
  AnnouncementDetailSkeleton,
  AnnouncementFormSkeleton,
  AnnouncementListSkeleton,
} from './Skeletons'
export {
  STATE_TONES,
  announcementState,
  auditActionLabel,
  panelError,
  sharePercent,
  stateLabel,
  type AnnouncementWindow,
} from './presentation'
