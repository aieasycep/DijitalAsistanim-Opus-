import { qk } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import { type Locale } from '@da/domain'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { View } from 'react-native'
import { Card } from '../../src/components/ui/Card'
import { Divider, ListRow } from '../../src/components/ui/Layout'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { Text } from '../../src/components/ui/Text'
import { useI18n, useT, type LanguagePreference } from '../../src/i18n/I18nProvider'
import { track } from '../../src/lib/analytics'
import { errorMessageKey } from '../../src/lib/query-client'
import { useApi } from '../../src/providers/AppProviders'
import { useSessionStore } from '../../src/stores/session'

const OPTIONS: ReadonlyArray<{ value: LanguagePreference; labelKey: string }> = [
  { value: 'system', labelKey: 'settings.language.systemDefault' },
  { value: 'tr', labelKey: 'settings.language.tr' },
  { value: 'en', labelKey: 'settings.language.en' },
]

/**
 * Language.
 *
 * The choice changes the app immediately and is also sent to the backend,
 * because the briefings, notifications and reply drafts are generated
 * server-side and have to be written in the same language the user reads.
 */
export default function LanguageSettingsScreen() {
  const t = useT()
  const { preference, setPreference, locale } = useI18n()
  const api = useApi()
  const queryClient = useQueryClient()
  const setProfile = useSessionStore((s) => s.setProfile)

  const update = useMutation({
    mutationFn: async (next: LanguagePreference) => {
      await api.settings.updatePreferences({ language: next })
      // The profile carries the locale the server generates content in; when
      // the user says "system" we send the resolved locale rather than a word
      // the backend would have to guess at.
      const resolved: Locale = next === 'system' ? locale : next
      return api.settings.updateProfile({ locale: resolved })
    },
    onSuccess: async (profile) => {
      track('settings_changed')
      setProfile(profile)
      await queryClient.invalidateQueries({ queryKey: qk.preferences() })
    },
  })

  const choose = useCallback(
    (next: LanguagePreference) => {
      setPreference(next)
      update.mutate(next)
    },
    [setPreference, update],
  )

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader title={t('settings.language.title')} />

      <View style={{ gap: spacing.md, marginTop: spacing.md }}>
        <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
          {OPTIONS.map((option, index) => (
            <View key={option.value}>
              {index > 0 ? <Divider /> : null}
              <ListRow
                title={t(option.labelKey)}
                icon={
                  preference === option.value ? 'radio-button-checked' : 'radio-button-unchecked'
                }
                onPress={() => choose(option.value)}
                testID={`language-${option.value}`}
              />
            </View>
          ))}
        </Card>

        <Text variant="micro" tone="tertiary">
          {t('settings.language.hint')}
        </Text>

        {update.isSuccess ? (
          <Text variant="secondary" tone="success">
            {t('settings.language.changed')}
          </Text>
        ) : null}
        {update.isError ? (
          <Text variant="secondary" tone="critical">
            {t(errorMessageKey(update.error))}
          </Text>
        ) : null}
      </View>
    </Screen>
  )
}
