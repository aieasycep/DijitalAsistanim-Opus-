import { qk } from '@da/api-client'
import type { HistoryScope } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import { formatFullDate } from '@da/i18n'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as WebBrowser from 'expo-web-browser'
import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { View } from 'react-native'
import { Badge } from '../../src/components/ui/Badge'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { FilterChip } from '../../src/components/ui/Controls'
import { Divider, ListRow } from '../../src/components/ui/Layout'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { Sheet } from '../../src/components/ui/Sheet'
import { Text } from '../../src/components/ui/Text'
import { TextField } from '../../src/components/ui/TextField'
import { useUserContext } from '../../src/hooks/useUserContext'
import { useI18n, useT } from '../../src/i18n/I18nProvider'
import { track } from '../../src/lib/analytics'
import { env } from '../../src/lib/env'
import { clearSnapshot } from '../../src/lib/native/widget'
import { cancelAllLocalNotifications } from '../../src/lib/notifications'
import { errorMessageKey } from '../../src/lib/query-client'
import { useApi } from '../../src/providers/AppProviders'
import { useSessionStore } from '../../src/stores/session'

const SCOPES: ReadonlyArray<{ value: HistoryScope; labelKey: string }> = [
  { value: 'emails', labelKey: 'search.scope.email' },
  { value: 'briefings', labelKey: 'briefing.title' },
  { value: 'assistant', labelKey: 'assistant.title' },
  { value: 'captures', labelKey: 'capture.title' },
  { value: 'memory', labelKey: 'assistant.memory.title' },
  { value: 'all', labelKey: 'search.scope.all' },
]

/**
 * The privacy centre.
 *
 * Export, delete history, delete account — the three things a data-protection
 * regime actually requires, each wired to a real endpoint. Account deletion is
 * gated twice: the email has to be typed correctly and the consequence has to
 * be acknowledged explicitly.
 */
