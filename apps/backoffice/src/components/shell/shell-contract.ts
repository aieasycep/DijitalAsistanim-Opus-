/**
 * The shell's two display preferences, and the names both sides agree on.
 *
 * Both are cookies rather than `localStorage`, for the same reason: the server
 * renders the shell, so the server has to know the answer before the first
 * paint. A preference read only by JavaScript means the page renders one way
 * and corrects itself a frame later — a light flash for an operator who chose
 * dark, a jolting rail on every navigation.
 *
 * Neither cookie carries anything about the person. They are not credentials,
 * they are not read by any guard, and losing them costs a default.
 *
 * This module is imported by Client Components and by the layout, so it holds
 * nothing but constants and pure functions — no `server-only`, no cookies API.
 */

// ===========================================================================
// Theme
// ===========================================================================

export const THEME_COOKIE = 'da_bo_theme'

/**
 * `system` is a real choice, not the absence of one: it means "follow the OS",
 * which is what `prefers-color-scheme` answers. It stamps no `data-theme`
 * attribute, so the media query in `globals.css` decides.
 */
export const THEME_CHOICES = ['light', 'dark', 'system'] as const
export type ThemeChoice = (typeof THEME_CHOICES)[number]

export const DEFAULT_THEME: ThemeChoice = 'system'

/** One year: a display preference an operator sets once. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === 'string' && (THEME_CHOICES as readonly string[]).includes(value)
}

export function parseTheme(value: string | undefined): ThemeChoice {
  return isThemeChoice(value) ? value : DEFAULT_THEME
}

/**
 * What goes on `<html data-theme>`. `system` stamps nothing, which is what lets
 * the `prefers-color-scheme` block in `globals.css` apply — and what lets the
 * explicit choices beat it in both directions.
 */
export function themeAttribute(choice: ThemeChoice): 'light' | 'dark' | undefined {
  return choice === 'system' ? undefined : choice
}

// ===========================================================================
// Sidebar
// ===========================================================================

export const SIDEBAR_COOKIE = 'da_bo_sidebar'
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function parseSidebarCollapsed(value: string | undefined): boolean {
  return value === 'collapsed'
}
