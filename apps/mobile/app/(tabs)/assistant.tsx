import { radius, spacing } from '@da/design-tokens'
import type { SourceRef } from '@da/domain'
import { MaterialIcons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
  type ScrollView as ScrollViewType,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { IconButton } from '../../src/components/ui/Controls'
import { EmptyState } from '../../src/components/ui/States'
import { Pressable } from '../../src/components/ui/Pressable'
import { Screen } from '../../src/components/ui/Screen'
import { SourceChip } from '../../src/components/ui/SourceChip'
import { Text } from '../../src/components/ui/Text'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'
import { useAssistant } from '../../src/hooks/useAssistant'
import { errorMessageKey } from '../../src/lib/query-client'

/** The starting questions. Concrete, and each answerable from the user's data. */
const SUGGESTIONS = [
  'assistant.suggested.focus',
  'assistant.suggested.replies',
  'assistant.suggested.tomorrow',
  'assistant.suggested.person',
] as const

/**
 * Asistan — the fourth tab, deliberately not the first.
 *
 * It answers from the user's own data and cites what it used. When a question
 * asks for a write, the turn produces an approval card instead of acting, and
 * the answer says so.
 */
export default function AssistantScreen() {
  const t = useT()
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ q?: string }>()
  const scrollRef = useRef<ScrollViewType>(null)
  const [input, setInput] = useState('')

  const { messages, ask, isAsking, error, reset } = useAssistant()

  // A deep link can arrive with a question already chosen (a push, a widget).
  useEffect(() => {
    if (params.q && messages.length === 0) {
      setInput(params.q)
    }
  }, [params.q, messages.length])

  const submit = useCallback(
    async (question: string) => {
      const trimmed = question.trim()
      if (!trimmed || isAsking) return
      setInput('')
      await ask(trimmed)
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }))
    },
    [ask, isAsking],
  )

  const openCitation = useCallback(
    (source: SourceRef) => () => {
      if (source.type === 'email') router.push(`/thread/${source.id}`)
      else if (source.type === 'calendar_event') router.push(`/event/${source.id}`)
      else if (source.type === 'contact') router.push(`/person/${source.id}`)
      else if (source.type === 'commitment') router.push(`/commitment/${source.id}`)
      else if (source.type === 'capture') router.push(`/capture?id=${source.id}`)
    },
    [router],
  )

  return (
    <Screen scroll={false} padded={false}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.bottom + 56}
      >
        <View
          style={{
            paddingTop: insets.top + spacing.xs,
            paddingHorizontal: spacing.lg,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text variant="h1" accessibilityRole="header">
            {t('common.tab.assistant')}
          </Text>
          <View style={{ flexDirection: 'row' }}>
            <IconButton onPress={() => router.push('/voice')} accessibilityLabel={t('a11y.button.voice')}>
              <MaterialIcons name="mic" size={22} color={theme.colors.textSecondary} />
            </IconButton>
            {messages.length > 0 ? (
              <IconButton onPress={reset} accessibilityLabel={t('assistant.newThread')}>
                <MaterialIcons name="add-comment" size={20} color={theme.colors.textSecondary} />
              </IconButton>
            ) : null}
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: spacing.lg,
            gap: spacing.sm,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {messages.length === 0 ? (
            <View style={{ gap: spacing.md }}>
              <EmptyState
                icon="auto-awesome"
                title={t('assistant.suggested.title')}
                description={t('assistant.privacyNote')}
              />
              <View style={{ gap: spacing.xs }}>
                {SUGGESTIONS.map((key) => (
                  <Pressable
                    key={key}
                    onPress={() => void submit(t(key))}
                    accessibilityLabel={t(key)}
                    haptic="light"
                    style={{
                      backgroundColor: theme.colors.surface,
                      borderRadius: radius.cardSm,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.xs,
                    }}
                    pressedStyle={{ backgroundColor: theme.colors.surface2 }}
                    testID={`assistant-suggestion-${key}`}
                  >
                    <MaterialIcons
                      name="north-east"
                      size={15}
                      color={theme.colors.textTertiary}
                    />
                    <Text variant="body" style={{ flex: 1 }}>
                      {t(key)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {messages.map((message) => (
            <View
              key={message.id}
              style={{
                alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '92%',
                gap: spacing.xs,
              }}
            >
              {message.role === 'user' ? (
                <View
                  style={{
                    backgroundColor: theme.colors.primary,
                    borderRadius: radius.card,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                  }}
                >
                  <Text variant="body" style={{ color: theme.colors.onPrimary }}>
                    {message.content}
                  </Text>
                </View>
              ) : (
                <Card style={{ gap: spacing.xs }}>
                  <Text variant="body">{message.content}</Text>

                  {message.citations.length > 0 ? (
                    <View style={{ gap: 6, marginTop: spacing.xxs }}>
                      {message.citations.map((citation) => (
                        <SourceChip
                          key={`${citation.type}:${citation.id}`}
                          source={citation}
                          onPress={openCitation(citation)}
                        />
                      ))}
                    </View>
                  ) : null}

                  {!message.grounded ? (
                    <Text variant="micro" tone="tertiary">
                      {t('assistant.answer.uncertain')}
                    </Text>
                  ) : null}

                  {message.proposedApprovalId ? (
                    <Button
                      label={t('approval.decide.edit')}
                      onPress={() => router.push(`/approval/${message.proposedApprovalId}`)}
                      variant="tonal"
                      size="sm"
                    />
                  ) : null}
                </Card>
              )}
            </View>
          ))}

          {isAsking ? (
            <Card style={{ alignSelf: 'flex-start' }}>
              <Text variant="secondary" tone="secondary">
                {t('assistant.thinking')}
              </Text>
            </Card>
          ) : null}

          {error ? (
            <Card tone="critical">
              <Text variant="secondary" tone="critical">
                {t(errorMessageKey(error))}
              </Text>
            </Card>
          ) : null}
        </ScrollView>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: spacing.xs,
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.sm,
          }}
        >
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t('assistant.inputPlaceholder')}
            placeholderTextColor={theme.colors.textTertiary}
            multiline
            accessibilityLabel={t('assistant.inputPlaceholder')}
            style={{
              flex: 1,
              minHeight: 44,
              maxHeight: 120,
              backgroundColor: theme.colors.surface,
              borderRadius: radius.button,
              paddingHorizontal: spacing.sm,
              paddingTop: spacing.xs,
              paddingBottom: spacing.xs,
              color: theme.colors.text,
              fontSize: 15,
            }}
            onSubmitEditing={() => void submit(input)}
            testID="assistant-input"
          />
          <IconButton
            onPress={() => void submit(input)}
            accessibilityLabel={t('assistant.send')}
            tone="primary"
            testID="assistant-send"
          >
            <MaterialIcons
              name="arrow-upward"
              size={20}
              color={input.trim() ? theme.colors.primaryOnSoft : theme.colors.textDisabled}
            />
          </IconButton>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}
