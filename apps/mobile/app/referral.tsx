import { qk } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import { MAX_REDEMPTIONS_PER_REFERRER, REFERRAL_BONUS_DAYS } from '@da/domain'
import { formatFullDate } from '@da/i18n'
import * as Clipboard from 'expo-clipboard'
import { MaterialIcons } from '@expo/vector-icons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Share, View } from 'react-native'
import { Button } from '../src/components/ui/Button'
import { Card } from '../src/components/ui/Card'
import { Screen } from '../src/components/ui/Screen'
import { ScreenHeader } from '../src/components/ui/ScreenHeader'
import { SkeletonCard } from '../src/components/ui/States'
import { Text } from '../src/components/ui/Text'
import { TextField } from '../src/components/ui/TextField'
import { useReferral } from '../src/hooks/queries'
import { useUserContext } from '../src/hooks/useUserContext'
import { useI18n, useT } from '../src/i18n/I18nProvider'
import { track } from '../src/lib/analytics'
import { shareableLink } from '../src/lib/deep-links'
import { errorMessageKey } from '../src/lib/query-client'
import { useApi } from '../src/providers/AppProviders'
import { useTheme } from '../src/theme/ThemeProvider'

/**
 * Invite a friend, both get Pro for a while.
 *
 * The code is server-issued and the reward is granted server-side on the
 * invitee's first real use — the client cannot mint a code, redeem its own, or
 * decide that a redemption counts.
 */
export default function ReferralScreen() {
  const t = useT()
  const { locale, plural } = useI18n()
  const theme = useTheme()
  const router = useRouter()
  const api = useApi()
  const queryClient = useQueryClient()
  const { timeZone } = useUserContext()
  const query = useReferral()

  const params = useLocalSearchParams<{ code?: string }>()
  const [code, setCode] = useState((params.code ?? '').toUpperCase())
  const [copied, setCopied] = useState(false)

  // An invite link opens straight here with the code already in hand.
  useEffect(() => {
    if (params.code) setCode(params.code.toUpperCase())
  }, [params.code])

  const summary = query.data ?? null

  const redeem = useMutation({
    mutationFn: () => api.referral.redeem(code.trim().toUpperCase()),
    onSuccess: async () => {
      track('referral_redeemed')
      setCode('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.referral() }),
        queryClient.invalidateQueries({ queryKey: qk.subscription() }),
      ])
    },
  })

  const shareCode = useCallback(async () => {
    if (!summary) return
    track('referral_shared')
    await Share.share({
      message: t('referral.code.shareMessage', {
        code: summary.code,
        url: shareableLink({ screen: 'referral', code: summary.code }),
      }),
    })
  }, [summary, t])

  const copyCode = useCallback(async () => {
    if (!summary) return
    await Clipboard.setStringAsync(summary.code)
    setCopied(true)
  }, [summary])

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader title={t('referral.title')} dismiss onBack={() => router.back()} />

      <View style={{ gap: spacing.lg, paddingTop: spacing.sm }}>
        <Text variant="body" tone="secondary">
          {t('referral.explain', { days: REFERRAL_BONUS_DAYS })}
        </Text>

        {query.isLoading && !summary ? (
          <SkeletonCard />
        ) : summary ? (
          <Card style={{ gap: spacing.sm, alignItems: 'center' }}>
            <Text variant="caption" tone="tertiary">
              {t('referral.code.label')}
            </Text>
            <Text variant="display" tabular accessibilityLabel={summary.code}>
              {summary.code}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              <Button
                label={copied ? t('referral.code.copied') : t('referral.code.copy')}
                onPress={() => void copyCode()}
                variant="neutral"
                size="sm"
                leading={
                  <MaterialIcons
                    name={copied ? 'check' : 'content-copy'}
                    size={16}
                    color={theme.colors.text}
                  />
                }
                testID="referral-copy"
              />
              <Button
                label={t('referral.code.share')}
                onPress={() => void shareCode()}
                size="sm"
                testID="referral-share"
              />
            </View>
          </Card>
        ) : null}

        {summary ? (
          <Card style={{ gap: spacing.xxs }}>
            <Text variant="caption" tone="tertiary">
              {t('referral.stats.title')}
            </Text>
            <Text variant="body">{plural('referral.stats.invited', summary.redemptionCount)}</Text>
            <Text variant="secondary" tone="secondary">
              {plural(
                'referral.stats.remaining',
                Math.max(0, MAX_REDEMPTIONS_PER_REFERRER - summary.redemptionCount),
              )}
            </Text>
            {summary.bonusExpiresAt ? (
              <Text variant="secondary" tone="primary">
                {t('settings.subscription.expiresOn', {
                  date: formatFullDate(new Date(summary.bonusExpiresAt), locale, timeZone),
                })}
              </Text>
            ) : null}
            {summary.redemptionCount >= MAX_REDEMPTIONS_PER_REFERRER ? (
              <Text variant="micro" tone="tertiary">
                {t('referral.stats.limitReached')}
              </Text>
            ) : null}
          </Card>
        ) : null}

        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary">
            {t('referral.redeem.title')}
          </Text>
          <TextField
            label={t('referral.redeem.label')}
            labelHidden
            value={code}
            onChangeText={(next) => setCode(next.toUpperCase())}
            placeholder={t('referral.redeem.placeholder')}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            testID="referral-code-input"
          />
          <Button
            label={t('referral.redeem.action')}
            onPress={() => redeem.mutate()}
            variant="tonal"
            fullWidth
            loading={redeem.isPending}
            disabled={code.trim().length < 4}
            testID="referral-redeem"
          />
          {redeem.isSuccess ? (
            <Text variant="secondary" tone="success">
              {t('referral.redeem.success', { days: REFERRAL_BONUS_DAYS })}
            </Text>
          ) : null}
          {redeem.isError ? (
            <Text variant="secondary" tone="critical">
              {t(errorMessageKey(redeem.error))}
            </Text>
          ) : null}
        </View>

        <Text variant="micro" tone="tertiary">
          {t('referral.terms')}
        </Text>
      </View>
    </Screen>
  )
}
