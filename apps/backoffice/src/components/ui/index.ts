/**
 * The backoffice primitive set. Every page composes from here so the tool looks
 * like one product rather than a stack of separately built screens.
 *
 * Two layers, deliberately not merged:
 *
 *   - the shadcn/ui primitives (`button`, `field`, `dialog`, `dropdown-menu`,
 *     `tooltip`), copied in and re-themed against `@da/design-tokens` rather
 *     than shadcn's stock neutral ramp, so the indigo carries over and the
 *     density is the console's;
 *   - the composed pieces every module needs (`DataTable`, `ConfirmDialog`,
 *     `DateRangePicker`, `PageHeader`, the four states), which encode decisions
 *     — server-side pagination, a required reason, a stated timezone — that a
 *     page must not be able to opt out of by accident.
 */

// --- shadcn/ui primitives --------------------------------------------------
export { Button, buttonVariants, type ButtonProps } from './button.tsx'
export {
  Field,
  Input,
  Label,
  Select,
  Textarea,
  fieldControlProps,
  fieldIds,
  type FieldProps,
} from './field.tsx'
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog.tsx'
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu.tsx'
export {
  Tooltip,
  TooltipContent,
  TooltipLabel,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip.tsx'
export { cn } from './utils.ts'

// --- states ----------------------------------------------------------------
export {
  EmptyState,
  ErrorState,
  LoadingState,
  Skeleton,
  type EmptyStateProps,
  type ErrorStateProps,
} from './states.tsx'

// --- composed --------------------------------------------------------------
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
export {
  DataTable,
  Mono,
  Num,
  type Column,
  type DataTableColumnVisibility,
  type DataTablePagination,
  type DataTableProps,
  type DataTableSorting,
} from './DataTable.tsx'
export { ColumnVisibilityMenu, type ColumnVisibilityOption } from './ColumnVisibilityMenu.tsx'
export {
  ALL_COLUMNS_VISIBLE,
  PAGINATION_RESET_PARAMS,
  TABLE_PARAMS,
  encodeHiddenColumns,
  encodeSort,
  nextSort,
  pageWindow,
  parseColumnVisibility,
  parsePage,
  parsePageSize,
  parseSort,
  withParams,
  type PageWindow,
  type SortDirection,
  type TableLocation,
  type TableSort,
} from './table-url.ts'
export {
  ConfirmDialog,
  type ConfirmDialogProps,
  type ConfirmReasonConfig,
} from './ConfirmDialog.tsx'
export { DateRangePicker, type DateRangePickerProps } from './DateRangePicker.tsx'
export {
  MAX_RANGE_DAYS,
  RANGE_PARAMS,
  RANGE_PRESETS,
  RANGE_TIME_ZONE,
  isRangePreset,
  resolveRange,
  type RangeParamNames,
  type RangePreset,
  type RangeSelection,
  type ResolvedRange,
} from './date-range.ts'
export { Filters, type FilterControl, type FilterOption, type FiltersProps } from './Filters'
export { PageHeader, type Breadcrumb, type PageHeaderProps } from './PageHeader.tsx'
export { StatGrid, StatTile, StatTileSkeleton, type StatTileProps } from './StatTile'
