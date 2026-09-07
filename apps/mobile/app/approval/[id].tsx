import { spacing } from '@da/design-tokens'
import { APPROVAL_TTL_MS, type ApprovalPayload, systemClock, validateEdit } from '@da/domain'
import { formatFullDate, formatTime } from '@da/i18n'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { View } from 'react-native'
import { ApprovalCard } from '../../src/components/cards/ApprovalCard'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { Sheet } from '../../src/components/ui/Sheet'
import { ErrorState, SkeletonCard } from '../../src/components/ui/States'
import { Text } from '../../src/components/ui/Text'
import { TextField } from '../../src/components/ui/TextField'
import { useApproval } from '../../src/hooks/queries'
import { useApprovalFlow } from '../../src/hooks/useApprovalFlow'
import { useUserContext } from '../../src/hooks/useUserContext'
import { useI18n, useT } from '../../src/i18n/I18nProvider'
import { errorMessageKey } from '../../src/lib/query-client'

/** Fields the sheet can edit as free text, per action type. */
const TEXT_FIELDS: Record<string, readonly string[]> = {
  email_send: ['subject', 'body'],
  calendar_create: ['title', 'location'],
  task_create: ['title', 'notes'],
  reminder_create: ['title', 'body'],
  commitment_create: ['text'],
  calendar_update: [],
}

function readField(payload: ApprovalPayload, field: string): string {
  const value = (payload as unknown as Record<string, unknown>)[field]
  return typeof value === 'string' ? value : ''
}

/**
 * One approval, in full.
 *
 * Editing is deliberately narrow: only the fields the domain marks editable can
 * be changed, and an edit that touches anything else is refused here rather
 * than being silently dropped server-side. Approving is the only path that
 * reaches a provider, and it always starts with a human tap.
 */
