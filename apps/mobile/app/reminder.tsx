import { qk } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import {
  type ReminderPreset,
  type SourceType,
  nextLocalTimeOccurrence,
  systemClock,
} from '@da/domain'
import { formatFullDate, formatTime } from '@da/i18n'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { KeyboardAvoidingView, Platform, View } from 'react-native'
import { Button } from '../src/components/ui/Button'
import { Card } from '../src/components/ui/Card'
import { FilterChip } from '../src/components/ui/Controls'
import { Screen } from '../src/components/ui/Screen'
import { ScreenHeader } from '../src/components/ui/ScreenHeader'
import { Text } from '../src/components/ui/Text'
import { TextField } from '../src/components/ui/TextField'
import { TimeField } from '../src/components/ui/TimeField'
import { useInvalidateAfterWrite } from '../src/hooks/queries'
import { useUserContext } from '../src/hooks/useUserContext'
import { useI18n, useT } from '../src/i18n/I18nProvider'
import { errorMessageKey } from '../src/lib/query-client'
import { useApi } from '../src/providers/AppProviders'

const PRESETS: ReadonlyArray<{ value: ReminderPreset; labelKey: string }> = [
  { value: 'in_30_minutes', labelKey: 'reminder.preset.in30Minutes' },
  { value: 'in_1_hour', labelKey: 'reminder.preset.in1Hour' },
  { value: 'this_evening', labelKey: 'reminder.preset.thisEvening' },
  { value: 'tomorrow_morning', labelKey: 'reminder.preset.tomorrowMorning' },
  { value: 'custom', labelKey: 'reminder.preset.custom' },
]

function isSourceType(value: string | undefined): value is Exclude<SourceType, 'user_input'> {
  return (
    value === 'email' ||
    value === 'calendar_event' ||
    value === 'task' ||
    value === 'capture' ||
    value === 'commitment' ||
    value === 'contact' ||
    value === 'notification'
  )
}

/**
 * Set a reminder.
 *
 * A reminder is an internal record — it fires a notification and nothing
 * leaves the app — so unlike a calendar event it is created directly rather
 * than through an approval. The evening preset resolves against the user's own
 * zone, so "this evening" means their evening.
 */
export default function ReminderScreen() {
  const t = useT()
  const { locale } = useI18n()
  const router = useRouter()
  const api = useApi()
  const queryClient = useQueryClient()
  const invalidate = useInvalidateAfterWrite()
  const { timeZone } = useUserContext()
  const params = useLocalSearchParams<{
    sourceType?: string
    sourceId?: string
    title?: string
  }>()

  const [title, setTitle] = useState(params.title ?? '')
  const [preset, setPreset] = useState<ReminderPreset>('tomorrow_morning')
  const [customTime, setCustomTime] = useState('09:00')

  const now = systemClock.now()

  const remindAt = useMemo(() => {
    switch (preset) {
      case 'in_30_minutes':
        return new Date(now.getTime() + 30 * 60_000)
      case 'in_1_hour':
        return new Date(now.getTime() + 60 * 60_000)
      case 'this_evening':
        return nextLocalTimeOccurrence(now, '19:00', timeZone)
      case 'tomorrow_morning':
        return nextLocalTimeOccurrence(now, '09:00', timeZone)
      case 'custom':
        return nextLocalTimeOccurrence(now, customTime, timeZone)
      case 'smart':
        // Resolved server-side against the calendar; the client proposes the
        // next morning so the preview is never empty.
        return nextLocalTimeOccurrence(now, '09:00', timeZone)
    }
  }, [preset, customTime, now, timeZone])

  const create = useMutation({
    mutationFn: () =>
      api.reminders.create({
        title: title.trim(),
        remindAt: remindAt.toISOString(),
        preset,
        ...(isSourceType(params.sourceType) && params.sourceId
          ? { relatedEntityType: params.sourceType, relatedEntityId: params.sourceId }
          : {}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.tasks() })
      await invalidate()
      router.back()
    },
  })

  return (
    <Screen scroll={false}>
      <ScreenHeader title={t('reminder.create.title')} dismiss onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ flex: 1, gap: spacing.md, paddingTop: spacing.sm }}>
          <TextField
            label={t('reminder.create.whatLabel')}
            value={title}
            onChangeText={setTitle}
            placeholder={t('reminder.create.whatPlaceholder')}
            autoFocus={!params.title}
            testID="reminder-title"
          />

          <View style={{ gap: spacing.xs }}>
            <Text variant="caption" tone="secondary">
              {t('reminder.create.whenLabel')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {PRESETS.map((entry) => (
                <FilterChip
                  key={entry.value}
                  label={t(entry.labelKey)}
                  selected={preset === entry.value}
                  onPress={() => setPreset(entry.value)}
                  testID={`reminder-preset-${entry.value}`}
                />
              ))}
            </View>
          </View>

          {preset === 'custom' ? (
            <TimeField
              label={t('reminder.create.customTime')}
              value={customTime}
              onChange={setCustomTime}
              minuteStep={5}
              testID="reminder-time"
            />
          ) : null}

          <Card style={{ gap: spacing.xxs }}>
            <Text variant="caption" tone="tertiary">
              {t('reminder.card.fires')}
            </Text>
            <Text variant="body">
              {formatFullDate(remindAt, locale, timeZone)} ·{' '}
              {formatTime(remindAt, locale, timeZone)}
            </Text>
            <Text variant="micro" tone="tertiary">
              {t('reminder.quietHoursShifted')}
            </Text>
          </Card>

          {create.isError ? (
            <Card tone="critical">
              <Text variant="secondary" tone="critical">
                {t(errorMessageKey(create.error))}
              </Text>
            </Card>
          ) : null}

          <View style={{ flex: 1 }} />

          <Button
            label={t('reminder.create.save')}
            onPress={() => create.mutate()}
            size="lg"
            fullWidth
            loading={create.isPending}
            disabled={title.trim().length < 2}
            style={{ marginBottom: spacing.md }}
            testID="reminder-save"
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}
