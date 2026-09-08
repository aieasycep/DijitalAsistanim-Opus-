import { qk } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import { nextLocalTimeOccurrence, systemClock } from '@da/domain'
import { formatFullDate, formatTime } from '@da/i18n'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback } from 'react'
import { View } from 'react-native'
import { Badge } from '../../src/components/ui/Badge'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { SourceChip } from '../../src/components/ui/SourceChip'
import { ErrorState, SkeletonCard } from '../../src/components/ui/States'
import { Text } from '../../src/components/ui/Text'
import { useCommitments, useInvalidateAfterWrite } from '../../src/hooks/queries'
import { useUserContext } from '../../src/hooks/useUserContext'
import { useI18n, useT } from '../../src/i18n/I18nProvider'
import { errorMessageKey } from '../../src/lib/query-client'
import { useApi } from '../../src/providers/AppProviders'

const STATUS_TONE = {
  open: 'info',
  overdue: 'critical',
  done: 'success',
  snoozed: 'neutral',
  cancelled: 'neutral',
} as const

/**
 * One promise.
 *
 * The quote is the point: the user should be able to see the exact sentence the
 * commitment was read from, and disagree with it. Completing or snoozing is a
 * local record change — nothing here writes to a provider.
 */
export default function CommitmentScreen() {
  const t = useT()
  const { locale } = useI18n()
  const router = useRouter()
  const api = useApi()
  const queryClient = useQueryClient()
  const invalidate = useInvalidateAfterWrite()
  const { timeZone } = useUserContext()
  const params = useLocalSearchParams<{ id?: string }>()
  const commitmentId = params.id ?? null

  const query = useCommitments()
  const commitment = (query.data ?? []).find((entry) => entry.id === commitmentId) ?? null

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: qk.commitments() })
    await invalidate()
  }, [queryClient, invalidate])

  const complete = useMutation({
    mutationFn: () => api.commitments.complete(commitmentId as string),
    onSuccess: async () => {
      await refresh()
      router.back()
    },
  })

  const snooze = useMutation({
    mutationFn: (until: string) => api.commitments.snooze(commitmentId as string, until),
    onSuccess: refresh,
  })

  if (query.isLoading && !commitment) {
    return (
      <Screen>
        <ScreenHeader title={t('commitment.title')} />
        <SkeletonCard />
      </Screen>
    )
  }

  if (!commitment) {
    return (
      <Screen>
        <ScreenHeader title={t('commitment.title')} />
        <ErrorState
          message={query.isError ? t(errorMessageKey(query.error)) : t('errors.not_found')}
        />
      </Screen>
    )
  }

  const now = systemClock.now()
  // Snoozed counts as still owed: postponing a promise must not take away the
  // button that closes it, or the only way back is to un-snooze it first.
  const isOpen =
    commitment.status === 'open' ||
    commitment.status === 'overdue' ||
    commitment.status === 'snoozed'
  // The next 09:00 in the user's own zone rather than the device's.
  const tomorrowMorning = nextLocalTimeOccurrence(now, '09:00', timeZone)

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader title={t('commitment.title')} />

      <View style={{ gap: spacing.md, paddingTop: spacing.sm }}>
        <View style={{ gap: spacing.xs }}>
          <View style={{ flexDirection: 'row', gap: spacing.xxs, flexWrap: 'wrap' }}>
            <Badge
              label={t(`commitment.status.${commitment.status}`)}
              tone={STATUS_TONE[commitment.status]}
            />
            <Badge label={t(`commitment.direction.${commitment.direction}`)} tone="neutral" />
            {!commitment.confirmedByUser ? (
              <Badge label={t('common.state.proposed')} tone="primary" icon="auto-awesome" />
            ) : null}
          </View>
          <Text variant="h2" accessibilityRole="header">
            {commitment.text}
          </Text>
          {commitment.personName ? (
            <Text variant="secondary" tone="secondary">
              {commitment.personName}
            </Text>
          ) : null}
          {commitment.dueAt ? (
            <Text
              variant="secondary"
              tone={commitment.status === 'overdue' ? 'critical' : 'secondary'}
            >
              {t('commitment.card.dueOn', {
                date: formatFullDate(new Date(commitment.dueAt), locale, timeZone),
              })}
            </Text>
          ) : (
            <Text variant="secondary" tone="tertiary">
              {t('commitment.card.noDate')}
            </Text>
          )}
        </View>

        <Card style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary">
            {t('common.fromSource', { source: t(`flow.itemType.${commitment.source.type}`) })}
          </Text>
          <Text variant="editorial">{t('commitment.card.quote', { quote: commitment.quote })}</Text>
          <SourceChip
            source={commitment.source}
            onPress={() => {
              if (commitment.source.type === 'email') router.push(`/thread/${commitment.source.id}`)
              else if (commitment.source.type === 'calendar_event') {
                router.push(`/event/${commitment.source.id}`)
              }
            }}
          />
        </Card>

        {commitment.snoozedUntil ? (
          <Text variant="micro" tone="tertiary">
            {t('commitment.snoozedTo', {
              date: formatTime(new Date(commitment.snoozedUntil), locale, timeZone),
            })}
          </Text>
        ) : null}

        {isOpen ? (
          <View style={{ gap: spacing.xs }}>
            <Button
              label={t('commitment.action.markDone')}
              onPress={() => complete.mutate()}
              fullWidth
              loading={complete.isPending}
              testID="commitment-complete"
            />
            <Button
              label={t('reminder.preset.tomorrowMorning')}
              onPress={() => snooze.mutate(tomorrowMorning.toISOString())}
              variant="tonal"
              fullWidth
              loading={snooze.isPending}
              testID="commitment-snooze"
            />
            <Button
              label={t('commitment.action.remind')}
              onPress={() =>
                router.push({
                  pathname: '/reminder',
                  params: {
                    sourceType: 'commitment',
                    sourceId: commitment.id,
                    title: commitment.text,
                  },
                })
              }
              variant="ghost"
              fullWidth
              testID="commitment-remind"
            />
          </View>
        ) : null}

        {complete.isError || snooze.isError ? (
          <Card tone="critical">
            <Text variant="secondary" tone="critical">
              {t(errorMessageKey(complete.error ?? snooze.error))}
            </Text>
          </Card>
        ) : null}
      </View>
    </Screen>
  )
}
