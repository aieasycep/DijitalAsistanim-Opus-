import { spacing } from '@da/design-tokens'
import { useMutation } from '@tanstack/react-query'
import * as Application from 'expo-application'
import * as Device from 'expo-device'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Linking, Platform, View } from 'react-native'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { SegmentedControl, Toggle } from '../../src/components/ui/Controls'
import { ListRow } from '../../src/components/ui/Layout'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { Text } from '../../src/components/ui/Text'
import { TextField } from '../../src/components/ui/TextField'
import { useT } from '../../src/i18n/I18nProvider'
import { env } from '../../src/lib/env'

type FeedbackType = 'bug' | 'idea' | 'accuracy' | 'other'

const SUPPORT_ADDRESS = 'destek@dijitalasistan.app'

/**
 * Feedback.
 *
 * Sent as a mail the user can see and edit before it leaves, rather than
 * through a silent endpoint: they can read exactly what is attached, which is
 * the only honest way to offer "include diagnostics".
 */
export default function FeedbackScreen() {
  const t = useT()
  const router = useRouter()

  const [type, setType] = useState<FeedbackType>('idea')
  const [message, setMessage] = useState('')
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true)

  const diagnostics = [
    `app: ${Application.nativeApplicationVersion ?? '1.0.0'} (${Application.nativeBuildVersion ?? '1'})`,
    `platform: ${Platform.OS} ${Device.osVersion ?? ''}`.trim(),
    `device: ${Device.modelName ?? 'unknown'}`,
  ].join('\n')

  const send = useMutation({
    mutationFn: async () => {
      const subject = `[${t(`settings.feedback.type${type[0]?.toUpperCase()}${type.slice(1)}`)}] ${t('common.appName')}`
      const body = includeDiagnostics ? `${message.trim()}\n\n---\n${diagnostics}` : message.trim()
      const url = `mailto:${SUPPORT_ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      const supported = await Linking.canOpenURL(url)
      if (!supported) throw new Error('no mail client')
      await Linking.openURL(url)
    },
    onSuccess: () => router.back(),
  })

  return (
    <Screen scroll={false}>
      <ScreenHeader
        title={t('settings.feedback.title')}
        subtitle={t('settings.feedback.subtitle')}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ flex: 1, gap: spacing.md, paddingTop: spacing.sm }}>
          <View style={{ gap: spacing.xs }}>
            <Text variant="caption" tone="secondary">
              {t('settings.feedback.typeLabel')}
            </Text>
            <SegmentedControl<FeedbackType>
              options={[
                { value: 'bug', label: t('settings.feedback.typeBug') },
                { value: 'idea', label: t('settings.feedback.typeIdea') },
                { value: 'accuracy', label: t('settings.feedback.typeAccuracy') },
                { value: 'other', label: t('settings.feedback.typeOther') },
              ]}
              value={type}
              onChange={setType}
              testID="feedback-type"
            />
          </View>

          <TextField
            label={t('settings.feedback.messageLabel')}
            value={message}
            onChangeText={setMessage}
            placeholder={t('settings.feedback.messagePlaceholder')}
            multiline
            height={180}
            autoFocus
            testID="feedback-message"
          />

          <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
            <ListRow
              title={t('settings.feedback.includeDiagnostics')}
              subtitle={t('settings.feedback.includeDiagnosticsHint')}
              accessory={
                <Toggle
                  value={includeDiagnostics}
                  onValueChange={setIncludeDiagnostics}
                  accessibilityLabel={t('settings.feedback.includeDiagnostics')}
                  testID="feedback-diagnostics"
                />
              }
            />
          </Card>

          {includeDiagnostics ? (
            <Text variant="micro" tone="tertiary">
              {diagnostics}
            </Text>
          ) : null}

          {send.isError ? (
            <Card tone="critical">
              <Text variant="secondary" tone="critical">
                {t('settings.feedback.failed')}
              </Text>
            </Card>
          ) : null}

          <View style={{ flex: 1 }} />

          <Button
            label={t('settings.feedback.send')}
            onPress={() => send.mutate()}
            size="lg"
            fullWidth
            loading={send.isPending}
            disabled={message.trim().length < 5}
            testID="feedback-send"
          />
          <Button
            label={t('settings.feedback.rateApp')}
            onPress={() =>
              void Linking.openURL(
                Platform.OS === 'ios'
                  ? `https://apps.apple.com/app/id0000000000?action=write-review`
                  : `market://details?id=${env.bundleId}`,
              )
            }
            variant="ghost"
            size="md"
            fullWidth
            style={{ marginBottom: spacing.md }}
            testID="feedback-rate"
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}
