/**
 * The temporary-Pro area's building blocks, in one import.
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
  entitlementSourceTone,
  grantEffectTone,
  grantStatusOf,
  grantStatusTone,
  outcomeTone,
  shareOf,
  type NamedAdmin,
} from './presentation'

export { AdminBudgetTable } from './AdminBudgetTable'
export { EntitlementSourcePanel } from './EntitlementSourcePanel'
export { GrantFacts } from './GrantFacts'
export { GrantForm, type GrantFormProps } from './GrantForm'
export { GrantResultBanner } from './GrantResultBanner'
export { GrantTable } from './GrantTable'
export { GrantTrailTable } from './GrantTrailTable'
export { RevokeGrantControl } from './RevokeGrantControl'
export { GrantDetailSkeleton, GrantFormSkeleton, GrantListSkeleton } from './Skeletons'
