/**
 * The support queue's building blocks, in one import.
 *
 * The contract is re-exported alongside the components because both sides of
 * the client boundary need it: a page reads the query parameters from it and a
 * form posts the field names from it, and one import means the two can never
 * be looking at different copies.
 */

export * from './contract'
export {
  adminLabel,
  firstResponseDisplay,
  formatMinutes,
  panelError,
  priorityTone,
  statusTone,
  type FirstResponseDisplay,
} from './presentation'

export { DetailList, type DetailItem } from './DetailList'
export { QueueTiles, type QueueTilesProps } from './QueueTiles'
export { QueueSkeleton, TicketDetailSkeleton } from './Skeletons'
export { TicketQueueTable, type TicketQueueTableProps } from './TicketQueueTable'
export { TicketResultBanner, type TicketResultBannerProps } from './TicketResultBanner'
export {
  TicketBodyPanel,
  TicketSummaryPanel,
  type TicketSummaryPanelProps,
} from './TicketSummaryPanel'
export { TicketNotesPanel, type TicketNotesPanelProps } from './TicketNotesPanel'
export { TicketHistoryPanel, type TicketHistoryPanelProps } from './TicketHistoryPanel'
export { SubjectContextPanel, type SubjectContextPanelProps } from './SubjectContextPanel'
export { TicketActionsPanel, type TicketActionsPanelProps } from './TicketActionsPanel'
export { AddNoteForm, type AddNoteFormProps } from './AddNoteForm'
export { AssignForm, type AssignFormProps, type AssignableAdminOption } from './AssignForm'
export { TicketSubmitButton, type TicketSubmitButtonProps } from './SubmitButton'
