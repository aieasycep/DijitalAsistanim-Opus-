import { spacing } from '@da/design-tokens'
import {
  type ReminderPreset,
  nextLocalTimeOccurrence,
  resolveReminderTime,
  systemClock,
} from '@da/domain'
import { formatFullDate, formatTime } from '@da/i18n'
import type { ReminderEntityType } from '@da/validation'
import { useMutation } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { KeyboardAvoidingView, Platform, View } from 'react-native'
import { Button } from '../src/components/ui/Button'
import { Card } from '../src/components/ui/Card'
import { FilterChip } from '../src/components/ui/Controls'
import { Screen } from '../src/components/ui/Screen'
import { ScreenHeader } from '../src/components/ui/ScreenHeader'
import { Text } from '../src/components/ui/Text'
import { TextField } from '../src/components/ui/TextField'
import { TimeField } from '../src/components/ui/TimeField'
import {
  useInvalidateAfterWrite,
  useNotificationPreferences,
  usePreferences,
} from '../src/hooks/queries'
import { useUserContext } from '../src/hooks/useUserContext'
import { useI18n, useT } from '../src/i18n/I18nProvider'
import { errorMessageKey } from '../src/lib/query-client'
import { useApi } from '../src/providers/AppProviders'

/**
 * The chip labels are `reminder.options.*` — the short names of the choices.
 * `reminder.preset.*` are the full sentences `resolveReminderTime` explains its
 * answer with ("Bu akşam {time} saatinde hatırlatılacak."), and rendering one
 * of those on a chip printed a placeholder the user could see.
 */
const PRESETS: ReadonlyArray<{ value: ReminderPreset; labelKey: string }> = [
  { value: 'in_30_minutes', labelKey: 'reminder.options.in30Minutes' },
  { value: 'in_1_hour', labelKey: 'reminder.options.in1Hour' },
  { value: 'this_evening', labelKey: 'reminder.options.thisEvening' },
  { value: 'tomorrow_morning', labelKey: 'reminder.options.tomorrowMorning' },
  { value: 'smart', labelKey: 'reminder.options.smart' },
  { value: 'custom', labelKey: 'reminder.options.custom' },
]

