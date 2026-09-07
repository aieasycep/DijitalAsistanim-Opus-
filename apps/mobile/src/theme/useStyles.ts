import {
  type ElevationToken,
  type Theme,
  type TypeToken,
  elevation,
  typography,
} from '@da/design-tokens'
import { useMemo } from 'react'
import { Platform, StyleSheet, type TextStyle, type ViewStyle } from 'react-native'
import { type FontWeight, resolveFont } from './fonts'
import { useTheme } from './ThemeProvider'

/**
 * `useStyles` builds a themed StyleSheet once per theme change rather than on
 * every render, so a screen with fifty styled rows does not rebuild fifty
 * objects each frame. Pass a module-level factory (a stable reference) so the
 * memo actually holds.
 */
export function useStyles<T extends StyleSheet.NamedStyles<T>>(factory: (theme: Theme) => T): T {
  const theme = useTheme()
  return useMemo(() => StyleSheet.create(factory(theme)), [theme, factory])
}

/** Resolve a type token to a React Native text style in the current theme. */
export function textStyle(token: TypeToken, theme: Theme): TextStyle {
  const t = typography[token]
  return {
    ...resolveFont(t.family, t.fontWeight as FontWeight),
    fontSize: t.fontSize,
    lineHeight: t.lineHeight,
    letterSpacing: t.letterSpacing,
    color: theme.colors.text,
    ...('textTransform' in t && t.textTransform ? { textTransform: t.textTransform } : {}),
  }
}

/** Shadow props for an elevation token, correct on both platforms. */
export function elevationStyle(token: ElevationToken): ViewStyle {
  const e = elevation[token]
  return (
    Platform.select<ViewStyle>({
      ios: {
        shadowColor: e.shadowColor,
        shadowOpacity: e.shadowOpacity,
        shadowRadius: e.shadowRadius,
        shadowOffset: e.shadowOffset,
      },
      android: { elevation: e.elevation },
      default: {},
    }) ?? {}
  )
}

/** Tabular figures for clock times and money, so columns line up. */
export const tabularNums: TextStyle = {
  fontVariant: ['tabular-nums'],
}
