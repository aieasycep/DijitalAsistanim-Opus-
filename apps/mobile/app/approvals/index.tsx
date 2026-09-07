import { spacing } from '@da/design-tokens'
import type { ApprovalStatus } from '@da/domain'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { ApprovalCard } from '../../src/components/cards/ApprovalCard'
import { SegmentedControl } from '../../src/components/ui/Controls'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { EmptyState, ErrorState, SkeletonCard } from '../../src/components/ui/States'
import { Text } from '../../src/components/ui/Text'
import { useApprovals } from '../../src/hooks/queries'
import { useApprovalFlow } from '../../src/hooks/useApprovalFlow'
import { useUserContext } from '../../src/hooks/useUserContext'
import { useT } from '../../src/i18n/I18nProvider'
import { errorMessageKey, isRetryable } from '../../src/lib/query-client'

type Tab = 'pending' | 'history'

/**
 * The approval centre.
 *
 * Everything the assistant wants to do outside the app lands here first, and
 * the history tab keeps the record afterwards — including what failed and why,
 * which is the part users check when they stop trusting an automation.
 */
export default function ApprovalsScreen() {
  const t = useT()
  const router = useRouter()
  const { timeZone } = useUserContext()
  const [tab, setTab] = useState<Tab>('pending')
  const { decide, retry, isDeciding } = useApprovalFlow()

  const status: ApprovalStatus | 'all' = tab === 'pending' ? 'pending' : 'all'
  const query = useApprovals(status)

  const approvals = (query.data ?? []).filter((approval) =>
    tab === 'pending' ? approval.status === 'pending' : approval.status !== 'pending',
  )

  const header = (
    <View style={{ gap: spacing.sm }}>
      <ScreenHeader title={t('approval.title')} subtitle={t('approval.subtitle')} />
      <SegmentedControl<Tab>
        options={[
          { value: 'pending', label: t('approval.pendingTab') },
          { value: 'history', label: t('approval.historyTab') },
        ]}
        value={tab}
        onChange={setTab}
        testID="approvals-tabs"
      />
    </View>
  )

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      {header}

      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        {query.isLoading && approvals.length === 0 ? (
          <SkeletonCard />
        ) : query.isError && approvals.length === 0 ? (
          <ErrorState
            message={t(errorMessageKey(query.error))}
            {...(isRetryable(query.error)
              ? { retryLabel: t('common.action.retry'), onRetry: () => void query.refetch() }
              : {})}
          />
        ) : approvals.length === 0 ? (
          <EmptyState
            icon="task-alt"
            title={tab === 'pending' ? t('empty.approval.title') : t('empty.approval.history')}
            description={tab === 'pending' ? t('empty.approval.hint') : undefined}
          />
        ) : (
          approvals.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              timeZone={timeZone}
              compact
              busy={isDeciding}
              onApprove={() => void decide({ approvalId: approval.id, decision: 'approve' })}
              onReject={() => void decide({ approvalId: approval.id, decision: 'reject' })}
              onEdit={() => router.push(`/approval/${approval.id}`)}
              {...(approval.status === 'failed'
                ? { onRetry: () => void retry(approval.id) }
                : {})}
              {...(approval.source
                ? { onOpenSource: () => router.push(`/approval/${approval.id}`) }
                : {})}
              testID={`approval-${approval.id}`}
            />
          ))
        )}
      </View>

      <Text variant="micro" tone="tertiary" center style={{ marginTop: spacing.lg }}>
        {t('approval.promise')}
      </Text>
    </Screen>
  )
}
