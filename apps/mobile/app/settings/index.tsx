import { spacing } from '@da/design-tokens'
import { type MaterialIcons } from '@expo/vector-icons'
import * as Application from 'expo-application'
import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { View } from 'react-native'
import { Avatar } from '../../src/components/ui/Avatar'
import { Badge } from '../../src/components/ui/Badge'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { Divider, ListRow, SectionHeader } from '../../src/components/ui/Layout'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { Sheet } from '../../src/components/ui/Sheet'
import { Text } from '../../src/components/ui/Text'
import { useAccounts, useSubscription } from '../../src/hooks/queries'
import { useEntitlements } from '../../src/hooks/useEntitlements'
import { useT } from '../../src/i18n/I18nProvider'
import { revokeSession } from '../../src/lib/auth'
import { clearSnapshot } from '../../src/lib/native/widget'
import { cancelAllLocalNotifications } from '../../src/lib/notifications'
import { errorMessageKey } from '../../src/lib/query-client'
import { useSessionStore } from '../../src/stores/session'

interface Entry {
  route: string
  labelKey: string
  icon: keyof typeof MaterialIcons.glyphMap
}

/**
 * The end-to-end id of a menu row: `settings-` plus the screen it opens, so
 * `/settings/language` is `settings-language`.
 *
 * Derived from the route rather than written out per entry, because the id and
 * the destination must not be able to disagree. This row used to be tagged with
 * the *label key* — `settings-settings.menu.language` for a flow reaching for
 * `settings-language` — and nothing caught it: the id checker only ever sees
 * the literal `settings-` prefix of the template, so every flow that tapped a
 * settings row was green in CI and timed out on a device.
 */
function screenOf(route: string): string {
  return route.slice('/settings/'.length)
}

const GROUPS: ReadonlyArray<{ titleKey: string; entries: readonly Entry[] }> = [
  {
    titleKey: 'settings.title',
    entries: [
      { route: '/settings/profile', labelKey: 'settings.menu.profile', icon: 'person-outline' },
      { route: '/settings/accounts', labelKey: 'settings.menu.integrations', icon: 'link' },
      {
        route: '/settings/subscription',
        labelKey: 'settings.menu.subscription',
        icon: 'workspace-premium',
      },
    ],
  },
  {
    titleKey: 'priority.title',
    entries: [
      { route: '/settings/rules', labelKey: 'settings.menu.priorityRules', icon: 'rule' },
      { route: '/settings/vip', labelKey: 'settings.menu.vip', icon: 'star-outline' },
      {
        route: '/settings/personalization',
        labelKey: 'settings.menu.personalization',
        icon: 'psychology',
      },
    ],
  },
  {
    titleKey: 'briefing.title',
    entries: [
      { route: '/settings/briefing', labelKey: 'settings.menu.briefing', icon: 'wb-twilight' },
      {
        route: '/settings/notifications',
        labelKey: 'settings.menu.notifications',
        icon: 'notifications-none',
      },
      {
        route: '/settings/data-sources',
        labelKey: 'settings.menu.dataSources',
        icon: 'inbox',
      },
    ],
  },
  {
    titleKey: 'privacy.title',
    entries: [
      { route: '/settings/privacy', labelKey: 'settings.menu.privacy', icon: 'lock-outline' },
      { route: '/settings/appearance', labelKey: 'settings.menu.appearance', icon: 'palette' },
      { route: '/settings/language', labelKey: 'settings.menu.language', icon: 'translate' },
      { route: '/settings/help', labelKey: 'settings.menu.help', icon: 'help-outline' },
    ],
  },
]

/**
 * Settings.
 *
 * A single index over every preference the app has, in the order a user goes
 * looking for them — identity, connections, money; then what gets surfaced;
 * then when they hear about it; then privacy and the app itself.
 */
