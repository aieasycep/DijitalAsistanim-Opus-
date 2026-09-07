import { qk } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import { systemClock } from '@da/domain'
import { elapsedKey } from '@da/i18n'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo } from 'react'
import { View } from 'react-native'
import { EmailCard } from '../../src/components/cards/EmailCard'
import { Avatar } from '../../src/components/ui/Avatar'
import { Badge } from '../../src/components/ui/Badge'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { SectionHeader } from '../../src/components/ui/Layout'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { ErrorState, SkeletonCard } from '../../src/components/ui/States'
import { Text } from '../../src/components/ui/Text'
import { useCommitments, usePerson, useThreads } from '../../src/hooks/queries'
import { useUserContext } from '../../src/hooks/useUserContext'
import { useI18n, useT } from '../../src/i18n/I18nProvider'
import { errorMessageKey } from '../../src/lib/query-client'
import { useApi } from '../../src/providers/AppProviders'

/**
 * A person, as the assistant knows them.
 *
 * The stats are counted from the user's own mail — no external enrichment, no
 * third-party lookup — which is what the privacy note under the header says in
 * as many words.
 */
export default function PersonScreen() {
  const t = useT()
  const { plural } = useI18n()
  const router = useRouter()
  const api = useApi()
  const queryClient = useQueryClient()
  const { timeZone } = useUserContext()
  const params = useLocalSearchParams<{ id?: string }>()
  const contactId = params.id ?? null

  const query = usePerson(contactId)
  const contact = query.data ?? null
  const threadsQuery = useThreads({ flow: 'all', limit: 100 })
  const commitmentsQuery = useCommitments()

  const threads = useMemo(
    () =>
      contact
        ? (threadsQuery.data ?? [])
            .filter((thread) => thread.participantEmails.includes(contact.email))
            .slice(0, 5)
        : [],
    [contact, threadsQuery.data],
  )

  const commitments = useMemo(
    () =>
      contact
        ? (commitmentsQuery.data ?? []).filter(
            (commitment) =>
              commitment.personId === contact.id ||
              (commitment.personName !== null && commitment.personName === contact.name),
          )
        : [],
    [contact, commitmentsQuery.data],
  )

  const toggleVip = useMutation({
    mutationFn: (isVip: boolean) => api.people.setVip(contactId as string, isVip),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.person(contactId as string) }),
        queryClient.invalidateQueries({ queryKey: qk.contacts() }),
      ])
    },
  })

  if (query.isLoading && !contact) {
    return (
      <Screen>
        <ScreenHeader title={t('person.title')} />
        <SkeletonCard />
      </Screen>
    )
  }

  if (!contact) {
    return (
      <Screen>
        <ScreenHeader title={t('person.title')} />
        <ErrorState
          message={query.isError ? t(errorMessageKey(query.error)) : t('errors.not_found')}
        />
      </Screen>
    )
  }

  const lastContact = contact.lastContactAt
    ? elapsedKey(new Date(contact.lastContactAt), systemClock.now())
    : null

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader title={t('person.title')} />

      <View style={{ gap: spacing.md, paddingTop: spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
          <Avatar
            name={contact.name ?? contact.email}
            imageUrl={contact.avatarUrl}
            size={56}
            isVip={contact.isVip}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="h2" numberOfLines={2} accessibilityRole="header">
              {contact.name ?? contact.email}
            </Text>
            <Text variant="secondary" tone="secondary" numberOfLines={1}>
              {contact.email}
            </Text>
            {contact.company || contact.role ? (
              <Text variant="micro" tone="tertiary" numberOfLines={1}>
                {[contact.role, contact.company].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
          {contact.isVip ? (
            <Badge label={t('person.header.vip')} tone="warning" icon="star" />
          ) : null}
          {lastContact ? (
            <Badge
              label={t('person.header.lastContact', {
                time: plural(lastContact.key, lastContact.count),
              })}
              tone="neutral"
            />
          ) : (
            <Badge label={t('person.header.neverContacted')} tone="neutral" />
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
          <Button
            label={contact.isVip ? t('person.action.unmarkVip') : t('person.action.markVip')}
            onPress={() => toggleVip.mutate(!contact.isVip)}
            variant={contact.isVip ? 'neutral' : 'primary'}
            size="sm"
            loading={toggleVip.isPending}
            testID="person-vip"
          />
          <Button
            label={t('person.action.openThreads')}
            onPress={() => router.push({ pathname: '/search', params: { q: contact.email } })}
            variant="tonal"
            size="sm"
            testID="person-threads"
          />
        </View>

        <Card style={{ gap: spacing.xxs }}>
          <Text variant="caption" tone="tertiary">
            {t('person.stats.title')}
          </Text>
          <Text variant="body">{plural('person.stats.threads', contact.interactionCount)}</Text>
          <Text variant="micro" tone="tertiary">
            {t('person.privacyNote')}
          </Text>
        </Card>

        {commitments.length > 0 ? (
          <View>
            <SectionHeader title={t('person.section.commitments')} />
            <View style={{ gap: spacing.sm }}>
              {commitments.slice(0, 5).map((commitment) => (
                <Card
                  key={commitment.id}
                  onPress={() => router.push(`/commitment/${commitment.id}`)}
                  accessibilityLabel={commitment.text}
                  style={{ gap: spacing.xxs }}
                >
                  <Text variant="body">{commitment.text}</Text>
                  <Text variant="micro" tone="tertiary">
                    {t(`commitment.direction.${commitment.direction}`)}
                  </Text>
                </Card>
              ))}
            </View>
          </View>
        ) : null}

        {threads.length > 0 ? (
          <View>
            <SectionHeader title={t('person.section.recentThreads')} />
            <View style={{ gap: spacing.sm }}>
              {threads.map((thread) => (
                <EmailCard
                  key={thread.id}
                  thread={thread}
                  senderName={contact.name ?? contact.email}
                  timeZone={timeZone}
                  onPress={() => router.push(`/thread/${thread.id}`)}
                  testID={`person-thread-${thread.id}`}
                />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </Screen>
  )
}
