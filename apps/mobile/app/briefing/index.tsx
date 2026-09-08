import { spacing } from '@da/design-tokens'
import {
  BRIEFING_SECTIONS,
  type BriefingKind,
  type BriefingItem,
  type BriefingSection,
  systemClock,
  toIsoDate,
} from '@da/domain'
import { formatWeekdayDate } from '@da/i18n'
import { MaterialIcons } from '@expo/vector-icons'
import { useMutation } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { View } from 'react-native'
import { Badge } from '../../src/components/ui/Badge'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { GradientHeader } from '../../src/components/ui/GradientHeader'
import { IconButton } from '../../src/components/ui/Controls'
import { SectionHeader } from '../../src/components/ui/Layout'
import { Pressable } from '../../src/components/ui/Pressable'
import { EmptyState, ErrorState, SkeletonCard } from '../../src/components/ui/States'
import { Screen } from '../../src/components/ui/Screen'
import { SourceChip } from '../../src/components/ui/SourceChip'
import { Text } from '../../src/components/ui/Text'
import { useBriefingAudio } from '../../src/hooks/useBriefingAudio'
import { useBriefing } from '../../src/hooks/queries'
import { useI18n, useT } from '../../src/i18n/I18nProvider'
import { useUserContext } from '../../src/hooks/useUserContext'
import { track } from '../../src/lib/analytics'
import { errorMessageKey, isRetryable } from '../../src/lib/query-client'
import { useApi } from '../../src/providers/AppProviders'
import { useTheme } from '../../src/theme/ThemeProvider'

const KIND_GRADIENT = {
  morning: 'dawn',
  midday: 'dawn',
  evening: 'dusk',
  weekly: 'night',
} as const

function isBriefingKind(value: string | undefined): value is BriefingKind {
  return value === 'morning' || value === 'midday' || value === 'evening' || value === 'weekly'
}

/**
 * The briefing, read in full.
 *
 * The narrative is the product's editorial voice, so it is typeset as prose
 * rather than as a list of cards; the structured items follow underneath, each
 * one traceable back to the mail or the event it came from.
 */