export default function PrivacySettingsScreen() {
  const t = useT()
  const { locale } = useI18n()
  const router = useRouter()
  const api = useApi()
  const queryClient = useQueryClient()
  const { timeZone } = useUserContext()
  const profile = useSessionStore((s) => s.profile)
  const signOut = useSessionStore((s) => s.signOut)

  const [scope, setScope] = useState<HistoryScope>('emails')
  const [deleteHistoryOpen, setDeleteHistoryOpen] = useState(false)
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState('')

  const exportStatus = useQuery({
    queryKey: qk.exportStatus(),
    queryFn: () => api.privacy.exportStatus(),
    refetchInterval: (query) =>
      query.state.data?.status === 'processing' || query.state.data?.status === 'requested'
        ? 5000
        : false,
  })

  const requestExport = useMutation({
    mutationFn: () => api.privacy.requestExport(),
    onSuccess: () => track('export_requested'),
    // Refreshed either way: building the archive can outlast the call that
    // asked for it, and a timeout must not leave the card showing a failure
    // over a file that is already on its way.
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.exportStatus() })
    },
  })

  const deleteHistory = useMutation({
    mutationFn: () => api.privacy.deleteHistory({ scope }),
    onSuccess: async () => {
      setDeleteHistoryOpen(false)
      await queryClient.invalidateQueries()
    },
  })

  const deleteAccount = useMutation({
    mutationFn: () =>
      api.privacy.deleteAccount({
        confirmationEmail: confirmEmail.trim().toLowerCase(),
        acknowledgedIrreversible: true,
      }),
    // The account is gone the moment this resolves, so the session has to go
    // with it: staying signed in would leave the app holding a token whose
    // user no longer exists, and every cached row belongs to that user.
    onSuccess: async () => {
      track('account_deleted')
      setDeleteAccountOpen(false)
      await cancelAllLocalNotifications()
      clearSnapshot()
      queryClient.clear()
      await signOut()
      router.replace('/(auth)')
    },
  })

  // While the archive is being built there is nothing to download yet, so the
  // card says what happens next rather than leaving the button unexplained.
  const preparing =
    exportStatus.data?.status === 'requested' || exportStatus.data?.status === 'processing'

  const emailMatches =
    confirmEmail.trim().toLowerCase() === (profile?.email ?? '').toLowerCase() &&
    confirmEmail.trim().length > 0

  const openDownload = useCallback(() => {
    const url = exportStatus.data?.downloadUrl
    if (url) void WebBrowser.openBrowserAsync(url)
  }, [exportStatus.data])

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader title={t('privacy.title')} />

      <View style={{ gap: spacing.md, marginTop: spacing.md }}>
        <Card tone="info" style={{ gap: spacing.xxs }}>
          <Text variant="secondary" tone="info">
            {t('privacy.encryption')}
          </Text>
          <Text variant="secondary" tone="info">
            {t('privacy.noAdSale')}
          </Text>
        </Card>

        <Card style={{ gap: spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {t('privacy.dataExport.title')}
            </Text>
            {exportStatus.data ? (
              <Badge
                label={t(`privacy.dataExport.status.${exportStatus.data.status}`)}
                tone={exportStatus.data.status === 'ready' ? 'success' : 'info'}
              />
            ) : null}
          </View>
          <Text variant="secondary" tone="secondary">
            {t('privacy.dataExport.body')}
          </Text>

          {exportStatus.data?.status === 'ready' && exportStatus.data.downloadUrl ? (
            <>
              <Button
                label={t('privacy.dataExport.download')}
                onPress={openDownload}
                fullWidth
                testID="privacy-export-download"
              />
              {exportStatus.data.expiresAt ? (
                <Text variant="micro" tone="tertiary">
                  {t('privacy.dataExport.ready', {
                    date: formatFullDate(new Date(exportStatus.data.expiresAt), locale, timeZone),
                  })}
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <Button
                label={
                  exportStatus.data
                    ? t('privacy.dataExport.requestAgain')
                    : t('privacy.dataExport.request')
                }
                onPress={() => requestExport.mutate()}
                variant="tonal"
                fullWidth
                loading={requestExport.isPending}
                testID="privacy-export-request"
              />
              {preparing ? (
                <Text variant="micro" tone="tertiary">
                  {t('privacy.dataExport.hint')}
                </Text>
              ) : null}
            </>
          )}

          {requestExport.isError ? (
            <Text variant="secondary" tone="critical">
              {t(errorMessageKey(requestExport.error))}
            </Text>
          ) : null}
          {exportStatus.isError ? (
            <Text variant="secondary" tone="critical">
              {t(errorMessageKey(exportStatus.error))}
            </Text>
          ) : null}
        </Card>

        <Card style={{ gap: spacing.xs }}>
          <Text variant="bodyStrong">{t('privacy.deleteHistory.title')}</Text>
          <Text variant="secondary" tone="secondary">
            {t('privacy.deleteHistory.body')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {SCOPES.map((entry) => (
              <FilterChip
                key={entry.value}
                label={t(entry.labelKey)}
                selected={scope === entry.value}
                onPress={() => setScope(entry.value)}
                testID={`privacy-scope-${entry.value}`}
              />
            ))}
          </View>
          <Button
            label={t('privacy.deleteHistory.confirm')}
            onPress={() => setDeleteHistoryOpen(true)}
            variant="destructive"
            fullWidth
            testID="privacy-delete-history"
          />
          {deleteHistory.isSuccess ? (
            <Text variant="secondary" tone="success" testID="privacy-delete-history-done">
              {t('privacy.deleteHistory.done')}
            </Text>
          ) : null}
        </Card>

        <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
          <ListRow
            title={t('privacy.policyLink')}
            icon="policy"
            onPress={() => void WebBrowser.openBrowserAsync(`${env.webUrl}/privacy`)}
            testID="privacy-policy"
          />
          <Divider />
          <ListRow
            title={t('privacy.permissions.manage')}
            icon="tune"
            onPress={() => router.push('/settings/notifications')}
            testID="privacy-permissions"
          />
          <Divider />
          <ListRow
            title={t('privacy.contact')}
            icon="mail-outline"
            onPress={() => router.push('/settings/feedback')}
            testID="privacy-contact"
          />
        </Card>

        <Button
          label={t('privacy.deleteAccount.title')}
          onPress={() => setDeleteAccountOpen(true)}
          variant="ghost"
          fullWidth
          testID="privacy-delete-account"
        />
      </View>

      <Sheet
        visible={deleteHistoryOpen}
        onClose={() => setDeleteHistoryOpen(false)}
        title={t('privacy.deleteHistory.confirmTitle')}
        closeLabel={t('common.action.close')}
        scrollable={false}
        footer={
          <Button
            label={t('privacy.deleteHistory.confirm')}
            onPress={() => deleteHistory.mutate()}
            variant="destructive"
            fullWidth
            loading={deleteHistory.isPending}
            testID="privacy-delete-history-confirm"
          />
        }
        testID="privacy-delete-history-sheet"
      >
        <Text variant="body" tone="secondary">
          {t('privacy.deleteHistory.confirmBody')}
        </Text>
        {deleteHistory.isError ? (
          <Text variant="secondary" tone="critical">
            {t(errorMessageKey(deleteHistory.error))}
          </Text>
        ) : null}
      </Sheet>

      <Sheet
        visible={deleteAccountOpen}
        onClose={() => setDeleteAccountOpen(false)}
        title={t('privacy.deleteAccount.title')}
        closeLabel={t('common.action.close')}
        footer={
          <Button
            label={t('privacy.deleteAccount.confirm')}
            onPress={() => deleteAccount.mutate()}
            variant="destructive"
            fullWidth
            loading={deleteAccount.isPending}
            disabled={!emailMatches}
            testID="privacy-delete-account-confirm"
          />
        }
        testID="privacy-delete-account-sheet"
      >
        <Text variant="body" tone="critical">
          {t('privacy.deleteAccount.warning')}
        </Text>
        <Text variant="secondary" tone="secondary">
          {t('privacy.deleteAccount.body')}
        </Text>
        <Text variant="secondary" tone="secondary">
          {t('privacy.deleteAccount.keepsProviderData')}
        </Text>
        <Text variant="secondary" tone="secondary">
          {t('privacy.deleteAccount.cancelSubscriptionNote')}
        </Text>
        <TextField
          label={t('privacy.deleteAccount.confirmLabel')}
          value={confirmEmail}
          onChangeText={setConfirmEmail}
          placeholder={profile?.email ?? ''}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          testID="privacy-delete-account-email"
        />
        {deleteAccount.isError ? (
          <Text variant="secondary" tone="critical">
            {t(errorMessageKey(deleteAccount.error))}
          </Text>
        ) : null}
      </Sheet>
    </Screen>
  )
}
