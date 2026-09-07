import type { SearchHit, SearchType } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import { elapsedKey } from '@da/i18n'
import { MaterialIcons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import { Card } from '../src/components/ui/Card'
import { FilterChip } from '../src/components/ui/Controls'
import { Divider } from '../src/components/ui/Layout'
import { Pressable } from '../src/components/ui/Pressable'
import { Screen } from '../src/components/ui/Screen'
import { ScreenHeader } from '../src/components/ui/ScreenHeader'
import { EmptyState, ErrorState, SkeletonCard } from '../src/components/ui/States'
import { Text } from '../src/components/ui/Text'
import { TextField } from '../src/components/ui/TextField'
import { useSearch } from '../src/hooks/queries'
import { useI18n, useT } from '../src/i18n/I18nProvider'
import { errorMessageKey, isRetryable } from '../src/lib/query-client'
import { useTheme } from '../src/theme/ThemeProvider'

const SCOPES: ReadonlyArray<{ value: SearchType | 'all'; labelKey: string }> = [
  { value: 'all', labelKey: 'search.scope.all' },
  { value: 'email', labelKey: 'search.scope.email' },
  { value: 'calendar_event', labelKey: 'search.scope.calendar_event' },
  { value: 'commitment', labelKey: 'search.scope.commitment' },
  { value: 'contact', labelKey: 'search.scope.contact' },
  { value: 'capture', labelKey: 'search.scope.capture' },
]

/** Starting points that are answerable without typing anything. */
const SUGGESTIONS = [
  'search.suggestion.unanswered',
  'search.suggestion.deadlines',
  'search.suggestion.thisWeekMeetings',
  'search.suggestion.fromVip',
] as const

const HIT_ICON: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  email: 'mail-outline',
  calendar_event: 'event',
  commitment: 'handshake',
  contact: 'person-outline',
  capture: 'photo-camera',
  task: 'check-circle-outline',
  notification: 'notifications-none',
  user_input: 'edit-note',
}

/**
 * Search across everything the assistant knows.
 *
 * Queries run only from two characters up: a request per keystroke would bill a
 * model call for every letter, and the semantic pass is the expensive half.
 */
export default function SearchScreen() {
  const t = useT()
  const { locale, plural } = useI18n()
  const theme = useTheme()
  const router = useRouter()
  const params = useLocalSearchParams<{ q?: string }>()

  const [query, setQuery] = useState(params.q ?? '')
  const [scope, setScope] = useState<SearchType | 'all'>('all')

  useEffect(() => {
    if (params.q) setQuery(params.q)
  }, [params.q])

  const types: SearchType[] =
    scope === 'all' ? ['email', 'calendar_event', 'commitment', 'contact', 'capture'] : [scope]
  const searchQuery = useSearch(query, types)

  const openHit = useCallback(
    (type: string, id: string) => {
      if (type === 'email') router.push(`/thread/${id}`)
      else if (type === 'calendar_event') router.push(`/event/${id}`)
      else if (type === 'commitment') router.push(`/commitment/${id}`)
      else if (type === 'contact') router.push(`/person/${id}`)
      else if (type === 'capture') router.push(`/capture?id=${id}`)
    },
    [router],
  )

  const hits = searchQuery.data?.results ?? []
  const trimmed = query.trim()

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader title={t('search.title')} dismiss onBack={() => router.back()} />

      <View style={{ gap: spacing.sm, paddingTop: spacing.xs }}>
        <TextField
          label={t('search.placeholder')}
          labelHidden
          value={query}
          onChangeText={setQuery}
          placeholder={t('search.placeholder')}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          testID="search-input"
        />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {SCOPES.map((entry) => (
            <FilterChip
              key={entry.value}
              label={t(entry.labelKey)}
              selected={scope === entry.value}
              onPress={() => setScope(entry.value)}
              testID={`search-scope-${entry.value}`}
            />
          ))}
        </View>
      </View>

      <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
        {trimmed.length < 2 ? (
          <View style={{ gap: spacing.xs }}>
            <Text variant="caption" tone="tertiary">
              {t('search.suggestion.title')}
            </Text>
            {SUGGESTIONS.map((key) => (
              <Pressable
                key={key}
                onPress={() => setQuery(t(key))}
                haptic="light"
                accessibilityLabel={t(key)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.xs,
                  paddingVertical: spacing.xs,
                }}
                testID={`search-suggestion-${key}`}
              >
                <MaterialIcons name="search" size={16} color={theme.colors.textTertiary} />
                <Text variant="body" style={{ flex: 1 }}>
                  {t(key)}
                </Text>
              </Pressable>
            ))}
            <Text variant="micro" tone="tertiary">
              {t('search.semantic.hint')}
            </Text>
          </View>
        ) : searchQuery.isLoading ? (
          <SkeletonCard />
        ) : searchQuery.isError ? (
          <ErrorState
            message={t(errorMessageKey(searchQuery.error))}
            {...(isRetryable(searchQuery.error)
              ? { retryLabel: t('common.action.retry'), onRetry: () => void searchQuery.refetch() }
              : {})}
          />
        ) : hits.length === 0 ? (
          <EmptyState
            icon="search-off"
            title={t('search.noResults')}
            description={t('search.noResultsHint')}
          />
        ) : (
          <>
            <Text variant="caption" tone="tertiary">
              {plural('search.results.count', hits.length)}
              {searchQuery.data?.mode === 'semantic' ? ` · ${t('search.semantic.matchedOn')}` : ''}
            </Text>
            <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
              {hits.map((hit: SearchHit, index: number) => {
                const elapsed = hit.occurredAt
                  ? elapsedKey(new Date(hit.occurredAt), new Date())
                  : null
                return (
                  <View key={`${hit.type}:${hit.id}`}>
                    {index > 0 ? <Divider inset={36} /> : null}
                    <Pressable
                      onPress={() => openHit(hit.type, hit.id)}
                      haptic="light"
                      scaleOnPress={false}
                      accessibilityLabel={hit.title}
                      style={{
                        flexDirection: 'row',
                        gap: spacing.sm,
                        paddingVertical: spacing.sm,
                        alignItems: 'flex-start',
                      }}
                      testID={`search-hit-${hit.id}`}
                    >
                      <MaterialIcons
                        name={HIT_ICON[hit.type] ?? 'search'}
                        size={18}
                        color={theme.colors.textTertiary}
                        style={{ marginTop: 2 }}
                      />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="body" numberOfLines={2}>
                          {hit.title}
                        </Text>
                        <Text variant="micro" tone="tertiary" numberOfLines={2}>
                          {hit.snippet}
                        </Text>
                        <Text variant="micro" tone="tertiary">
                          {t(`search.scope.${hit.type}`)}
                          {elapsed ? ` · ${plural(elapsed.key, elapsed.count)}` : ''}
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                )
              })}
            </Card>
          </>
        )}
      </View>
    </Screen>
  )
}
