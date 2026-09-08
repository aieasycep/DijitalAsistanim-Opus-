/**
 * The application shell.
 *
 * `AppShell` is what `app/(dash)/layout.tsx` renders; everything else here is a
 * part of it. Pages do not compose the shell themselves — a page that drew its
 * own chrome would draw it slightly differently, and would redraw it on every
 * navigation.
 */

export { AppShell, type AppShellProps } from './AppShell.tsx'
export { Sidebar, type SidebarGroupView, type SidebarItemView } from './Sidebar.tsx'
export { Topbar, type TopbarProps } from './Topbar.tsx'
export { CommandPalette, type PaletteNavItem } from './CommandPalette.tsx'
export { EnvironmentBadge } from './EnvironmentBadge.tsx'
export { HealthIndicator } from './HealthIndicator.tsx'
export { loadHealthSummary, type HealthOverall, type HealthSummary } from './health.ts'
export {
  DEFAULT_THEME,
  SIDEBAR_COOKIE,
  THEME_COOKIE,
  THEME_CHOICES,
  isThemeChoice,
  parseSidebarCollapsed,
  parseTheme,
  themeAttribute,
  type ThemeChoice,
} from './shell-contract.ts'
