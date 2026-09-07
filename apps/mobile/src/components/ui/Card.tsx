import { type Theme, radius, spacing } from '@da/design-tokens'
import { type ReactNode } from 'react'
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native'
import { useTheme } from '../../theme/ThemeProvider'
import { elevationStyle } from '../../theme/useStyles'
import { Pressable } from './Pressable'

export type CardTone = 'surface' | 'primary' | 'critical' | 'warning' | 'success' | 'info' | 'paper'

function toneBackground(tone: CardTone, theme: Theme): string {
  switch (tone) {
    case 'surface':
      return theme.colors.surface
    case 'primary':
      return theme.colors.primarySoft
    case 'critical':
      return theme.colors.criticalSoft
    case 'warning':
      return theme.colors.warningSoft
    case 'success':
      return theme.colors.successSoft
    case 'info':
      return theme.colors.infoSoft
    case 'paper':
      return theme.colors.paper
  }
}

export interface CardProps {
  children: ReactNode
  tone?: CardTone
  style?: StyleProp<ViewStyle>
  /** Makes the whole card a button. Omit for a static card. */
  onPress?: (() => void) | undefined
  /** Required when `onPress` is set, so screen readers announce the target. */
  accessibilityLabel?: string
  /**
   * A dashed border, reserved by the design system for a proposal that is not
   * yet real: a pending approval, an AI suggestion awaiting confirmation.
   */
  proposed?: boolean
  padded?: boolean
  testID?: string
}

/**
 * The card surface. Cards are shadowed and border-less; the only border the
 * system allows is the dashed "proposed" outline, which is why `proposed` is a
 * prop rather than something a screen styles by hand.
 */
export function Card({
  children,
  tone = 'surface',
  style,
  onPress,
  accessibilityLabel,
  proposed = false,
  padded = true,
  testID,
}: CardProps) {
  const theme = useTheme()

  const base: ViewStyle = {
    backgroundColor: toneBackground(tone, theme),
    borderRadius: radius.card,
    ...(padded ? { padding: spacing.md } : {}),
    ...(proposed
      ? {
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderStyle: 'dashed',
          borderColor: theme.colors.primary,
        }
      : {}),
    ...(tone === 'surface' ? elevationStyle('card') : {}),
  }

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        style={[base, style]}
        pressedStyle={{ backgroundColor: theme.colors.surface2 }}
      >
        {children}
      </Pressable>
    )
  }

  return (
    <View style={[base, style]} testID={testID}>
      {children}
    </View>
  )
}
