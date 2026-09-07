import { qk } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import type { Contact } from '@da/domain'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { View } from 'react-native'
import { Avatar } from '../../src/components/ui/Avatar'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { Divider, ListRow } from '../../src/components/ui/Layout'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { EmptyState, SkeletonCard } from '../../src/components/ui/States'
import { Text } from '../../src/components/ui/Text'
import { TextField } from '../../src/components/ui/TextField'
import { useContacts } from '../../src/hooks/queries'
import { useEntitlements } from '../../src/hooks/useEntitlements'
import { useI18n, useT } from '../../src/i18n/I18nProvider'
import { errorMessageKey } from '../../src/lib/query-client'
import { useApi } from '../../src/providers/AppProviders'

/** Ranked suggestions come from interaction volume, nothing external. */
const SUGGESTION_LIMIT = 8

/**
 * The VIP list.
 *
 * A VIP always surfaces and always notifies, including inside quiet hours —
 * which is exactly why the list is capped and why every entry is a deliberate
 * choice rather than something the assistant decides on its own.
 */
export default function VipSettingsScreen() {
  const t = useT()
  const { plural } = useI18n()
  const router = useRouter()
  const api = useApi()
  const queryClient = useQueryClient()
  const query = useContacts()
  const { entitlements } = useEntitlements()

  const [search, setSearch] = useState('')

  const contacts = query.data ?? []
  const vips = useMemo(() => contacts.filter((contact) => contact.isVip), [contacts])
  const atLimit = vips.length >= entitlements.limits.vipPeople

  const suggestions = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('tr-TR')
    const pool = contacts.filter((contact) => !contact.isVip)
    const matching = needle
      ? pool.filter(
          (contact) =>
            (contact.name ?? '').toLocaleLowerCase('tr-TR').includes(needle) ||
            contact.email.toLocaleLowerCase('tr-TR').includes(needle),
        )
      : [...pool].sort((a, b) => b.interactionCount - a.interactionCount)
    return matching.slice(0, SUGGESTION_LIMIT)
  }, [contacts, search])

  const setVip = useMutation({
    mutationFn: (input: { contact: Contact; isVip: boolean }) =>
      api.people.setVip(input.contact.id, input.isVip),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.contacts() })
    },
  })

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader title={t('vip.title')} subtitle={t('vip.subtitle')} />

      <View style={{ gap: spacing.md, marginTop: spacing.md }}>
        <Card style={{ gap: spacing.xxs }}>
          <Text variant="caption" tone="tertiary">
            {t('vip.behaviour.title')}
          </Text>
          <Text variant="secondary" tone="secondary">
            {t('vip.behaviour.alwaysTop')}
          </Text>
          <Text variant="secondary" tone="secondary">
            {t('vip.behaviour.alwaysNotifyHint')}
          </Text>
        </Card>

        <View>
          <Text variant="caption" tone="tertiary" style={{ marginBottom: spacing.xs }}>
            {plural('vip.list.count', vips.length)}
          </Text>

          {query.isLoading && contacts.length === 0 ? (
            <SkeletonCard />
          ) : vips.length === 0 ? (
            <EmptyState
              icon="star-outline"
              title={t('empty.vip.title')}
              description={t('empty.vip.hint')}
            />
          ) : (
            <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
              {vips.map((contact, index) => (
                <View key={contact.id}>
                  {index > 0 ? <Divider inset={44} /> : null}
                  <ListRow
                    title={contact.name ?? contact.email}
                    subtitle={contact.email}
                    onPress={() => router.push(`/person/${contact.id}`)}
                    accessory={
                      <Button
                        label={t('vip.remove')}
                        onPress={() => setVip.mutate({ contact, isVip: false })}
                        variant="ghost"
                        size="sm"
                        testID={`vip-remove-${contact.id}`}
                      />
                    }
                    testID={`vip-${contact.id}`}
                  />
                </View>
              ))}
            </Card>
          )}
        </View>

        {atLimit ? (
          <Text variant="micro" tone="tertiary">
            {t('vip.list.limitReached')}
          </Text>
        ) : (
          <View style={{ gap: spacing.xs }}>
            <Text variant="caption" tone="tertiary">
              {t('vip.suggestion.title')}
            </Text>
            <TextField
              label={t('vip.addPlaceholder')}
              labelHidden
              value={search}
              onChangeText={setSearch}
              placeholder={t('vip.addPlaceholder')}
              autoCapitalize="none"
              autoCorrect={false}
              testID="vip-search"
            />
            {suggestions.map((contact) => (
              <Card
                key={contact.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
              >
                <Avatar
                  name={contact.name ?? contact.email}
                  imageUrl={contact.avatarUrl}
                  size={32}
                />
                <View style={{ flex: 1 }}>
                  <Text variant="body" numberOfLines={1}>
                    {contact.name ?? contact.email}
                  </Text>
                  <Text variant="micro" tone="tertiary" numberOfLines={1}>
                    {t('vip.suggestion.reasonFrequent')}
                  </Text>
                </View>
                <Button
                  label={t('vip.add')}
                  onPress={() => setVip.mutate({ contact, isVip: true })}
                  variant="tonal"
                  size="sm"
                  loading={setVip.isPending}
                  testID={`vip-add-${contact.id}`}
                />
              </Card>
            ))}
          </View>
        )}

        {setVip.isError ? (
          <Text variant="secondary" tone="critical">
            {t(errorMessageKey(setVip.error))}
          </Text>
        ) : null}

        <Text variant="micro" tone="tertiary">
          {t('vip.explain')}
        </Text>
      </View>
    </Screen>
  )
}
