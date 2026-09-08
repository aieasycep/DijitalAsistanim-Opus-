import { spacing } from '@da/design-tokens'
import { type CommitmentStatus, systemClock } from '@da/domain'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { CommitmentCard } from '../../src/components/cards/CommitmentCard'
import { Button } from '../../src/components/ui/Button'
import { SegmentedControl } from '../../src/components/ui/Controls'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { EmptyState, ErrorState, SkeletonCard } from '../../src/components/ui/States'
import { useCommitments } from '../../src/hooks/queries'
import { useUserContext } from '../../src/hooks/useUserContext'
import { useT } from '../../src/i18n/I18nProvider'
import { errorMessageKey, isRetryable } from '../../src/lib/query-client'

type Filter = 'mine' | 'theirs' | 'done'

/**
 * A promise that is still owed.
 *
 * Snoozing defers a promise, it does not keep it, so a snoozed row belongs in
 * the direction tabs beside the open ones — and this screen is the only place
 * it can appear at all, since every server-side feed asks for `open` and
 * `overdue` only. Filing it under "Tamamlandı" told the user they had done
 * something they had merely postponed.
 */
const OWED_STATUSES: readonly CommitmentStatus[] = ['open', 'overdue', 'snoozed']

/**
 * Promises, both directions.
 *
 * Every row here was extracted from a real sentence in a real message, which is
 * why the card can always show the quote: a tracked promise the user does not
 * recognise is worse than no tracking at all.
 */
export default function CommitmentsScreen() {
  const t = useT()
  const router = useRouter()
  const { timeZone } = useUserContext()
  const [filter, setFilter] = useState<Filter>('mine')
  const query = useCommitments()

  const now = systemClock.now()
  const all = query.data ?? []
  const commitments = all.filter((commitment) => {
    const owed = OWED_STATUSES.includes(commitment.status)
    if (filter === 'done') return !owed
    if (!owed) return false
    return filter === 'mine'
      ? commitment.direction === 'user_owes'
      : commitment.direction === 'other_owes'
  })

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader
        title={t('commitment.title')}
        subtitle={t('commitment.subtitle')}
        actions={
          <Button
            label={t('commitment.action.addManually')}
            onPress={() => router.push('/commitment/new')}
            variant="ghost"
            size="sm"
            testID="commitment-add"
          />
        }
      />

      <SegmentedControl<Filter>
        options={[
          { value: 'mine', label: t('commitment.directionShort.user_owes') },
          { value: 'theirs', label: t('commitment.directionShort.other_owes') },
          { value: 'done', label: t('commitment.status.done') },
        ]}
        value={filter}
        onChange={setFilter}
        style={{ marginTop: spacing.sm }}
        testID="commitment-filter"
      />

      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        {query.isLoading && all.length === 0 ? (
          <SkeletonCard />
        ) : query.isError && all.length === 0 ? (
          <ErrorState
            message={t(errorMessageKey(query.error))}
            {...(isRetryable(query.error)
              ? { retryLabel: t('common.action.retry'), onRetry: () => void query.refetch() }
              : {})}
          />
        ) : commitments.length === 0 ? (
          <EmptyState
            icon="handshake"
            title={
              filter === 'theirs' ? t('empty.commitment.othersOwe') : t('empty.commitment.title')
            }
            description={t('empty.commitment.hint')}
          />
        ) : (
          commitments.map((commitment) => (
            <CommitmentCard
              key={commitment.id}
              commitment={commitment}
              timeZone={timeZone}
              now={now}
              onComplete={() => router.push(`/commitment/${commitment.id}`)}
              onSnooze={() => router.push(`/commitment/${commitment.id}`)}
              onOpenSource={() => router.push(`/commitment/${commitment.id}`)}
              testID={`commitment-${commitment.id}`}
            />
          ))
        )}
      </View>
    </Screen>
  )
}
