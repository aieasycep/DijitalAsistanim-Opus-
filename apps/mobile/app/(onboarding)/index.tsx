import { spacing } from '@da/design-tokens'
import type { AccountKind, Provider } from '@da/domain'
import { MaterialIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useCallback } from 'react'
import { View } from 'react-native'
import { StepFrame } from '../../src/components/onboarding/StepFrame'
import { Badge } from '../../src/components/ui/Badge'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { Text } from '../../src/components/ui/Text'
import { useT } from '../../src/i18n/I18nProvider'
import { useAccounts } from '../../src/hooks/queries'
import { useConnectAccount } from '../../src/hooks/useConnectAccount'
import { errorMessageKey } from '../../src/lib/query-client'
import { useTheme } from '../../src/theme/ThemeProvider'

const KINDS: AccountKind[] = ['mail', 'calendar']

/** Why each permission is needed, in the user's terms rather than the API's. */
const WHY_LINES = [
  'onboarding.connect.whyMail',
  'onboarding.connect.whyCalendar',
  'onboarding.connect.whyContacts',
] as const

const PROVIDERS: ReadonlyArray<{
  provider: Extract<Provider, 'google' | 'microsoft'>
  labelKey: string
  icon: 'mail' | 'business'
}> = [
  { provider: 'google', labelKey: 'onboarding.connect.google', icon: 'mail' },
  { provider: 'microsoft', labelKey: 'onboarding.connect.microsoft', icon: 'business' },
]

/**
 * Step one: connect a mailbox.
 *
 * The permission list is shown before the consent screen rather than after, and
 * the send scope is deliberately not requested here — nothing can be sent until
 * the user approves a specific draft, and saying so up front is the point.
 */
export default function ConnectStep() {
  const t = useT()
  const theme = useTheme()
  const router = useRouter()
  const accountsQuery = useAccounts()
  const { connect, isConnecting, error } = useConnectAccount()

  const accounts = accountsQuery.data ?? []
  const connected = accounts.filter((account) => account.status === 'connected')

  const onConnect = useCallback(
    (provider: Extract<Provider, 'google' | 'microsoft'>) => {
      // The hook surfaces the failure in `error`; a rejection here is expected.
      void connect({ provider, kinds: KINDS }).catch(() => undefined)
    },
    [connect],
  )

  return (
    <StepFrame
      step="connect"
      title={t('onboarding.connect.title')}
      description={t('onboarding.connect.body')}
      primaryLabel={t('onboarding.connect.primary')}
      onPrimary={() => router.push('/(onboarding)/permissions')}
      primaryDisabled={connected.length === 0}
      {...(connected.length === 0
        ? {
            secondaryLabel: t('onboarding.connect.skip'),
            onSecondary: () => router.push('/(onboarding)/permissions'),
          }
        : {})}
      testID="onboarding-connect"
    >
      <View style={{ gap: spacing.sm }}>
        {connected.map((account) => (
          <Card
            key={account.id}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
          >
            <MaterialIcons name="check-circle" size={22} color={theme.colors.success} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {account.email ?? account.displayName ?? t(`common.provider.${account.provider}`)}
              </Text>
              <Text variant="micro" tone="tertiary">
                {account.kinds
                  .map((kind) => t(`settings.integrations.accountKind.${kind}`))
                  .join(' · ')}
              </Text>
            </View>
            <Badge label={t('common.state.active')} tone="success" />
          </Card>
        ))}

        {PROVIDERS.filter(
          (entry) => !connected.some((account) => account.provider === entry.provider),
        ).map((entry) => (
          <Button
            key={entry.provider}
            label={connected.length > 0 ? t('onboarding.connect.addAnother') : t(entry.labelKey)}
            onPress={() => onConnect(entry.provider)}
            variant="neutral"
            size="lg"
            fullWidth
            loading={isConnecting}
            leading={<MaterialIcons name={entry.icon} size={20} color={theme.colors.text} />}
            testID={`connect-${entry.provider}`}
          />
        ))}
      </View>

      {error ? (
        <Card tone="critical">
          <Text variant="secondary" tone="critical">
            {t(errorMessageKey(error))}
          </Text>
        </Card>
      ) : null}

      {connected.length === 0 ? (
        <Text variant="micro" tone="tertiary">
          {t('onboarding.connect.skipWarning')}
        </Text>
      ) : null}

      <Card style={{ gap: spacing.xs }}>
        <Text variant="caption" tone="tertiary">
          {t('onboarding.connect.whyTitle')}
        </Text>
        {WHY_LINES.map((key) => (
          <View key={key} style={{ flexDirection: 'row', gap: spacing.xs }}>
            <MaterialIcons
              name="lock-outline"
              size={16}
              color={theme.colors.textTertiary}
              style={{ marginTop: 2 }}
            />
            <Text variant="secondary" tone="secondary" style={{ flex: 1 }}>
              {t(key)}
            </Text>
          </View>
        ))}
        <Text variant="secondary" tone="primary">
          {t('onboarding.connect.noWriteWithoutApproval')}
        </Text>
      </Card>
    </StepFrame>
  )
}
