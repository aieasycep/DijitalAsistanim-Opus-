import { qk } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import type { PreferencesPatch } from '@da/api-client'
import { formatWeekdayName } from '@da/i18n'
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
import { TimeField } from '../../src/components/ui/TimeField'
import { usePreferences } from '../../src/hooks/queries'
import { useEntitlements } from '../../src/hooks/useEntitlements'
import { useI18n, useT } from '../../src/i18n/I18nProvider'
import { track } from '../../src/lib/analytics'
import { errorMessageKey } from '../../src/lib/query-client'
import { useApi } from '../../src/providers/AppProviders'

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0]

/**
 * When the briefings arrive.
 *
 * Each toggle writes straight through — a settings screen with a Save button
 * that people forget to press is a settings screen that silently does nothing.
 * The midday, evening and weekly briefings are Pro, and the switch says so
 * rather than disappearing.
 */
export default function BriefingSettingsScreen() {
  const t = useT()
  const { locale } = useI18n()
  const api = useApi()
  const queryClient = useQueryClient()
  const query = usePreferences()
  const { can } = useEntitlements()

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
        <ScreenHeader title={t('settings.briefing.title')} />
        <SkeletonCard />
      </Screen>
    )
  }

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader title={t('settings.briefing.title')} subtitle={t('settings.briefing.subtitle')} />

      <View style={{ gap: spacing.md, marginTop: spacing.md }}>
        <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
          {/* The morning briefing is the product; it has no off switch, so it
              is stated rather than offered as a toggle that cannot be moved. */}
          <ListRow
            title={t('settings.briefing.morningEnabled')}
            icon="wb-twilight"
            value={t('common.state.active')}
          />
          <Divider />
          <View style={{ paddingVertical: spacing.xs }}>
            <TimeField
              label={t('settings.briefing.timeLabel')}
              value={prefs.morningBriefingTime}
              onChange={(next) => apply({ morningBriefingTime: next })}
              testID="briefing-morning-time"
            />
          </View>

          <Divider />
          <ListRow
            title={t('settings.briefing.middayEnabled')}
            subtitle={can('midday_pulse') ? undefined : t('paywall.lock.body')}
            icon="light-mode"
            accessory={
              <Toggle
                value={prefs.middayPulseEnabled && can('midday_pulse')}
                disabled={!can('midday_pulse')}
                onValueChange={(next) => apply({ middayPulseEnabled: next })}
                accessibilityLabel={t('settings.briefing.middayEnabled')}
                testID="briefing-midday"
              />
            }
          />
          {prefs.middayPulseEnabled && can('midday_pulse') ? (
            <View style={{ paddingVertical: spacing.xs }}>
              <TimeField
                label={t('notifications.timing.middayAt')}
                value={prefs.middayPulseTime}
                onChange={(next) => apply({ middayPulseTime: next })}
                testID="briefing-midday-time"
              />
            </View>
          ) : null}

          <Divider />
          <ListRow
            title={t('settings.briefing.eveningEnabled')}
            subtitle={can('evening_close') ? undefined : t('paywall.lock.body')}
            icon="nights-stay"
            accessory={
              <Toggle
                value={prefs.eveningCloseEnabled && can('evening_close')}
                disabled={!can('evening_close')}
                onValueChange={(next) => apply({ eveningCloseEnabled: next })}
                accessibilityLabel={t('settings.briefing.eveningEnabled')}
                testID="briefing-evening"
              />
            }
          />
          {prefs.eveningCloseEnabled && can('evening_close') ? (
            <View style={{ paddingVertical: spacing.xs }}>
              <TimeField
                label={t('notifications.timing.eveningAt')}
                value={prefs.eveningCloseTime}
                onChange={(next) => apply({ eveningCloseTime: next })}
                testID="briefing-evening-time"
              />
            </View>
          ) : null}

          <Divider />
          <ListRow
            title={t('settings.briefing.weeklyEnabled')}
            subtitle={can('weekly_review') ? undefined : t('paywall.lock.body')}
            icon="calendar-view-week"
            accessory={
              <Toggle
                value={prefs.weeklyReviewEnabled && can('weekly_review')}
                disabled={!can('weekly_review')}
                onValueChange={(next) => apply({ weeklyReviewEnabled: next })}
                accessibilityLabel={t('settings.briefing.weeklyEnabled')}
                testID="briefing-weekly"
              />
            }
          />
        </Card>

        {prefs.weeklyReviewEnabled && can('weekly_review') ? (
          <View style={{ gap: spacing.xs }}>
            <Text variant="caption" tone="secondary">
              {t('settings.briefing.weeklyDayLabel')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {WEEKDAYS.map((index) => (
                <FilterChip
                  key={index}
                  label={formatWeekdayName(index, locale)}
                  selected={prefs.weeklyReviewWeekday === index}
                  onPress={() => apply({ weeklyReviewWeekday: index })}
                  testID={`briefing-weekday-${index}`}
                />
              ))}
            </View>
            <TimeField
              label={t('notifications.timing.weeklyOn')}
              value={prefs.weeklyReviewTime}
              onChange={(next) => apply({ weeklyReviewTime: next })}
              testID="briefing-weekly-time"
            />
          </View>
        ) : null}

        <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
          <ListRow
            title={t('settings.briefing.audioEnabled')}
            subtitle={t('settings.briefing.audioHint')}
            icon="volume-up"
            accessory={
              <Toggle
                value={prefs.audioBriefingVoice !== null}
                onValueChange={(next) => apply({ audioBriefingVoice: next ? 'default' : null })}
                accessibilityLabel={t('settings.briefing.audioEnabled')}
                testID="briefing-audio"
              />
            }
          />
          <Divider />
          <ListRow
            title={t('plan.week.title')}
            subtitle={t('calendar.weekend')}
            icon="weekend"
            accessory={
              <Toggle
                value={prefs.briefingOnWeekends}
                onValueChange={(next) => apply({ briefingOnWeekends: next })}
                accessibilityLabel={t('calendar.weekend')}
                testID="briefing-weekends"
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
            {t('settings.briefing.saved')}
          </Text>
        ) : null}
      </View>
    </Screen>
  )
}
