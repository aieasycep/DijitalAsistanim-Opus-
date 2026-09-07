import { qk } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import { DEFAULT_TIME_ZONE } from '@da/domain'
import { formatWeekdayName } from '@da/i18n'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as Localization from 'expo-localization'
import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { View } from 'react-native'
import { StepFrame } from '../../src/components/onboarding/StepFrame'
import { Card } from '../../src/components/ui/Card'
import { FilterChip } from '../../src/components/ui/Controls'
import { ListRow } from '../../src/components/ui/Layout'
import { Text } from '../../src/components/ui/Text'
import { TimeField } from '../../src/components/ui/TimeField'
import { useI18n, useT } from '../../src/i18n/I18nProvider'
import { errorMessageKey } from '../../src/lib/query-client'
import { useApi } from '../../src/providers/AppProviders'
import { useSessionStore } from '../../src/stores/session'

/** Monday-first, matching the Turkish week and the plan screen's grouping. */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0]

const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5]

/**
 * Step five: the shape of the user's day.
 *
 * Every value here is a real scheduling input: the morning briefing fires at
 * the wake time, the evening close at the sleep time, and the days that are not
 * work days become quiet days on which no briefing is generated at all.
 */
export default function PreferencesStep() {
  const t = useT()
  const { locale } = useI18n()
  const router = useRouter()
  const api = useApi()
  const queryClient = useQueryClient()
  const setProfile = useSessionStore((s) => s.setProfile)

  const [wake, setWake] = useState('07:30')
  const [sleep, setSleep] = useState('20:30')
  const [quietStart, setQuietStart] = useState('22:30')
  const [quietEnd, setQuietEnd] = useState('07:00')
  const [workDays, setWorkDays] = useState<number[]>(DEFAULT_WORK_DAYS)

  const timeZone = Localization.getCalendars()[0]?.timeZone ?? DEFAULT_TIME_ZONE

  const toggleDay = useCallback((index: number) => {
    setWorkDays((current) =>
      current.includes(index) ? current.filter((entry) => entry !== index) : [...current, index],
    )
  }, [])

  const save = useMutation({
    mutationFn: async () => {
      const quietDays = WEEKDAYS.filter((index) => !workDays.includes(index))
      await api.settings.updatePreferences({
        morningBriefingTime: wake,
        eveningCloseTime: sleep,
        quietHoursStart: quietStart,
        quietHoursEnd: quietEnd,
        quietDays,
        timeZone,
      })
      // The zone lives on the profile as well: everything scheduled server-side
      // resolves through it, so the two must not disagree.
      return api.settings.updateProfile({ timeZone })
    },
    onSuccess: async (profile) => {
      setProfile(profile)
      await queryClient.invalidateQueries({ queryKey: qk.preferences() })
      router.push('/(onboarding)/analysis')
    },
  })

  return (
    <StepFrame
      step="preferences"
      title={t('onboarding.preferences.title')}
      description={t('onboarding.preferences.body')}
      primaryLabel={t('onboarding.preferences.primary')}
      onPrimary={() => save.mutate()}
      primaryLoading={save.isPending}
      testID="onboarding-preferences"
    >
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <TimeField
            label={t('onboarding.preferences.wakeLabel')}
            value={wake}
            onChange={setWake}
            testID="wake-time"
          />
        </View>
        <View style={{ flex: 1 }}>
          <TimeField
            label={t('onboarding.preferences.sleepLabel')}
            value={sleep}
            onChange={setSleep}
            testID="sleep-time"
          />
        </View>
      </View>

      <View style={{ gap: spacing.xs }}>
        <Text variant="caption" tone="secondary">
          {t('onboarding.preferences.workDaysLabel')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {WEEKDAYS.map((index) => (
            <FilterChip
              key={index}
              label={formatWeekdayName(index, locale)}
              selected={workDays.includes(index)}
              onPress={() => toggleDay(index)}
              testID={`workday-${index}`}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.xs }}>
        <Text variant="caption" tone="secondary">
          {t('onboarding.preferences.quietHoursLabel')}
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <TimeField
              label={t('notifications.quietHours.from')}
              value={quietStart}
              onChange={setQuietStart}
              testID="quiet-start"
            />
          </View>
          <View style={{ flex: 1 }}>
            <TimeField
              label={t('notifications.quietHours.to')}
              value={quietEnd}
              onChange={setQuietEnd}
              testID="quiet-end"
            />
          </View>
        </View>
        <Text variant="micro" tone="tertiary">
          {t('onboarding.preferences.quietHoursHint')}
        </Text>
      </View>

      <ListRow title={t('onboarding.preferences.timeZoneLabel')} value={timeZone} icon="public" />

      {save.isError ? (
        <Card tone="critical">
          <Text variant="secondary" tone="critical">
            {t(errorMessageKey(save.error))}
          </Text>
        </Card>
      ) : null}
    </StepFrame>
  )
}
