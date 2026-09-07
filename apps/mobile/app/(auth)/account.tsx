import { spacing } from '@da/design-tokens'
import { MaterialIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { View } from 'react-native'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { Pressable } from '../../src/components/ui/Pressable'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { Text } from '../../src/components/ui/Text'
import { useT } from '../../src/i18n/I18nProvider'
import { useSignIn } from '../../src/hooks/useSignIn'
import { env } from '../../src/lib/env'
import { errorMessageKey } from '../../src/lib/query-client'
import { useTheme } from '../../src/theme/ThemeProvider'

/**
 * Sign-in.
 *
 * Signing in proves who you are; it does not read your mail. The mailbox
 * connection is a separate, later consent, and keeping the two apart is what
 * makes the permission screen believable when it arrives.
 */
export default function AccountScreen() {
  const t = useT()
  const theme = useTheme()
  const router = useRouter()
  const { providers, signInWithGoogle, signInWithApple, signInWithDemo, isPending, error } =
    useSignIn()

  return (
    <Screen scroll contentStyle={{ flexGrow: 1, justifyContent: 'space-between' }}>
      <View>
        <ScreenHeader title={t('onboarding.account.title')} />
        <Text variant="body" tone="secondary" style={{ marginTop: spacing.md }}>
          {t('onboarding.account.body')}
        </Text>
      </View>

      <View style={{ gap: spacing.sm, paddingBottom: spacing.lg }}>
        {error ? (
          <Card tone="critical">
            <Text variant="secondary" tone="critical">
              {t(errorMessageKey(error))}
            </Text>
          </Card>
        ) : null}

        {providers.apple ? (
          <Button
            label={t('onboarding.account.continueWithApple')}
            onPress={() => void signInWithApple()}
            variant="primary"
            size="lg"
            fullWidth
            leading={<MaterialIcons name="apple" size={20} color={theme.colors.onPrimary} />}
            loading={isPending}
            testID="sign-in-apple"
          />
        ) : null}

        {providers.google ? (
          <Button
            label={t('onboarding.account.continueWithGoogle')}
            onPress={() => void signInWithGoogle()}
            variant={providers.apple ? 'neutral' : 'primary'}
            size="lg"
            fullWidth
            leading={
              <MaterialIcons
                name="account-circle"
                size={20}
                color={providers.apple ? theme.colors.text : theme.colors.onPrimary}
              />
            }
            loading={isPending}
            testID="sign-in-google"
          />
        ) : null}

        <Button
          label={t('onboarding.account.continueWithEmail')}
          onPress={() => router.push('/(auth)/email')}
          variant="ghost"
          size="lg"
          fullWidth
          testID="sign-in-email"
        />

        {providers.demo ? (
          <Button
            label={t('settings.demo.enter')}
            onPress={() => void signInWithDemo()}
            variant="ghost"
            size="md"
            fullWidth
            loading={isPending}
            testID="sign-in-demo"
          />
        ) : null}

        <Text variant="micro" tone="tertiary" center style={{ marginTop: spacing.xs }}>
          {t('onboarding.account.legal')}
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.md }}>
          <Pressable
            onPress={() => void WebBrowser.openBrowserAsync(`${env.webUrl}/kullanim-sartlari`)}
            haptic="none"
            scaleOnPress={false}
            accessibilityLabel={t('onboarding.account.terms')}
            style={{ minHeight: 0 }}
          >
            <Text variant="micro" tone="primary">
              {t('onboarding.account.terms')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void WebBrowser.openBrowserAsync(`${env.webUrl}/gizlilik`)}
            haptic="none"
            scaleOnPress={false}
            accessibilityLabel={t('onboarding.account.privacy')}
            style={{ minHeight: 0 }}
          >
            <Text variant="micro" tone="primary">
              {t('onboarding.account.privacy')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  )
}
