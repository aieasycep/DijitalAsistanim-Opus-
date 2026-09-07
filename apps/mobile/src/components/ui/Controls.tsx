import { minTouchTarget, radius, spacing } from '@da/design-tokens'
import { Switch as RNSwitch, View, type ViewStyle } from 'react-native'
import { useTheme } from '../../theme/ThemeProvider'
import { Pressable } from './Pressable'
import { Text } from './Text'

export interface ToggleProps {
  value: boolean
  onValueChange: (value: boolean) => void
  disabled?: boolean
  accessibilityLabel: string
  testID?: string
}

export function Toggle({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
  testID,
}: ToggleProps) {
  const theme = useTheme()
  return (
    <RNSwitch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      trackColor={{ false: theme.colors.hairline, true: theme.colors.primary }}
      thumbColor={theme.colors.surface}
      ios_backgroundColor={theme.colors.hairline}
    />
  )
}

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

export interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>
  value: T
  onChange: (value: T) => void
  style?: ViewStyle
  testID?: string
}

/** The pill segmented control used for day/week, tone pickers and filters. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
  testID,
}: SegmentedControlProps<T>) {
  const theme = useTheme()
  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={[
        {
          flexDirection: 'row',
          backgroundColor: theme.colors.surface2,
          borderRadius: radius.inline,
          padding: 3,
          gap: 3,
        },
        style,
      ]}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            haptic="light"
            scaleOnPress={false}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            style={{
              flex: 1,
              minHeight: 36,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.chip,
              backgroundColor: selected ? theme.colors.surface : 'transparent',
            }}
          >
            <Text
              variant="secondary"
              tone={selected ? 'default' : 'secondary'}
              numberOfLines={1}
              style={selected ? { fontWeight: '600' } : undefined}
            >
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export interface FilterChipProps {
  label: string
  selected: boolean
  onPress: () => void
  count?: number
  testID?: string
}

/** The horizontally scrolling filter chip used by the Flow feed. */
export function FilterChip({ label, selected, onPress, count, testID }: FilterChipProps) {
  const theme = useTheme()
  return (
    <Pressable
      onPress={onPress}
      haptic="light"
      scaleOnPress={false}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={count === undefined ? label : `${label}, ${count}`}
      testID={testID}
      style={{
        minHeight: 34,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.full,
        backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <Text
        variant="secondary"
        style={{
          color: selected ? theme.colors.onPrimary : theme.colors.textSecondary,
          fontWeight: selected ? '600' : '400',
        }}
      >
        {label}
      </Text>
      {count !== undefined && count > 0 ? (
        <Text
          variant="micro"
          tabular
          style={{ color: selected ? theme.colors.onPrimary : theme.colors.textTertiary }}
        >
          {count}
        </Text>
      ) : null}
    </Pressable>
  )
}

export interface ProgressBarProps {
  /** 0..1 */
  progress: number
  label?: string
  tone?: 'primary' | 'success'
  testID?: string
}

export function ProgressBar({ progress, label, tone = 'primary', testID }: ProgressBarProps) {
  const theme = useTheme()
  const clamped = Math.max(0, Math.min(1, progress))
  const fill = tone === 'success' ? theme.colors.success : theme.colors.primary

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      accessibilityLabel={label}
      style={{ gap: 6 }}
    >
      {label ? (
        <Text variant="micro" tone="secondary">
          {label}
        </Text>
      ) : null}
      <View
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: theme.colors.surface2,
          overflow: 'hidden',
        }}
      >
        <View
          style={{ width: `${clamped * 100}%`, height: '100%', backgroundColor: fill }}
        />
      </View>
    </View>
  )
}

export interface IconButtonProps {
  onPress: () => void
  accessibilityLabel: string
  children: React.ReactNode
  tone?: 'neutral' | 'primary'
  testID?: string
}

/** An icon-only button. `accessibilityLabel` is required — it has no text. */
export function IconButton({
  onPress,
  accessibilityLabel,
  children,
  tone = 'neutral',
  testID,
}: IconButtonProps) {
  const theme = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={{
        width: minTouchTarget,
        height: minTouchTarget,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tone === 'primary' ? theme.colors.primarySoft : 'transparent',
      }}
      pressedStyle={{ backgroundColor: theme.colors.surface2 }}
    >
      {children}
    </Pressable>
  )
}