function isEntityType(value: string | undefined): value is ReminderEntityType {
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
 * Postgres renders a `time` column as `HH:MM:SS` while the domain's clock
 * helpers parse `HH:MM` and throw on anything else, so a preference time is
 * trimmed before the preview is computed from it.
 */
function localTime(value: string | null | undefined): string | null {
  const match = typeof value === 'string' ? /^([01]\d|2[0-3]):([0-5]\d)/.exec(value) : null
  return match ? `${match[1]}:${match[2]}` : null
}

/**
 * Set a reminder.
 *
 * A reminder is an internal record — it fires a notification and nothing
 * leaves the app — so unlike a calendar event it is created directly rather
 * than through an approval.
 *
 * The time itself is chosen by `reminder-create`, because the preset resolves
 * against the user's own hours, the quiet hours their notifications actually
 * honour and, for "at a good moment", their calendar. The preview here runs
 * the same `resolveReminderTime` over the preferences the app has loaded, so
 * it agrees with the server rather than guessing at it; the reminder screen
 * then shows the instant the server settled on, and why.
 */
export default function ReminderScreen() {
  const t = useT()
  const { locale } = useI18n()
  const router = useRouter()
  const api = useApi()
  const invalidate = useInvalidateAfterWrite()
  const { timeZone } = useUserContext()
  const preferences = usePreferences()
  const notificationPrefs = useNotificationPreferences()
  const params = useLocalSearchParams<{
    sourceType?: string
    sourceId?: string
    /** `useInsightActions` routes with the entity spelling; both are accepted. */
    entityType?: string
    entityId?: string
    title?: string
  }>()

  const [title, setTitle] = useState(params.title ?? '')
  const [preset, setPreset] = useState<ReminderPreset>('tomorrow_morning')
  const [customTime, setCustomTime] = useState('09:00')

  const entityType = params.sourceType ?? params.entityType
  const entityId = params.sourceId ?? params.entityId

  /**
   * The instant behind the picked wall-clock time, in the user's own zone.
   * Read at the moment it is needed rather than memoised, so a screen left
   * open past the chosen hour still sends the next occurrence of it.
   */
  const customAt = useCallback(
    () => nextLocalTimeOccurrence(systemClock.now(), customTime, timeZone),
    [customTime, timeZone],
  )

  /**
   * The windows the server resolves against: the user's morning and evening,
   * and the quiet hours push delivery enforces. Null until both queries have
   * answered — a preview computed from defaults would name an hour the user
   * never chose, which is worse than no preview at all.
   */
  const windows = useMemo(() => {
    if (!preferences.isSuccess || !notificationPrefs.isSuccess) return null
    const morningTime = localTime(preferences.data?.morningBriefingTime)
    const eveningTime = localTime(preferences.data?.eveningCloseTime)
    if (!morningTime || !eveningTime) return null
    return {
      morningTime,
      eveningTime,
      quietHoursStart: localTime(notificationPrefs.data?.quietHoursStart),
      quietHoursEnd: localTime(notificationPrefs.data?.quietHoursEnd),
    }
  }, [preferences.isSuccess, preferences.data, notificationPrefs.isSuccess, notificationPrefs.data])

  /** `smart` is resolved against the calendar, which only the server can read. */
  const preview = useMemo(() => {
    if (!windows || preset === 'smart') return null
    const resolved = resolveReminderTime({
      preset,
      now: systemClock.now(),
      timeZone,
      windows,
      customAt: customAt().toISOString(),
    })
    return new Date(resolved.remindAt)
  }, [windows, preset, timeZone, customAt])

  const create = useMutation({
    mutationFn: () =>
      api.reminders.create({
        title: title.trim(),
        preset,
        customAt: preset === 'custom' ? customAt().toISOString() : null,
        timeZone,
        ...(isEntityType(entityType) && entityId
          ? { relatedEntityType: entityType, relatedEntityId: entityId }
          : {}),
      }),
    onSuccess: () => invalidate(),
  })

  const created = create.data
  const remindAt = created ? new Date(created.reminder.remindAt) : null

  return (
    <Screen scroll={false}>
      <ScreenHeader title={t('reminder.create.title')} dismiss onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {created && remindAt ? (
          <View style={{ flex: 1, gap: spacing.md, paddingTop: spacing.sm }}>
            <Card style={{ gap: spacing.xxs }} testID="reminder-saved">
              <Text variant="caption" tone="tertiary">
                {t('reminder.create.saved')}
              </Text>
              <Text variant="body">{created.reminder.title}</Text>
              <Text variant="secondary" tone="secondary">
                {t('reminder.card.at', {
                  date: formatFullDate(remindAt, locale, timeZone),
                  time: formatTime(remindAt, locale, timeZone),
                })}
              </Text>
              <Text variant="micro" tone="tertiary">
                {t(created.resolution.explanationKey, {
                  date: formatFullDate(remindAt, locale, timeZone),
                  time: formatTime(remindAt, locale, timeZone),
                  ...(created.resolution.values ?? {}),
                })}
              </Text>
            </Card>

            <View style={{ flex: 1 }} />

            <Button
              label={t('common.action.done')}
              onPress={() => router.back()}
              size="lg"
              fullWidth
              style={{ marginBottom: spacing.md }}
              testID="reminder-done"
            />
          </View>
        ) : (
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

            {preset === 'smart' ? (
              <Card testID="reminder-preview">
                <Text variant="secondary" tone="secondary">
                  {t('reminder.smart.explain')}
                </Text>
              </Card>
            ) : preview ? (
              <Card style={{ gap: spacing.xxs }} testID="reminder-preview">
                <Text variant="caption" tone="tertiary">
                  {t('reminder.card.fires', {
                    time: formatTime(preview, locale, timeZone),
                  })}
                </Text>
                <Text variant="body">{formatFullDate(preview, locale, timeZone)}</Text>
              </Card>
            ) : null}

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
        )}
      </KeyboardAvoidingView>
    </Screen>
  )
}
