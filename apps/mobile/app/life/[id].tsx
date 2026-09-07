import { spacing } from '@da/design-tokens'
import { systemClock } from '@da/domain'
import { formatFullDate, formatMoney, formatTime } from '@da/i18n'
import * as WebBrowser from 'expo-web-browser'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { View } from 'react-native'
import { Badge } from '../../src/components/ui/Badge'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { SourceChip } from '../../src/components/ui/SourceChip'
import { ErrorState, SkeletonCard } from '../../src/components/ui/States'
import { Text } from '../../src/components/ui/Text'
import { useLifeEvents } from '../../src/hooks/queries'
import { useUserContext } from '../../src/hooks/useUserContext'
import { useI18n, useT } from '../../src/i18n/I18nProvider'
import { errorMessageKey } from '../../src/lib/query-client'

/** Life-event types map onto the mail categories the copy already covers. */
const TYPE_LABEL = {
  shipment: 'mail.category.shipment',
  flight: 'mail.category.travel',
  reservation: 'mail.category.travel',
  payment: 'mail.category.payment',
  subscription: 'mail.category.subscription',
  security: 'mail.category.security',
} as const

/**
 * A tracked life event — a parcel, a flight, a payment, a renewal.
 *
 * Amount, reference and date are rendered only when the extraction actually
 * found them in the source. A missing field says "not stated in the source"
 * rather than being quietly guessed, which is the anti-hallucination rule
 * showing through to the UI.
 */
export default function LifeEventScreen() {
  const t = useT()
  const { locale } = useI18n()
  const router = useRouter()
  const { timeZone } = useUserContext()
  const params = useLocalSearchParams<{ id?: string }>()
  const lifeEventId = params.id ?? null

  const query = useLifeEvents()
  const event = (query.data ?? []).find((entry) => entry.id === lifeEventId) ?? null

  if (query.isLoading && !event) {
    return (
      <Screen>
        <ScreenHeader title={t('today.section.personal')} />
        <SkeletonCard />
      </Screen>
    )
  }

  if (!event) {
    return (
      <Screen>
        <ScreenHeader title={t('today.section.personal')} />
        <ErrorState
          message={query.isError ? t(errorMessageKey(query.error)) : t('errors.not_found')}
        />
      </Screen>
    )
  }

  const occursAt = event.occursAt ? new Date(event.occursAt) : null
  const isPast = occursAt !== null && occursAt.getTime() < systemClock.now().getTime()

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader title={t('today.section.personal')} />

      <View style={{ gap: spacing.md, paddingTop: spacing.sm }}>
        <View style={{ gap: spacing.xs }}>
          <View style={{ flexDirection: 'row', gap: spacing.xxs, flexWrap: 'wrap' }}>
            <Badge label={t(TYPE_LABEL[event.type])} tone="neutral" />
            {event.status === 'completed' ? (
              <Badge label={t('commitment.status.done')} tone="success" />
            ) : null}
            {event.confidence < 0.6 ? (
              <Badge label={t('mail.triage.confidenceLow')} tone="warning" />
            ) : null}
          </View>
          <Text variant="h2" accessibilityRole="header">
            {event.title}
          </Text>
          {event.detail ? (
            <Text variant="body" tone="secondary">
              {event.detail}
            </Text>
          ) : null}
        </View>

        <Card style={{ gap: spacing.xs }}>
          <View style={{ gap: 2 }}>
            <Text variant="caption" tone="tertiary">
              {t('approval.preview.when')}
            </Text>
            <Text variant="body">
              {occursAt
                ? `${formatFullDate(occursAt, locale, timeZone)} · ${formatTime(occursAt, locale, timeZone)}`
                : t('common.uncertain')}
            </Text>
          </View>

          <View style={{ gap: 2 }}>
            <Text variant="caption" tone="tertiary">
              {t('email.amountFound')}
            </Text>
            <Text variant="body" tabular>
              {event.amount
                ? formatMoney(event.amount.value, event.amount.currency, locale)
                : t('common.uncertain')}
            </Text>
          </View>

          {event.reference ? (
            <View style={{ gap: 2 }}>
              <Text variant="caption" tone="tertiary">
                {t('capture.extraction.codeField')}
              </Text>
              <Text variant="body" tabular>
                {event.reference}
              </Text>
            </View>
          ) : null}
        </Card>

        {event.trackingUrl ? (
          <Button
            label={t('common.action.openLink')}
            onPress={() => void WebBrowser.openBrowserAsync(event.trackingUrl as string)}
            variant="tonal"
            fullWidth
            testID="life-track"
          />
        ) : null}

        <SourceChip
          source={event.source}
          onPress={() => {
            if (event.source.type === 'email') router.push(`/thread/${event.source.id}`)
            else if (event.source.type === 'capture') router.push(`/capture?id=${event.source.id}`)
          }}
        />

        {isPast && event.status === 'active' ? (
          <Text variant="micro" tone="tertiary">
            {t('common.state.lastUpdated', {
              time: formatFullDate(new Date(event.updatedAt), locale, timeZone),
            })}
          </Text>
        ) : null}
      </View>
    </Screen>
  )
}
