import { spacing } from '@da/design-tokens'
import * as Application from 'expo-application'
import * as Clipboard from 'expo-clipboard'
import * as Device from 'expo-device'
import * as WebBrowser from 'expo-web-browser'
import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { Platform, View } from 'react-native'
import { Card } from '../../src/components/ui/Card'
import { Divider, ListRow } from '../../src/components/ui/Layout'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { Text } from '../../src/components/ui/Text'
import { useT } from '../../src/i18n/I18nProvider'
import { env, integrations } from '../../src/lib/env'

/**
 * Help and about.
 *
 * The diagnostics block is deliberately dull: platform, version, build. No
 * identifiers, no email address, nothing that would turn a support paste into
 * a privacy incident.
 */
export default function HelpSettingsScreen() {
  const t = useT()
  const router = useRouter()
  const [copied, setCopied] = useState(false)

  const version = Application.nativeApplicationVersion ?? '1.0.0'
  const build = Application.nativeBuildVersion ?? '1'

  const diagnostics = [
    `app: ${version} (${build})`,
    `platform: ${Platform.OS} ${Device.osVersion ?? ''}`.trim(),
    `device: ${Device.modelName ?? 'unknown'}`,
    `mode: ${env.demoMode ? 'demo' : 'live'}`,
    `analytics: ${integrations.analytics ? 'on' : 'off'}`,
  ].join('\n')

  const copyDiagnostics = useCallback(async () => {
    await Clipboard.setStringAsync(diagnostics)
    setCopied(true)
  }, [diagnostics])

  const open = useCallback((path: string) => {
    void WebBrowser.openBrowserAsync(`${env.webUrl}${path}`)
  }, [])

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader title={t('settings.help.title')} />

      <View style={{ gap: spacing.md, marginTop: spacing.md }}>
        <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
          <ListRow
            title={t('settings.help.howItWorks')}
            icon="help-outline"
            onPress={() => open('/#nasil-calisir')}
            testID="help-how"
          />
          <Divider />
          <ListRow
            title={t('settings.help.faq')}
            icon="quiz"
            onPress={() => open('/#sss')}
            testID="help-faq"
          />
          <Divider />
          <ListRow
            title={t('settings.help.gettingStarted')}
            icon="rocket-launch"
            onPress={() => open('/support')}
            testID="help-start"
          />
          <Divider />
          <ListRow
            title={t('settings.help.contact')}
            subtitle={t('settings.help.contactHint')}
            icon="mail-outline"
            onPress={() => router.push('/settings/feedback')}
            testID="help-contact"
          />
        </Card>

        <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
          <ListRow
            title={t('settings.help.privacyPolicy')}
            icon="policy"
            onPress={() => open('/privacy')}
            testID="help-privacy"
          />
          <Divider />
          <ListRow
            title={t('settings.help.terms')}
            icon="gavel"
            onPress={() => open('/terms')}
            testID="help-terms"
          />
          <Divider />
          <ListRow
            title={t('settings.help.licenses')}
            icon="description"
            onPress={() => open('/licenses')}
            testID="help-licenses"
          />
          <Divider />
          <ListRow
            title={t('settings.help.status')}
            icon="monitor-heart"
            onPress={() => open('/support')}
            testID="help-status"
          />
        </Card>

        <Card style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary">
            {t('settings.help.diagnostics')}
          </Text>
          <Text variant="micro" tone="secondary">
            {diagnostics}
          </Text>
          <ListRow
            title={copied ? t('settings.help.diagnosticsCopied') : t('common.action.copy')}
            icon="content-copy"
            onPress={() => void copyDiagnostics()}
            testID="help-copy-diagnostics"
          />
        </Card>

        <Text variant="micro" tone="tertiary" center>
          {t('settings.help.version', { version })} · {t('settings.help.build', { build })}
        </Text>
      </View>
    </Screen>
  )
}
