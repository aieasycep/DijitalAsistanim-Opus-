import { palette } from './palette.ts'

/**
 * Semantic colour roles. Every shared component reads from this shape, so a
 * component written once renders correctly in both themes — dark mode is a
 * different set of role values, never a background swap.
 */
export interface ThemeColors {
  /** App background. */
  bg: string
  /** Card / sheet surface. */
  surface: string
  /** Icon tiles, neutral badges, pressed rows. */
  surface2: string
  /** Reading surfaces: weekly review, briefing editorial body. */
  paper: string
  /** 1px dividers. */
  hairline: string

  text: string
  textSecondary: string
  textTertiary: string
  textDisabled: string

  primary: string
  primaryPressed: string
  primarySoft: string
  primaryOnSoft: string
  onPrimary: string

  critical: string
  criticalSoft: string
  criticalText: string

  warning: string
  warningSoft: string
  warningText: string

  success: string
  successSoft: string
  successText: string

  info: string
  infoSoft: string
  infoText: string

  /** Scrim behind modals and sheets. */
  scrim: string
  /** Skeleton base + highlight for the shimmer sweep. */
  skeleton: string
  skeletonHighlight: string
}

export const lightColors: ThemeColors = {
  bg: palette.warmBg,
  surface: palette.white,
  surface2: palette.warmSurface2,
  paper: palette.paper,
  hairline: palette.warmHairline,

  text: palette.ink,
  textSecondary: palette.inkSecondary,
  textTertiary: palette.inkTertiary,
  textDisabled: palette.inkDisabled,

  primary: palette.indigo500,
  primaryPressed: palette.indigo600,
  primarySoft: palette.indigo50,
  primaryOnSoft: palette.indigo700,
  onPrimary: palette.white,

  critical: palette.coral500,
  criticalSoft: palette.coral50,
  criticalText: palette.coral700,

  warning: palette.amber500,
  warningSoft: palette.amber50,
  warningText: palette.amber700,

  success: palette.green500,
  successSoft: palette.green50,
  successText: palette.green700,

  info: palette.blue500,
  infoSoft: palette.blue50,
  infoText: palette.blue700,

  scrim: 'rgba(26,25,23,0.45)',
  skeleton: '#EFEDE7',
  skeletonHighlight: '#F7F6F2',
}

export const darkColors: ThemeColors = {
  bg: palette.darkBg,
  surface: palette.darkSurface,
  surface2: palette.darkSurface2,
  paper: palette.darkPaper,
  hairline: palette.darkHairline,

  text: palette.darkText,
  textSecondary: palette.darkSecondary,
  textTertiary: palette.darkTertiary,
  textDisabled: palette.darkDisabled,

  primary: palette.indigo400,
  primaryPressed: palette.indigo300,
  primarySoft: 'rgba(133,134,242,0.16)',
  primaryOnSoft: palette.indigo300,
  onPrimary: palette.darkOnPrimary,

  // On dark surfaces the "soft" fills become low-alpha washes of the same hue
  // so the badge keeps its meaning without glowing.
  critical: palette.coral300,
  criticalSoft: 'rgba(224,85,63,0.20)',
  criticalText: palette.coral300,

  warning: palette.amber300,
  warningSoft: 'rgba(224,154,28,0.20)',
  warningText: palette.amber300,

  success: palette.green300,
  successSoft: 'rgba(47,160,98,0.20)',
  successText: palette.green300,

  info: '#8AB4F8',
  infoSoft: 'rgba(59,130,230,0.20)',
  infoText: '#8AB4F8',

  scrim: 'rgba(0,0,0,0.62)',
  skeleton: 'rgba(255,255,255,0.06)',
  skeletonHighlight: 'rgba(255,255,255,0.12)',
}

export type ThemeName = 'light' | 'dark'

/** User-facing appearance preference; `system` follows the OS setting. */
export type ColorSchemePreference = 'system' | 'light' | 'dark'

export interface Theme {
  name: ThemeName
  colors: ThemeColors
  /** True when the theme is dark — used for status-bar and keyboard styling. */
  isDark: boolean
}

export const lightTheme: Theme = { name: 'light', colors: lightColors, isDark: false }
export const darkTheme: Theme = { name: 'dark', colors: darkColors, isDark: true }

export const themes: Record<ThemeName, Theme> = { light: lightTheme, dark: darkTheme }

export function resolveTheme(
  preference: ColorSchemePreference,
  systemScheme: ThemeName | null | undefined,
): Theme {
  if (preference === 'light') return lightTheme
  if (preference === 'dark') return darkTheme
  return systemScheme === 'dark' ? darkTheme : lightTheme
}
