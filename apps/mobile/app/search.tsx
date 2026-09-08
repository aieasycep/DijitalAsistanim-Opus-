import type { SearchHit, SearchType } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import { systemClock } from '@da/domain'
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

/**
 * What each kind of hit is called, keyed by the contract's own union so a kind
 * added to the wire cannot reach this screen without a name.
 *
 * The label used to be built as `search.scope.${hit.type}`, which read as a
 * lookup that always works and was not one: the catalogue has no
 * `search.scope.life_event`, so a tracked parcel or flight in the results threw
 * on a missing key in development and rendered the raw key in production. A
 * life event is named here the way its own screen names it.
 */
const SCOPE_LABEL_KEY: Record<SearchType, string> = {
  email: 'search.scope.email',
  calendar_event: 'search.scope.calendar_event',
  task: 'search.scope.task',
  capture: 'search.scope.capture',
  commitment: 'search.scope.commitment',
  notification: 'search.scope.notification',
  contact: 'search.scope.contact',
  user_input: 'search.scope.user_input',
  life_event: 'today.section.personal',
}

const HIT_ICON: Record<SearchType, keyof typeof MaterialIcons.glyphMap> = {
  email: 'mail-outline',
  calendar_event: 'event',
  task: 'check-circle-outline',
  capture: 'photo-camera',
  commitment: 'handshake',
  notification: 'notifications-none',
  contact: 'person-outline',
  user_input: 'edit-note',
  life_event: 'track-changes',
}

/**
 * Where a hit opens, or `null` when the app has no screen for that kind.
 *
 * A remembered note, a notification and a task are real answers to the question
 * asked, so they are still listed — but their rows are rendered flat rather
 * than as buttons that swallow the tap.
 */
const HIT_ROUTE: Record<SearchType, ((id: string) => string) | null> = {
  email: (id) => `/thread/${id}`,
  calendar_event: (id) => `/event/${id}`,
  task: null,
  capture: (id) => `/capture?id=${id}`,
  commitment: (id) => `/commitment/${id}`,
  notification: null,
  contact: (id) => `/person/${id}`,
  user_input: null,
  life_event: (id) => `/life/${id}`,
}

/**
 * `hit.type` arrives as a string on the wire, so these are read through maps
 * rather than indexed directly — an unknown kind falls back instead of
 * producing `undefined` halfway down the render.
 */
const LABEL_BY_TYPE = new Map<string, string>(Object.entries(SCOPE_LABEL_KEY))
const ICON_BY_TYPE = new Map<string, keyof typeof MaterialIcons.glyphMap>(Object.entries(HIT_ICON))
const ROUTE_BY_TYPE = new Map<string, ((id: string) => string) | null>(Object.entries(HIT_ROUTE))

function routeFor(hit: SearchHit): string | null {
  return ROUTE_BY_TYPE.get(hit.type)?.(encodeURIComponent(hit.id)) ?? null
}

/**
 * Search across everything the assistant knows.
 *
 * Queries run only from two characters up: a request per keystroke would bill a
 * model call for every letter, and the semantic pass is the expensive half.
 */
export default function SearchScreen() {
  const t = useT()
  const { plural } = useI18n()
  const theme = useTheme()
  const router = useRouter()
  const params = useLocalSearchParams<{ q?: string }>()

  const [query, setQuery] = useState(params.q ?? '')
  const [scope, setScope] = useState<SearchType | 'all'>('all')

  useEffect(() => {
    if (params.q) setQuery(params.q)
  }, [params.q])

  // "Tümü" sends no filter at all rather than a list of kinds: the function
  // reads an empty filter as every kind, so a kind added to the contract is
  // searchable here without this list having to be kept in step.
  const types: SearchType[] = scope === 'all' ? [] : [scope]
  const searchQuery = useSearch(query, types)

  const openHit = useCallback(
    (route: string) => {
      router.push(route)
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
                  ? elapsedKey(new Date(hit.occurredAt), systemClock.now())
                  : null
                const route = routeFor(hit)
                const rowStyle = {
                  flexDirection: 'row' as const,
                  gap: spacing.sm,
                  paddingVertical: spacing.sm,
                  alignItems: 'flex-start' as const,
                }
                const body = (
                  <>
                    <MaterialIcons
                      name={ICON_BY_TYPE.get(hit.type) ?? 'search'}
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
                        {t(LABEL_BY_TYPE.get(hit.type) ?? 'search.scope.all')}
                        {elapsed ? ` · ${plural(elapsed.key, elapsed.count)}` : ''}
                      </Text>
                    </View>
                  </>
                )
                return (
                  <View key={`${hit.type}:${hit.id}`}>
                    {index > 0 ? <Divider inset={36} /> : null}
                    {route ? (
                      <Pressable
                        onPress={() => openHit(route)}
                        haptic="light"
                        scaleOnPress={false}
                        accessibilityLabel={hit.title}
                        style={rowStyle}
                        testID={`search-hit-${hit.id}`}
                      >
                        {body}
                      </Pressable>
                    ) : (
                      <View style={rowStyle} testID={`search-hit-${hit.id}`}>
                        {body}
                      </View>
                    )}
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
