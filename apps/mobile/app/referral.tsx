import { qk } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import { MAX_REDEMPTIONS_PER_REFERRER, REFERRAL_BONUS_DAYS } from '@da/domain'
import { formatFullDate } from '@da/i18n'
import type { ReferralRejectionReason } from '@da/validation'
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
import { ErrorState, SkeletonCard } from '../src/components/ui/States'
import { Text } from '../src/components/ui/Text'
import { TextField } from '../src/components/ui/TextField'
import { useReferral } from '../src/hooks/queries'
import { useUserContext } from '../src/hooks/useUserContext'
import { useI18n, useT } from '../src/i18n/I18nProvider'
import { track } from '../src/lib/analytics'
import { shareableLink } from '../src/lib/deep-links'
import { errorMessageKey, isRetryable } from '../src/lib/query-client'
import { useApi } from '../src/providers/AppProviders'
import { useTheme } from '../src/theme/ThemeProvider'

/**
 * What each refusal is told to the person.
 *
 * A refusal is a normal answer from the server, so it gets a sentence of its
 * own rather than the generic failure line: "you have already used this code"
 * and "check the code again" ask for completely different next moves. Keyed by
 * the contract's reason, so a reason the server can send and this table has no
 * copy for is a compile error rather than a blank line under the field.
 */
const REJECTION_MESSAGE: Record<ReferralRejectionReason, string> = {
  invalid_code: 'referral.redeem.invalid',
  unknown_code: 'referral.redeem.invalid',
  self_referral: 'referral.redeem.self',
  already_redeemed: 'referral.redeem.alreadyUsed',
  referee_not_new: 'referral.redeem.notEligible',
  // The code is real but its owner has run out of invites, so re-typing it
  // will not help either: from here it is a code that cannot be redeemed.
  referrer_limit_reached: 'referral.redeem.invalid',
}

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
    onSuccess: async (result) => {
      // A refusal arrives as a successful call, so nothing below may run for
      // one: it is not a redemption to report, the entitlement did not move,
      // and clearing the field would throw away a code with a typo in it.
      if (!result.granted) return
      track('referral_redeemed')
      setCode('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.referral() }),
        queryClient.invalidateQueries({ queryKey: qk.subscription() }),
      ])
    },
  })

  const outcome = redeem.data ?? null

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

        {/*
          The code and the stats stand or fall together, so one branch covers
          both — and every state has a branch. The screen used to render `null`
          for anything that was not a loaded summary, so a failed query left no
          code, no stats and no hint that anything had gone wrong, above a
          redeem field that still worked: it read as an account the app had
          decided not to give a code to. A summary that is already loaded also
          survives a failed refetch here, because stale stats beat a blank card.
        */}
        {summary ? (
          <>
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

            <Card style={{ gap: spacing.xxs }}>
              <Text variant="caption" tone="tertiary">
                {t('referral.stats.title')}
              </Text>
              <Text variant="body">
                {plural('referral.stats.invited', summary.redemptionCount)}
              </Text>
              <Text variant="secondary" tone="secondary">
                {plural(
                  'referral.stats.remaining',
                  Math.max(0, MAX_REDEMPTIONS_PER_REFERRER - summary.redemptionCount),
                )}
              </Text>
              {summary.activeBonuses > 0 && summary.bonusExpiresAt ? (
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
          </>
        ) : query.isError ? (
          <ErrorState
            message={t(errorMessageKey(query.error))}
            {...(isRetryable(query.error)
              ? { retryLabel: t('common.action.retry'), onRetry: () => void query.refetch() }
              : {})}
            testID="referral-error"
          />
        ) : (
          // Loading, and also the query paused offline: a skeleton is honest
          // about both, where an error state would invent a failure that has
          // not happened yet.
          <SkeletonCard />
        )}

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
          {outcome ? (
            outcome.granted ? (
              <Text variant="secondary" tone="success" testID="referral-redeem-result">
                {/* The server says how many days it granted; the constant is
                    what we advertise, which is not the same promise. */}
                {t('referral.redeem.success', { days: outcome.bonusDays })}
              </Text>
            ) : (
              <Text variant="secondary" tone="critical" testID="referral-redeem-result">
                {t(REJECTION_MESSAGE[outcome.reason])}
              </Text>
            )
          ) : redeem.isError ? (
            <Text variant="secondary" tone="critical" testID="referral-redeem-result">
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
