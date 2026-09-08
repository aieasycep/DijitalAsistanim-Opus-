import {
  Badge,
  Card,
  type Column,
  DataTable,
  Mono,
  Num,
  StatGrid,
  StatTile,
  approvalTone,
  countTone,
  exportTone,
} from '@/components/ui'
import type { BoApprovalRow, BoPrivacyRequestRow, BoUserDetailRow } from '@/lib/db'
import {
  formatBytes,
  formatCostMicros,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatRelative,
} from '@/lib/format'
import { enumLabels, labelFor, messages } from '@/lib/messages'
import type { ApprovalStatusCount, Settled } from '@/lib/queries/users'
import { userEnumLabels, userMessages } from './messages'

/**
 * The counters, the approval queue and the privacy requests.
 *
 * Every figure on this screen was produced by Postgres: the tiles come from the
 * lateral aggregates in `bo_user_detail`, and the status breakdown from seven
 * `count=exact` head requests against `bo_approvals`. Nothing is a length of an
 * array that was fetched to be measured — which matters most for approvals,
 * where each row is a drafted outgoing email and fetching one to count it would
 * be the exact mistake this tool exists to make impossible.
 */

export function UserCountTiles({ row }: { row: BoUserDetailRow }) {
  return (
    <div className="flex flex-col gap-2">
      <StatGrid>
        <StatTile
          label={userMessages.detail.countAccounts}
          value={formatNumber(row.account_connected_count)}
          hint={userMessages.detail.countAccountsHint(
            row.account_connected_count,
            row.account_count,
          )}
          tone={row.account_connected_count === 0 ? 'critical' : 'neutral'}
        />
        <StatTile
          label={userMessages.detail.countApprovalsPending}
          value={formatNumber(row.approval_pending_count)}
          tone={row.approval_pending_count > 0 ? 'info' : 'neutral'}
        />
        <StatTile
          label={userMessages.detail.countApprovalsFailed}
          value={formatNumber(row.approval_failed_count)}
          tone={countTone(row.approval_failed_count)}
        />
        <StatTile
          label={userMessages.detail.countDevices}
          value={formatNumber(row.device_count)}
          hint={userMessages.detail.countDevicesHint}
          tone={row.device_count === 0 ? 'critical' : 'neutral'}
        />
      </StatGrid>

      <StatGrid>
        <StatTile
          label={userMessages.detail.countBriefingsReady}
          value={formatNumber(row.briefing_ready_count_30d)}
          tone={row.briefing_ready_count_30d > 0 ? 'success' : 'warning'}
        />
        <StatTile
          label={userMessages.detail.countBriefingsFailed}
          value={formatNumber(row.briefing_failed_count_30d)}
          tone={countTone(row.briefing_failed_count_30d)}
        />
        <StatTile
          label={userMessages.detail.countCaptures}
          value={formatNumber(row.capture_count)}
          hint={`${formatNumber(row.capture_failed_count)} ${userMessages.detail.countCapturesFailed.toLocaleLowerCase('tr-TR')}`}
          tone={row.capture_failed_count > 0 ? 'warning' : 'neutral'}
        />
        <StatTile
          label={userMessages.detail.countExports}
          value={formatNumber(row.export_open_count)}
          hint={
            row.export_last_requested_at ? formatRelative(row.export_last_requested_at) : undefined
          }
          tone={row.export_open_count > 0 ? 'warning' : 'neutral'}
        />
      </StatGrid>

      <StatGrid>
        <StatTile
          label={userMessages.detail.countAiCost}
          value={formatCostMicros(row.ai_cost_micros_30d)}
        />
        <StatTile
          label={userMessages.detail.countAiEvents}
          value={formatNumber(row.ai_event_count_30d)}
        />
        <StatTile
          label={userMessages.detail.countAiLast}
          value={formatRelative(row.ai_last_event_at)}
          hint={formatDateTime(row.ai_last_event_at)}
        />
        <StatTile
          label={messages.fields.lastRunAt}
          value={formatRelative(row.sync_last_run_at)}
          hint={`${formatNumber(row.sync_error_count)} / ${formatNumber(row.sync_resource_count)}`}
          tone={row.sync_error_count > 0 ? 'critical' : 'neutral'}
        />
      </StatGrid>
    </div>
  )
}

const breakdownColumns: readonly Column<ApprovalStatusCount>[] = [
  {
    key: 'status',
    header: messages.fields.status,
    cell: (row) => (
      <Badge tone={approvalTone(row.status)} dot>
        {labelFor(enumLabels.approvalStatus, row.status)}
      </Badge>
    ),
  },
  {
    key: 'count',
    header: messages.fields.count,
    align: 'right',
    cell: (row) => <Num>{formatNumber(row.count)}</Num>,
  },
]

