import { spacing } from '@da/design-tokens'
import { MaterialIcons } from '@expo/vector-icons'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useT } from '../../i18n/I18nProvider'
import { useTheme } from '../../theme/ThemeProvider'
import { IconButton } from '../ui/Controls'
import { Text } from '../ui/Text'

export interface TodayHeaderProps {
  /** Already-interpolated greeting, e.g. "Günaydın, Yunus". */
  greeting: string
  /** Localised date line, e.g. "Cuma, 5 Eylül". */
  dateLabel: string
  onOpenSearch: () => void
  onOpenProfile: () => void
  onOpenCapture: () => void
}

/**
 * The Today header: greeting, date, and the three global entry points.
 *
 * Capture sits here rather than behind a floating button because it is the one
 * action a user reaches for while looking at something else — a screenshot, a
 * poster, a link — and it should be one tap from the home screen.
 */
export function TodayHeader({
  greeting,
  dateLabel,
  onOpenSearch,
  onOpenProfile,
  onOpenCapture,
}: TodayHeaderProps) {
  const theme = useTheme()
  const t = useT()
  const insets = useSafeAreaInsets()

  return (
    <View style={{ paddingTop: insets.top + spacing.xs, gap: 2 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.xs,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text variant="h1" numberOfLines={1} accessibilityRole="header">
            {greeting}
          </Text>
          <Text variant="secondary" tone="tertiary">
            {dateLabel}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <IconButton
            onPress={onOpenCapture}
            accessibilityLabel={t('a11y.button.capture')}
            testID="today-capture"
          >
            <MaterialIcons name="add-a-photo" size={21} color={theme.colors.textSecondary} />
          </IconButton>
          <IconButton
            onPress={onOpenSearch}
            accessibilityLabel={t('a11y.button.search')}
            testID="today-search"
          >
            <MaterialIcons name="search" size={22} color={theme.colors.textSecondary} />
          </IconButton>
          <IconButton
            onPress={onOpenProfile}
            accessibilityLabel={t('a11y.button.profile')}
            testID="today-settings"
          >
            <MaterialIcons name="account-circle" size={26} color={theme.colors.textSecondary} />
          </IconButton>
        </View>
      </View>
    </View>
  )
}
