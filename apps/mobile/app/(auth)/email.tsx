import { spacing } from '@da/design-tokens'
import { emailSchema } from '@da/validation'
import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { KeyboardAvoidingView, Platform, View } from 'react-native'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { Text } from '../../src/components/ui/Text'
import { TextField } from '../../src/components/ui/TextField'
import { useT } from '../../src/i18n/I18nProvider'
import { requestEmailCode } from '../../src/lib/auth'
import { errorMessageKey } from '../../src/lib/query-client'

/**
 * Email sign-in, step one.
 *
 * A six-digit code rather than a password: there is no password to leak, and
 * the same flow works for sign-up and sign-in without asking the user which
 * one they are doing.
 */
export default function EmailSignInScreen() {
  const t = useT()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const submit = useCallback(async () => {
    const trimmed = email.trim().toLowerCase()
    if (!emailSchema.safeParse(trimmed).success) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setPending(true)
    setError(null)
    try {
      await requestEmailCode(trimmed)
      router.push({ pathname: '/(auth)/verify', params: { email: trimmed } })
    } catch (caught) {
      setError(caught)
    } finally {
      setPending(false)
    }
  }, [email, router])

  return (
    <Screen scroll={false}>
      <ScreenHeader title={t('onboarding.account.continueWithEmail')} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ gap: spacing.md, paddingTop: spacing.lg, flex: 1 }}>
          <Text variant="secondary" tone="secondary">
            {t('onboarding.account.body')}
          </Text>

          <TextField
            label={t('onboarding.account.emailLabel')}
            value={email}
            onChangeText={(next) => {
              setEmail(next)
              if (invalid) setInvalid(false)
            }}
            placeholder={t('onboarding.account.emailPlaceholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            autoFocus
            returnKeyType="send"
            onSubmitEditing={() => void submit()}
            error={invalid ? t('errors.validation_failed') : undefined}
            testID="email-input"
          />

          {error ? (
            <Card tone="critical">
              <Text variant="secondary" tone="critical">
                {t(errorMessageKey(error))}
              </Text>
            </Card>
          ) : null}

          <Button
            label={t('common.action.next')}
            onPress={() => void submit()}
            size="lg"
            fullWidth
            loading={pending}
            disabled={email.trim().length === 0}
            testID="email-submit"
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}
