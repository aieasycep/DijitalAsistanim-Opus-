import { qk } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import { systemClock } from '@da/domain'
import type { AccountKind, ConnectedAccount, ConnectionStatus } from '@da/domain'
import { elapsedKey } from '@da/i18n'
import { MaterialIcons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { View } from 'react-native'
import { Badge, type BadgeTone } from '../../src/components/ui/Badge'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { Sheet } from '../../src/components/ui/Sheet'
import { EmptyState, SkeletonCard } from '../../src/components/ui/States'
import { Text } from '../../src/components/ui/Text'
import { useAccounts } from '../../src/hooks/queries'
import { useConnectAccount } from '../../src/hooks/useConnectAccount'
import { useEntitlements } from '../../src/hooks/useEntitlements'
import { useI18n, useT } from '../../src/i18n/I18nProvider'
import { errorMessageKey, errorValues } from '../../src/lib/query-client'
import { useApi } from '../../src/providers/AppProviders'
import { useTheme } from '../../src/theme/ThemeProvider'

const STATUS_TONE: Record<ConnectionStatus, BadgeTone> = {
  connected: 'success',
  expired: 'warning',
  revoked: 'critical',
  error: 'critical',
  disconnected: 'neutral',
}

const KINDS: AccountKind[] = ['mail', 'calendar']

/**
 * Connected accounts.
 *
 * Disconnecting revokes the token at the provider as well as deleting it here —
 * leaving a live refresh token behind after a user says "disconnect" would be
 * the single worst thing this screen could do.
 */
export default function AccountsSettingsScreen() {
  const t = useT()
  const { plural } = useI18n()
  const theme = useTheme()
  const api = useApi()
  const queryClient = useQueryClient()
  const query = useAccounts()
  const { connect, isConnecting, error: connectError } = useConnectAccount()
  const { entitlements } = useEntitlements()

  const [pendingDisconnect, setPendingDisconnect] = useState<ConnectedAccount | null>(null)

  const syncStatus = useQuery({
    queryKey: qk.syncStatus(),
    queryFn: () => api.sync.status(),
    staleTime: 30_000,
  })

  const disconnect = useMutation({
    mutationFn: (accountId: string) =>
      api.accounts.disconnect({ connectedAccountId: accountId, revoke: true }),
    onSuccess: async () => {
      setPendingDisconnect(null)
      await queryClient.invalidateQueries({ queryKey: qk.accounts() })
    },
  })

  const syncNow = useMutation({
    mutationFn: (accountId: string) =>
      api.sync.start({ connectedAccountId: accountId, resources: KINDS }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.syncStatus() })
    },
  })

  const accounts = query.data ?? []
  // Counted the same way `oauth-complete` counts it, so the greyed-out button
  // and the server's answer cannot disagree.
  const mailCount = accounts.filter(
    (account) => account.status === 'connected' && account.kinds.includes('mail'),
  ).length
  const atLimit = mailCount >= entitlements.limits.mailAccounts

  /** How an account is named on screen: the address, else the display name. */
  const accountLabel = useCallback(
    (account: ConnectedAccount): string =>
      account.email ?? account.displayName ?? t(`common.provider.${account.provider}`),
    [t],
  )

  const lastSyncFor = useCallback(
    (accountId: string): string | null => {
      const states = (syncStatus.data ?? []).filter(
        (state) => state.connectedAccountId === accountId && state.lastRunAt !== null,
      )
      const latest = states
        .map((state) => state.lastRunAt as string)
        .sort()
        .at(-1)
      if (!latest) return null
      const elapsed = elapsedKey(new Date(latest), systemClock.now())
      return plural(elapsed.key, elapsed.count)
    },
    [syncStatus.data, plural],
  )

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader
        title={t('settings.integrations.title')}
        subtitle={t('settings.integrations.subtitle')}
      />

      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        {query.isLoading && accounts.length === 0 ? (
          <SkeletonCard />
        ) : accounts.length === 0 ? (
          <EmptyState
            icon="link-off"
            title={t('onboarding.connect.title')}
            description={t('onboarding.connect.body')}
          />
        ) : (
          accounts.map((account) => {
            const lastSync = lastSyncFor(account.id)
            return (
              <Card key={account.id} style={{ gap: spacing.xs }} testID={`account-${account.id}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <MaterialIcons
                    name={account.provider === 'google' ? 'mail' : 'business'}
                    size={22}
                    color={theme.colors.textSecondary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {accountLabel(account)}
                    </Text>
                    <Text variant="micro" tone="tertiary">
                      {account.kinds
                        .map((kind) => t(`settings.integrations.accountKind.${kind}`))
                        .join(' · ')}
                    </Text>
                  </View>
                  <Badge
                    label={t(`settings.integrations.${account.status}`)}
                    tone={STATUS_TONE[account.status]}
                  />
                </View>

                {lastSync ? (
                  <Text variant="micro" tone="tertiary">
                    {t('settings.integrations.lastSync', { time: lastSync })}
                  </Text>
                ) : null}

                <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
                  {account.status === 'connected' ? (
                    <Button
                      label={t('settings.integrations.syncNow')}
                      onPress={() => syncNow.mutate(account.id)}
                      variant="tonal"
                      size="sm"
                      loading={syncNow.isPending}
                      testID={`account-sync-${account.id}`}
                    />
                  ) : (
                    <Button
                      label={t('settings.integrations.reconnect')}
                      onPress={() =>
                        void connect({
                          provider: account.provider,
                          kinds: account.kinds,
                        }).catch(() => undefined)
                      }
                      size="sm"
                      loading={isConnecting}
                      testID={`account-reconnect-${account.id}`}
                    />
                  )}
                  <Button
                    label={t('settings.integrations.disconnect')}
                    onPress={() => setPendingDisconnect(account)}
                    variant="ghost"
                    size="sm"
                    testID={`account-disconnect-${account.id}`}
                  />
                </View>
              </Card>
            )
          })
        )}

        {connectError ? (
          <Card tone="critical">
            <Text variant="secondary" tone="critical" testID="accounts-connect-error">
              {t(errorMessageKey(connectError), errorValues(connectError))}
            </Text>
          </Card>
        ) : null}

        {/* `sync-start` fails when every account it covered failed, so this is
            the difference between "eşitlendi" and a silent no-op. */}
        {syncNow.isError ? (
          <Card tone="critical">
            <Text variant="secondary" tone="critical" testID="accounts-sync-error">
              {t(errorMessageKey(syncNow.error), errorValues(syncNow.error))}
            </Text>
          </Card>
        ) : null}

        <Button
          label={t('settings.integrations.addAccount')}
          onPress={() => void connect({ provider: 'google', kinds: KINDS }).catch(() => undefined)}
          variant="tonal"
          fullWidth
          loading={isConnecting}
          disabled={atLimit}
          testID="accounts-add"
        />
        {atLimit ? (
          <Text variant="micro" tone="tertiary">
            {t('paywall.limit.body')}
          </Text>
        ) : null}
      </View>

      <Sheet
        visible={pendingDisconnect !== null}
        onClose={() => setPendingDisconnect(null)}
        title={t('settings.integrations.disconnectConfirmTitle')}
        closeLabel={t('common.action.close')}
        scrollable={false}
        footer={
          <Button
            label={t('settings.integrations.disconnect')}
            onPress={() =>
              pendingDisconnect ? disconnect.mutate(pendingDisconnect.id) : undefined
            }
            variant="destructive"
            fullWidth
            loading={disconnect.isPending}
            testID="account-disconnect-confirm"
          />
        }
        testID="account-disconnect-sheet"
      >
        <Text variant="body" tone="secondary">
          {/* The sentence names the mailbox it is about; without the value it
              rendered the placeholder itself. */}
          {t('settings.integrations.disconnectConfirmBody', {
            email: pendingDisconnect ? accountLabel(pendingDisconnect) : '',
          })}
        </Text>
        <Text variant="secondary" tone="tertiary">
          {t('settings.integrations.disconnectDeleteData')}
        </Text>
        {disconnect.isError ? (
          <Text variant="secondary" tone="critical" testID="account-disconnect-error">
            {t(errorMessageKey(disconnect.error), errorValues(disconnect.error))}
          </Text>
        ) : null}
      </Sheet>
    </Screen>
  )
}
