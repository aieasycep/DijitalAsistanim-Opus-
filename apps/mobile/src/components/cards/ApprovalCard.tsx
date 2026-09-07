import { spacing } from '@da/design-tokens'
import type { ApprovalAction, ApprovalActionType, ApprovalPayload, ApprovalStatus } from '@da/domain'
import { formatFullDate, formatTime } from '@da/i18n'
import { MaterialIcons } from '@expo/vector-icons'
import { View } from 'react-native'
import { useI18n, useT } from '../../i18n/I18nProvider'
import { useTheme } from '../../theme/ThemeProvider'
import { Badge, type BadgeTone } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { IconTile } from '../ui/Layout'
import { SourceChip } from '../ui/SourceChip'
import { Text } from '../ui/Text'

const ACTION_ICON: Record<ApprovalActionType, keyof typeof MaterialIcons.glyphMap> = {
  email_send: 'send',
  calendar_create: 'event',
  calendar_update: 'event-repeat',
  task_create: 'check-circle-outline',
  reminder_create: 'notifications',
  commitment_create: 'handshake',
}

const STATUS_TONE: Record<ApprovalStatus, BadgeTone> = {
  pending: 'primary',
  approved: 'info',
  executing: 'info',
  executed: 'success',
  rejected: 'neutral',
  failed: 'critical',
  expired: 'neutral',
}

/**
 * Render the exact change the action will make, field by field.
 *
 * This is the heart of the approval contract: the user has to be able to see
 * precisely what will happen — the recipient, the subject, the times — before
 * anything leaves the app. A summary sentence is not enough.
 */
function PayloadPreview({
  payload,
  timeZone,
}: {
  payload: ApprovalPayload
  timeZone: string
}) {
  const t = useT()
  const { locale } = useI18n()
  const theme = useTheme()

  const Row = ({ label, value }: { label: string; value: string }) => (
    <View style={{ flexDirection: 'row', gap: spacing.xs }}>
      <Text variant="micro" tone="tertiary" style={{ width: 76, letterSpacing: 0 }}>
        {label}
      </Text>
      <Text variant="secondary" style={{ flex: 1 }} numberOfLines={6}>
        {value}
      </Text>
    </View>
  )

  const instant = (iso: string): string => {
    const d = new Date(iso)
    return `${formatFullDate(d, locale, timeZone)} · ${formatTime(d, locale, timeZone)}`
  }

  const rows: Array<{ label: string; value: string }> = (() => {
    switch (payload.kind) {
      case 'email_send':
        return [
          { label: t('approval.preview.to'), value: payload.to.join(', ') },
          ...(payload.cc.length > 0
            ? [{ label: t('approval.preview.cc'), value: payload.cc.join(', ') }]
            : []),
          { label: t('approval.preview.subject'), value: payload.subject },
          { label: t('approval.preview.body'), value: payload.body },
        ]
      case 'calendar_create':
        return [
          { label: t('approval.preview.title'), value: payload.title },
          { label: t('approval.preview.when'), value: instant(payload.startsAt) },
          { label: t('approval.preview.until'), value: instant(payload.endsAt) },
          ...(payload.location
            ? [{ label: t('approval.preview.where'), value: payload.location }]
            : []),
          ...(payload.attendees.length > 0
            ? [{ label: t('approval.preview.attendees'), value: payload.attendees.join(', ') }]
            : []),
        ]
      case 'calendar_update': {
        const c = payload.changes
        return [
          ...(c.title ? [{ label: t('approval.preview.title'), value: c.title }] : []),
          ...(c.startsAt ? [{ label: t('approval.preview.when'), value: instant(c.startsAt) }] : []),
          ...(c.endsAt ? [{ label: t('approval.preview.until'), value: instant(c.endsAt) }] : []),
          ...(c.location !== undefined
            ? [{ label: t('approval.preview.where'), value: c.location ?? '—' }]
            : []),
        ]
      }
      case 'task_create':
        return [
          { label: t('approval.preview.title'), value: payload.title },
          ...(payload.dueAt ? [{ label: t('approval.preview.dueDate'), value: instant(payload.dueAt) }] : []),
          ...(payload.notes ? [{ label: t('approval.preview.notes'), value: payload.notes }] : []),
        ]
      case 'reminder_create':
        return [
          { label: t('approval.preview.title'), value: payload.title },
          { label: t('approval.preview.when'), value: instant(payload.remindAt) },
        ]
      case 'commitment_create':
        return [
          { label: t('approval.preview.title'), value: payload.text },
          ...(payload.personName
            ? [{ label: t('approval.preview.person'), value: payload.personName }]
            : []),
          ...(payload.dueAt ? [{ label: t('approval.preview.dueDate'), value: instant(payload.dueAt) }] : []),
        ]
    }
  })()

  return (
    <View
      style={{
        gap: 6,
        padding: spacing.sm,
        borderRadius: 12,
        backgroundColor: theme.colors.surface2,
      }}
    >
      {rows.map((row) => (
        <Row key={row.label} label={row.label} value={row.value} />
      ))}
    </View>
  )
}

