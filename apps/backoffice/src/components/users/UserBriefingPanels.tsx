import { BRIEFING_KINDS, type BriefingKind, type Entitlements } from '@da/domain'
import { Badge, Card, CardError, type Column, DataTable, Mono, Num } from '@/components/ui'
import type {
  BoAuditRow,
  BoBriefingHealthRow,
  BoNotificationHealthRow,
  BoUserDetailRow,
} from '@/lib/db'
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatRelative,
  shortId,
} from '@/lib/format'
import { labelFor, messages } from '@/lib/messages'
import { briefingKindAllowed, type Settled } from '@/lib/queries/users'
import { DefinitionList, PanelNote, type Definition } from './DefinitionList'
import { RegenerateBriefingForm } from './RegenerateBriefingForm'
import { userEnumLabels, userMessages } from './messages'

/**
 * Briefing generation and notification delivery.
 *
 * This is the part of the screen a "my briefing did not arrive" call actually
 * lands on, and it is shaped by one honest limitation: per-user delivery
 * outcomes do not exist here. A `notification_deliveries` row carries the title
 * and body that were pushed, so 0017 aggregates it by day and category instead
 * of projecting it per user, and no amount of application code can widen that.
 *
 * So the screen answers the question in the two halves it can answer truthfully:
 * what is true of this account (does it have a device to receive anything, how
 * many briefings it has had in the last thirty days), and what is true of the
 * pipeline this week (whether anyone's briefing was generated and delivered at
 * all). Between them those separate "the platform broke" from "this account is
 * misconfigured", which is the distinction support is really making. The rest
 * is stated as unavailable rather than approximated.
 */

const briefingHealthColumns: readonly Column<BoBriefingHealthRow>[] = [
  {
    key: 'date',
    header: userMessages.detail.briefingDate,
    cell: (row) => formatDate(row.for_date),
  },
  {
    key: 'kind',
    header: userMessages.detail.briefingKind,
    cell: (row) => labelFor(userEnumLabels.briefingKind, row.kind),
  },
  {
    key: 'ready',
    header: userMessages.detail.briefingReady,
    align: 'right',
    cell: (row) => <Num>{formatNumber(row.ready_count)}</Num>,
  },
  {
    key: 'failed',
    header: userMessages.detail.briefingFailed,
    align: 'right',
    cell: (row) => (
      <Num>
        <span className={row.failed_count > 0 ? 'text-critical-text' : undefined}>
          {formatNumber(row.failed_count)}
        </span>
      </Num>
    ),
  },
  {
    key: 'pending',
    header: userMessages.detail.briefingQueued,
    align: 'right',
    secondary: true,
    cell: (row) => <Num>{formatNumber(row.queued_count + row.generating_count)}</Num>,
  },
  {
    key: 'skipped',
    header: userMessages.detail.briefingSkipped,
    align: 'right',
    secondary: true,
    cell: (row) => <Num>{formatNumber(row.skipped_count)}</Num>,
  },
  {
    key: 'opened',
    header: userMessages.detail.briefingOpened,
    align: 'right',
    secondary: true,
    cell: (row) => <Num>{formatNumber(row.opened_count)}</Num>,
  },
  {
    key: 'avg',
    header: userMessages.detail.briefingAvgSeconds,
    align: 'right',
    secondary: true,
    cell: (row) => formatDuration(row.avg_generation_seconds),
  },
]

export function UserBriefingPanel({
  row,
  health,
}: {
  row: BoUserDetailRow
  health: Settled<readonly BoBriefingHealthRow[]>
}) {
  const userItems: readonly Definition[] = [
    {
      term: userMessages.detail.countBriefingsReady,
      value: (
        <Badge tone={row.briefing_ready_count_30d > 0 ? 'success' : 'warning'}>
          {formatNumber(row.briefing_ready_count_30d)}
        </Badge>
      ),
    },
    {
      term: userMessages.detail.countBriefingsFailed,
      value: (
        <Badge tone={row.briefing_failed_count_30d > 0 ? 'critical' : 'neutral'}>
          {formatNumber(row.briefing_failed_count_30d)}
        </Badge>
      ),
    },
  ]

  return (
    <Card
      title={userMessages.detail.sectionBriefings}
      description={userMessages.detail.briefingPlatformHint}
    >
      <div className="flex flex-col gap-3">
        <section>
          <h3 className="bo-kicker mb-1.5">{userMessages.detail.briefingUserWindow}</h3>
          <DefinitionList items={userItems} />
        </section>

        <PanelNote>{userMessages.detail.briefingUserNote}</PanelNote>

        <section>
          <h3 className="bo-kicker mb-1.5">{userMessages.detail.briefingPlatform}</h3>
          <DataTable
            columns={briefingHealthColumns}
            rows={health.ok ? health.value : []}
            rowKey={(entry) => `${entry.for_date}-${entry.kind}`}
            error={health.ok ? null : health.message}
            errorHint={messages.errors.queryFailedHint}
            emptyMessage={userMessages.detail.briefingPlatformEmpty}
            caption={userMessages.detail.briefingCaption}
            rowTone={(entry) => (entry.failed_count > 0 ? 'critical' : 'default')}
          />
        </section>
      </div>
    </Card>
  )
}