const approvalColumns: readonly Column<BoApprovalRow>[] = [
  {
    key: 'type',
    header: userMessages.detail.approvalType,
    cell: (row) => (
      <div className="flex flex-col">
        <span>{labelFor(userEnumLabels.approvalType, row.type)}</span>
        {row.source_type ? (
          <span className="text-[11px] text-faint">
            {labelFor(userEnumLabels.sourceType, row.source_type)}
          </span>
        ) : null}
      </div>
    ),
  },
  {
    key: 'status',
    header: messages.fields.status,
    cell: (row) => (
      <div className="flex flex-wrap items-center gap-1">
        <Badge tone={approvalTone(row.status)} dot>
          {labelFor(enumLabels.approvalStatus, row.status)}
        </Badge>
        {row.is_overdue ? (
          <Badge tone="warning">{userMessages.detail.approvalOverdue}</Badge>
        ) : null}
      </div>
    ),
  },
  {
    key: 'failure',
    header: messages.fields.lastErrorCode,
    secondary: true,
    cell: (row) => (
      <div className="flex flex-col">
        {row.failure_code ? <Mono>{row.failure_code}</Mono> : null}
        {row.attempt_count > 0 ? (
          <span className="text-[11px] text-faint">
            {userMessages.detail.approvalAttempts}: {formatNumber(row.attempt_count)}
          </span>
        ) : null}
      </div>
    ),
  },
  {
    key: 'timing',
    header: userMessages.detail.approvalDecision,
    align: 'right',
    secondary: true,
    cell: (row) => (
      <div className="flex flex-col items-end">
        <span>{formatDuration(row.decision_seconds)}</span>
        <span className="text-[11px] text-faint">
          {userMessages.detail.approvalExecution}: {formatDuration(row.execution_seconds)}
        </span>
      </div>
    ),
  },
  {
    key: 'created',
    header: messages.fields.createdAt,
    align: 'right',
    cell: (row) => (
      <span title={formatDateTime(row.created_at)}>{formatRelative(row.created_at)}</span>
    ),
  },
]

export function UserApprovalsPanel({
  breakdown,
  recent,
}: {
  breakdown: Settled<readonly ApprovalStatusCount[]>
  recent: Settled<readonly BoApprovalRow[]>
}) {
  const breakdownRows = breakdown.ok ? breakdown.value.filter((entry) => entry.count > 0) : []

  return (
    <Card title={userMessages.detail.sectionApprovals} flush>
      <div className="grid gap-0 xl:grid-cols-[minmax(0,18rem)_1fr]">
        <div className="border-b border-hairline xl:border-r xl:border-b-0">
          <h3 className="bo-kicker px-3 pt-3 pb-1">{userMessages.detail.approvalsBreakdown}</h3>
          <DataTable
            columns={breakdownColumns}
            rows={breakdownRows}
            rowKey={(entry) => entry.status}
            error={breakdown.ok ? null : breakdown.message}
            errorHint={messages.errors.queryFailedHint}
            emptyMessage={userMessages.detail.approvalsBreakdownEmpty}
            caption={userMessages.detail.approvalsBreakdown}
          />
        </div>

        <div>
          <h3 className="bo-kicker px-3 pt-3 pb-1">{userMessages.detail.approvalsRecent}</h3>
          <DataTable
            columns={approvalColumns}
            rows={recent.ok ? recent.value : []}
            rowKey={(row) => row.approval_id}
            error={recent.ok ? null : recent.message}
            errorHint={messages.errors.queryFailedHint}
            emptyMessage={userMessages.detail.approvalsRecentEmpty}
            caption={userMessages.detail.approvalsCaption}
            rowTone={(row) =>
              row.status === 'failed' ? 'critical' : row.is_overdue ? 'warning' : 'default'
            }
          />
        </div>
      </div>
    </Card>
  )
}

const privacyColumns: readonly Column<BoPrivacyRequestRow>[] = [
  {
    key: 'status',
    header: messages.fields.status,
    cell: (row) => (
      <div className="flex flex-col gap-0.5">
        <Badge tone={exportTone(row.status)} dot>
          {labelFor(enumLabels.exportStatus, row.status)}
        </Badge>
        {row.failure_code ? <Mono>{row.failure_code}</Mono> : null}
      </div>
    ),
  },
  {
    key: 'requested',
    header: userMessages.detail.privacyRequested,
    cell: (row) => (
      <span title={formatDateTime(row.requested_at)}>{formatRelative(row.requested_at)}</span>
    ),
  },
  {
    key: 'ready',
    header: userMessages.detail.privacyReady,
    secondary: true,
    cell: (row) => (
      <div className="flex flex-col">
        <span title={formatDateTime(row.ready_at)}>{formatRelative(row.ready_at)}</span>
        <span className="text-[11px] text-faint">
          {userMessages.detail.privacyFulfilment}:{' '}
          {row.fulfilment_minutes === null ? '—' : formatDuration(row.fulfilment_minutes * 60)}
        </span>
      </div>
    ),
  },
  {
    key: 'size',
    header: userMessages.detail.privacySize,
    align: 'right',
    secondary: true,
    cell: (row) => <Num>{formatBytes(row.size_bytes)}</Num>,
  },
  {
    key: 'expires',
    header: userMessages.detail.privacyExpires,
    align: 'right',
    cell: (row) => (
      <span title={formatDateTime(row.expires_at)}>
        {row.is_expired ? (
          <Badge tone="warning">{labelFor(enumLabels.exportStatus, 'expired')}</Badge>
        ) : (
          formatRelative(row.expires_at)
        )}
      </span>
    ),
  },
]

export function UserPrivacyRequestsPanel({
  requests,
}: {
  requests: Settled<readonly BoPrivacyRequestRow[]>
}) {
  return (
    <Card title={userMessages.detail.sectionPrivacyRequests} flush>
      <DataTable
        columns={privacyColumns}
        rows={requests.ok ? requests.value : []}
        rowKey={(row) => row.request_id}
        error={requests.ok ? null : requests.message}
        errorHint={messages.errors.queryFailedHint}
        emptyMessage={userMessages.detail.privacyRequestsEmpty}
        caption={userMessages.detail.privacyRequestsCaption}
        rowTone={(row) => (row.status === 'failed' ? 'critical' : 'default')}
      />
    </Card>
  )
}
