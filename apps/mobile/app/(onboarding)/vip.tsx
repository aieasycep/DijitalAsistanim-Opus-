import { qk } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import type { Contact } from '@da/domain'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { View } from 'react-native'
import { StepFrame } from '../../src/components/onboarding/StepFrame'
import { Avatar } from '../../src/components/ui/Avatar'
import { Card } from '../../src/components/ui/Card'
import { Divider } from '../../src/components/ui/Layout'
import { Pressable } from '../../src/components/ui/Pressable'
import { EmptyState, SkeletonCard } from '../../src/components/ui/States'
import { Text } from '../../src/components/ui/Text'
import { TextField } from '../../src/components/ui/TextField'
import { MaterialIcons } from '@expo/vector-icons'
import { useI18n, useT } from '../../src/i18n/I18nProvider'
import { useContacts } from '../../src/hooks/queries'
import { errorMessageKey } from '../../src/lib/query-client'
import { useApi } from '../../src/providers/AppProviders'
import { useTheme } from '../../src/theme/ThemeProvider'

/** Enough to be useful, few enough to still feel like a choice. */
const SUGGESTION_LIMIT = 12

export default function VipStep() {
  const t = useT()
  const { plural } = useI18n()
  const theme = useTheme()
  const router = useRouter()
  const api = useApi()
  const queryClient = useQueryClient()
  const contactsQuery = useContacts()

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  const contacts = useMemo<Contact[]>(() => {
    const all = contactsQuery.data ?? []
    const needle = query.trim().toLocaleLowerCase('tr-TR')
    const matching = needle
      ? all.filter(
          (contact) =>
            (contact.name ?? '').toLocaleLowerCase('tr-TR').includes(needle) ||
            contact.email.toLocaleLowerCase('tr-TR').includes(needle),
        )
      : // Without a query, the people worth suggesting are the ones written to
        // most: interaction count is the only honest proxy for importance we
        // have before the user tells us anything.
        [...all].sort((a, b) => b.interactionCount - a.interactionCount)
    return matching.slice(0, SUGGESTION_LIMIT)
  }, [contactsQuery.data, query])

  const toggle = useCallback((contactId: string) => {
    setSelected((current) =>
      current.includes(contactId)
        ? current.filter((entry) => entry !== contactId)
        : [...current, contactId],
    )
  }, [])

  const save = useMutation({
    mutationFn: async () => {
      for (const contactId of selected) {
        await api.people.setVip(contactId, true)
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.contacts() })
      router.push('/(onboarding)/preferences')
    },
  })

  const skip = useCallback(() => router.push('/(onboarding)/preferences'), [router])

  return (
    <StepFrame
      step="vip"
      title={t('onboarding.vip.title')}
      description={t('onboarding.vip.body')}
      primaryLabel={t('onboarding.vip.primary')}
      onPrimary={() => (selected.length > 0 ? save.mutate() : skip())}
      primaryLoading={save.isPending}
      secondaryLabel={t('onboarding.vip.skip')}
      onSecondary={skip}
      testID="onboarding-vip"
    >
      <TextField
        label={t('onboarding.vip.searchPlaceholder')}
        labelHidden
        value={query}
        onChangeText={setQuery}
        placeholder={t('onboarding.vip.searchPlaceholder')}
        autoCapitalize="none"
        autoCorrect={false}
        testID="vip-search"
      />

      <Text variant="caption" tone="tertiary">
        {query.trim() ? plural('onboarding.vip.selected', selected.length) : t('onboarding.vip.suggestedTitle')}
      </Text>

      {contactsQuery.isLoading ? (
        <SkeletonCard />
      ) : contacts.length === 0 ? (
        <EmptyState icon="person-search" title={t('empty.person.title')} />
      ) : (
        <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
          {contacts.map((contact, index) => {
            const isSelected = selected.includes(contact.id) || contact.isVip
            return (
              <View key={contact.id}>
                {index > 0 ? <Divider inset={48} /> : null}
                <Pressable
                  onPress={() => toggle(contact.id)}
                  haptic="light"
                  scaleOnPress={false}
                  accessibilityLabel={contact.name ?? contact.email}
                  accessibilityState={{ selected: isSelected }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.sm,
                    paddingVertical: spacing.sm,
                  }}
                  testID={`vip-contact-${contact.id}`}
                >
                  <Avatar
                    name={contact.name ?? contact.email}
                    imageUrl={contact.avatarUrl}
                    size={36}
                    isVip={isSelected}
                  />
                  <View style={{ flex: 1 }}>
                    <Text variant="body" numberOfLines={1}>
                      {contact.name ?? contact.email}
                    </Text>
                    <Text variant="micro" tone="tertiary" numberOfLines={1}>
                      {contact.email}
                    </Text>
                  </View>
                  <MaterialIcons
                    name={isSelected ? 'star' : 'star-outline'}
                    size={22}
                    color={isSelected ? theme.colors.warning : theme.colors.textTertiary}
                  />
                </Pressable>
              </View>
            )
          })}
        </Card>
      )}

      {save.isError ? (
        <Card tone="critical">
          <Text variant="secondary" tone="critical">
            {t(errorMessageKey(save.error))}
          </Text>
        </Card>
      ) : null}
    </StepFrame>
  )
}
