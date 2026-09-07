import { spacing } from '@da/design-tokens'
import { MaterialIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { type ReactNode } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useT } from '../../i18n/I18nProvider'
import { useTheme } from '../../theme/ThemeProvider'
import { IconButton } from './Controls'
import { Text } from './Text'

export interface ScreenHeaderProps {
  title: string
  subtitle?: string
  /** Defaults to `router.back()`; pass an explicit handler for a modal. */
  onBack?: () => void
  /** Close (×) instead of back (‹) — used by modal presentations. */
  dismiss?: boolean
  /** Trailing controls, e.g. an overflow button. */
  actions?: ReactNode
  /** Set false when the screen is inside a group that already offsets the inset. */
  withSafeArea?: boolean
  testID?: string
}

/**
 * The header for every pushed or presented screen.
 *
 * Back is always present and always in the same place: a detail screen the user
 * cannot leave with one thumb is the fastest way to make an app feel like a
 * webview.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  dismiss = false,
  actions,
  withSafeArea = true,
  testID,
}: ScreenHeaderProps) {
  const t = useT()
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const goBack = () => {
    if (onBack) {
      onBack()
      return
    }
    if (router.canGoBack()) router.back()
    else router.replace('/(tabs)/today')
  }

  return (
    <View
      testID={testID}
      style={{
        paddingTop: withSafeArea ? insets.top + spacing.xs : spacing.xs,
        paddingBottom: spacing.xs,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
      }}
    >
      <IconButton
        onPress={goBack}
        accessibilityLabel={dismiss ? t('a11y.button.close') : t('a11y.button.back')}
        testID="screen-header-back"
      >
        <MaterialIcons
          name={dismiss ? 'close' : 'arrow-back-ios-new'}
          size={dismiss ? 22 : 18}
          color={theme.colors.text}
        />
      </IconButton>
      <View style={{ flex: 1 }}>
        <Text variant="h3" numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="micro" tone="tertiary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actions ? (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>{actions}</View>
      ) : null}
    </View>
  )
}