export default function BriefingScreen() {
  const t = useT()
  const { locale } = useI18n()
  const theme = useTheme()
  const router = useRouter()
  const api = useApi()
  const { timeZone } = useUserContext()
  const params = useLocalSearchParams<{ kind?: string; date?: string; listen?: string }>()

  const kind: BriefingKind = isBriefingKind(params.kind) ? params.kind : 'morning'
  const forDate = params.date ?? toIsoDate(systemClock.now(), timeZone)

  const query = useBriefing(kind, forDate)
  const briefing = query.data?.briefing ?? null
  const items = useMemo<BriefingItem[]>(() => query.data?.items ?? [], [query.data])
  const audio = useBriefingAudio(briefing)
  const marked = useRef(false)
  /**
   * Arriving from the hero's "Dinle" button.
   *
   * Today links here with `listen=1`, and the parameter used to be read by
   * nobody — the button opened the briefing and left the user to find the
   * speaker icon. Playback starts once the narrative has loaded, and the ref
   * makes it once per visit rather than on every re-render.
   */
  const listenRequested = params.listen === '1'
  const autoPlayed = useRef(false)

  useEffect(() => {
    if (!listenRequested || autoPlayed.current || !audio.available) return
    autoPlayed.current = true
    audio.play()
  }, [listenRequested, audio.available, audio.play])

  /**
   * Asking for this briefing again.
   *
   * `force` is what the button means: it overrides the quiet-day rule, the
   * midday no-change rule and the cache, because the user is standing here
   * asking for it. The server can still answer that it wrote nothing; that
   * answer is shown rather than swallowed, and there is nothing to refetch
   * for it.
   */
  const regenerate = useMutation({
    mutationFn: () => api.briefings.generate({ kind, forDate, force: true }),
    onSuccess: (result) => {
      if (result.status === 'ready') void query.refetch()
    },
  })

  const regenerateSkipped = regenerate.data?.status === 'skipped'

  useEffect(() => {
    if (!briefing || briefing.openedAt || marked.current) return
    marked.current = true
    track('first_brief_opened')
    void api.briefings.markOpened(briefing.id).catch(() => undefined)
  }, [api, briefing])

  const openItem = useCallback(
    (item: BriefingItem) => {
      if (!item.relatedEntityId) return
      if (item.relatedEntityType === 'email') router.push(`/thread/${item.relatedEntityId}`)
      else if (item.relatedEntityType === 'calendar_event') {
        router.push(`/event/${item.relatedEntityId}`)
      } else if (item.relatedEntityType === 'commitment') {
        router.push(`/commitment/${item.relatedEntityId}`)
      } else if (item.relatedEntityType === 'contact')
        router.push(`/person/${item.relatedEntityId}`)
    },
    [router],
  )

  if (query.isLoading && !briefing) {
    return (
      <Screen scroll bottomInset={spacing.xxl}>
        <SkeletonCard />
        <View style={{ height: spacing.md }} />
        <SkeletonCard />
      </Screen>
    )
  }

  if (query.isError && !briefing) {
    return (
      <Screen scroll={false}>
        <ErrorState
          message={t(errorMessageKey(query.error))}
          {...(isRetryable(query.error)
            ? { retryLabel: t('common.action.retry'), onRetry: () => void query.refetch() }
            : {})}
        />
      </Screen>
    )
  }

  if (!briefing) {
    return (
      <Screen scroll={false}>
        <EmptyState
          icon="wb-twilight"
          title={regenerateSkipped ? t('briefing.status.skipped') : t('briefing.status.queued')}
          description={
            regenerateSkipped ? t('empty.briefing.skipped') : t('briefing.statusHint.queued')
          }
          actionLabel={t('briefing.regenerate')}
          onAction={() => regenerate.mutate()}
        />
        {regenerate.isError ? (
          <Text variant="micro" tone="critical" center>
            {t(errorMessageKey(regenerate.error))}
          </Text>
        ) : null}
      </Screen>
    )
  }

  return (
    <Screen scroll padded={false} bottomInset={spacing.xxl}>
      <GradientHeader variant={KIND_GRADIENT[kind]}>
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <IconButton
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/today'))}
              accessibilityLabel={t('a11y.button.back')}
            >
              <MaterialIcons name="arrow-back-ios-new" size={18} color={theme.colors.onPrimary} />
            </IconButton>
            <View style={{ flex: 1 }} />
            {audio.available ? (
              <IconButton
                onPress={audio.isPlaying ? audio.stop : audio.play}
                accessibilityLabel={
                  audio.isPlaying ? t('briefing.audio.stop') : t('briefing.audio.listen')
                }
                testID="briefing-audio"
              >
                <MaterialIcons
                  name={audio.isPlaying ? 'stop' : 'volume-up'}
                  size={20}
                  color={theme.colors.onPrimary}
                />
              </IconButton>
            ) : null}
          </View>

          <Text variant="caption" style={{ color: theme.colors.onPrimary, opacity: 0.85 }}>
            {t(`briefing.kind.${kind}`)} ·{' '}
            {formatWeekdayDate(new Date(`${forDate}T12:00:00Z`), locale, timeZone)}
          </Text>
          <Text
            variant="editorialDisplay"
            style={{ color: theme.colors.onPrimary }}
            accessibilityRole="header"
          >
            {briefing.headline ?? t(`briefing.kindSubtitle.${kind}`)}
          </Text>
          {briefing.durationSeconds ? (
            <Text variant="micro" style={{ color: theme.colors.onPrimary, opacity: 0.8 }}>
              {t('briefing.readingTime', {
                minutes: Math.max(1, Math.round(briefing.durationSeconds / 60)),
              })}
            </Text>
          ) : null}
        </View>
      </GradientHeader>

      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.lg }}>
        {briefing.narrative ? <Text variant="editorial">{briefing.narrative}</Text> : null}

        {audio.error ? (
          <Text variant="micro" tone="tertiary">
            {t('briefing.audio.unavailable')}
          </Text>
        ) : null}

        {BRIEFING_SECTIONS.map((section: BriefingSection) => {
          const sectionItems = items.filter((item) => item.section === section)
          if (sectionItems.length === 0) return null
          return (
            <View key={section}>
              <SectionHeader title={t(`briefing.section.${section}`)} />
              <View style={{ gap: spacing.sm }}>
                {sectionItems.map((item) => (
                  <Card key={item.id} style={{ gap: spacing.xxs }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                      {item.importance === 'critical' || item.importance === 'high' ? (
                        <Badge
                          label={t(`email.importance.${item.importance}`)}
                          tone={item.importance === 'critical' ? 'critical' : 'warning'}
                        />
                      ) : null}
                    </View>
                    <Text variant="bodyStrong">{item.title}</Text>
                    {item.detail ? (
                      <Text variant="secondary" tone="secondary">
                        {item.detail}
                      </Text>
                    ) : null}
                    {item.source ? (
                      <SourceChip
                        source={item.source}
                        {...(item.relatedEntityId ? { onPress: () => openItem(item) } : {})}
                      />
                    ) : item.relatedEntityId ? (
                      <Pressable
                        onPress={() => openItem(item)}
                        haptic="light"
                        scaleOnPress={false}
                        accessibilityLabel={t('briefing.item.openSource')}
                        style={{ minHeight: 0, paddingTop: spacing.xxs }}
                      >
                        <Text variant="micro" tone="primary">
                          {t('briefing.item.openSource')}
                        </Text>
                      </Pressable>
                    ) : null}
                  </Card>
                ))}
              </View>
            </View>
          )
        })}

        {briefing.stats ? (
          <Card tone="paper" style={{ gap: spacing.xxs }}>
            <Text variant="caption" tone="tertiary">
              {t('briefing.stats.timeSaved', { minutes: briefing.stats.estimatedMinutesSaved })}
            </Text>
            <Text variant="secondary" tone="secondary">
              {t('mail.summary.line', {
                scanned: briefing.stats.emailsAnalyzed,
                surfaced: briefing.stats.importantCount,
              })}
            </Text>
          </Card>
        ) : null}

        <Button
          label={t('briefing.regenerate')}
          onPress={() => regenerate.mutate()}
          variant="ghost"
          size="sm"
          loading={regenerate.isPending}
          testID="briefing-regenerate"
        />

        {regenerateSkipped ? (
          <Text variant="micro" tone="tertiary" center>
            {t('empty.briefing.skipped')}
          </Text>
        ) : null}

        {regenerate.isError ? (
          <Text variant="micro" tone="critical" center>
            {t(errorMessageKey(regenerate.error))}
          </Text>
        ) : null}

        <Text variant="micro" tone="tertiary" center>
          {t('briefing.signature')}
        </Text>
      </View>
    </Screen>
  )
}
