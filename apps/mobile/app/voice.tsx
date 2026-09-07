import { spacing } from '@da/design-tokens'
import { MaterialIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useCallback, useEffect } from 'react'
import { Linking, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { Button } from '../src/components/ui/Button'
import { Card } from '../src/components/ui/Card'
import { GradientHeader } from '../src/components/ui/GradientHeader'
import { IconButton } from '../src/components/ui/Controls'
import { Pressable } from '../src/components/ui/Pressable'
import { Screen } from '../src/components/ui/Screen'
import { Text } from '../src/components/ui/Text'
import { MIN_RECORDING_MS, useVoiceCapture } from '../src/hooks/useVoiceCapture'
import { useT } from '../src/i18n/I18nProvider'
import { errorMessageKey } from '../src/lib/query-client'
import { useTheme } from '../src/theme/ThemeProvider'
import { isAppError } from '@da/domain'

/**
 * Ask by voice.
 *
 * Hold to talk, release to send — the same gesture as a voice note, because
 * that is the mental model people already have. The transcript is always shown
 * before the question is asked, so a mis-hearing is caught by the user rather
 * than answered confidently.
 */
export default function VoiceScreen() {
  const t = useT()
  const theme = useTheme()
  const router = useRouter()
  const voice = useVoiceCapture()
  const pulse = useSharedValue(1)

  useEffect(() => {
    if (voice.state === 'recording') {
      pulse.value = withRepeat(withTiming(1.25, { duration: 700 }), -1, true)
    } else {
      pulse.value = withTiming(1, { duration: 200 })
    }
  }, [voice.state, pulse])

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }))

  const finish = useCallback(async () => {
    const text = await voice.stop()
    if (!text) return
    router.replace({ pathname: '/(tabs)/assistant', params: { q: text } })
  }, [router, voice])

  const permissionDenied = isAppError(voice.error) && voice.error.code === 'permission_denied'
  const tooShort = voice.durationMs > 0 && voice.durationMs < MIN_RECORDING_MS

  return (
    <Screen scroll={false} padded={false} edgeToEdge>
      <GradientHeader variant="night" style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            paddingHorizontal: spacing.lg,
            justifyContent: 'space-between',
            paddingBottom: spacing.xxl,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <IconButton
              onPress={() => {
                void voice.cancel()
                router.back()
              }}
              accessibilityLabel={t('a11y.button.close')}
              testID="voice-close"
            >
              <MaterialIcons name="close" size={22} color={theme.colors.onPrimary} />
            </IconButton>
          </View>

          <View style={{ alignItems: 'center', gap: spacing.md }}>
            <Text
              variant="h2"
              style={{ color: theme.colors.onPrimary }}
              center
              accessibilityRole="header"
            >
              {voice.state === 'recording'
                ? t('voice.listening')
                : voice.state === 'transcribing'
                  ? t('voice.transcribing')
                  : t('voice.title')}
            </Text>

            {voice.transcript ? (
              <Card style={{ alignSelf: 'stretch' }}>
                <Text variant="caption" tone="tertiary">
                  {t('voice.transcript.label')}
                </Text>
                <Text variant="body">{voice.transcript}</Text>
              </Card>
            ) : (
              <Text variant="body" style={{ color: theme.colors.onPrimary, opacity: 0.8 }} center>
                {voice.state === 'recording' ? t('voice.releaseToSend') : t('voice.holdToTalk')}
              </Text>
            )}

            {permissionDenied ? (
              <Card tone="warning" style={{ alignSelf: 'stretch', gap: spacing.xs }}>
                <Text variant="secondary" tone="warning">
                  {t('voice.permission.denied')}
                </Text>
                <Button
                  label={t('voice.permission.openSettings')}
                  onPress={() => void Linking.openSettings()}
                  variant="tonal"
                  size="sm"
                  testID="voice-settings"
                />
              </Card>
            ) : voice.error ? (
              <Card tone="critical" style={{ alignSelf: 'stretch' }}>
                <Text variant="secondary" tone="critical">
                  {t(errorMessageKey(voice.error))}
                </Text>
              </Card>
            ) : null}

            {tooShort && voice.state === 'recording' ? (
              <Text variant="micro" style={{ color: theme.colors.onPrimary, opacity: 0.7 }}>
                {t('voice.tooShort')}
              </Text>
            ) : null}
          </View>

          <View style={{ alignItems: 'center', gap: spacing.md }}>
            <Animated.View style={pulseStyle}>
              <Pressable
                // Push to talk: the recording starts on press and stops on
                // release, so there is no `onPress` — the wrapper still fires
                // the haptic on the completed press.
                onPressIn={() => void voice.start()}
                onPressOut={() => void finish()}
                haptic="medium"
                accessibilityLabel={t('voice.tapToSpeak')}
                accessibilityHint={t('voice.listeningHint')}
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 48,
                  backgroundColor: theme.colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                testID="voice-button"
              >
                <MaterialIcons
                  name={voice.state === 'recording' ? 'graphic-eq' : 'mic'}
                  size={40}
                  color={theme.colors.primary}
                />
              </Pressable>
            </Animated.View>

            {voice.transcript ? (
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                <Button
                  label={t('voice.transcript.rerecord')}
                  onPress={voice.reset}
                  variant="ghost"
                  size="sm"
                  testID="voice-rerecord"
                />
                <Button
                  label={t('voice.transcript.confirm')}
                  onPress={() =>
                    router.replace({
                      pathname: '/(tabs)/assistant',
                      params: { q: voice.transcript },
                    })
                  }
                  size="sm"
                  testID="voice-confirm"
                />
              </View>
            ) : null}

            <Text variant="micro" style={{ color: theme.colors.onPrimary, opacity: 0.7 }} center>
              {t('voice.privacy')}
            </Text>
          </View>
        </View>
      </GradientHeader>
    </Screen>
  )
}
