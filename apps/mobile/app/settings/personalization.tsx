import { qk } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { View } from 'react-native'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { Toggle } from '../../src/components/ui/Controls'
import { Divider, ListRow } from '../../src/components/ui/Layout'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { EmptyState, SkeletonCard } from '../../src/components/ui/States'
import { Text } from '../../src/components/ui/Text'
import { useLearnedPreferences, usePreferences } from '../../src/hooks/queries'
import { useT } from '../../src/i18n/I18nProvider'
import { track } from '../../src/lib/analytics'
import { errorMessageKey } from '../../src/lib/query-client'
import { useApi } from '../../src/providers/AppProviders'

/**
 * What the assistant has learned, and the switch that stops it learning more.
 *
 * Every learned preference is listed, individually reversible and individually
 * deletable. A model that quietly adapts and cannot be corrected is the thing
 * users mean when they say an app "went weird on them".
 */
export default function PersonalizationSettingsScreen() {
  const t = useT()
  const api = useApi()
  const queryClient = useQueryClient()
  const preferences = usePreferences()
  const learned = useLearnedPreferences()

  const refreshLearned = useCallback(
    () => queryClient.invalidateQueries({ queryKey: qk.learnedPreferences() }),
    [queryClient],
  )

  const setLearning = useMutation({
    mutationFn: (enabled: boolean) =>
      api.settings.updatePreferences({ learnFromInteractions: enabled }),
    onSuccess: async () => {
      track('settings_changed')
      await queryClient.invalidateQueries({ queryKey: qk.preferences() })
    },
  })

  const toggleOne = useMutation({
    mutationFn: (input: { id: string; enabled: boolean }) =>
      api.rules.learnedToggle(input.id, input.enabled),
    onSuccess: refreshLearned,
  })

  const forgetOne = useMutation({
    mutationFn: (id: string) => api.rules.learnedDelete(id),
    onSuccess: refreshLearned,
  })

  const items = learned.data ?? []
  const learningEnabled = preferences.data?.learnFromInteractions ?? true

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader
        title={t('settings.personalization.title')}
        subtitle={t('settings.personalization.subtitle')}
      />

      <View style={{ gap: spacing.md, marginTop: spacing.md }}>
        <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
          <ListRow
            title={t('settings.personalization.learningEnabled')}
            subtitle={t('settings.personalization.learningHint')}
            accessory={
              <Toggle
                value={learningEnabled}
                onValueChange={(next) => setLearning.mutate(next)}
                accessibilityLabel={t('settings.personalization.learningEnabled')}
                testID="personalization-learning"
              />
            }
          />
        </Card>

        <View>
          <Text variant="caption" tone="tertiary" style={{ marginBottom: spacing.xs }}>
            {t('priority.learned.title')}
          </Text>

          {learned.isLoading && items.length === 0 ? (
            <SkeletonCard />
          ) : items.length === 0 ? (
            <EmptyState
              icon="psychology"
              title={t('priority.learned.empty')}
              description={t('settings.personalization.learnedEmpty')}
            />
          ) : (
            <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
              {items.map((item, index) => (
                <View key={item.id}>
                  {index > 0 ? <Divider /> : null}
                  <ListRow
                    title={item.statement}
                    subtitle={t('priority.learned.confidence', {
                      confidence: Math.round(item.strength * 100),
                    })}
                    accessory={
                      <Toggle
                        value={item.enabled}
                        onValueChange={(next) => toggleOne.mutate({ id: item.id, enabled: next })}
                        accessibilityLabel={item.statement}
                        testID={`learned-toggle-${item.id}`}
                      />
                    }
                    testID={`learned-${item.id}`}
                  />
                  <Button
                    label={t('priority.learned.forget')}
                    onPress={() => forgetOne.mutate(item.id)}
                    variant="ghost"
                    size="sm"
                    loading={forgetOne.isPending}
                    style={{ alignSelf: 'flex-start', marginBottom: spacing.xs }}
                    testID={`learned-forget-${item.id}`}
                  />
                </View>
              ))}
            </Card>
          )}
        </View>

        {setLearning.isError || toggleOne.isError || forgetOne.isError ? (
          <Text variant="secondary" tone="critical">
            {t(errorMessageKey(setLearning.error ?? toggleOne.error ?? forgetOne.error))}
          </Text>
        ) : null}

        <Text variant="micro" tone="tertiary">
          {t('assistant.memory.manage')}
        </Text>
      </View>
    </Screen>
  )
}
