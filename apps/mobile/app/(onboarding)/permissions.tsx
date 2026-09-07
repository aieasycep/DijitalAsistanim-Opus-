import { spacing } from '@da/design-tokens'
import { formatLocalTime } from '@da/i18n'
import { MaterialIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Linking, Platform, View } from 'react-native'
import { StepFrame } from '../../src/components/onboarding/StepFrame'
import { Card } from '../../src/components/ui/Card'
import { ListRow } from '../../src/components/ui/Layout'
import { Text } from '../../src/components/ui/Text'
import { useI18n, useT } from '../../src/i18n/I18nProvider'
import { usePreferences } from '../../src/hooks/queries'
import { usePushRegistration } from '../../src/hooks/usePushRegistration'
import { useTheme } from '../../src/theme/ThemeProvider'

/** The optional permissions, each with the feature it unlocks. */
const OPTIONAL = [
  { icon: 'mic', titleKey: 'onboarding.permissions.micTitle', bodyKey: 'onboarding.permissions.micBody' },
  {
    icon: 'photo-camera',
    titleKey: 'onboarding.permissions.cameraTitle',
    bodyKey: 'onboarding.permissions.cameraBody',
  },
] as const

/**
 * Step two: notifications.
 *
 * The example notification is shown before the OS prompt so the user can judge
 * what they are agreeing to. Microphone and camera are named but not requested
 * here — they are asked for at the moment they are first used, which is both
 * better for consent and better for the grant rate.
 */
export default function PermissionsStep() {
  const t = useT()
  const { locale } = useI18n()
  const theme = useTheme()
  const router = useRouter()
  const preferences = usePreferences()
  const { state, register, isRegistering, ensureChannels } = usePushRegistration()

  const [asked, setAsked] = useState(false)

  useEffect(() => {
    // Channels must exist before the first notification arrives, and creating
    // them does not require permission.
    void ensureChannels()
  }, [ensureChannels])

  const briefingTime = preferences.data?.morningBriefingTime ?? '07:30'

  const allow = useCallback(async () => {
    setAsked(true)
    await register()
  }, [register])

  const next = useCallback(() => router.push('/(onboarding)/personalization'), [router])

  return (
    <StepFrame
      step="permissions"
      title={t('onboarding.notification.title')}
      description={t('onboarding.notification.body', {
        time: formatLocalTime(briefingTime, locale),
      })}
      primaryLabel={
        state === 'granted' ? t('common.action.next') : t('onboarding.notification.allow')
      }
      onPrimary={state === 'granted' ? next : () => void allow()}
      primaryLoading={isRegistering}
      secondaryLabel={state === 'granted' ? undefined : t('onboarding.notification.later')}
      {...(state === 'granted' ? {} : { onSecondary: next })}
      testID="onboarding-permissions"
    >
      <Card style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              backgroundColor: theme.colors.primarySoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MaterialIcons name="auto-awesome" size={16} color={theme.colors.primaryOnSoft} />
          </View>
          <Text variant="caption" tone="tertiary">
            {t('common.appName')} · {formatLocalTime(briefingTime, locale)}
          </Text>
        </View>
        <Text variant="body">{t('onboarding.notification.example')}</Text>
      </Card>

      {state === 'granted' ? (
        <Card tone="success" style={{ flexDirection: 'row', gap: spacing.xs }}>
          <MaterialIcons name="check-circle" size={18} color={theme.colors.success} />
          <Text variant="secondary" tone="success" style={{ flex: 1 }}>
            {t('privacy.permissions.granted')}
          </Text>
        </Card>
      ) : null}

      {state === 'denied' && asked ? (
        <Card tone="warning" style={{ gap: spacing.xs }}>
          <Text variant="secondary" tone="warning">
            {t('onboarding.permissions.denied')}
          </Text>
          <ListRow
            title={t('onboarding.permissions.openSettings')}
            icon="settings"
            onPress={() => void Linking.openSettings()}
            testID="open-settings"
          />
        </Card>
      ) : null}

      <View>
        <Text variant="caption" tone="tertiary" style={{ marginBottom: spacing.xs }}>
          {t('onboarding.permissions.title')}
        </Text>
        {OPTIONAL.map((entry) => (
          <ListRow
            key={entry.titleKey}
            title={t(entry.titleKey)}
            subtitle={t(entry.bodyKey)}
            icon={entry.icon}
            value={t('common.state.optional')}
          />
        ))}
        {Platform.OS === 'android' ? (
          <ListRow
            title={t('settings.deviceNotifications.title')}
            subtitle={t('settings.deviceNotifications.body')}
            icon="notifications"
            onPress={() =>
              void Linking.sendIntent('android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS')
            }
            testID="android-notification-access"
          />
        ) : null}
      </View>
    </StepFrame>
  )
}