export interface ApprovalCardProps {
  approval: ApprovalAction
  timeZone: string
  onApprove: () => void
  onReject: () => void
  onEdit: () => void
  onOpenSource?: (() => void) | undefined
  /** Retry after a failed execution. Only supplied while retries remain. */
  onRetry?: (() => void) | undefined
  busy?: boolean
  /** Collapses the payload preview in list contexts. */
  compact?: boolean
  testID?: string
}

/**
 * The approval card.
 *
 * A pending proposal is drawn with the dashed "not yet real" border the design
 * system reserves for exactly this, so it never reads as something that has
 * already happened.
 */
export function ApprovalCard({
  approval,
  timeZone,
  onApprove,
  onReject,
  onEdit,
  onOpenSource,
  onRetry,
  busy = false,
  compact = false,
  testID,
}: ApprovalCardProps) {
  const t = useT()
  const isPending = approval.status === 'pending'
  const isFailed = approval.status === 'failed'

  return (
    <Card
      proposed={isPending}
      testID={testID}
      accessibilityLabel={approval.what}
      style={{ gap: spacing.sm }}
    >
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
        <IconTile icon={ACTION_ICON[approval.type]} tone={isPending ? 'primary' : 'neutral'} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="h3" numberOfLines={3}>
            {approval.what}
          </Text>
          <Text variant="secondary" tone="secondary" numberOfLines={3}>
            {approval.why}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
        <Badge
          label={t(`approval.status.${approval.status}`)}
          tone={STATUS_TONE[approval.status]}
        />
        <Badge label={t(`approval.actionType.${approval.type}`)} tone="neutral" />
      </View>

      {approval.source ? <SourceChip source={approval.source} onPress={onOpenSource} /> : null}

      {!compact ? <PayloadPreview payload={approval.payload} timeZone={timeZone} /> : null}

      {isFailed && approval.failureReason ? (
        <Text variant="micro" tone="critical">
          {approval.failureReason}
        </Text>
      ) : null}

      {isPending ? (
        <View style={{ gap: spacing.xs }}>
          <Button
            label={t('approval.decide.approve')}
            onPress={onApprove}
            loading={busy}
            fullWidth
            accessibilityHint={t('a11y.button.approve')}
          />
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <Button
              label={t('approval.decide.edit')}
              onPress={onEdit}
              variant="neutral"
              size="sm"
              style={{ flex: 1 }}
            />
            <Button
              label={t('approval.decide.reject')}
              onPress={onReject}
              variant="destructive"
              size="sm"
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : null}

      {isFailed && onRetry ? (
        <Button label={t('common.action.retry')} onPress={onRetry} variant="tonal" size="sm" />
      ) : null}
    </Card>
  )
}
