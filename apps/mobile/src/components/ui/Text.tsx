import { type Theme, type TypeToken } from '@da/design-tokens'
import { type ReactNode, useMemo } from 'react'
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native'
import { textStyle } from '../../theme/useStyles'
import { useTheme } from '../../theme/ThemeProvider'

export type TextTone =
  | 'default'
  | 'secondary'
  | 'tertiary'
  | 'disabled'
  | 'primary'
  | 'critical'
  | 'warning'
  | 'success'
  | 'info'
  | 'onPrimary'
  | 'inherit'

function toneColor(tone: TextTone, theme: Theme): string | undefined {
  switch (tone) {
    case 'default':
      return theme.colors.text
    case 'secondary':
      return theme.colors.textSecondary
    case 'tertiary':
      return theme.colors.textTertiary
    case 'disabled':
      return theme.colors.textDisabled
    case 'primary':
      return theme.colors.primaryOnSoft
    case 'critical':
      return theme.colors.criticalText
    case 'warning':
      return theme.colors.warningText
    case 'success':
      return theme.colors.successText
    case 'info':
      return theme.colors.infoText
    case 'onPrimary':
      return theme.colors.onPrimary
    case 'inherit':
      return undefined
  }
}

export interface TextProps extends Omit<RNTextProps, 'style'> {
  variant?: TypeToken
  tone?: TextTone
  style?: TextStyle | TextStyle[] | undefined
  children?: ReactNode
  /** Use tabular figures — for clock times, counts and amounts. */
  tabular?: boolean
  center?: boolean
}

/**
 * The only text primitive in the app.
 *
 * Screens never reach for `<RNText>` directly, which is what keeps the type
 * scale honest: a size that is not in the scale cannot be expressed, and every
 * string automatically follows the theme and the user's Dynamic Type setting.
 */
export function Text({
  variant = 'body',
  tone = 'default',
  style,
  tabular = false,
  center = false,
  ...rest
}: TextProps) {
  const theme = useTheme()

  const resolved = useMemo<TextStyle>(() => {
    const base = textStyle(variant, theme)
    const color = toneColor(tone, theme)
    return {
      ...base,
      ...(color ? { color } : {}),
      ...(tabular ? { fontVariant: ['tabular-nums' as const] } : {}),
      ...(center ? { textAlign: 'center' as const } : {}),
    }
  }, [variant, tone, theme, tabular, center])

  return <RNText {...rest} style={style ? [resolved, style].flat() : resolved} />
}
