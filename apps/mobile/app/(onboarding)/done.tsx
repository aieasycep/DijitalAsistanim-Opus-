import { spacing } from '@da/design-tokens'
import { estimateTimeSaved } from '@da/domain'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { View } from 'react-native'
import { StepFrame } from '../../src/components/onboarding/StepFrame'
import { Card } from '../../src/components/ui/Card'
import { Text } from '../../src/components/ui/Text'
import { useI18n, useT } from '../../src/i18n/I18nProvider'
import { useTodayFeed } from '../../src/hooks/queries'
import { track } from '../../src/lib/analytics'
import { errorMessageKey } from '../../src/lib/query-client'
import { useApi } from '../../src/providers/AppProviders'
import { useSessionStore } from '../../src/stores/session'

/**
 * The last step: the first real payload.
 *
 * The counts here come from the feed that was just built, not from a canned
 * illustration — the promise the intro made is demonstrated before onboarding
 * is allowed to end.
 */
export default function DoneStep() {
  const t = useT()
  const { plural } = useI18n()
  const router = useRouter()
  const api = useApi()
  const markCompleted = useSessionStore((s) => s.markOnboardingCompleted)
  const setProfile = useSessionStore((s) => s.setProfile)
  const feed = useTodayFeed()

  const finish = useMutation({
    mutationFn: () => api.settings.updateProfile({ onboardingCompleted: true }),
    onSuccess: (profile) => {
      track('onboarding_completed')
      setProfile(profile)
      markCompleted()
      // The root navigator's guard swaps the stack as soon as the flag flips;
      // replacing rather than pushing keeps the flow out of the back stack.
      router.replace('/(tabs)/today')
    },
    onError: () => {
      // The server call is bookkeeping. Refusing to let someone into the app
      // because a flag did not persist would be the worse failure, so the local
      // flag is set either way and the next profile fetch reconciles it.
      markCompleted()
      router.replace('/(tabs)/today')
    },
  })

  const needsAttention = (feed.data?.insights ?? []).filter(
    (insight) => insight.completedAt === null && insight.dismissedAt === null,
  ).length
  // Only the two quantities this first pass actually produced are counted:
  // triaged mail the user never had to open, and follow-ups it surfaced.
  const { totalMinutes: minutesSaved } = estimateTimeSaved({
    emailsTriagedWithoutOpening: Math.max(
      0,
      (feed.data?.briefingItems.length ?? 0) - needsAttention,
    ),
    threadsReadAsSummary: 0,
    draftsUsed: 0,
    meetingPrepsOpened: 0,
    followUpsSurfaced: feed.data?.followUps.length ?? 0,
    commitmentsCaptured: feed.data?.commitments.length ?? 0,
  })

  return (
    <StepFrame
      step="done"
      title={t('onboarding.done.title')}
      description={t('onboarding.done.body')}
      primaryLabel={t('onboarding.done.primary')}
      onPrimary={() => finish.mutate()}
      primaryLoading={finish.isPending}
      testID="onboarding-done"
    >
      <View style={{ gap: spacing.sm }}>
        <Card tone="primary" style={{ gap: spacing.xxs }}>
          <Text variant="h3" tone="primary">
            {plural('onboarding.aha.highlight', needsAttention)}
          </Text>
          {minutesSaved > 0 ? (
            <Text variant="secondary" tone="primary">
              {t('onboarding.aha.timeSaved', { minutes: minutesSaved })}
            </Text>
          ) : null}
        </Card>

        <Card style={{ gap: spacing.xxs }}>
          <Text variant="bodyStrong">{t('privacy.title')}</Text>
          <Text variant="secondary" tone="secondary">
            {t('privacy.encryption')}
          </Text>
          <Text variant="secondary" tone="secondary">
            {t('privacy.noAdSale')}
          </Text>
        </Card>
      </View>

      {finish.isError ? (
        <Text variant="micro" tone="tertiary">
          {t(errorMessageKey(finish.error))}
        </Text>
      ) : null}
    </StepFrame>
  )
}
