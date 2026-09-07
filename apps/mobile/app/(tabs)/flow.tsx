import type { FlowFilter } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import type { EmailThread } from '@da/domain'
import { FlashList } from '@shopify/flash-list'
import { useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { EmailCard } from '../../src/components/cards/EmailCard'
import { FilterChip } from '../../src/components/ui/Controls'
import { EmptyState, ErrorState, SkeletonCard } from '../../src/components/ui/States'
import { Screen } from '../../src/components/ui/Screen'
import { Text } from '../../src/components/ui/Text'
import { useT } from '../../src/i18n/I18nProvider'
import { useThreads } from '../../src/hooks/queries'
import { useUserContext } from '../../src/hooks/useUserContext'
import { errorMessageKey, isRetryable } from '../../src/lib/query-client'

/** The filter row. `all` first, then the cuts users actually reach for. */
const FILTERS: ReadonlyArray<{ value: FlowFilter; labelKey: string }> = [
  { value: 'all', labelKey: 'flow.filters.all' },
  { value: 'important', labelKey: 'flow.filters.important' },
  { value: 'action_required', labelKey: 'mail.categories.important' },
  { value: 'waiting', labelKey: 'flow.filters.followup' },
  { value: 'deadlines', labelKey: 'mail.categories.deadline' },
  { value: 'meetings', labelKey: 'flow.filters.calendar' },
  { value: 'personal', labelKey: 'flow.filters.personal' },
]

/**
 * Akış — the attention feed.
 *
 * Not an inbox. It is the ranked stream of things worth knowing, and it ends:
 * the list is bounded by the priority engine's own cut-off rather than paging
 * forever into everything that ever arrived.
 */
export default function FlowScreen() {
  const t = useT()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { timeZone } = useUserContext()
  const [filter, setFilter] = useState<FlowFilter>('all')
  const [refreshing, setRefreshing] = useState(false)

  const query = useThreads({ flow: filter, limit: 60 })

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await query.refetch()
    } finally {
      setRefreshing(false)
    }
  }, [query])

  const threads = useMemo<EmailThread[]>(() => query.data ?? [], [query.data])

  const renderItem = useCallback(
    ({ item }: { item: EmailThread }) => (
      <View style={{ marginBottom: spacing.sm }}>
        <EmailCard
          thread={item}
          senderName={item.participantEmails[0] ?? item.subject}
          timeZone={timeZone}
          onPress={() => router.push(`/thread/${item.id}`)}
          testID={`thread-${item.id}`}
        />
      </View>
    ),
    [router, timeZone],
  )

  const header = (
    <View style={{ paddingTop: insets.top + spacing.xs, gap: spacing.sm }}>
      <Text variant="h1" accessibilityRole="header">
        {t('common.tab.flow')}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.xs, paddingRight: spacing.lg }}
      >
        {FILTERS.map((entry) => (
          <FilterChip
            key={entry.value}
            label={t(entry.labelKey)}
            selected={filter === entry.value}
            onPress={() => setFilter(entry.value)}
            testID={`flow-filter-${entry.value}`}
          />
        ))}
      </ScrollView>
    </View>
  )

  if (query.isLoading && threads.length === 0) {
    return (
      <Screen scroll bottomInset={spacing.xxl}>
        {header}
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </Screen>
    )
  }

  if (query.isError && threads.length === 0) {
    return (
      <Screen scroll={false}>
        {header}
        <ErrorState
          message={t(errorMessageKey(query.error))}
          {...(isRetryable(query.error)
            ? { retryLabel: t('common.action.retry'), onRetry: () => void query.refetch() }
            : {})}
        />
      </Screen>
    )
  }

  return (
    <Screen scroll={false} padded={false}>
      <View style={{ flex: 1, paddingHorizontal: spacing.lg }}>
        <FlashList
          data={threads}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={<View style={{ paddingBottom: spacing.md }}>{header}</View>}
          ListEmptyComponent={
            <EmptyState
              icon="dynamic-feed"
              title={t('empty.noImportantEmail')}
              description={t('empty.flow.hint')}
            />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={onRefresh}
          testID="flow-list"
        />
      </View>
    </Screen>
  )
}
