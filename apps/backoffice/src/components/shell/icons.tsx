import {
  Activity,
  CheckSquare,
  Cpu,
  CreditCard,
  Gauge,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { NavIcon } from '@/lib/nav'

/**
 * Icon key → glyph.
 *
 * `lib/nav.ts` stores a string because it is imported on both sides of the
 * server/client boundary and a React component cannot be passed across it. The
 * mapping lives here, on the client side, where the sidebar and the palette
 * both need it.
 *
 * The record is exhaustive over `NavIcon` by type, so adding a key to the union
 * without adding its glyph does not compile — a nav entry can never render a
 * blank square.
 */
export const NAV_ICON_COMPONENTS: Readonly<Record<NavIcon, LucideIcon>> = {
  gauge: Gauge,
  users: Users,
  activity: Activity,
  refresh: RefreshCw,
  'check-square': CheckSquare,
  cpu: Cpu,
  'credit-card': CreditCard,
  'shield-check': ShieldCheck,
  scroll: ScrollText,
}
