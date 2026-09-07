import { radius, spacing } from '@da/design-tokens'
import { MaterialIcons } from '@expo/vector-icons'
import { useEffect } from 'react'
import { type DimensionValue, View, type ViewStyle } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { useReduceMotion, useTheme } from '../../theme/ThemeProvider'
import { Button } from './Button'
import { Text } from './Text'

/**
 * Skeleton, empty and error states.
 *
 * These are first-class components rather than ad-hoc JSX because every list in
 * the app has to have all three, and a screen that forgets one is how "infinite
 * spinner" and "blank page" bugs ship.
 */

export interface SkeletonProps {
  width?: DimensionValue
  height?: number
  borderRadius?: number
  style?: ViewStyle
}

export function Skeleton({ width = '100%', height = 14, borderRadius, style }: SkeletonProps) {
  const theme = useTheme()
  const reduceMotion = useReduceMotion()
  const progress = useSharedValue(0)

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 0.5
      return
    }
    progress.value = withRepeat(withTiming(1, { duration: 1200 }), -1, true)
  }, [progress, reduceMotion])

  const animated = useAnimatedStyle(() => ({
    opacity: 0.55 + progress.value * 0.35,
  }))

  return (
    <Animated.View
      accessible={false}
      style={[
        {
          width,
          height,
          borderRadius: borderRadius ?? height / 2,
          backgroundColor: theme.colors.skeleton,
        },
        style,
        animated,
      ]}
    />
  )
}

/** A card-shaped placeholder matching the real card's rhythm, so nothing jumps. */
export function SkeletonCard() {
  const theme = useTheme()
  return (
    <View
      accessible
      accessibilityLabel=""
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: radius.card,
        padding: spacing.md,
        gap: spacing.xs,
      }}
    >
      <Skeleton width="30%" height={10} />
      <Skeleton width="90%" height={16} />
      <Skeleton width="60%" height={12} />
    </View>
  )
}

export interface EmptyStateProps {
  icon: keyof typeof MaterialIcons.glyphMap
  title: string
  description?: string
  /** An empty state may offer one action — but only if it really does something. */
  actionLabel?: string
  onAction?: () => void
  testID?: string
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  testID,
}: EmptyStateProps) {
  const theme = useTheme()
  return (
    <View
      testID={testID}
      style={{ alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: radius.cardSm,
          backgroundColor: theme.colors.surface2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MaterialIcons name={icon} size={26} color={theme.colors.textTertiary} />
      </View>
      <Text variant="h3" center>
        {title}
      </Text>
      {description ? (
        <Text variant="secondary" tone="secondary" center style={{ maxWidth: 300 }}>
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="tonal" size="sm" />
      ) : null}
    </View>
  )
}

export interface ErrorStateProps {
  /** Already-localised message. Never a stack trace or a provider error string. */
  message: string
  retryLabel?: string
  onRetry?: (() => void) | undefined
  testID?: string
}

export function ErrorState({ message, retryLabel, onRetry, testID }: ErrorStateProps) {
  const theme = useTheme()
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      style={{ alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: radius.cardSm,
          backgroundColor: theme.colors.criticalSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MaterialIcons name="error-outline" size={26} color={theme.colors.criticalText} />
      </View>
      <Text variant="secondary" tone="secondary" center style={{ maxWidth: 320 }}>
        {message}
      </Text>
      {onRetry && retryLabel ? (
        <Button label={retryLabel} onPress={onRetry} variant="tonal" size="sm" />
      ) : null}
    </View>
  )
}
