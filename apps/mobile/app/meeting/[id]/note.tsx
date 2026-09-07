import { spacing } from '@da/design-tokens'
import type { Commitment } from '@da/domain'
import { useMutation } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { KeyboardAvoidingView, Platform, View } from 'react-native'
import { Button } from '../../../src/components/ui/Button'
import { Card } from '../../../src/components/ui/Card'
import { Screen } from '../../../src/components/ui/Screen'
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader'
import { Text } from '../../../src/components/ui/Text'
import { TextField } from '../../../src/components/ui/TextField'
import { useEvent, useInvalidateAfterWrite } from '../../../src/hooks/queries'
import { useT } from '../../../src/i18n/I18nProvider'
import { errorMessageKey } from '../../../src/lib/query-client'
import { useApi } from '../../../src/providers/AppProviders'

/**
 * The post-meeting note.
 *
 * The note is the user's own words; the assistant only extracts commitments
 * from it, and each extracted item is quoted back before it becomes a tracked
 * promise. Anything that would leave the app — a summary mail, a calendar
 * follow-up — is created as an approval, never sent from here.
 */
export default function MeetingNoteScreen() {
  const t = useT()
  const router = useRouter()
  const api = useApi()
  const invalidate = useInvalidateAfterWrite()
  const params = useLocalSearchParams<{ id?: string }>()
  const eventId = params.id ?? null
  const eventQuery = useEvent(eventId)

  const [note, setNote] = useState('')
  const [extracted, setExtracted] = useState<Commitment[] | null>(null)

  const save = useMutation({
    mutationFn: () =>
      api.meetings.postMeetingNote({ eventId: eventId as string, note: note.trim() }),
    onSuccess: async (result) => {
      setExtracted(result.commitments)
      await invalidate()
    },
  })

  const done = useCallback(() => {
    if (router.canGoBack()) router.back()
    else router.replace('/(tabs)/plan')
  }, [router])

  if (!eventId) {
    return (
      <Screen>
        <ScreenHeader title={t('meeting.post.title')} />
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
      <ScreenHeader title={t('meeting.post.title')} subtitle={eventQuery.data?.title} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <View style={{ flex: 1, gap: spacing.md, paddingTop: spacing.sm }}>
          <Text variant="secondary" tone="secondary">
            {t('meeting.post.howDidItGo')}
          </Text>

          <TextField
            label={t('meeting.post.notesLabel')}
            value={note}
            onChangeText={setNote}
            placeholder={t('meeting.post.notesPlaceholder')}
            multiline
            height={200}
            autoFocus
            testID="meeting-note"
          />

          {extracted ? (
            <View style={{ gap: spacing.xs }}>
              <Text variant="caption" tone="tertiary">
                {t('meeting.post.extracted')}
              </Text>
              {extracted.length === 0 ? (
                <Text variant="secondary" tone="tertiary">
                  {t('meeting.post.noActions')}
                </Text>
              ) : (
                extracted.map((commitment) => (
                  <Card
                    key={commitment.id}
                    onPress={() => router.push(`/commitment/${commitment.id}`)}
                    accessibilityLabel={commitment.text}
                    style={{ gap: spacing.xxs }}
                  >
                    <Text variant="body">{commitment.text}</Text>
                    <Text variant="micro" tone="tertiary">
                      {t(`commitment.directionShort.${commitment.direction}`)} ·{' '}
                      {t('commitment.card.quote', { quote: commitment.quote })}
                    </Text>
                  </Card>
                ))
              )}
            </View>
          ) : null}

          {save.isError ? (
            <Card tone="critical">
              <Text variant="secondary" tone="critical">
                {t(errorMessageKey(save.error))}
              </Text>
            </Card>
          ) : null}

          <View style={{ gap: spacing.xs, paddingBottom: spacing.md }}>
            {extracted ? (
              <Button
                label={t('common.action.done')}
                onPress={done}
                size="lg"
                fullWidth
                testID="meeting-note-done"
              />
            ) : (
              <Button
                label={t('meeting.post.extractActions')}
                onPress={() => save.mutate()}
                size="lg"
                fullWidth
                loading={save.isPending}
                disabled={note.trim().length < 10}
                testID="meeting-note-save"
              />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}
