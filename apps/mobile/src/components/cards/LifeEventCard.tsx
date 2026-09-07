import { spacing } from '@da/design-tokens'
import type { LifeEvent, LifeEventType } from '@da/domain'
import { formatMoney, relativeDayKey } from '@da/i18n'
import { MaterialIcons } from '@expo/vector-icons'
import { View } from 'react-native'
import { useI18n, useT } from '../../i18n/I18nProvider'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { IconTile, type IconTileProps } from '../ui/Layout'
import { SourceChip } from '../ui/SourceChip'
import { Text } from '../ui/Text'

const VISUAL: Record<
  LifeEventType,
  { icon: keyof typeof MaterialIcons.glyphMap; tone: IconTileProps['tone'] }
> = {
  shipment: { icon: 'local-shipping', tone: 'neutral' },
  flight: { icon: 'flight', tone: 'info' },
  reservation: { icon: 'restaurant', tone: 'neutral' },
  payment: { icon: 'receipt-long', tone: 'warning' },
  subscription: { icon: 'autorenew', tone: 'neutral' },
  security: { icon: 'shield', tone: 'critical' },
}

export interface LifeEventCardProps {
  event: LifeEvent
  /** The user's zone, for the "tomorrow"/"in 3 days" label. */
  timeZone: string
  now: Date
  onPress: () => void
  onOpenSource: () => void
  /** Only supplied when the source really gave a tracking URL. */
  onTrack?: (() => void) | undefined
  testID?: string
}

/**
 * A Life Intelligence card: a shipment, a flight, a payment, a renewal.
 *
 * Amounts and reference numbers render only when the extraction actually found
 * them in the source — the entity models them as nullable and this card treats
 * null as "don't show", never as "estimate one".
 */
export function LifeEventCard({
  event,
  timeZone,
  now,
  onPress,
  onOpenSource,
  onTrack,
  testID,
}: LifeEventCardProps) {
  const t = useT()
  const { locale } = useI18n()
  const visual = VISUAL[event.type]

  const when = event.occursAt
    ? (() => {
        const rel = relativeDayKey(new Date(event.occursAt), now, timeZone)
        return t(rel.key, rel.values)
      })()
    : null

  const isUncertain = event.confidence < 0.6

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={event.title}
      testID={testID}
      style={{ gap: spacing.xs }}
    >
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
        <IconTile icon={visual.icon} tone={visual.tone} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h3" numberOfLines={2}>
            {event.title}
          </Text>
          {event.detail ? (
            <Text variant="secondary" tone="secondary" numberOfLines={2}>
              {event.detail}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
        {when ? <Badge label={when} tone="neutral" icon="schedule" /> : null}
        {event.amount ? (
          <Badge
            label={formatMoney(event.amount.value, event.amount.currency, locale)}
            tone="warning"
            icon="payments"
          />
        ) : null}
        {event.reference ? (
          <Text variant="micro" tone="tertiary" tabular numberOfLines={1}>
            {event.reference}
          </Text>
        ) : null}
        {event.type === 'security' ? (
          <Badge label={t('mail.badge.security')} tone="critical" icon="shield" />
        ) : null}
      </View>

      {isUncertain ? (
        <Text variant="micro" tone="tertiary">
          {t('common.uncertain')}
        </Text>
      ) : null}

      <SourceChip source={event.source} onPress={onOpenSource} />

      {onTrack ? (
        <Button
          label={t(event.type === 'shipment' ? 'life.track' : 'life.open')}
          onPress={onTrack}
          variant="tonal"
          size="sm"
        />
      ) : null}
    </Card>
  )
}
