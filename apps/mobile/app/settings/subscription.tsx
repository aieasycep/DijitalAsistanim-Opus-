import { qk } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import { formatFullDate } from '@da/i18n'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { Linking, Platform, View } from 'react-native'
import { Badge } from '../../src/components/ui/Badge'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { ListRow } from '../../src/components/ui/Layout'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { SkeletonCard } from '../../src/components/ui/States'
import { Text } from '../../src/components/ui/Text'
import { useReferral, useSubscription } from '../../src/hooks/queries'
import { useEntitlements } from '../../src/hooks/useEntitlements'
import { useUserContext } from '../../src/hooks/useUserContext'
import { useI18n, useT } from '../../src/i18n/I18nProvider'
import { purchasesAvailable, restore } from '../../src/lib/purchases'
import { errorMessageKey } from '../../src/lib/query-client'
import { useApi } from '../../src/providers/AppProviders'

/** Where the store sends someone to cancel or change a plan. */
const MANAGE_URL =
  Platform.OS === 'ios'
    ? 'https://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions'

/**
 * Subscription state.
 *
 * Cancellation is deliberately a link out to the store rather than an in-app
 * button: the store owns the billing relationship, and pretending otherwise
 * produces a button that cannot keep its promise.
 */
export default function SubscriptionSettingsScreen() {
  const t = useT()
  const { locale, plural } = useI18n()
  const router = useRouter()
  const api = useApi()
  const queryClient = useQueryClient()
  const { timeZone } = useUserContext()
  const query = useSubscription()
  const referral = useReferral()
  const { entitlements } = useEntitlements()

  const restoreMutation = useMutation({
    mutationFn: async () => {
      const result = await restore()
      await api.subscription.refresh(
        result.customerId ? { revenueCatCustomerId: result.customerId } : {},
      )
      await queryClient.invalidateQueries({ queryKey: qk.subscription() })
      return result
    },
  })

  const subscription = query.data ?? null
  const limits = entitlements.limits
  const isPro = entitlements.plan === 'pro'

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader title={t('settings.subscription.title')} />

      <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
        {query.isLoading && !subscription ? (
          <SkeletonCard />
        ) : (
          <Card style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Text variant="h3" style={{ flex: 1 }}>
                {isPro ? t('paywall.plan.pro') : t('paywall.plan.free')}
              </Text>
              <Badge
                label={t(`settings.subscription.${subscription?.status ?? 'free'}`)}
                tone={isPro ? 'success' : 'neutral'}
              />
            </View>

            {entitlements.isTrial && entitlements.expiresAt ? (
              <Text variant="secondary" tone="primary">
                {plural(
                  'settings.subscription.trialEndsIn',
                  Math.max(
                    0,
                    Math.ceil(
                      (new Date(entitlements.expiresAt).getTime() - Date.now()) / 86_400_000,
                    ),
                  ),
                )}
              </Text>
            ) : null}

            {subscription?.currentPeriodEnd ? (
              <Text variant="secondary" tone="secondary">
                {t('settings.subscription.renewsOn', {
                  date: formatFullDate(new Date(subscription.currentPeriodEnd), locale, timeZone),
                })}
              </Text>
            ) : null}

            {entitlements.source === 'referral_bonus' && entitlements.expiresAt ? (
              <Text variant="secondary" tone="primary">
                {t('settings.subscription.expiresOn', {
                  date: formatFullDate(new Date(entitlements.expiresAt), locale, timeZone),
                })}
              </Text>
            ) : null}

            {subscription?.status === 'billing_issue' ? (
              <Text variant="secondary" tone="critical">
                {t('settings.subscription.billingIssueBody')}
              </Text>
            ) : null}
            {subscription?.status === 'grace_period' ? (
              <Text variant="secondary" tone="warning">
                {t('settings.subscription.gracePeriodBody')}
              </Text>
            ) : null}
          </Card>
        )}

        <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
          <ListRow
            title={t('paywall.freeFeatures.accounts')}
            value={`${limits.mailAccounts}`}
            icon="mail-outline"
          />
          <ListRow
            title={t('paywall.freeFeatures.assistant')}
            value={
              limits.assistantQueriesPerDay === null ? '∞' : `${limits.assistantQueriesPerDay}`
            }
            icon="auto-awesome"
          />
          <ListRow
            title={t('paywall.freeFeatures.vip')}
            value={`${limits.vipPeople}`}
            icon="star-outline"
          />
          <ListRow
            title={t('paywall.freeFeatures.rules')}
            value={`${limits.priorityRules}`}
            icon="rule"
          />
        </Card>

        {!isPro ? (
          <Button
            label={t('settings.subscription.upgrade')}
            onPress={() => router.push('/paywall?source=settings')}
            fullWidth
            testID="subscription-upgrade"
          />
        ) : null}

        <Button
          label={t('settings.subscription.manage')}
          onPress={() => void Linking.openURL(MANAGE_URL)}
          variant="tonal"
          fullWidth
          testID="subscription-manage"
        />

        <Button
          label={t('settings.subscription.restore')}
          onPress={() => restoreMutation.mutate()}
          variant="ghost"
          fullWidth
          loading={restoreMutation.isPending}
          disabled={!purchasesAvailable()}
          testID="subscription-restore"
        />

        {restoreMutation.isSuccess ? (
          <Text
            variant="secondary"
            tone={restoreMutation.data.isPro ? 'success' : 'tertiary'}
            center
          >
            {restoreMutation.data.isPro
              ? t('settings.subscription.restored')
              : t('settings.subscription.nothingToRestore')}
          </Text>
        ) : null}
        {restoreMutation.isError ? (
          <Text variant="secondary" tone="critical" center>
            {t(errorMessageKey(restoreMutation.error))}
          </Text>
        ) : null}

        <Card
          onPress={() => router.push('/referral')}
          accessibilityLabel={t('referral.title')}
          style={{ gap: spacing.xxs }}
          testID="subscription-referral"
        >
          <Text variant="bodyStrong">{t('referral.banner.title')}</Text>
          <Text variant="secondary" tone="secondary">
            {t('referral.banner.body')}
          </Text>
          {referral.data && referral.data.redemptionCount > 0 ? (
            <Text variant="micro" tone="primary">
              {plural('referral.stats.earned', referral.data.redemptionCount)}
            </Text>
          ) : null}
        </Card>

        <Text variant="micro" tone="tertiary">
          {t('paywall.price.storeNote')}
        </Text>
      </View>
    </Screen>
  )
}
