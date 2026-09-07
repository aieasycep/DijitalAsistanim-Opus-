import { qk, type PreferencesPatch } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import { RETENTION_WINDOWS, type RetentionWindow } from '@da/domain'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { View } from 'react-native'
import { Card } from '../../src/components/ui/Card'
import { FilterChip, Toggle } from '../../src/components/ui/Controls'
import { Divider, ListRow } from '../../src/components/ui/Layout'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { SkeletonCard } from '../../src/components/ui/States'
import { Text } from '../../src/components/ui/Text'
import { usePreferences } from '../../src/hooks/queries'
import { useT } from '../../src/i18n/I18nProvider'
import { track } from '../../src/lib/analytics'
import { errorMessageKey } from '../../src/lib/query-client'
import { useApi } from '../../src/providers/AppProviders'

/** How far back the first sync reaches. Longer costs more to analyse. */
const HISTORY_OPTIONS = [30, 90, 180, 365] as const

/**
 * What the assistant reads, and how long it keeps it.
 *
 * Retention is enforced by a scheduled cleanup on the backend, so shortening
 * the window here actually deletes rows rather than only hiding them.
 */
export default function DataSourcesSettingsScreen() {
  const t = useT()
  const api = useApi()
  const queryClient = useQueryClient()
  const query = usePreferences()

  const update = useMutation({
    mutationFn: (patch: PreferencesPatch) => api.settings.updatePreferences(patch),
    onSuccess: async () => {
      track('settings_changed')
      await queryClient.invalidateQueries({ queryKey: qk.preferences() })
    },
  })

  const apply = useCallback((patch: PreferencesPatch) => update.mutate(patch), [update])
  const prefs = query.data

  if (!prefs) {
    return (
      <Screen>
        <ScreenHeader title={t('settings.dataSources.title')} />
        <SkeletonCard />
      </Screen>
    )
  }

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader
        title={t('settings.dataSources.title')}
        subtitle={t('settings.dataSources.subtitle')}
      />

      <View style={{ gap: spacing.md, marginTop: spacing.md }}>
        <Text variant="secondary" tone="secondary">
          {t('settings.dataSources.hint')}
        </Text>

        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary">
            {t('settings.dataSources.historyWindow')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {HISTORY_OPTIONS.map((days) => (
              <FilterChip
                key={days}
                label={`${days}`}
                selected={prefs.historyDays === days}
                onPress={() => apply({ historyDays: days })}
                testID={`history-${days}`}
              />
            ))}
          </View>
          <Text variant="micro" tone="tertiary">
            {t('settings.dataSources.historyWindowHint')}
          </Text>
        </View>

        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary">
            {t('settings.dataSources.retention')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {RETENTION_WINDOWS.map((window: RetentionWindow) => (
              <FilterChip
                key={window}
                label={t(`settings.dataSources.retentionOption.${window}`)}
                selected={prefs.retentionWindow === window}
                onPress={() => apply({ retentionWindow: window })}
                testID={`retention-${window}`}
              />
            ))}
          </View>
          <Text variant="micro" tone="tertiary">
            {t('settings.dataSources.retentionHint')}
          </Text>
        </View>

        {/* Two exclusions are structural rather than configurable: promotional
            mail and archived threads are never analysed, so they are stated as
            facts instead of switches that cannot move. */}
        <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
          <ListRow
            title={t('settings.dataSources.includePromotions')}
            icon="local-offer"
            value={t('common.state.inactive')}
          />
          <Divider />
          <ListRow
            title={t('settings.dataSources.includeArchived')}
            icon="archive"
            value={t('common.state.inactive')}
          />
        </Card>

        <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
          <ListRow
            title={t('capture.title')}
            subtitle={t('capture.subtitle')}
            icon="attachment"
            accessory={
              <Toggle
                value={prefs.analyzeAttachments}
                onValueChange={(next) => apply({ analyzeAttachments: next })}
                accessibilityLabel={t('capture.title')}
                testID="analyze-attachments"
              />
            }
          />
        </Card>

        {update.isError ? (
          <Text variant="secondary" tone="critical">
            {t(errorMessageKey(update.error))}
          </Text>
        ) : update.isSuccess ? (
          <Text variant="micro" tone="success">
            {t('settings.dataSources.saved')}
          </Text>
        ) : null}
      </View>
    </Screen>
  )
}
