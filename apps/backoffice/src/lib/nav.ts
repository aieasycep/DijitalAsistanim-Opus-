import {
  satisfiesRequirement,
  type AdminPermission,
  type PermissionRequirement,
} from './permissions.ts'
import { messages } from './messages'

/**
 * The console's information architecture, in one place.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE IS, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------
 *
 * It is the map: eight groups, in the order the specification lists them, and
 * the destinations inside each. The sidebar renders it, the command palette
 * searches it, and the breadcrumb reads it, so those three can never disagree
 * about what the console contains or what a page is called.
 *
 * It is NOT the authorization boundary. Every entry carries the permission its
 * page requires, and `navGroupsFor()` drops the ones a viewer cannot open — but
 * that is about not offering a door that will be slammed, not about locking it.
 * The lock is `requirePermission()` in the page itself, server-side, and it
 * would refuse the same route typed straight into the address bar.
 *
 * ---------------------------------------------------------------------------
 * EVERY ENTRY HERE IS A ROUTE THAT EXISTS
 * ---------------------------------------------------------------------------
 *
 * A sidebar link to an unbuilt page is a 404 with a nice icon. So an entry is
 * added in the same change that adds its `page.tsx`, never before. The groups
 * below are all eight from the specification; the ones with no entries yet
 * simply do not render, which is honest about what the console can do today.
 *
 * Destinations the specification calls for that have no page yet, with the
 * entry each should register when it lands:
 *
 *   overview  { href: '/analytics',  label: …, icon: 'chart',   requires: 'analytics.read' }
 *   ai        { href: '/ai/models',  label: …, icon: 'sliders', requires: 'ai.configure' }
 */

// ===========================================================================
// 1. Groups
// ===========================================================================

/** The eight sections, in specification order. Order here is order on screen. */
export const NAV_GROUP_IDS = [
  'overview',
  'users',
  'operations',
  'ai',
  'business',
  'product',
  'privacy',
  'system',
] as const

export type NavGroupId = (typeof NAV_GROUP_IDS)[number]

// ===========================================================================
// 2. Icons
//
// A key, not a component: `nav.ts` is imported by the layout (a Server
// Component) and the sidebar (a Client Component), and a React component cannot
// cross that boundary as a prop. `components/shell/icons.tsx` maps each key to
// its Lucide glyph on the client side.
// ===========================================================================

export const NAV_ICONS = [
  'gauge',
  'users',
  'activity',
  'refresh',
  'check-square',
  'cpu',
  'credit-card',
  'shield-check',
  'scroll',
  'lifebuoy',
  'key',
  'flag',
  'megaphone',
  'sparkles',
  'gift',
  'heart-pulse',
  'shield',
  'settings',
] as const

export type NavIcon = (typeof NAV_ICONS)[number]

// ===========================================================================
// 3. Items
// ===========================================================================

export interface NavItem {
  /** The route. English segments; the interface language is not the URL space. */
  readonly href: string
  readonly label: string
  /** One line, shown in the command palette and as the collapsed tooltip. */
  readonly description: string
  readonly icon: NavIcon
  /** What the page's own `requirePermission()` asks for. Kept identical. */
  readonly requires: PermissionRequirement
}

export interface NavGroup {
  readonly id: NavGroupId
  readonly label: string
  readonly items: readonly NavItem[]
}

const OVERVIEW_ITEMS: readonly NavItem[] = [
  {
    href: '/',
    label: messages.nav.overview,
    description: 'Platformun anlık durumu: kişiler, boru hattı, riskler, maliyet.',
    icon: 'gauge',
    // The one page every role reaches: `system.health.read` is the single
    // permission `readonly` and `analyst` both carry.
    requires: 'system.health.read',
  },
]

const USERS_ITEMS: readonly NavItem[] = [
  {
    href: '/users',
    label: messages.nav.users,
    description: 'Hesap arama, bağlantı sağlığı ve abonelik durumu. İçerik gösterilmez.',
    icon: 'users',
    requires: 'users.read',
  },
  {
    href: '/support',
    label: messages.nav.tickets,
    description: 'Destek kuyruğu: açık, atanmamış ve geciken talepler.',
    icon: 'lifebuoy',
    requires: 'support.ticket.read',
  },
]

const OPERATIONS_ITEMS: readonly NavItem[] = [
  {
    href: '/ops',
    label: messages.nav.operations,
    description: 'Sağlayıcı sağlığı, hata kodları ve iş hacmi.',
    icon: 'activity',
    requires: 'system.health.read',
  },
  {
    href: '/ops/sync',
    label: messages.nav.sync,
    description: 'Hata veren ve takılmış senkronizasyon kayıtları.',
    icon: 'refresh',
    requires: 'integration.read',
  },
  {
    href: '/approvals',
    label: messages.nav.approvals,
    description: 'Onay kuyruğu, red oranları ve yürütme hataları.',
    icon: 'check-square',
    requires: 'integration.read',
  },
]

const AI_ITEMS: readonly NavItem[] = [
  {
    href: '/ai',
    label: messages.nav.spend,
    description: 'Model maliyeti, jeton tüketimi ve en çok harcayan hesaplar.',
    icon: 'cpu',
    requires: 'ai.read',
  },
  {
    href: '/ai/prompts',
    label: messages.nav.prompts,
    description: 'Prompt sürümleri, aktif sürümle farkı ve ona atfedilen maliyet.',
    icon: 'sparkles',
    requires: 'prompt.read',
  },
]

