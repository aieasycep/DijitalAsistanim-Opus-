import { minTouchTarget, radius, spacing, typography } from '@da/design-tokens'
import { forwardRef } from 'react'
import { TextInput, View, type TextInputProps } from 'react-native'
import { useTheme } from '../../theme/ThemeProvider'
import { Text } from './Text'

export interface TextFieldProps extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  /** Always present: a placeholder is not a label for a screen reader. */
  label: string
  /** Shown under the field in the normal tone. */
  hint?: string
  /** Shown under the field in the critical tone, replacing the hint. */
  error?: string | undefined
  /** Hide the visible label when the surrounding row already names the field. */
  labelHidden?: boolean
  multiline?: boolean
  /** Fixed height for a multiline field, in points. */
  height?: number
  testID?: string
}

/**
 * The single text input.
 *
 * Owns focus colour, error colour and the label/hint relationship so no screen
 * has to restate them, and so an invalid field is never signalled by colour
 * alone — the message is always text as well.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, hint, error, labelHidden = false, multiline = false, height, testID, ...rest },
  ref,
) {
  const theme = useTheme()

  return (
    <View style={{ gap: 6 }}>
      {labelHidden ? null : (
        <Text variant="caption" tone="secondary">
          {label}
        </Text>
      )}
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={theme.colors.textTertiary}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        testID={testID}
        style={{
          minHeight: multiline ? (height ?? 120) : minTouchTarget,
          ...(multiline && height ? { height } : {}),
          backgroundColor: theme.colors.surface,
          borderRadius: radius.button,
          borderWidth: 1,
          borderColor: error ? theme.colors.critical : theme.colors.hairline,
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xs,
          color: theme.colors.text,
          fontSize: typography.body.fontSize,
        }}
        {...rest}
      />
      {error ? (
        <Text variant="micro" tone="critical">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="micro" tone="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  )
})
