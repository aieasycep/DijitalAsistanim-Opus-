import { type GradientName, gradients, gradientToNativePoints, spacing } from '@da/design-tokens'
import { LinearGradient } from 'expo-linear-gradient'
import { type ReactNode } from 'react'
import { View, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export interface GradientHeaderProps {
  /** `dawn` for the morning briefing, `dusk` for evening close, `night` for voice. */
  variant: GradientName
  children: ReactNode
  /** Extends the gradient behind the status bar. */
  includeStatusBar?: boolean
  style?: ViewStyle
  testID?: string
}

/**
 * The brand gradient surfaces — the morning briefing hero, the evening close,
 * the voice and analysis screens. The stop list and angle come from the token
 * file so the same ramp renders identically here and on the marketing site.
 */
export function GradientHeader({
  variant,
  children,
  includeStatusBar = true,
  style,
  testID,
}: GradientHeaderProps) {
  const insets = useSafeAreaInsets()
  const g = gradients[variant]
  const { start, end } = gradientToNativePoints(variant)

  return (
    <LinearGradient
      colors={[...g.colors] as [string, string, ...string[]]}
      locations={[...g.locations] as [number, number, ...number[]]}
      start={start}
      end={end}
      style={[
        {
          paddingTop: (includeStatusBar ? insets.top : 0) + spacing.md,
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.lg,
        },
        style,
      ]}
      testID={testID}
    >
      <View>{children}</View>
    </LinearGradient>
  )
}
