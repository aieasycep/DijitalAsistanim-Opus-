import { qk, type NotificationPreferencesPatch } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import { LOCK_SCREEN_PRIVACY, NOTIFICATION_CATEGORIES, type LockScreenPrivacy } from '@da/domain'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { Linking, Platform, View } from 'react-native'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { SegmentedControl, Toggle } from '../../src/components/ui/Controls'
import { Divider, ListRow } from '../../src/components/ui/Layout'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { SkeletonCard } from '../../src/components/ui/States'
import { Text } from '../../src/components/ui/Text'
import { TimeField } from '../../src/components/ui/TimeField'
import { useNotificationPreferences } from '../../src/hooks/queries'
import { usePushRegistration } from '../../src/hooks/usePushRegistration'
import { useT } from '../../src/i18n/I18nProvider'
import { track } from '../../src/lib/analytics'
import { errorMessageKey } from '../../src/lib/query-client'
import { useApi } from '../../src/providers/AppProviders'

/**
 * Notification preferences.
 *
 * The lock-screen setting is enforced server-side when the push is built, not
 * by the client after delivery: choosing "generic" means the sensitive text
 * never leaves the backend, rather than being sent and then hidden.
 */
export default function NotificationSettingsScreen() {
  const t = useT()
  const api = useApi()
  const queryClient = useQueryClient()
  const query = useNotificationPreferences()
  const { state, register } = usePushRegistration()

  const update = useMutation({
    mutationFn: (patch: NotificationPreferencesPatch) => api.settings.updateNotificationPrefs(patch),
    onSuccess: async () => {
      track('settings_changed')
      await queryClient.invalidateQueries({ queryKey: qk.notificationPrefs() })
    },
  })

  const apply = useCallback(
    (patch: NotificationPreferencesPatch) => update.mutate(patch),
    [update],
  )

  const prefs = query.data

  if (!prefs) {
    return (
      <Screen>
        <ScreenHeader title={t('notifications.title')} />
        <SkeletonCard />
      </Screen>
    )
  }

  const categoryEnabled = (category: (typeof NOTIFICATION_CATEGORIES)[number]): boolean =>
    prefs.categories[category] ?? true

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader title={t('notifications.title')} subtitle={t('notifications.subtitle')} />

      <View style={{ gap: spacing.md, marginTop: spacing.md }}>
        {state !== 'granted' ? (
          <Card tone="warning" style={{ gap: spacing.xs }}>
            <Text variant="secondary" tone="warning">
              {t('notifications.master.systemDisabled')}
            </Text>
            <Button
              label={
                state === 'denied'
                  ? t('notifications.master.openSystemSettings')
                  : t('onboarding.notification.allow')
              }
              onPress={() =>
                state === 'denied' ? void Linking.openSettings() : void register()
              }
              variant="tonal"
              size="sm"
              testID="notifications-enable"
            />
          </Card>
        ) : null}

        <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
          <ListRow
            title={t('notifications.master.label')}
            subtitle={t('notifications.master.hint')}
            accessory={
              <Toggle
                value={prefs.onlyIfImportant}
                onValueChange={(next) => apply({ onlyIfImportant: next })}
                accessibilityLabel={t('notifications.master.label')}
                testID="notifications-only-important"
              />
            }
          />
        </Card>

        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary">
            {t('notifications.lockScreen.title')}
          </Text>
          <SegmentedControl<LockScreenPrivacy>
            options={LOCK_SCREEN_PRIVACY.map((value) => ({
              value,
              label: t(`notifications.lockScreen.${value}`),
            }))}
            value={prefs.lockScreenPrivacy}
            onChange={(next) => apply({ lockScreenPrivacy: next })}
            testID="notifications-lockscreen"
          />
          <Text variant="micro" tone="tertiary">
            {t(`notifications.lockScreen.${prefs.lockScreenPrivacy}Hint`)}
          </Text>
        </View>

        <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
          {NOTIFICATION_CATEGORIES.map((category, index) => (
            <View key={category}>
              {index > 0 ? <Divider /> : null}
              <ListRow
                title={t(`notifications.category.${category}`)}
                subtitle={t(`notifications.categoryHint.${category}`)}
                accessory={
                  <Toggle
                    value={categoryEnabled(category)}
                    onValueChange={(next) =>
                      apply({ categories: { ...prefs.categories, [category]: next } })
                    }
                    accessibilityLabel={t(`notifications.category.${category}`)}
                    testID={`notifications-category-${category}`}
                  />
                }
                testID={`notifications-row-${category}`}
              />
            </View>
          ))}
        </Card>

        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary">
            {t('notifications.quietHours.title')}
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <TimeField
                label={t('notifications.quietHours.from')}
                value={prefs.quietHoursStart ?? '22:30'}
                onChange={(next) => apply({ quietHoursStart: next })}
                testID="notifications-quiet-start"
              />
            </View>
            <View style={{ flex: 1 }}>
              <TimeField
                label={t('notifications.quietHours.to')}
                value={prefs.quietHoursEnd ?? '07:00'}
                onChange={(next) => apply({ quietHoursEnd: next })}
                testID="notifications-quiet-end"
              />
            </View>
          </View>
          <Text variant="micro" tone="tertiary">
            {t('notifications.quietHours.hint')}
          </Text>
          <Text variant="micro" tone="tertiary">
            {t('notifications.quietHours.allowVip')}
          </Text>
        </View>

        {Platform.OS === 'android' ? (
          <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
            <ListRow
              title={t('settings.deviceNotifications.title')}
              subtitle={t('settings.deviceNotifications.body')}
              icon="notifications-active"
              onPress={() =>
                void Linking.sendIntent('android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS')
              }
              testID="notifications-device-access"
            />
          </Card>
        ) : null}

        {update.isError ? (
          <Text variant="secondary" tone="critical">
            {t(errorMessageKey(update.error))}
          </Text>
        ) : update.isSuccess ? (
          <Text variant="micro" tone="success">
            {t('notifications.saved')}
          </Text>
        ) : null}
      </View>
    </Screen>
  )
}