const BUSINESS_ITEMS: readonly NavItem[] = [
  {
    href: '/billing',
    label: messages.nav.subscriptions,
    description: 'Abonelikler, deneme süreleri ve ödeme sorunları.',
    icon: 'credit-card',
    requires: 'billing.read',
  },
  {
    href: '/billing/grants',
    label: messages.nav.grants,
    description: 'Geçici Pro hakları, gerekçeleri ve admin başına dağılımı.',
    icon: 'gift',
    requires: 'billing.read',
  },
]

const PRODUCT_ITEMS: readonly NavItem[] = [
  {
    href: '/flags',
    label: messages.nav.flags,
    description: 'Özellik bayrakları, yüzdelik açılım ve acil kapatma.',
    icon: 'flag',
    requires: 'flags.read',
  },
  {
    href: '/announcements',
    label: messages.nav.announcements,
    description: 'Uygulama içi duyurular, kitle hedefleme ve yayın durumu.',
    icon: 'megaphone',
    requires: 'announcement.read',
  },
]

const PRIVACY_ITEMS: readonly NavItem[] = [
  {
    href: '/privacy',
    label: messages.nav.privacy,
    description: 'Dışa aktarma ve silme talepleri, yasal 30 günlük süreye göre.',
    icon: 'shield-check',
    requires: 'privacy.read',
  },
  {
    href: '/support/access',
    label: messages.nav.supportAccess,
    description: 'Denetimli içerik erişimi: gerekçe, çift onay, süre sınırı, tam kayıt.',
    icon: 'key',
    // Requesters and approvers are different people by design, and both need
    // the door.
    requires: { anyOf: ['support.access.request', 'support.access.approve'] },
  },
]

const SYSTEM_ITEMS: readonly NavItem[] = [
  {
    href: '/audit',
    label: messages.nav.audit,
    description: 'Kim, ne zaman, neyi, hangi gerekçeyle yaptı.',
    icon: 'scroll',
    requires: 'audit.read',
  },
  {
    href: '/health',
    label: messages.nav.health,
    description: 'Bağımlılıkların ölçülmüş durumu ve zamanlanmış işler.',
    icon: 'heart-pulse',
    requires: 'system.health.read',
  },
  {
    href: '/health/config',
    label: messages.nav.config,
    description: 'Hangi sırlar yapılandırılmış. Değer asla gösterilmez.',
    icon: 'settings',
    requires: 'system.config.read',
  },
  {
    href: '/system/admins',
    label: messages.nav.admins,
    description: 'Yönetici listesi, davetler, roller ve oturumlar.',
    icon: 'shield',
    requires: 'admin.read',
  },
  {
    href: '/system/roles',
    label: messages.nav.roles,
    description: 'Rol–izin matrisi, veritabanının uyguladığı hâliyle.',
    icon: 'shield-check',
    requires: 'admin.read',
  },
]

const GROUP_ITEMS: Readonly<Record<NavGroupId, readonly NavItem[]>> = Object.freeze({
  overview: OVERVIEW_ITEMS,
  users: USERS_ITEMS,
  operations: OPERATIONS_ITEMS,
  ai: AI_ITEMS,
  business: BUSINESS_ITEMS,
  product: PRODUCT_ITEMS,
  privacy: PRIVACY_ITEMS,
  system: SYSTEM_ITEMS,
})

/** The complete map, before any permission filtering. */
export const NAV_GROUPS: readonly NavGroup[] = Object.freeze(
  NAV_GROUP_IDS.map((id) =>
    Object.freeze({ id, label: messages.nav.groups[id], items: GROUP_ITEMS[id] }),
  ),
)

/** Every destination, flat. The command palette's page index. */
export const NAV_ITEMS: readonly NavItem[] = Object.freeze(
  NAV_GROUPS.flatMap((group) => group.items),
)

// ===========================================================================
// 4. Filtering and matching
// ===========================================================================

/**
 * The groups this viewer may actually open.
 *
 * Pure: it takes a permission set rather than a session, so the sidebar's
 * filtering is the same function the tests enumerate role by role. A group
 * whose every item was filtered out is dropped too — a heading over nothing is
 * a promise the console does not keep.
 */
export function navGroupsFor(permissions: ReadonlySet<AdminPermission>): readonly NavGroup[] {
  const groups: NavGroup[] = []
  for (const group of NAV_GROUPS) {
    const items = group.items.filter((item) => satisfiesRequirement(permissions, item.requires))
    if (items.length > 0) groups.push({ id: group.id, label: group.label, items })
  }
  return groups
}

/** The same list, flat, for the palette. */
export function navItemsFor(permissions: ReadonlySet<AdminPermission>): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => satisfiesRequirement(permissions, item.requires))
}

/**
 * Is this entry the page currently open?
 *
 * An entry owns its subtree, so `/users/9f3c…` highlights "Kullanıcılar" and
 * `/ai/quality` highlights the AI entry it is a tab of. `/` is the exception
 * and matches only itself: a prefix test on the root would light the overview
 * up on every page in the console.
 */
export function isNavItemActive(item: { readonly href: string }, pathname: string): boolean {
  if (item.href === '/') return pathname === '/'
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

/** The open entry, for the document title and the breadcrumb. */
export function activeNavItem(pathname: string): NavItem | null {
  let best: NavItem | null = null
  for (const item of NAV_ITEMS) {
    if (!isNavItemActive(item, pathname)) continue
    if (best === null || item.href.length > best.href.length) best = item
  }
  return best
}
