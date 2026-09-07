import { spacing } from '@da/design-tokens'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, View } from 'react-native'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { Text } from '../../src/components/ui/Text'
import { TextField } from '../../src/components/ui/TextField'
import { useT } from '../../src/i18n/I18nProvider'
import { RESEND_COOLDOWN_SECONDS } from '../../src/hooks/useSignIn'
import { requestEmailCode, verifyEmailCode } from '../../src/lib/auth'
import { errorMessageKey } from '../../src/lib/query-client'
import { useApi } from '../../src/providers/AppProviders'
import { useSessionStore } from '../../src/stores/session'

const CODE_LENGTH = 6

/**
 * Email sign-in, step two.
 *
 * The code is verified as soon as it is complete — asking someone to type six
 * digits and then press a button is one tap too many — but the button stays so
 * the flow is still operable with a keyboard or a screen reader.
 */
export default function VerifyCodeScreen() {
  const t = useT()
  const api = useApi()
  const router = useRouter()
  const params = useLocalSearchParams<{ email?: string }>()
  const email = params.email ?? ''
  const setSession = useSessionStore((s) => s.setSession)

  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS)
  const submitted = useRef<string | null>(null)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((current) => current - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const submit = useCallback(
    async (value: string) => {
      if (!email || value.length !== CODE_LENGTH || pending) return
      // Guard the auto-submit: re-rendering with the same complete code must
      // not spend the one-time token twice.
      if (submitted.current === value) return
      submitted.current = value

      setPending(true)
      setError(null)
      try {
        const session = await verifyEmailCode(email, value)
        await setSession(session, null)
        try {
          const profile = await api.settings.profile()
          if (profile) useSessionStore.getState().setProfile(profile)
        } catch {
          // The session is valid; onboarding fetches the profile again.
        }
      } catch (caught) {
        submitted.current = null
        setError(caught)
        setCode('')
      } finally {
        setPending(false)
      }
    },
    [api, email, pending, setSession],
  )

  const resend = useCallback(async () => {
    if (!email || cooldown > 0) return
    setError(null)
    try {
      await requestEmailCode(email)
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (caught) {
      setError(caught)
    }
  }, [email, cooldown])

  if (!email) {
    return (
      <Screen>
        <ScreenHeader title={t('onboarding.account.codeTitle')} />
        <Card tone="critical" style={{ marginTop: spacing.lg }}>
          <Text variant="secondary" tone="critical">
            {t('errors.validation_failed')}
          </Text>
        </Card>
        <Button
          label={t('common.action.back')}
          onPress={() => router.replace('/(auth)/email')}
          variant="tonal"
          style={{ marginTop: spacing.md }}
        />
      </Screen>
    )
  }

  return (
    <Screen scroll={false}>
      <ScreenHeader title={t('onboarding.account.codeTitle')} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ gap: spacing.md, paddingTop: spacing.lg, flex: 1 }}>
          <Text variant="secondary" tone="secondary">
            {t('onboarding.account.codeBody', { email })}
          </Text>

          <TextField
            label={t('onboarding.account.codeTitle')}
            value={code}
            onChangeText={(next) => {
              const digits = next.replace(/\D/g, '').slice(0, CODE_LENGTH)
              setCode(digits)
              if (digits.length === CODE_LENGTH) void submit(digits)
            }}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            autoFocus
            maxLength={CODE_LENGTH}
            testID="code-input"
          />

          {error ? (
            <Card tone="critical">
              <Text variant="secondary" tone="critical">
                {t(errorMessageKey(error))}
              </Text>
            </Card>
          ) : null}

          <Button
            label={t('common.action.confirm')}
            onPress={() => void submit(code)}
            size="lg"
            fullWidth
            loading={pending}
            disabled={code.length !== CODE_LENGTH}
            testID="code-submit"
          />

          {cooldown > 0 ? (
            <Text variant="micro" tone="tertiary" center>
              {t('onboarding.account.codeResendIn', { seconds: cooldown })}
            </Text>
          ) : (
            <Button
              label={t('onboarding.account.codeResend')}
              onPress={() => void resend()}
              variant="ghost"
              size="sm"
              testID="code-resend"
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}
