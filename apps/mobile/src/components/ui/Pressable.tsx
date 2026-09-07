import { minTouchTarget } from '@da/design-tokens'
import * as Haptics from 'expo-haptics'
import { type ReactNode, useCallback } from 'react'
import {
  Platform,
  Pressable as RNPressable,
  type PressableProps as RNPressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useReduceMotion } from '../../theme/ThemeProvider'

export type HapticStrength = 'none' | 'light' | 'medium' | 'success' | 'warning' | 'error'

export interface PressableProps extends Omit<RNPressableProps, 'style' | 'children'> {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  /** Style applied while pressed, on top of `style`. */
  pressedStyle?: StyleProp<ViewStyle>
  haptic?: HapticStrength
  /** Scale on press. Skipped when reduce-motion is on. */
  scaleOnPress?: boolean
}

async function fireHaptic(strength: HapticStrength): Promise<void> {
  // Haptics are unavailable on web and on some Android hardware; a failure
  // here must never break the interaction it was decorating.
  try {
    switch (strength) {
      case 'light':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        break
      case 'medium':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
        break
      case 'success':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        break
      case 'warning':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        break
      case 'error':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        break
      case 'none':
        break
    }
  } catch {
    // Intentionally ignored — haptics are a nicety, not a requirement.
  }
}

/**
 * Pressable with the app's press feel baked in: a subtle scale, an optional
 * haptic, a guaranteed 44pt hit area, and reduce-motion support. Every tappable
 * surface in the app goes through this so press behaviour cannot drift.
 */
export function Pressable({
  children,
  style,
  pressedStyle,
  haptic = 'light',
  scaleOnPress = true,
  onPress,
  disabled,
  hitSlop,
  accessibilityRole = 'button',
  ...rest
}: PressableProps) {
  const reduceMotion = useReduceMotion()

  const handlePress = useCallback<NonNullable<RNPressableProps['onPress']>>(
    (event) => {
      if (haptic !== 'none' && Platform.OS !== 'web') void fireHaptic(haptic)
      onPress?.(event)
    },
    [haptic, onPress],
  )

  return (
    <RNPressable
      {...rest}
      disabled={disabled}
      onPress={handlePress}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled: Boolean(disabled), ...rest.accessibilityState }}
      hitSlop={hitSlop ?? 8}
      style={({ pressed }) => [
        { minHeight: minTouchTarget, justifyContent: 'center' },
        style,
        pressed && !disabled ? pressedStyle : null,
        pressed && !disabled && scaleOnPress && !reduceMotion ? { transform: [{ scale: 0.982 }] } : null,
        disabled ? { opacity: 0.45 } : null,
      ]}
    >
      {children}
    </RNPressable>
  )
}
