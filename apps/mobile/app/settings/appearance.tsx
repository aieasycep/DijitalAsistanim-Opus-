import { qk, type PreferencesPatch } from '@da/api-client'
import { type ColorSchemePreference, spacing } from '@da/design-tokens'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { View } from 'react-native'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { SegmentedControl, Toggle } from '../../src/components/ui/Controls'
import { ListRow } from '../../src/components/ui/Layout'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { Text } from '../../src/components/ui/Text'
import { usePreferences } from '../../src/hooks/queries'
import { useT } from '../../src/i18n/I18nProvider'
import { track } from '../../src/lib/analytics'
import { errorMessageKey, isRetryable } from '../../src/lib/query-client'
import { useApi } from '../../src/providers/AppProviders'
import { useThemeContext } from '../../src/theme/ThemeProvider'

/**
 * Appearance.
 *
 * The theme applies instantly and locally, then syncs to the server so a second
 * device opens in the same skin — waiting on a round trip to redraw would make
 * the switch feel broken.
 */
export default function AppearanceSettingsScreen() {
  const t = useT()
  const api = useApi()
  const queryClient = useQueryClient()
  const { preference, setPreference, reduceMotion, setReduceMotionPreference } = useThemeContext()
  const prefsQuery = usePreferences()

  const update = useMutation({
    mutationFn: (patch: PreferencesPatch) => api.settings.updatePreferences(patch),
    onSuccess: async () => {
      track('settings_changed')
      await queryClient.invalidateQueries({ queryKey: qk.preferences() })
    },
  })

  const changeScheme = useCallback(
    (next: ColorSchemePreference) => {
      setPreference(next)
      update.mutate({ colorScheme: next })
    },
    [setPreference, update],
  )

  const changeReduceMotion = useCallback(
    (next: boolean) => {
      setReduceMotionPreference(next)
      update.mutate({ reduceMotion: next })
    },
    [setReduceMotionPreference, update],
  )

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader title={t('settings.appearance.title')} />

      <View style={{ gap: spacing.md, marginTop: spacing.md }}>
        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary">
            {t('settings.appearance.theme')}
          </Text>
          <SegmentedControl<ColorSchemePreference>
            options={[
              { value: 'system', label: t('settings.appearance.themeSystem') },
              { value: 'light', label: t('settings.appearance.themeLight') },
              { value: 'dark', label: t('settings.appearance.themeDark') },
            ]}
            value={preference}
            onChange={changeScheme}
            testID="appearance-theme"
          />
        </View>

        <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
          <ListRow
            title={t('settings.appearance.reduceMotion')}
            icon="animation"
            accessory={
              <Toggle
                value={reduceMotion}
                onValueChange={changeReduceMotion}
                accessibilityLabel={t('settings.appearance.reduceMotion')}
                testID="appearance-reduce-motion"
              />
            }
          />
        </Card>

        <Text variant="micro" tone="tertiary">
          {t('settings.appearance.textSizeHint')}
        </Text>

        {update.isError ? (
          <Text variant="secondary" tone="critical">
            {t(errorMessageKey(update.error))}
          </Text>
        ) : null}

        {/* The theme is applied locally the moment it is tapped, so a failed
            preferences query does not break this screen — it only means the
            screen cannot say whether the server agrees. Silence there read as
            "in sync"; this says which of the two it is and offers the retry. */}
        {prefsQuery.isError ? (
          <Card tone="critical" style={{ gap: spacing.xs }}>
            <Text variant="secondary" tone="critical">
              {t(errorMessageKey(prefsQuery.error))}
            </Text>
            {isRetryable(prefsQuery.error) ? (
              <Button
                label={t('common.action.retry')}
                onPress={() => void prefsQuery.refetch()}
                variant="tonal"
                size="sm"
                testID="appearance-retry"
              />
            ) : null}
          </Card>
        ) : prefsQuery.data?.colorScheme && prefsQuery.data.colorScheme !== preference ? (
          <Text variant="micro" tone="tertiary">
            {t('common.state.syncing')}
          </Text>
        ) : null}
      </View>
    </Screen>
  )
}
