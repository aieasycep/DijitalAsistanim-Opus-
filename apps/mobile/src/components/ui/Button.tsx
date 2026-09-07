import { type Theme, minTouchTarget, radius, spacing } from '@da/design-tokens'
import { ActivityIndicator, type StyleProp, View, type ViewStyle } from 'react-native'
import { useTheme } from '../../theme/ThemeProvider'
import { Pressable } from './Pressable'
import { Text } from './Text'

export type ButtonVariant = 'primary' | 'tonal' | 'ghost' | 'destructive' | 'neutral'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface Palette {
  background: string
  pressed: string
  label: string
  border?: string
}

function paletteFor(variant: ButtonVariant, theme: Theme): Palette {
  switch (variant) {
    case 'primary':
      return {
        background: theme.colors.primary,
        pressed: theme.colors.primaryPressed,
        label: theme.colors.onPrimary,
      }
    case 'tonal':
      return {
        background: theme.colors.primarySoft,
        pressed: theme.colors.surface2,
        label: theme.colors.primaryOnSoft,
      }
    case 'ghost':
      return {
        background: 'transparent',
        pressed: theme.colors.surface2,
        label: theme.colors.primaryOnSoft,
      }
    case 'destructive':
      return {
        background: theme.colors.criticalSoft,
        pressed: theme.colors.surface2,
        label: theme.colors.criticalText,
      }
    case 'neutral':
      return {
        background: theme.colors.surface2,
        pressed: theme.colors.hairline,
        label: theme.colors.text,
      }
  }
}

const SIZE: Record<ButtonSize, { height: number; paddingHorizontal: number; radius: number }> = {
  sm: { height: minTouchTarget, paddingHorizontal: spacing.sm, radius: radius.inline },
  md: { height: 48, paddingHorizontal: spacing.md, radius: radius.button },
  lg: { height: 54, paddingHorizontal: spacing.lg, radius: radius.button },
}

export interface ButtonProps {
  label: string
  onPress: () => void
  variant?: ButtonVariant
  size?: ButtonSize
  disabled?: boolean
  /** Shows a spinner and blocks presses. The label stays for layout stability. */
  loading?: boolean
  /** Rendered before the label — pass an icon element. */
  leading?: React.ReactNode
  trailing?: React.ReactNode
  fullWidth?: boolean
  style?: StyleProp<ViewStyle>
  accessibilityHint?: string
  testID?: string
}

/**
 * The app's only button.
 *
 * `onPress` is required and non-optional on purpose: a button with nothing to
 * do cannot be constructed, which is the type-level half of the no-dead-button
 * rule. Anything that merely looks like a button but does nothing has to be
 * rendered as text instead.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  leading,
  trailing,
  fullWidth = false,
  style,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const theme = useTheme()
  const palette = paletteFor(variant, theme)
  const dims = SIZE[size]
  const isDisabled = disabled || loading

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      haptic={variant === 'destructive' ? 'warning' : 'light'}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      testID={testID}
      style={[
        {
          height: dims.height,
          minHeight: dims.height,
          paddingHorizontal: dims.paddingHorizontal,
          borderRadius: dims.radius,
          backgroundColor: palette.background,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.xs,
          ...(palette.border ? { borderWidth: 1, borderColor: palette.border } : {}),
          ...(fullWidth ? { alignSelf: 'stretch' } : {}),
        },
        style,
      ]}
      pressedStyle={{ backgroundColor: palette.pressed }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.label} />
      ) : (
        leading && <View accessible={false}>{leading}</View>
      )}
      <Text variant="button" style={{ color: palette.label }} numberOfLines={1}>
        {label}
      </Text>
      {!loading && trailing ? <View accessible={false}>{trailing}</View> : null}
    </Pressable>
  )
}
