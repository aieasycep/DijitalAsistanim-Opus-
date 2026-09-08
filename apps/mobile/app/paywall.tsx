import { qk } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import { AppError } from '@da/domain'
import { formatMoney } from '@da/i18n'
import { MaterialIcons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import { Badge } from '../src/components/ui/Badge'
import { Button } from '../src/components/ui/Button'
import { Card } from '../src/components/ui/Card'
import { Pressable } from '../src/components/ui/Pressable'
import { Screen } from '../src/components/ui/Screen'
import { ScreenHeader } from '../src/components/ui/ScreenHeader'
import { Text } from '../src/components/ui/Text'
import { useEntitlements } from '../src/hooks/useEntitlements'
import { useI18n, useT } from '../src/i18n/I18nProvider'
import { track } from '../src/lib/analytics'
import { loadPackages, purchase, purchasesAvailable, restore } from '../src/lib/purchases'
import { errorMessageKey } from '../src/lib/query-client'
import { useApi } from '../src/providers/AppProviders'
import { useTheme } from '../src/theme/ThemeProvider'

/** What Pro adds, in the order that matters to someone deciding. */
const PRO_FEATURES = [
  'paywall.proFeatures.briefings',
  'paywall.proFeatures.meetingPrep',
  'paywall.proFeatures.followUps',
  'paywall.proFeatures.replies',
  'paywall.proFeatures.assistant',
  'paywall.proFeatures.accounts',
  'paywall.proFeatures.capture',
  'paywall.proFeatures.search',
  'paywall.proFeatures.audio',
  'paywall.proFeatures.widgets',
] as const

const FREE_FEATURES = [
  'paywall.freeFeatures.briefing',
  'paywall.freeFeatures.mail',
  'paywall.freeFeatures.calendar',
  'paywall.freeFeatures.assistant',
  'paywall.freeFeatures.capture',
] as const

/**
 * The paywall.
 *
 * The free tier is described alongside Pro rather than hidden: the product's
 * rule is that the free path always stays usable, so the honest comparison is
 * also the one that converts. Purchases go through the store; entitlement is
 * confirmed server-side from the RevenueCat webhook, never from the client.
 */
export default function PaywallScreen() {
  const t = useT()
  const { locale } = useI18n()
  const theme = useTheme()
  const router = useRouter()
  const api = useApi()
  const queryClient = useQueryClient()
  const params = useLocalSearchParams<{ source?: string }>()
  const { entitlements } = useEntitlements()

  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    track('paywall_viewed')
  }, [])

  const packagesQuery = useQuery({
    queryKey: ['purchases', 'packages'],
    queryFn: () => loadPackages(),
    staleTime: 10 * 60_000,
  })

  const packages = packagesQuery.data ?? []
  const chosen =
    selected ?? packages.find((pkg) => pkg.period === 'annual')?.id ?? packages[0]?.id ?? null

  /**
   * Pull the server's own view of the entitlement down after the store has
   * acted. The store's answer decides whether to dismiss this screen; the
   * server's answer decides what the rest of the app unlocks.
   */
  const syncEntitlement = useCallback(async () => {
    await api.subscription.refresh()
    await queryClient.invalidateQueries({ queryKey: qk.subscription() })
  }, [api, queryClient])

  const buy = useMutation({
    mutationFn: async () => {
      if (!chosen) throw new AppError('subscription_error', { detail: 'no package selected' })
      const result = await purchase(chosen)
      await syncEntitlement()
      return result
    },
    onSuccess: (result) => {
      const pkg = packages.find((entry) => entry.id === chosen)
      if (pkg?.trialDays) track('trial_started', { plan: 'pro' })
      else track('subscription_started', { plan: pkg?.period === 'annual' ? 'annual' : 'monthly' })
      if (result.isPro) router.back()
    },
  })

  const restoreMutation = useMutation({
    mutationFn: async () => {
      const result = await restore()
      await syncEntitlement()
      return result
    },
    onSuccess: (result) => {
      if (result.isPro) router.back()
    },
  })

  const available = purchasesAvailable()
  const monthly = packages.find((pkg) => pkg.period === 'monthly')
  const annual = packages.find((pkg) => pkg.period === 'annual')

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader title={t('paywall.title')} dismiss onBack={() => router.back()} />

      <View style={{ gap: spacing.lg, paddingTop: spacing.sm }}>
        <View style={{ gap: spacing.xs }}>
          <Text variant="h1" accessibilityRole="header">
            {t('paywall.headline')}
          </Text>
          {/* `paywall.lock.body` interpolates the feature's name, and nothing
              here has one to give — an unfilled placeholder is left intact by
              design, so arriving from a gate used to read literally as
              "{feature} için Pro plana geçmen gerekiyor". `lock.title` says the
              same thing and needs no value. */}
          <Text variant="body" tone="secondary">
            {params.source ? t('paywall.lock.title') : t('paywall.subtitle')}
          </Text>
        </View>

        <Card style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary">
            {t('paywall.proFeatures.title')}
          </Text>
          {PRO_FEATURES.map((key) => (
            <View key={key} style={{ flexDirection: 'row', gap: spacing.xs }}>
              <MaterialIcons
                name="check"
                size={16}
                color={theme.colors.success}
                style={{ marginTop: 2 }}
              />
              <Text variant="secondary" style={{ flex: 1 }}>
                {t(key)}
              </Text>
            </View>
          ))}
        </Card>

        {available && packages.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            {[annual, monthly].filter(Boolean).map((pkg) => {
              if (!pkg) return null
              const isSelected = chosen === pkg.id
              const perMonth = pkg.period === 'annual' ? pkg.price / 12 : pkg.price
              return (
                // The choice is announced, not just tinted: `selected` is what a
                // screen reader reads out, and the check mark is what someone
                // who cannot separate the two backgrounds sees.
                <Pressable
                  key={pkg.id}
                  onPress={() => setSelected(pkg.id)}
                  scaleOnPress={false}
                  accessibilityLabel={`${t(`paywall.plan.${pkg.period}`)} ${pkg.priceString}`}
                  accessibilityState={{ selected: isSelected }}
                  testID={`paywall-plan-${pkg.period}`}
                >
                  <Card tone={isSelected ? 'primary' : 'surface'} style={{ gap: spacing.xxs }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                      <MaterialIcons
                        name={isSelected ? 'radio-button-checked' : 'radio-button-unchecked'}
                        size={20}
                        color={isSelected ? theme.colors.primary : theme.colors.textTertiary}
                      />
                      <Text variant="bodyStrong" style={{ flex: 1 }}>
                        {t(`paywall.plan.${pkg.period}`)}
                      </Text>
                      {pkg.period === 'annual' ? (
                        <Badge label={t('paywall.plan.recommended')} tone="primary" />
                      ) : null}
                    </View>
                    <Text variant="h3" tabular>
                      {pkg.priceString}
                    </Text>
                    {pkg.period === 'annual' ? (
                      <Text variant="micro" tone="tertiary">
                        {t('paywall.price.annualPerMonth', {
                          price: formatMoney(perMonth, pkg.currencyCode, locale),
                        })}
                      </Text>
                    ) : null}
                    {pkg.trialDays ? (
                      <Text variant="micro" tone="primary">
                        {t('paywall.price.trial', { days: pkg.trialDays })}
                      </Text>
                    ) : null}
                  </Card>
                </Pressable>
              )
            })}
          </View>
        ) : (
          <Card tone="info">
            <Text variant="secondary" tone="info">
              {t('paywall.purchase.failed')}
            </Text>
          </Card>
        )}

        {buy.isError || restoreMutation.isError ? (
          <Card tone="critical">
            <Text variant="secondary" tone="critical">
              {t(errorMessageKey(buy.error ?? restoreMutation.error))}
            </Text>
          </Card>
        ) : null}

        <View style={{ gap: spacing.xs }}>
          <Button
            label={
              packages.find((pkg) => pkg.id === chosen)?.trialDays
                ? t('paywall.cta.startTrial')
                : t('paywall.cta.subscribe')
            }
            onPress={() => buy.mutate()}
            size="lg"
            fullWidth
            loading={buy.isPending}
            disabled={!available || !chosen || entitlements.plan === 'pro'}
            testID="paywall-subscribe"
          />
          <Button
            label={t('paywall.cta.restore')}
            onPress={() => restoreMutation.mutate()}
            variant="ghost"
            size="md"
            fullWidth
            loading={restoreMutation.isPending}
            disabled={!available}
            testID="paywall-restore"
          />
          <Button
            label={t('paywall.cta.continueFree')}
            onPress={() => router.back()}
            variant="ghost"
            size="md"
            fullWidth
            testID="paywall-continue-free"
          />
        </View>

        {/* A restore that found nothing has to say so — silence reads as a
            broken button, and this is the outcome most people who tap it get.
            It sits under the buttons, not above them, so an answer appearing
            cannot shift the control the reader is about to press next. */}
        {restoreMutation.isSuccess && !restoreMutation.data.isPro ? (
          <Text variant="secondary" tone="tertiary" center>
            {t('settings.subscription.nothingToRestore')}
          </Text>
        ) : null}

        <Card style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary">
            {t('paywall.freeFeatures.title')}
          </Text>
          {FREE_FEATURES.map((key) => (
            <Text key={key} variant="secondary" tone="secondary">
              {t(key)}
            </Text>
          ))}
        </Card>

        <View style={{ gap: spacing.xxs }}>
          <Text variant="micro" tone="tertiary" center>
            {t('paywall.price.renewalNote')}
          </Text>
          <Text variant="micro" tone="tertiary" center>
            {t('paywall.privacy')}
          </Text>
        </View>
      </View>
    </Screen>
  )
}