export default function SettingsScreen() {
  const t = useT()
  const router = useRouter()
  const profile = useSessionStore((s) => s.profile)
  const signOut = useSessionStore((s) => s.signOut)
  const accounts = useAccounts()
  const subscription = useSubscription()
  const { entitlements } = useEntitlements()

  const [confirmSignOut, setConfirmSignOut] = useState(false)

  const doSignOut = useCallback(async () => {
    setConfirmSignOut(false)
    await cancelAllLocalNotifications()
    clearSnapshot()
    const token = await useSessionStore.getState().getAccessToken()
    if (token) await revokeSession(token)
    await signOut()
    router.replace('/(auth)')
  }, [router, signOut])

  // Null while the answer is unknown. A failed query used to read as a
  // confident "0 connected accounts" next to a row whose screen would have
  // listed three of them.
  const connectedCount =
    accounts.data === undefined
      ? null
      : accounts.data.filter((account) => account.status === 'connected').length

  const summaryError = accounts.error ?? subscription.error

  const { isError: accountsFailed, refetch: refetchAccounts } = accounts
  const { isError: subscriptionFailed, refetch: refetchSubscription } = subscription

  const retrySummary = useCallback(() => {
    if (accountsFailed) void refetchAccounts()
    if (subscriptionFailed) void refetchSubscription()
  }, [accountsFailed, refetchAccounts, subscriptionFailed, refetchSubscription])

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader title={t('settings.title')} />

      <Card
        onPress={() => router.push('/settings/profile')}
        accessibilityLabel={t('settings.menu.profile')}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          marginTop: spacing.sm,
        }}
        testID="settings-profile-card"
      >
        <Avatar
          name={profile?.displayName ?? profile?.email ?? ''}
          imageUrl={profile?.avatarUrl ?? null}
          size={48}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {profile?.displayName ?? t('settings.profile.nameLabel')}
          </Text>
          <Text variant="micro" tone="tertiary" numberOfLines={1}>
            {profile?.email ?? ''}
          </Text>
        </View>
        {/* `useEntitlements` assumes Free until the answer arrives, which is
            right while it is loading and wrong once the query has failed — a
            Pro user must not be told they are on Free. */}
        {subscriptionFailed ? null : (
          <Badge
            label={entitlements.plan === 'pro' ? t('paywall.plan.pro') : t('paywall.plan.free')}
            tone={entitlements.plan === 'pro' ? 'primary' : 'neutral'}
          />
        )}
      </Card>

      {/* The count on the integrations row and the plan on the subscription row
          both come from queries. When one fails the menu still works, so the
          failure is stated here rather than rendered as a zero and a free
          plan the user would have to disprove. */}
      {summaryError ? (
        <Card tone="critical" style={{ marginTop: spacing.sm, gap: spacing.xs }}>
          <Text variant="secondary" tone="critical">
            {t(errorMessageKey(summaryError))}
          </Text>
          <Button
            label={t('common.action.retry')}
            onPress={retrySummary}
            variant="tonal"
            size="sm"
            testID="settings-summary-retry"
          />
        </Card>
      ) : null}

      {entitlements.plan === 'free' && !subscriptionFailed ? (
        <Card tone="primary" style={{ marginTop: spacing.sm, gap: spacing.xs }}>
          <Text variant="bodyStrong" tone="primary">
            {t('paywall.headline')}
          </Text>
          <Button
            label={t('settings.subscription.upgrade')}
            onPress={() => router.push('/paywall?source=settings')}
            variant="tonal"
            size="sm"
            testID="settings-upgrade"
          />
        </Card>
      ) : null}

      {GROUPS.map((group) => (
        <View key={group.titleKey} style={{ marginTop: spacing.xl }}>
          <SectionHeader title={t(group.titleKey)} />
          <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
            {group.entries.map((entry, index) => (
              <View key={entry.route}>
                {index > 0 ? <Divider inset={44} /> : null}
                <ListRow
                  title={t(entry.labelKey)}
                  icon={entry.icon}
                  onPress={() => router.push(entry.route)}
                  {...(entry.route === '/settings/accounts' && connectedCount !== null
                    ? { value: String(connectedCount) }
                    : {})}
                  {...(entry.route === '/settings/subscription' && subscription.data
                    ? { value: t(`settings.subscription.${subscription.data.status}`) }
                    : {})}
                  testID={`settings-${screenOf(entry.route)}`}
                />
              </View>
            ))}
          </Card>
        </View>
      ))}

      <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
        <Button
          label={t('settings.menu.feedback')}
          onPress={() => router.push('/settings/feedback')}
          variant="tonal"
          fullWidth
          testID="settings-feedback"
        />
        <Button
          label={t('settings.menu.signOut')}
          onPress={() => setConfirmSignOut(true)}
          variant="ghost"
          fullWidth
          testID="settings-sign-out"
        />
        <Text variant="micro" tone="tertiary" center>
          {t('settings.help.version', {
            version: Application.nativeApplicationVersion ?? '1.0.0',
          })}
        </Text>
      </View>

      <Sheet
        visible={confirmSignOut}
        onClose={() => setConfirmSignOut(false)}
        title={t('settings.signOut.confirmTitle')}
        closeLabel={t('common.action.close')}
        scrollable={false}
        footer={
          <Button
            label={t('settings.signOut.confirm')}
            onPress={() => void doSignOut()}
            variant="destructive"
            fullWidth
            testID="settings-sign-out-confirm"
          />
        }
        testID="settings-sign-out-sheet"
      >
        <Text variant="body" tone="secondary">
          {t('settings.signOut.confirmBody')}
        </Text>
      </Sheet>
    </Screen>
  )
}
