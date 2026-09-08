/**
 * The admin-management area's building blocks, in one import.
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
  MATRIX_CELL_CLASS,
  MATRIX_GLYPH,
  adminRoleTone,
  adminStatusTone,
  isDrift,
  matrixCell,
  mfaTone,
  outcomeTone,
  permissionNamespace,
  sessionTone,
  type MatrixCell,
} from './presentation'

export { AccessPanel } from './AccessPanel'
export { AdminFacts } from './AdminFacts'
export { AdminResultBanner } from './AdminResultBanner'
export { AdminTable } from './AdminTable'
export { InviteForm, type InviteRoleOption } from './InviteForm'
export { InviteTable } from './InviteTable'
export { PermissionList } from './PermissionList'
export { RoleMatrixTable, UnobservableRoles } from './RoleMatrixTable'
export { RolePanel, type AssignableRoleOption } from './RolePanel'
export { SessionTable } from './SessionTable'
export {
  AdminDetailSkeleton,
  AdminListSkeleton,
  InviteFormSkeleton,
  RoleMatrixSkeleton,
} from './Skeletons'
export { TrailTable } from './TrailTable'
