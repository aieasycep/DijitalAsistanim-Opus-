import { qk } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import { nextWorkingDay, systemClock, type FollowUp } from '@da/domain'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { View } from 'react-native'
import { FollowUpCard } from '../../src/components/cards/FollowUpCard'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { SectionHeader } from '../../src/components/ui/Layout'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { Sheet } from '../../src/components/ui/Sheet'
import { EmptyState, ErrorState, SkeletonCard } from '../../src/components/ui/States'
import { Text } from '../../src/components/ui/Text'
import {
  useFollowUps,
  useInvalidateAfterWrite,
  useThread,
  useThreads,
} from '../../src/hooks/queries'
import { useApprovalFlow } from '../../src/hooks/useApprovalFlow'
import { useUserContext } from '../../src/hooks/useUserContext'
import { useT } from '../../src/i18n/I18nProvider'
import { errorMessageKey, isRetryable } from '../../src/lib/query-client'
import { useApi } from '../../src/providers/AppProviders'

/**
 * Threads waiting on a reply.
 *
 * The nudge is drafted, shown, and then handed to the approval flow — the app
 * has no path that sends a chase-up mail on its own, which is the difference
 * between a helpful assistant and an embarrassing one.
 */
export default function FollowUpsScreen() {
  const t = useT()
  const router = useRouter()
  const api = useApi()
  const queryClient = useQueryClient()
  const invalidate = useInvalidateAfterWrite()
  const { timeZone } = useUserContext()
  const query = useFollowUps()
  // Follow-ups carry the thread id but not its subject; the waiting slice of
  // the flow already holds those rows, so no extra endpoint is needed.
  const threadsQuery = useThreads({ flow: 'waiting', limit: 100 })
  const subjectOf = useCallback(
    (followUp: FollowUp): string =>
      (threadsQuery.data ?? []).find((thread) => thread.id === followUp.threadId)?.subject ??
      followUp.recipientName ??
      followUp.recipientEmail,
    [threadsQuery.data],
  )
  const { proposeAndReview, isProposing, error: proposeError } = useApprovalFlow()

  const [draftFor, setDraftFor] = useState<FollowUp | null>(null)

  /**
   * The mailbox a nudge would leave from.
   *
   * A reply has to be sent from the account that holds the thread, so the
   * account is the thread's and never a guess: this screen used to put an
   * empty string in the approval payload, which `emailSendPayloadSchema`
   * rejects as a uuid, so the send button threw before anything left the
   * device and the rejection was dropped on the floor.
   */
  const threadQuery = useThread(draftFor?.threadId ?? null)
  const sendAccountId = threadQuery.data?.connectedAccountId ?? null
  /** Settled and still no mailbox — a pending query is not an answer. */
  const threadUnavailable = draftFor !== null && !threadQuery.isPending && sendAccountId === null

  const now = systemClock.now()
  const followUps = (query.data ?? []).filter(
    (followUp) => followUp.status === 'waiting' || followUp.status === 'nudged',
  )
  const overdue = followUps.filter((followUp) => new Date(followUp.dueAt) <= now)
  const upcoming = followUps.filter((followUp) => new Date(followUp.dueAt) > now)

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: qk.followUps() })
    await invalidate()
  }, [queryClient, invalidate])

  const nudge = useMutation({
    mutationFn: (followUp: FollowUp) => api.followUps.nudgeDraft(followUp.id),
    // Drafting moves the follow-up to `nudged`; the list says so once it has
    // been refetched.
    onSuccess: refresh,
  })

  const close = useMutation({
    mutationFn: (followUpId: string) => api.followUps.close(followUpId),
    onSuccess: refresh,
  })

  const snooze = useMutation({
    // "Remind me tomorrow" means the start of the next working day — the
    // domain's rule, so a Friday afternoon nudge is not due again on Saturday.
    mutationFn: (followUpId: string) =>
      api.followUps.snooze(followUpId, nextWorkingDay(now, timeZone).toISOString()),
    onSuccess: refresh,
  })

  const openNudge = useCallback(
    (followUp: FollowUp) => {
      setDraftFor(followUp)
      nudge.mutate(followUp)
    },
    [nudge],
  )

  const sendForApproval = useCallback(() => {
    const draft = nudge.data
    const followUp = draftFor
    if (!draft || !followUp || !sendAccountId) return
    setDraftFor(null)
    void proposeAndReview({
      type: 'email_send',
      what: t('followup.nudge.title'),
      why: t('followup.card.sentTo', { name: followUp.recipientName ?? followUp.recipientEmail }),
      sourceType: 'email',
      sourceId: followUp.threadId,
      discriminator: `nudge:${followUp.id}`,
      payload: {
        kind: 'email_send',
        connectedAccountId: sendAccountId,
        threadId: followUp.threadId,
        inReplyToMessageId: followUp.messageId,
        to: [followUp.recipientEmail],
        cc: [],
        subject: draft.subject,
        body: draft.body,
        tone: 'professional',
      },
    })
  }, [draftFor, nudge.data, proposeAndReview, sendAccountId, t])

  const renderGroup = (title: string, items: FollowUp[]) =>
    items.length === 0 ? null : (
      <View style={{ marginTop: spacing.lg }}>
        <SectionHeader title={title} />
        <View style={{ gap: spacing.sm }}>
          {items.map((followUp) => (
            <FollowUpCard
              key={followUp.id}
              followUp={followUp}
              subject={subjectOf(followUp)}
              now={now}
              onDraftNudge={() => openNudge(followUp)}
              onRemindTomorrow={() => snooze.mutate(followUp.id)}
              onClose={() => close.mutate(followUp.id)}
              onOpenThread={() => router.push(`/thread/${followUp.threadId}`)}
              busy={nudge.isPending || snooze.isPending || close.isPending}
              testID={`followup-${followUp.id}`}
            />
          ))}
        </View>
      </View>
    )

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader title={t('followup.title')} subtitle={t('followup.subtitle')} />

      {query.isLoading && followUps.length === 0 ? (
        <SkeletonCard />
      ) : query.isError && followUps.length === 0 ? (
        <ErrorState
          message={t(errorMessageKey(query.error))}
          {...(isRetryable(query.error)
            ? { retryLabel: t('common.action.retry'), onRetry: () => void query.refetch() }
            : {})}
        />
      ) : followUps.length === 0 ? (
        <EmptyState
          icon="hourglass-empty"
          title={t('empty.noFollowUp')}
          description={t('empty.noFollowUpHint')}
        />
      ) : (
        <>
          {renderGroup(t('followup.section.overdue'), overdue)}
          {renderGroup(t('followup.section.upcoming'), upcoming)}
        </>
      )}

      <Sheet
        visible={draftFor !== null}
        onClose={() => setDraftFor(null)}
        title={t('followup.nudge.title')}
        closeLabel={t('common.action.close')}
        // No mailbox, no send button: a control that cannot work is worse than
        // no control at all, so the sheet says why instead of offering one.
        {...(sendAccountId === null
          ? {}
          : {
              footer: (
                <Button
                  label={t('reply.review.send')}
                  onPress={sendForApproval}
                  fullWidth
                  loading={isProposing}
                  disabled={!nudge.data}
                  testID="followup-nudge-send"
                />
              ),
            })}
        testID="followup-nudge-sheet"
      >
        {nudge.isPending ? (
          <Text variant="secondary" tone="secondary">
            {t('reply.draft.generating')}
          </Text>
        ) : nudge.isError ? (
          <Card tone="critical">
            <Text variant="secondary" tone="critical">
              {t(errorMessageKey(nudge.error))}
            </Text>
          </Card>
        ) : nudge.data ? (
          <View style={{ gap: spacing.xs }}>
            <Text variant="caption" tone="tertiary">
              {nudge.data.subject}
            </Text>
            <Text variant="body">{nudge.data.body}</Text>
            <Text variant="micro" tone="tertiary">
              {t('reply.neverAutoSend')}
            </Text>
          </View>
        ) : null}

        {threadUnavailable ? (
          <Card tone="critical">
            <Text variant="secondary" tone="critical">
              {threadQuery.isError ? t(errorMessageKey(threadQuery.error)) : t('errors.not_found')}
            </Text>
          </Card>
        ) : null}

        {proposeError ? (
          <Card tone="critical">
            <Text variant="secondary" tone="critical">
              {t(errorMessageKey(proposeError))}
            </Text>
          </Card>
        ) : null}
      </Sheet>
    </Screen>
  )
}
