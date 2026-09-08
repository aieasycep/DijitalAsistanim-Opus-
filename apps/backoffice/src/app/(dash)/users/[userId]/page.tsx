import { systemClock } from '@da/domain'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge, Mono, PageHeader } from '@/components/ui'
import {
  RegenerateBriefingPanel,
  UserBriefingPanel,
  UserNotificationPanel,
} from '@/components/users/UserBriefingPanels'
import { UserAccountsPanel, UserSyncPanel } from '@/components/users/UserConnectionPanels'
import {
  UserApprovalsPanel,
  UserCountTiles,
  UserPrivacyRequestsPanel,
} from '@/components/users/UserActivityPanels'
import {
  PrivacyBoundaryPanel,
  UserAuditPanel,
  UserRetentionPanel,
} from '@/components/users/UserPolicyPanels'
import {
  UserIdentityPanel,
  UserOnboardingPanel,
  UserPlanPanel,
} from '@/components/users/UserProfilePanels'
import { userMessages } from '@/components/users/messages'
import { isUserId } from '@/components/users/params'
import { MAX_REASON_LENGTH } from '@/lib/audit'
import { requirePermission } from '@/lib/auth'
import { shortId } from '@/lib/format'
import {
  deriveEntitlements,
  loadApprovalBreakdown,
  loadBriefingHealth,
  loadNotificationHealth,
  loadRegenerationRequests,
  loadUserAccounts,
  loadUserApprovals,
  loadUserAudit,
  loadUserDetail,
  loadUserPrivacyRequests,
  loadUserReferral,
  loadUserSyncHealth,
  settle,
} from '@/lib/queries/users'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ userId: string }>
}): Promise<Metadata> {
  const { userId } = await params
  // The title is an id, never an address: browser tabs, window titles and
  // screen-share previews all leak, and none of them should carry a person.
  return { title: `${userMessages.detail.kicker} ${shortId(userId)}` }
}

/**
 * One user, for answering "my briefing did not arrive".
 *
 * The page loads the row first, because a missing user is a 404 rather than a
 * page of empty panels. Everything else is fetched in parallel and settled
 * individually, so a view that fails renders its own error and the eleven
 * panels around it still answer the call.
 *
 * Every number here came out of Postgres: the tiles from the lateral aggregates
 * in `bo_user_detail`, the approval breakdown from seven `count=exact` head
 * requests, the pipeline tables from `bo_briefing_health` and
 * `bo_notification_health`. Nothing on the page is derived from a row that was
 * fetched in order to be counted, and nothing on it can be derived from
 * something a user wrote or received — the views have no such column to offer.
 */
export default async function UserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  await requirePermission('users.read')
  const { userId } = await params

  if (!isUserId(userId)) notFound()

  const detail = await loadUserDetail(userId)
  if (!detail) notFound()

  const [
    accounts,
    sync,
    approvalBreakdown,
    recentApprovals,
    referral,
    privacyRequests,
    briefingHealth,
    notificationHealth,
    regenerationHistory,
    audit,
  ] = await Promise.all([
    settle(() => loadUserAccounts(userId)),
    settle(() => loadUserSyncHealth(userId)),
    settle(() => loadApprovalBreakdown(userId)),
    settle(() => loadUserApprovals(userId)),
    settle(() => loadUserReferral(userId)),
    settle(() => loadUserPrivacyRequests(userId)),
    settle(() => loadBriefingHealth(systemClock)),
    settle(() => loadNotificationHealth(systemClock)),
    settle(() => loadRegenerationRequests(userId)),
    settle(() => loadUserAudit(userId)),
  ])

  const entitlements = deriveEntitlements(detail, systemClock)

  return (
    <>
      <PageHeader
        title={detail.email_redacted ?? shortId(detail.user_id)}
        description={userMessages.detail.description}
        kicker={
          <span className="flex flex-wrap items-center gap-2">
            {userMessages.detail.kicker}
            <Mono>{detail.user_id}</Mono>
            {detail.is_deleted ? (
              <Badge tone="critical">{userMessages.detail.deletedBadge}</Badge>
            ) : (
              <Badge tone="success">{userMessages.detail.activeBadge}</Badge>
            )}
          </span>
        }
        action={
          <Link
            href="/users"
            className="inline-flex h-7 items-center rounded-md border border-hairline px-2.5 text-[12px] font-medium text-muted transition-colors hover:border-primary/40 hover:text-ink"
          >
            {userMessages.detail.backToList}
          </Link>
        }
      />

      <div className="flex flex-col gap-4">
        <UserCountTiles row={detail} />

        <div className="grid gap-4 xl:grid-cols-3">
          <UserIdentityPanel row={detail} clock={systemClock} />
          <UserPlanPanel row={detail} entitlements={entitlements} referral={referral} />
          <UserOnboardingPanel row={detail} />
        </div>

        <UserAccountsPanel accounts={accounts} />
        <UserSyncPanel sync={sync} />

        <div className="grid gap-4 xl:grid-cols-2">
          <UserBriefingPanel row={detail} health={briefingHealth} />
          <UserNotificationPanel row={detail} health={notificationHealth} />
        </div>

        <RegenerateBriefingPanel
          row={detail}
          entitlements={entitlements}
          history={regenerationHistory}
          maxReasonLength={MAX_REASON_LENGTH}
        />

        <UserApprovalsPanel breakdown={approvalBreakdown} recent={recentApprovals} />

        <div className="grid gap-4 xl:grid-cols-2">
          <UserPrivacyRequestsPanel requests={privacyRequests} />
          <UserRetentionPanel clock={systemClock} />
        </div>

        <UserAuditPanel audit={audit} />
        <PrivacyBoundaryPanel />
      </div>
    </>
  )
}
