import { qk } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import { systemClock } from '@da/domain'
import type { EmailMessage, FeedbackSignal } from '@da/domain'
import { elapsedKey, formatTime } from '@da/i18n'
import { MaterialIcons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as WebBrowser from 'expo-web-browser'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { View } from 'react-native'
import { Avatar } from '../../src/components/ui/Avatar'
import { Badge } from '../../src/components/ui/Badge'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { IconButton } from '../../src/components/ui/Controls'
import { Divider, SectionHeader } from '../../src/components/ui/Layout'
import { Pressable } from '../../src/components/ui/Pressable'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { ErrorState, SkeletonCard } from '../../src/components/ui/States'
import { Sheet } from '../../src/components/ui/Sheet'
import { Text } from '../../src/components/ui/Text'
import { useI18n, useT } from '../../src/i18n/I18nProvider'
import { useInvalidateAfterWrite } from '../../src/hooks/queries'
import { useUserContext } from '../../src/hooks/useUserContext'
import { errorMessageKey, isRetryable } from '../../src/lib/query-client'
import { useApi } from '../../src/providers/AppProviders'
import { useTheme } from '../../src/theme/ThemeProvider'

const IMPORTANCE_TONE = {
  critical: 'critical',
  high: 'warning',
  normal: 'neutral',
  low: 'neutral',
} as const

/**
 * A thread, read the way the assistant read it.
 *
 * The summary and the reason it was surfaced come first, then the messages —
 * the point of the product is that most threads never need to be opened at all,
 * so the screen is built for confirming a judgement rather than for reading
 * mail top to bottom.
 */
export default function ThreadScreen() {
  const t = useT()
  const { locale, plural } = useI18n()
  const theme = useTheme()
  const router = useRouter()
  const api = useApi()
  const queryClient = useQueryClient()
  const invalidate = useInvalidateAfterWrite()
  const { timeZone } = useUserContext()
  const params = useLocalSearchParams<{ id?: string }>()
  const threadId = params.id ?? null

  const [expanded, setExpanded] = useState<string[]>([])
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  const query = useQuery({
    queryKey: [...qk.thread(threadId ?? 'none'), 'detail'],
    queryFn: () => api.threads.detail(threadId as string),
    enabled: Boolean(threadId),
  })

  const detail = query.data ?? null
  const thread = detail?.thread ?? null

  const markDone = useMutation({
    mutationFn: () => api.threads.suppress(threadId as string),
    onSuccess: async () => {
      await invalidate()
      router.back()
    },
  })

  const feedback = useMutation({
    mutationFn: (signal: FeedbackSignal) =>
      api.threads.feedback({ signal, entityType: 'email', entityId: threadId as string }),
    onSuccess: async () => {
      setFeedbackOpen(false)
      await queryClient.invalidateQueries({ queryKey: qk.threads({ flow: 'all' }) })
    },
  })

  const toggleMessage = useCallback((messageId: string) => {
    setExpanded((current) =>
      current.includes(messageId)
        ? current.filter((entry) => entry !== messageId)
        : [...current, messageId],
    )
  }, [])

  if (!threadId) {
    return (
      <Screen>
        <ScreenHeader title={t('email.title')} />
        <ErrorState message={t('errors.not_found')} />
      </Screen>
    )
  }

  if (query.isLoading && !detail) {
    return (
      <Screen>
        <ScreenHeader title={t('email.title')} />
        <SkeletonCard />
      </Screen>
    )
  }

  if ((query.isError || !thread) && !query.isLoading) {
    return (
      <Screen>
        <ScreenHeader title={t('email.title')} />
        <ErrorState
          message={query.isError ? t(errorMessageKey(query.error)) : t('errors.not_found')}
          {...(query.isError && isRetryable(query.error)
            ? { retryLabel: t('common.action.retry'), onRetry: () => void query.refetch() }
            : {})}
        />
      </Screen>
    )
  }

  if (!thread) return null

  const messages: EmailMessage[] = detail?.messages ?? []
  const latest = messages[messages.length - 1] ?? null

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader
        title={t('email.title')}
        actions={
          <IconButton
            onPress={() => setFeedbackOpen(true)}
            accessibilityLabel={t('a11y.button.more')}
            testID="thread-more"
          >
            <MaterialIcons name="more-horiz" size={22} color={theme.colors.text} />
          </IconButton>
        }
      />

      <View style={{ gap: spacing.md, paddingTop: spacing.sm }}>
        <View style={{ gap: spacing.xs }}>
          <View style={{ flexDirection: 'row', gap: spacing.xxs, flexWrap: 'wrap' }}>
            <Badge
              label={t(`mail.category.${thread.category}`)}
              tone={IMPORTANCE_TONE[thread.importance]}
            />
            {thread.requiresUserAction ? (
              <Badge label={t('mail.categories.awaitingYou')} tone="primary" icon="reply" />
            ) : null}
            {thread.deadline ? (
              <Badge
                label={formatTime(new Date(thread.deadline), locale, timeZone)}
                tone="warning"
                icon="schedule"
              />
            ) : null}
          </View>
          <Text variant="h2" accessibilityRole="header">
            {thread.subject}
          </Text>
          <Text variant="micro" tone="tertiary">
            {thread.participantEmails.slice(0, 3).join(', ')}
            {thread.participantEmails.length > 3 ? ` +${thread.participantEmails.length - 3}` : ''}
          </Text>
        </View>

        {thread.summary ? (
          <Card style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xxs }}>
              <MaterialIcons name="auto-awesome" size={15} color={theme.colors.primaryOnSoft} />
              <Text variant="caption" tone="primary">
                {t('email.summary.title')}
              </Text>
            </View>
            <Text variant="body">{thread.summary}</Text>
            {thread.reasonImportant ? (
              <Text variant="secondary" tone="secondary">
                {t('today.priority.reason', { reason: thread.reasonImportant })}
              </Text>
            ) : null}
            {thread.confidence !== null && thread.confidence < 0.6 ? (
              <Text variant="micro" tone="tertiary">
                {t('mail.triage.confidenceLow')}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xxs }}>
              <Pressable
                onPress={() => feedback.mutate('good_summary')}
                haptic="light"
                scaleOnPress={false}
                accessibilityLabel={t('email.summary.good')}
                style={{ minHeight: 0 }}
                testID="summary-good"
              >
                <Text variant="micro" tone="primary">
                  {t('email.summary.good')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => feedback.mutate('bad_summary')}
                haptic="light"
                scaleOnPress={false}
                accessibilityLabel={t('email.summary.bad')}
                style={{ minHeight: 0 }}
                testID="summary-bad"
              >
                <Text variant="micro" tone="tertiary">
                  {t('email.summary.bad')}
                </Text>
              </Pressable>
            </View>
          </Card>
        ) : null}

        <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
          <Button
            label={t('email.actions.draftReply')}
            onPress={() => router.push(`/reply/${threadId}`)}
            size="sm"
            leading={<MaterialIcons name="reply" size={16} color={theme.colors.onPrimary} />}
            testID="thread-reply"
          />
          <Button
            label={t('commitment.action.markDone')}
            onPress={() => markDone.mutate()}
            variant="tonal"
            size="sm"
            loading={markDone.isPending}
            testID="thread-done"
          />
          <Button
            label={t('email.actions.remind')}
            onPress={() =>
              router.push({
                pathname: '/reminder',
                params: { sourceType: 'email', sourceId: threadId, title: thread.subject },
              })
            }
            variant="tonal"
            size="sm"
            testID="thread-remind"
          />
          {latest?.externalUrl ? (
            <Button
              label={t('email.actions.openOriginal')}
              onPress={() => void WebBrowser.openBrowserAsync(latest.externalUrl as string)}
              variant="ghost"
              size="sm"
              testID="thread-open-original"
            />
          ) : null}
        </View>

        {(detail?.commitments.length ?? 0) > 0 ? (
          <View>
            <SectionHeader title={t('commitment.title')} />
            <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
              {detail?.commitments.map((commitment, index) => (
                <View key={commitment.id}>
                  {index > 0 ? <Divider /> : null}
                  <Pressable
                    onPress={() => router.push(`/commitment/${commitment.id}`)}
                    haptic="light"
                    scaleOnPress={false}
                    accessibilityLabel={commitment.text}
                    style={{ paddingVertical: spacing.sm }}
                    testID={`thread-commitment-${commitment.id}`}
                  >
                    <Text variant="body" numberOfLines={2}>
                      {commitment.text}
                    </Text>
                    <Text variant="micro" tone="tertiary">
                      {t(`commitment.direction.${commitment.direction}`)}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        <View>
          <SectionHeader title={t('mail.thread.messages', { count: messages.length })} />
          <View style={{ gap: spacing.sm }}>
            {messages.map((message) => {
              const isOpen = expanded.includes(message.id)
              return (
                <Card key={message.id} style={{ gap: spacing.xs }}>
                  <Pressable
                    onPress={() => toggleMessage(message.id)}
                    haptic="light"
                    scaleOnPress={false}
                    accessibilityLabel={message.fromName ?? message.fromEmail}
                    accessibilityState={{ expanded: isOpen }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
                    testID={`message-${message.id}`}
                  >
                    <Avatar name={message.fromName ?? message.fromEmail} size={32} />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {message.fromName ?? message.fromEmail}
                      </Text>
                      <Text variant="micro" tone="tertiary" numberOfLines={1}>
                        {(() => {
                          const elapsed = elapsedKey(new Date(message.sentAt), systemClock.now())
                          return plural(elapsed.key, elapsed.count)
                        })()}
                      </Text>
                    </View>
                    <MaterialIcons
                      name={isOpen ? 'expand-less' : 'expand-more'}
                      size={20}
                      color={theme.colors.textTertiary}
                    />
                  </Pressable>

                  <Text variant="secondary" tone="secondary">
                    {isOpen ? (message.bodyText ?? message.snippet) : message.snippet}
                  </Text>

                  {message.hasAttachments ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xxs }}>
                      <MaterialIcons
                        name="attach-file"
                        size={14}
                        color={theme.colors.textTertiary}
                      />
                      <Text variant="micro" tone="tertiary">
                        {t('mail.thread.attachments', { count: message.attachmentMeta.length })}
                      </Text>
                    </View>
                  ) : null}

                  {isOpen && message.bodyText === null ? (
                    <Text variant="micro" tone="tertiary">
                      {t('email.body.truncated')}
                    </Text>
                  ) : null}
                </Card>
              )
            })}
          </View>
        </View>

        {!thread.requiresUserAction ? (
          <Text variant="micro" tone="tertiary" center>
            {t('email.nothingAskedOfYou')}
          </Text>
        ) : null}
      </View>

      <Sheet
        visible={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        title={t('email.feedback.saved')}
        closeLabel={t('common.action.close')}
        testID="thread-feedback-sheet"
      >
        <Button
          label={t('email.feedback.moreLikeThis')}
          onPress={() => feedback.mutate('more_like_this')}
          variant="tonal"
          fullWidth
          testID="feedback-more"
        />
        <Button
          label={t('email.feedback.notImportant')}
          onPress={() => feedback.mutate('not_important')}
          variant="tonal"
          fullWidth
          testID="feedback-less"
        />
        <Button
          label={t('email.feedback.stopFollowing')}
          onPress={() => feedback.mutate('stop_following')}
          variant="ghost"
          fullWidth
          testID="feedback-mute"
        />
      </Sheet>
    </Screen>
  )
}