export default function ApprovalScreen() {
  const t = useT()
  const { locale } = useI18n()
  const router = useRouter()
  const { timeZone } = useUserContext()
  const params = useLocalSearchParams<{ id?: string }>()
  const approvalId = params.id ?? null

  const query = useApproval(approvalId)
  const approval = query.data ?? null
  const { decide, retry, isDeciding, isRetrying, error } = useApprovalFlow()

  const [editOpen, setEditOpen] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [illegal, setIllegal] = useState<string[]>([])

  const editableTextFields = useMemo(
    () => (approval ? (TEXT_FIELDS[approval.type] ?? []) : []),
    [approval],
  )

  const openEditor = useCallback(() => {
    if (!approval) return
    const initial: Record<string, string> = {}
    for (const field of TEXT_FIELDS[approval.type] ?? []) {
      initial[field] = readField(approval.payload, field)
    }
    setDraft(initial)
    setIllegal([])
    setEditOpen(true)
  }, [approval])

  const applyEdit = useCallback(() => {
    if (!approval) return
    const edited = { ...approval.payload } as unknown as Record<string, unknown>
    for (const [field, value] of Object.entries(draft)) edited[field] = value

    const result = validateEdit(
      approval.type,
      approval.payload,
      edited as unknown as ApprovalPayload,
    )
    if (!result.valid) {
      setIllegal(result.illegalFields)
      return
    }

    setEditOpen(false)
    void decide({
      approvalId: approval.id,
      decision: 'approve',
      editedPayload: edited as unknown as ApprovalPayload,
    })
  }, [approval, decide, draft])

  if (query.isLoading && !approval) {
    return (
      <Screen>
        <ScreenHeader title={t('approval.title')} />
        <SkeletonCard />
      </Screen>
    )
  }

  if (!approval) {
    return (
      <Screen>
        <ScreenHeader title={t('approval.title')} />
        <ErrorState
          message={query.isError ? t(errorMessageKey(query.error)) : t('errors.not_found')}
        />
      </Screen>
    )
  }

  const expiresAt = new Date(new Date(approval.createdAt).getTime() + APPROVAL_TTL_MS)
  const minutesLeft = Math.round((expiresAt.getTime() - systemClock.now().getTime()) / 60_000)

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader title={t('approval.title')} subtitle={t(`approval.actionType.${approval.type}`)} />

      <View style={{ gap: spacing.md, paddingTop: spacing.sm }}>
        <ApprovalCard
          approval={approval}
          timeZone={timeZone}
          busy={isDeciding}
          onApprove={() => void decide({ approvalId: approval.id, decision: 'approve' })}
          onReject={() => void decide({ approvalId: approval.id, decision: 'reject' })}
          onEdit={openEditor}
          {...(approval.status === 'failed' ? { onRetry: () => void retry(approval.id) } : {})}
          testID="approval-detail-card"
        />

        {approval.status === 'pending' ? (
          <Card tone={minutesLeft < 60 ? 'warning' : 'surface'} style={{ gap: spacing.xxs }}>
            <Text variant="caption" tone={minutesLeft < 60 ? 'warning' : 'tertiary'}>
              {minutesLeft > 0
                ? t('approval.expiry.expiresIn', { duration: Math.max(1, minutesLeft) })
                : t('approval.expiry.expired')}
            </Text>
            <Text variant="micro" tone="tertiary">
              {formatFullDate(expiresAt, locale, timeZone)} ·{' '}
              {formatTime(expiresAt, locale, timeZone)}
            </Text>
          </Card>
        ) : null}

        {approval.status === 'executed' ? (
          <Card tone="success">
            <Text variant="secondary" tone="success">
              {t('approval.statusHint.executed')}
            </Text>
          </Card>
        ) : null}

        {approval.status === 'failed' ? (
          <Card tone="critical" style={{ gap: spacing.xs }}>
            <Text variant="secondary" tone="critical">
              {t('approval.statusHint.failed')}
            </Text>
            {approval.attemptCount > 0 ? (
              <Text variant="micro" tone="tertiary">
                {t('approval.retry.attempt', { count: approval.attemptCount })}
              </Text>
            ) : null}
            <Button
              label={t('approval.retry.retryNow')}
              onPress={() => void retry(approval.id)}
              variant="tonal"
              size="sm"
              loading={isRetrying}
              testID="approval-retry"
            />
          </Card>
        ) : null}

        {error ? (
          <Card tone="critical">
            <Text variant="secondary" tone="critical">
              {t(errorMessageKey(error))}
            </Text>
          </Card>
        ) : null}

        <Text variant="micro" tone="tertiary" center>
          {t('approval.externalEffect')}
        </Text>

        <Button
          label={t('common.action.close')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/approvals'))}
          variant="ghost"
          size="sm"
          testID="approval-close"
        />
      </View>

      <Sheet
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        title={t('approval.edit.title')}
        closeLabel={t('common.action.close')}
        footer={
          <Button
            label={t('approval.edit.save')}
            onPress={applyEdit}
            fullWidth
            loading={isDeciding}
            testID="approval-edit-save"
          />
        }
        testID="approval-edit-sheet"
      >
        <Text variant="secondary" tone="secondary">
          {t('approval.edit.hint')}
        </Text>

        {editableTextFields.length === 0 ? (
          <Text variant="secondary" tone="tertiary">
            {t('approval.edit.lockedField')}
          </Text>
        ) : (
          editableTextFields.map((field) => (
            <TextField
              key={field}
              label={t(`approval.preview.${field === 'text' ? 'title' : field}`)}
              value={draft[field] ?? ''}
              onChangeText={(next) => setDraft((current) => ({ ...current, [field]: next }))}
              multiline={field === 'body' || field === 'notes' || field === 'text'}
              height={field === 'body' ? 180 : undefined}
              testID={`approval-edit-${field}`}
            />
          ))
        )}

        {illegal.length > 0 ? (
          <Text variant="micro" tone="critical">
            {t('approval.edit.invalid')}
          </Text>
        ) : null}
      </Sheet>
    </Screen>
  )
}
