import { spacing } from '@da/design-tokens'
import type { Commitment } from '@da/domain'
import { relativeDayKey } from '@da/i18n'
import { View } from 'react-native'
import { useT } from '../../i18n/I18nProvider'
import { useTheme } from '../../theme/ThemeProvider'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { SourceChip } from '../ui/SourceChip'
import { Text } from '../ui/Text'

export interface CommitmentCardProps {
  commitment: Commitment
  timeZone: string
  now: Date
  onComplete: () => void
  onSnooze: () => void
  onOpenSource: () => void
  /** Shown when the extraction needs the user to confirm it before it counts. */
  onConfirm?: (() => void) | undefined
  busy?: boolean
  testID?: string
}

/**
 * A tracked promise, in either direction.
 *
 * The quoted sentence is always rendered. A commitment the app cannot quote is
 * never persisted in the first place, so showing the quote costs nothing and
 * makes the claim checkable at a glance.
 */
export function CommitmentCard({
  commitment,
  timeZone,
  now,
  onComplete,
  onSnooze,
  onOpenSource,
  onConfirm,
  busy = false,
  testID,
}: CommitmentCardProps) {
  const t = useT()
  const theme = useTheme()

  const isOverdue =
    commitment.status === 'overdue' ||
    (commitment.dueAt != null &&
      commitment.status === 'open' &&
      new Date(commitment.dueAt).getTime() < now.getTime())

  const due = commitment.dueAt
    ? (() => {
        const rel = relativeDayKey(new Date(commitment.dueAt), now, timeZone)
        return t(rel.key, rel.values)
      })()
    : null

  const isDone = commitment.status === 'done'
  const needsConfirmation = !commitment.confirmedByUser && commitment.confidence < 0.7

  return (
    <Card
      proposed={needsConfirmation}
      testID={testID}
      accessibilityLabel={commitment.text}
      style={{ gap: spacing.xs, opacity: isDone ? 0.6 : 1 }}
    >
      <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
        <Badge
          label={t(
            commitment.direction === 'user_owes'
              ? 'commitment.direction.user_owes'
              : 'commitment.direction.other_owes',
          )}
          tone={commitment.direction === 'user_owes' ? 'primary' : 'neutral'}
          icon="handshake"
        />
        {isOverdue ? (
          <Badge label={t('commitment.status.overdue')} tone="critical" icon="priority-high" />
        ) : due ? (
          <Badge label={due} tone="warning" icon="schedule" />
        ) : null}
        {isDone ? <Badge label={t('common.action.done')} tone="success" icon="check-circle" /> : null}
      </View>

      <Text variant="h3" numberOfLines={3}>
        {commitment.text}
      </Text>

      {commitment.personName ? (
        <Text variant="secondary" tone="secondary">
          {commitment.personName}
        </Text>
      ) : null}

      {/* The verbatim sentence the promise was read from — set in the editorial
          serif because it is a quotation, not UI chrome. */}
      <View
        style={{
          borderLeftWidth: 2,
          borderLeftColor: theme.colors.hairline,
          paddingLeft: spacing.xs,
        }}
      >
        <Text variant="editorial" tone="secondary" numberOfLines={3} style={{ fontSize: 15, lineHeight: 23 }}>
          {`“${commitment.quote}”`}
        </Text>
      </View>

      <SourceChip source={commitment.source} onPress={onOpenSource} />

      {needsConfirmation && onConfirm ? (
        <Button label={t('commitment.detected.confirm')} onPress={onConfirm} variant="tonal" size="sm" />
      ) : null}

      {!isDone && commitment.status !== 'cancelled' ? (
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          <Button
            label={t('commitment.action.markDone')}
            onPress={onComplete}
            variant="tonal"
            size="sm"
            loading={busy}
            style={{ flex: 1 }}
          />
          <Button
            label={t('commitment.action.snooze')}
            onPress={onSnooze}
            variant="neutral"
            size="sm"
            style={{ flex: 1 }}
          />
        </View>
      ) : null}
    </Card>
  )
}
