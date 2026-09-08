import { qk } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import { DEFAULT_TIME_ZONE } from '@da/domain'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as Localization from 'expo-localization'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { Avatar } from '../../src/components/ui/Avatar'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { ListRow } from '../../src/components/ui/Layout'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { Text } from '../../src/components/ui/Text'
import { TextField } from '../../src/components/ui/TextField'
import { useT } from '../../src/i18n/I18nProvider'
import { track } from '../../src/lib/analytics'
import { errorMessageKey } from '../../src/lib/query-client'
import { useApi } from '../../src/providers/AppProviders'
import { useSessionStore } from '../../src/stores/session'

/**
 * Profile.
 *
 * The email address is read-only: it is the identity the auth provider issued
 * and the key every connected account is matched on, so editing it here would
 * quietly break the connections rather than change the address.
 */
export default function ProfileSettingsScreen() {
  const t = useT()
  const router = useRouter()
  const api = useApi()
  const queryClient = useQueryClient()
  const profile = useSessionStore((s) => s.profile)
  const setProfile = useSessionStore((s) => s.setProfile)

  const [name, setName] = useState(profile?.displayName ?? '')
  const deviceZone = Localization.getCalendars()[0]?.timeZone ?? DEFAULT_TIME_ZONE
  const [timeZone, setTimeZone] = useState(profile?.timeZone ?? deviceZone)

  const save = useMutation({
    mutationFn: () =>
      api.settings.updateProfile({
        displayName: name.trim() || null,
        timeZone,
      }),
    onSuccess: async (updated) => {
      track('settings_changed')
      setProfile(updated)
      await queryClient.invalidateQueries({ queryKey: qk.settings() })
      router.back()
    },
  })

  /**
   * The picture comes from the identity provider, so the app cannot choose a
   * new one — but it can drop the one it was given, and until now it could not:
   * `avatarUrl` was accepted by the client and silently discarded by
   * `profile-update`, under a caption that read like a button and was not one.
   */
  const removePhoto = useMutation({
    mutationFn: () => api.settings.updateProfile({ avatarUrl: null }),
    onSuccess: async (updated) => {
      track('settings_changed')
      setProfile(updated)
      await queryClient.invalidateQueries({ queryKey: qk.settings() })
    },
  })

  const failure = save.error ?? removePhoto.error

  const dirty = name !== (profile?.displayName ?? '') || timeZone !== (profile?.timeZone ?? '')

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader title={t('settings.profile.title')} />

      <View style={{ gap: spacing.md, paddingTop: spacing.sm }}>
        <View style={{ alignItems: 'center', gap: spacing.xs }}>
          <Avatar
            name={name || (profile?.email ?? '')}
            imageUrl={profile?.avatarUrl ?? null}
            size={72}
          />
          {profile?.avatarUrl ? (
            <Button
              label={t('settings.profile.avatarRemove')}
              onPress={() => removePhoto.mutate()}
              variant="ghost"
              size="sm"
              loading={removePhoto.isPending}
              testID="profile-avatar-remove"
            />
          ) : null}
        </View>

        <TextField
          label={t('settings.profile.nameLabel')}
          value={name}
          onChangeText={setName}
          placeholder={t('settings.profile.namePlaceholder')}
          testID="profile-name"
        />

        <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
          <ListRow
            title={t('settings.profile.emailLabel')}
            subtitle={t('settings.profile.emailReadOnly')}
            value={profile?.email ?? ''}
            icon="alternate-email"
          />
        </Card>

        <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
          <ListRow
            title={t('settings.profile.timeZoneLabel')}
            value={timeZone}
            icon="public"
            {...(timeZone !== deviceZone
              ? { subtitle: deviceZone, onPress: () => setTimeZone(deviceZone) }
              : {})}
            testID="profile-timezone"
          />
        </Card>

        {failure ? (
          <Card tone="critical">
            <Text variant="secondary" tone="critical">
              {t(errorMessageKey(failure))}
            </Text>
          </Card>
        ) : null}

        <Button
          label={t('common.action.saveChanges')}
          onPress={() => save.mutate()}
          fullWidth
          loading={save.isPending}
          disabled={!dirty}
          testID="profile-save"
        />

        <Button
          label={t('settings.profile.deleteAccount')}
          onPress={() => router.push('/settings/privacy')}
          variant="ghost"
          size="sm"
          fullWidth
          testID="profile-delete-account"
        />
      </View>
    </Screen>
  )
}
