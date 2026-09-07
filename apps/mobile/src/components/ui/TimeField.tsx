import { radius, spacing } from '@da/design-tokens'
import { MaterialIcons } from '@expo/vector-icons'
import { useMemo, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useT } from '../../i18n/I18nProvider'
import { useTheme } from '../../theme/ThemeProvider'
import { Pressable } from './Pressable'
import { Sheet } from './Sheet'
import { Text } from './Text'

export interface TimeFieldProps {
  label: string
  /** `HH:MM`, 24-hour, no zone — the same shape the backend stores. */
  value: string
  onChange: (value: string) => void
  /** Granularity of the minute column. */
  minuteStep?: 5 | 10 | 15 | 30
  testID?: string
}

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

/**
 * A wall-clock time field.
 *
 * Deliberately not the OS date picker: these values are wall-clock preferences
 * with no date attached, and the platform pickers all insist on a `Date`, which
 * is how a "07:30 briefing" quietly becomes 06:30 after a DST change.
 */
export function TimeField({ label, value, onChange, minuteStep = 15, testID }: TimeFieldProps) {
  const t = useT()
  const theme = useTheme()
  const [open, setOpen] = useState(false)

  const [hourPart = '00', minutePart = '00'] = value.split(':')
  const hour = Number.parseInt(hourPart, 10) || 0
  const minute = Number.parseInt(minutePart, 10) || 0

  const hours = useMemo(() => Array.from({ length: 24 }, (_, index) => index), [])
  const minutes = useMemo(
    () => Array.from({ length: 60 / minuteStep }, (_, index) => index * minuteStep),
    [minuteStep],
  )

  const column = (
    items: number[],
    selected: number,
    onSelect: (next: number) => void,
    columnTestId: string,
  ) => (
    <ScrollView
      style={{ maxHeight: 220, flex: 1 }}
      contentContainerStyle={{ gap: 4, paddingVertical: spacing.xs }}
      showsVerticalScrollIndicator={false}
      testID={columnTestId}
    >
      {items.map((item) => {
        const isSelected = item === selected
        return (
          <Pressable
            key={item}
            onPress={() => onSelect(item)}
            haptic="light"
            scaleOnPress={false}
            accessibilityLabel={pad(item)}
            accessibilityState={{ selected: isSelected }}
            style={{
              paddingVertical: spacing.xs,
              borderRadius: radius.inline,
              alignItems: 'center',
              backgroundColor: isSelected ? theme.colors.primarySoft : 'transparent',
            }}
            testID={`${columnTestId}-${pad(item)}`}
          >
            <Text variant="body" tone={isSelected ? 'primary' : 'default'} tabular>
              {pad(item)}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )

  return (
    <View style={{ gap: 6 }}>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel={`${label}: ${value}`}
        haptic="light"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: theme.colors.surface,
          borderRadius: radius.button,
          borderWidth: 1,
          borderColor: theme.colors.hairline,
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xs,
          minHeight: 44,
        }}
        testID={testID}
      >
        <Text variant="body" tabular>
          {`${pad(hour)}:${pad(minute)}`}
        </Text>
        <MaterialIcons name="schedule" size={18} color={theme.colors.textTertiary} />
      </Pressable>

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={label}
        closeLabel={t('common.action.close')}
        scrollable={false}
        testID={testID ? `${testID}-sheet` : undefined}
      >
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          {column(hours, hour, (next) => onChange(`${pad(next)}:${pad(minute)}`), 'time-hours')}
          {column(minutes, minute, (next) => onChange(`${pad(hour)}:${pad(next)}`), 'time-minutes')}
        </View>
      </Sheet>
    </View>
  )
}