const notificationColumns: readonly Column<BoNotificationHealthRow>[] = [
  {
    key: 'date',
    header: userMessages.detail.notificationDate,
    cell: (row) => formatDate(row.delivery_date),
  },
  {
    key: 'category',
    header: userMessages.detail.notificationCategory,
    cell: (row) => labelFor(userEnumLabels.notificationCategory, row.category),
  },
  {
    key: 'sent',
    header: userMessages.detail.notificationSent,
    align: 'right',
    cell: (row) => <Num>{formatNumber(row.sent_count)}</Num>,
  },
  {
    key: 'delivered',
    header: userMessages.detail.notificationDelivered,
    align: 'right',
    cell: (row) => <Num>{formatNumber(row.delivered_count)}</Num>,
  },
  {
    key: 'failed',
    header: userMessages.detail.notificationFailed,
    align: 'right',
    cell: (row) => (
      <Num>
        <span className={row.failed_count > 0 ? 'text-critical-text' : undefined}>
          {formatNumber(row.failed_count)}
        </span>
      </Num>
    ),
  },
  {
    key: 'attempts',
    header: userMessages.detail.notificationAttempts,
    align: 'right',
    secondary: true,
    cell: (row) =>
      row.avg_attempt_count === null ? null : (
        <Num>{row.avg_attempt_count.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</Num>
      ),
  },
]

export function UserNotificationPanel({
  row,
  health,
}: {
  row: BoUserDetailRow
  health: Settled<readonly BoNotificationHealthRow[]>
}) {
  return (
    <Card title={userMessages.detail.sectionNotifications}>
      <div className="flex flex-col gap-3">
        <DefinitionList
          items={[
            {
              term: userMessages.detail.notificationDevices,
              value: (
                <Badge tone={row.device_count === 0 ? 'critical' : 'success'}>
                  {formatNumber(row.device_count)}
                </Badge>
              ),
            },
          ]}
        />

        {row.device_count === 0 ? (
          <CardError message={userMessages.detail.notificationNoDevice} />
        ) : null}

        <PanelNote>{userMessages.detail.notificationPerUserNote}</PanelNote>

        <section>
          <h3 className="bo-kicker mb-1.5">{userMessages.detail.notificationPlatform}</h3>
          <DataTable
            columns={notificationColumns}
            rows={health.ok ? health.value : []}
            rowKey={(entry) => `${entry.delivery_date}-${entry.category}`}
            error={health.ok ? null : health.message}
            errorHint={messages.errors.queryFailedHint}
            emptyMessage={userMessages.detail.notificationPlatformEmpty}
            caption={userMessages.detail.notificationCaption}
            rowTone={(entry) => (entry.failed_count > 0 ? 'critical' : 'default')}
          />
        </section>
      </div>
    </Card>
  )
}

/** `2026-09-08:morning` → a date and a kind an operator can read. */
function describeTarget(entityId: string | null): string {
  if (!entityId) return '—'
  const separator = entityId.lastIndexOf(':')
  if (separator <= 0) return entityId
  const date = entityId.slice(0, separator)
  const kind = entityId.slice(separator + 1)
  return `${formatDate(date)} · ${labelFor(userEnumLabels.briefingKind, kind)}`
}

/** Widened to a plain record so an unmapped tier falls back to its token. */
const ROLE_LABEL: Record<string, string> = { ...messages.roles }

const historyColumns: readonly Column<BoAuditRow>[] = [
  {
    key: 'when',
    header: userMessages.regenerate.historyWhen,
    width: 'w-28',
    cell: (row) => (
      <span title={formatDateTime(row.created_at)}>{formatRelative(row.created_at)}</span>
    ),
  },
  {
    key: 'target',
    header: userMessages.regenerate.historyTarget,
    cell: (row) => describeTarget(row.entity_id),
  },
  {
    key: 'staff',
    header: userMessages.regenerate.historyStaff,
    secondary: true,
    cell: (row) => (
      <div className="flex flex-col">
        <Mono>{shortId(row.staff_user_id)}</Mono>
        {row.staff_role ? (
          <span className="text-[11px] text-faint">
            {ROLE_LABEL[row.staff_role] ?? row.staff_role}
          </span>
        ) : null}
      </div>
    ),
  },
  {
    key: 'reason',
    header: userMessages.regenerate.historyReason,
    cell: (row) => row.staff_reason,
  },
]

export function RegenerateBriefingPanel({
  row,
  entitlements,
  history,
  maxReasonLength,
}: {
  row: BoUserDetailRow
  entitlements: Entitlements
  history: Settled<readonly BoAuditRow[]>
  maxReasonLength: number
}) {
  const allowedKinds: readonly BriefingKind[] = BRIEFING_KINDS.filter((kind) =>
    briefingKindAllowed(entitlements, kind),
  )

  // The two states in which the request could never be honoured are shown as
  // the answer they are, rather than as a button that submits and is refused.
  const blocker = row.is_deleted
    ? userMessages.regenerate.errorDeleted
    : row.account_connected_count === 0
      ? userMessages.regenerate.errorNoAccount
      : null

  return (
    <Card title={userMessages.regenerate.title} description={userMessages.regenerate.description}>
      <div className="flex flex-col gap-4">
        {blocker ? (
          <CardError message={blocker} />
        ) : (
          <RegenerateBriefingForm
            userId={row.user_id}
            allowedKinds={allowedKinds}
            maxReasonLength={maxReasonLength}
          />
        )}

        <section>
          <h3 className="bo-kicker mb-1.5">{userMessages.regenerate.historyTitle}</h3>
          <DataTable
            columns={historyColumns}
            rows={history.ok ? history.value : []}
            rowKey={(entry) => entry.audit_id}
            error={history.ok ? null : history.message}
            errorHint={messages.errors.queryFailedHint}
            emptyMessage={userMessages.regenerate.historyEmpty}
            caption={userMessages.regenerate.historyCaption}
          />
        </section>
      </div>
    </Card>
  )
}
