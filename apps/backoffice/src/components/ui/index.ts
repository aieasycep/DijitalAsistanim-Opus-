/**
 * The backoffice primitive set. Every page composes from here so the tool looks
 * like one product rather than a stack of separately built screens.
 */

export { Card, CardEmpty, CardError, CardSkeleton, type CardProps } from './Card'
export {
  Badge,
  approvalTone,
  connectionTone,
  countTone,
  exportTone,
  roleTone,
  subscriptionTone,
  syncTone,
  type BadgeProps,
  type BadgeTone,
} from './Badge'
export { DataTable, Mono, Num, type Column, type DataTableProps } from './DataTable'
export { Filters, type FilterControl, type FilterOption, type FiltersProps } from './Filters'
export { PageHeader, type PageHeaderProps } from './PageHeader'
export { StatGrid, StatTile, StatTileSkeleton, type StatTileProps } from './StatTile'
