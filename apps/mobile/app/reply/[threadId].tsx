import { spacing } from '@da/design-tokens'
import { REPLY_TONES, type ReplyTone } from '@da/domain'
import { MaterialIcons } from '@expo/vector-icons'
import { useMutation } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, View } from 'react-native'
import { Badge } from '../../src/components/ui/Badge'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { FilterChip } from '../../src/components/ui/Controls'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { Text } from '../../src/components/ui/Text'
import { TextField } from '../../src/components/ui/TextField'
import { useT } from '../../src/i18n/I18nProvider'
import { useThread } from '../../src/hooks/queries'
import { useApprovalFlow } from '../../src/hooks/useApprovalFlow'
import { errorMessageKey } from '../../src/lib/query-client'
import { useApi } from '../../src/providers/AppProviders'
import { useTheme } from '../../src/theme/ThemeProvider'

/**
 * The reply composer.
 *
 * Nothing here sends anything. The draft is produced by the model, edited by
 * the user, and then handed to the approval flow — which is the only path in
 * the app that can touch a mail provider. The button therefore says "review and
 * approve", never "send", and that is a product rule rather than a wording
 * preference.
 */
export default function ReplyScreen() {
  const t = useT()
  const theme = useTheme()
  const router = useRouter()
  const api = useApi()
  const params = useLocalSearchParams<{ threadId?: string }>()
  const threadId = params.threadId ?? null
  const threadQuery = useThread(threadId)
  const { proposeAndReview, isProposing, error: proposeError } = useApprovalFlow()

  const [tone, setTone] = useState<ReplyTone>('professional')
  const [instruction, setInstruction] = useState('')
  const [body, setBody] = useState('')
  const [subject, setSubject] = useState('')
  const [grounded, setGrounded] = useState(true)
  const [edited, setEdited] = useState(false)

  const draft = useMutation({
    mutationFn: (input: { tone: ReplyTone; instruction: string }) =>
      api.reply.draft({
        threadId: threadId as string,
        tone: input.tone,
        ...(input.instruction.trim() ? { instruction: input.instruction.trim() } : {}),
      }),
    onSuccess: (result) => {
      setBody(result.body)
      setSubject(result.subject)
      setGrounded(result.grounded)
      setEdited(false)
    },
  })

  useEffect(() => {
    if (!threadId || draft.isPending || draft.data || draft.isError) return
    draft.mutate({ tone, instruction })
  }, [threadId, draft, tone, instruction])

  const regenerate = useCallback(
    (nextTone: ReplyTone) => {
      setTone(nextTone)
      draft.mutate({ tone: nextTone, instruction })
    },
    [draft, instruction],
  )

  const sendForApproval = useCallback(() => {
    const thread = threadQuery.data
    if (!thread || !body.trim()) return
    void proposeAndReview({
      type: 'email_send',
      what: t('reply.review.title'),
      why: thread.subject,
      sourceType: 'email',
      sourceId: thread.id,
      discriminator: `reply:${thread.id}:${body.length}`,
      payload: {
        kind: 'email_send',
        connectedAccountId: thread.connectedAccountId,
        threadId: thread.id,
        to: thread.participantEmails,
        cc: [],
        subject: subject || thread.subject,
        body,
        inReplyToMessageId: null,
        tone,
      },
    })
  }, [body, proposeAndReview, subject, t, threadQuery.data])

  if (!threadId) {
    return (
      <Screen>
        <ScreenHeader title={t('reply.title')} />
        <Card tone="critical">
          <Text variant="secondary" tone="critical">
            {t('errors.not_found')}
          </Text>
        </Card>
      </Screen>
    )
  }

  return (
    <Screen scroll={false}>
      <ScreenHeader title={t('reply.title')} subtitle={threadQuery.data?.subject} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <View style={{ flex: 1, gap: spacing.md, paddingTop: spacing.sm }}>
          <View style={{ gap: spacing.xs }}>
            <Text variant="caption" tone="secondary">
              {t('reply.intent.label')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {REPLY_TONES.map((entry) => (
                <FilterChip
                  key={entry}
                  label={t(`reply.tones.${entry}`)}
                  selected={tone === entry}
                  onPress={() => regenerate(entry)}
                  testID={`reply-tone-${entry}`}
                />
              ))}
            </View>
          </View>

          <TextField
            label={t('reply.intent.label')}
            labelHidden
            value={instruction}
            onChangeText={setInstruction}
            placeholder={t('reply.intent.placeholder')}
            onSubmitEditing={() => draft.mutate({ tone, instruction })}
            returnKeyType="done"
            testID="reply-instruction"
          />

          <Card style={{ flex: 1, gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Badge label={t('common.aiGenerated')} tone="primary" icon="auto-awesome" />
              {edited ? <Badge label={t('reply.draft.edited')} tone="neutral" /> : null}
              <View style={{ flex: 1 }} />
              <Button
                label={t('reply.draft.regenerate')}
                onPress={() => draft.mutate({ tone, instruction })}
                variant="ghost"
                size="sm"
                loading={draft.isPending}
                testID="reply-regenerate"
              />
            </View>

            <TextField
              label={t('reply.draft.label')}
              labelHidden
              value={body}
              onChangeText={(next) => {
                setBody(next)
                setEdited(true)
              }}
              placeholder={
                draft.isPending ? t('reply.draft.generating') : t('reply.draft.placeholder')
              }
              multiline
              height={220}
              testID="reply-body"
            />

            {!grounded ? (
              <View style={{ flexDirection: 'row', gap: spacing.xxs, alignItems: 'center' }}>
                <MaterialIcons name="info-outline" size={14} color={theme.colors.textTertiary} />
                <Text variant="micro" tone="tertiary" style={{ flex: 1 }}>
                  {t('reply.uncertainNotice')}
                </Text>
              </View>
            ) : null}
          </Card>

          {draft.isError ? (
            <Card tone="critical">
              <Text variant="secondary" tone="critical">
                {t(errorMessageKey(draft.error))}
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

          <View style={{ gap: spacing.xs, paddingBottom: spacing.md }}>
            <Text variant="micro" tone="tertiary" center>
              {t('reply.neverAutoSend')}
            </Text>
            <Button
              label={t('reply.review.send')}
              onPress={sendForApproval}
              size="lg"
              fullWidth
              loading={isProposing}
              disabled={body.trim().length === 0}
              testID="reply-submit"
            />
            <Button
              label={t('reply.review.discard')}
              onPress={() => router.back()}
              variant="ghost"
              size="md"
              fullWidth
              testID="reply-discard"
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}
