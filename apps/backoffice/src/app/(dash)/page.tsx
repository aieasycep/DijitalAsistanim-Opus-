import { isAppError, systemClock } from '@da/domain'
import type { Metadata } from 'next'
import {
  Badge,
  Card,
  CardError,
  type Column,
  DataTable,
  Filters,
  Mono,
  PageHeader,
  StatGrid,
  StatTile,
  connectionTone,
  countTone,
} from '@/components/ui'
import { requireStaff } from '@/lib/auth'
import {
  queryView,
  queryViewOne,
  type BoAccountRow,
  type BoAuditRow,
  type BoPlatformOverviewRow,
} from '@/lib/db'
import {
  formatCompact,
  formatCostMicros,
  formatDateTime,
  formatNumber,
  formatRelative,
  shortId,
} from '@/lib/format'
import { enumLabels, labelFor, messages } from '@/lib/messages'

export const metadata: Metadata = { title: messages.overview.title }
export const dynamic = 'force-dynamic'

/**
 * The operations landing page.
 *
 * Three queries, each isolated: the headline counters come from
 * `bo_platform_overview` (one row, all aggregation done in Postgres), and two
 * work queues come from `bo_audit` and `bo_accounts`. Each is settled
 * independently so one failing view degrades its own panel instead of blanking
 * the page — which is the pattern every other backoffice page should copy.
 */

const WINDOW_PARAM = 'aralik'

const WINDOWS = {
  '24s': { hours: 24, label: messages.overview.window24h },
  '7g': { hours: 24 * 7, label: messages.overview.window7d },
  '30g': { hours: 24 * 30, label: messages.overview.window30d },
} as const

type WindowKey = keyof typeof WINDOWS

function parseWindow(raw: string | string[] | undefined): WindowKey {
  return typeof raw === 'string' && raw in WINDOWS ? (raw as WindowKey) : '24s'
}

/** A query result that carries its own failure instead of throwing upward. */
type Settled<T> = { ok: true; value: T } | { ok: false; message: string }

async function settle<T>(run: () => Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await run() }
  } catch (error) {
    if (isAppError(error) && error.code === 'forbidden') {
      return { ok: false, message: messages.errors.forbidden }
    }
    return { ok: false, message: messages.errors.queryFailed }
  }
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireStaff()
  const params = await searchParams
  const windowKey = parseWindow(params[WINDOW_PARAM])
  const since = new Date(
    systemClock.now().getTime() - WINDOWS[windowKey].hours * 60 * 60 * 1000,
  ).toISOString()

  const [overview, audit, accountsAtRisk] = await Promise.all([
    settle(() => queryViewOne('bo_platform_overview')),
    settle(() =>
      queryView('bo_audit', {
        filters: [{ column: 'created_at', op: 'gte', value: since }],
        order: { column: 'created_at', ascending: false },
        limit: 12,
      }),
    ),
    settle(() =>
      queryView('bo_accounts', {
        filters: [{ column: 'status', op: 'in', value: ['error', 'expired', 'revoked'] }],
        order: { column: 'last_error_at', ascending: false },
        limit: 10,
      }),
    ),
  ])

  return (
    <>
      <PageHeader
        title={messages.overview.title}
        description={messages.overview.description}
        action={
          overview.ok && overview.value ? (
            <span className="text-[11px] text-faint">
              <span className="bo-kicker mr-1">{messages.overview.generatedAt}</span>
              {formatDateTime(overview.value.generated_at)}
            </span>
          ) : null
        }
      >
        <Filters
          controls={[
            {
              kind: 'segmented',
              param: WINDOW_PARAM,
              label: messages.overview.windowLabel,
              options: (Object.keys(WINDOWS) as WindowKey[]).map((key) => ({
                value: key,
                label: WINDOWS[key].label,
              })),
            },
          ]}
          values={{ [WINDOW_PARAM]: windowKey }}
          resetParams={[]}
        />
      </PageHeader>

      <div className="flex flex-col gap-4">
        {overview.ok ? (
          overview.value ? (
            <OverviewCounters row={overview.value} />
          ) : (
            <Card title={messages.overview.sectionPeople}>
              <CardError
                message={messages.errors.queryFailed}
                hint={messages.errors.queryFailedHint}
              />
            </Card>
          )
        ) : (
          <Card title={messages.overview.sectionPeople}>
            <CardError message={overview.message} hint={messages.errors.queryFailedHint} />
          </Card>
        )}

        <div className="grid gap-4 xl:grid-cols-2">
          <Card
            title={messages.overview.accountsAtRisk}
            description={messages.app.privacyBanner}
            flush
          >
            <DataTable
              columns={accountColumns}
              rows={accountsAtRisk.ok ? accountsAtRisk.value : []}
              rowKey={(row) => row.account_id}
              error={accountsAtRisk.ok ? null : accountsAtRisk.message}
              errorHint={messages.errors.queryFailedHint}
              emptyMessage={messages.overview.accountsAtRiskEmpty}
              rowTone={(row) => (row.status === 'error' ? 'critical' : 'warning')}
              caption={messages.overview.accountsAtRisk}
            />
          </Card>

          <Card title={messages.overview.recentAudit} description={WINDOWS[windowKey].label} flush>
            <DataTable
              columns={auditColumns}
              rows={audit.ok ? audit.value : []}
              rowKey={(row) => row.audit_id}
              error={audit.ok ? null : audit.message}
              errorHint={messages.errors.queryFailedHint}
              emptyMessage={messages.overview.recentAuditEmpty}
              caption={messages.overview.recentAudit}
            />
          </Card>
        </div>
      </div>
    </>
  )
}

function OverviewCounters({ row }: { row: BoPlatformOverviewRow }) {
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h2 className="bo-kicker mb-2">{messages.overview.sectionPeople}</h2>
        <StatGrid>
          <StatTile
            label={messages.overview.userTotal}
            value={formatCompact(row.user_total)}
            hint={`${formatNumber(row.user_deleted_total)} ${messages.overview.userDeleted.toLocaleLowerCase('tr-TR')}`}
          />
          <StatTile label={messages.overview.userNew24h} value={formatNumber(row.user_new_24h)} />
          <StatTile label={messages.overview.userNew7d} value={formatNumber(row.user_new_7d)} />
          <StatTile
            label={messages.overview.userActive7d}
            value={formatCompact(row.user_active_7d)}
          />
        </StatGrid>
      </section>

      <section>
        <h2 className="bo-kicker mb-2">{messages.overview.sectionPipeline}</h2>
        <StatGrid>
          <StatTile
            label={messages.overview.subscriptionActive}
            value={formatNumber(row.subscription_active)}
            tone="success"
          />
          <StatTile
            label={messages.overview.accountTotal}
            value={formatCompact(row.account_total)}
          />
          <StatTile
            label={messages.overview.approvalPending}
            value={formatNumber(row.approval_pending)}
            tone="info"
          />
          <StatTile
            label={messages.overview.exportOpen}
            value={formatNumber(row.export_open)}
            tone={row.export_open > 0 ? 'warning' : 'neutral'}
          />
        </StatGrid>
      </section>

      <section>
        <h2 className="bo-kicker mb-2">{messages.overview.sectionRisk}</h2>
        <StatGrid>
          <StatTile
            label={messages.overview.accountError}
            value={formatNumber(row.account_error)}
            tone={countTone(row.account_error)}
          />
          <StatTile
            label={messages.overview.syncError}
            value={formatNumber(row.sync_error)}
            tone={countTone(row.sync_error)}
            hint={`${formatNumber(row.sync_stalled)} ${messages.overview.syncStalled.toLocaleLowerCase('tr-TR')}`}
          />
          <StatTile
            label={messages.overview.approvalOverdue}
            value={formatNumber(row.approval_overdue)}
            tone={countTone(row.approval_overdue)}
            hint={`${formatNumber(row.approval_failed_24h)} ${messages.overview.approvalFailed24h.toLocaleLowerCase('tr-TR')}`}
          />
          <StatTile
            label={messages.overview.briefingFailed24h}
            value={formatNumber(row.briefing_failed_24h)}
            tone={countTone(row.briefing_failed_24h)}
            hint={`${formatNumber(row.notification_failed_24h)} ${messages.overview.notificationFailed24h.toLocaleLowerCase('tr-TR')}`}
          />
        </StatGrid>
      </section>

      <section>
        <h2 className="bo-kicker mb-2">{messages.overview.sectionCost}</h2>
        <StatGrid>
          <StatTile
            label={messages.overview.aiCost24h}
            value={formatCostMicros(row.ai_cost_micros_24h)}
          />
          <StatTile
            label={messages.overview.aiCost30d}
            value={formatCostMicros(row.ai_cost_micros_30d)}
          />
          <StatTile
            label={messages.overview.subscriptionBillingIssue}
            value={formatNumber(row.subscription_billing_issue)}
            tone={countTone(row.subscription_billing_issue)}
          />
          <StatTile label={messages.overview.staffActive} value={formatNumber(row.staff_active)} />
        </StatGrid>
      </section>
    </div>
  )
}

const accountColumns: readonly Column<BoAccountRow>[] = [
  {
    key: 'user',
    header: messages.fields.userId,
    cell: (row) => (
      <div className="flex flex-col">
        <Mono>{shortId(row.user_id)}</Mono>
        <span className="text-[11px] text-faint">{row.email_redacted ?? row.email_domain}</span>
      </div>
    ),
  },
  {
    key: 'provider',
    header: messages.fields.provider,
    cell: (row) => labelFor(enumLabels.provider, row.provider),
  },
  {
    key: 'status',
    header: messages.fields.status,
    cell: (row) => (
      <Badge tone={connectionTone(row.status)} dot>
        {labelFor(enumLabels.connectionStatus, row.status)}
      </Badge>
    ),
  },
  {
    key: 'error',
    header: messages.fields.lastErrorCode,
    secondary: true,
    cell: (row) => (row.last_error_code ? <Mono>{row.last_error_code}</Mono> : null),
  },
  {
    key: 'when',
    header: messages.fields.lastRunAt,
    align: 'right',
    cell: (row) => (
      <span title={formatDateTime(row.last_error_at ?? row.last_synced_at)}>
        {formatRelative(row.last_error_at ?? row.last_synced_at)}
      </span>
    ),
  },
]

const ACTOR_LABEL: Record<string, string> = {
  staff: messages.audit.actorStaff,
  system: messages.audit.actorSystem,
  user: messages.audit.actorUser,
}

const auditColumns: readonly Column<BoAuditRow>[] = [
  {
    key: 'when',
    header: messages.fields.createdAt,
    width: 'w-28',
    cell: (row) => (
      <span title={formatDateTime(row.created_at)} className="text-[12px]">
        {formatRelative(row.created_at)}
      </span>
    ),
  },
  {
    key: 'action',
    header: messages.fields.action,
    cell: (row) => {
      const action = row.action
      if (!action) return null
      return (
        <div className="flex flex-col">
          <span>{messages.audit.actions[action] ?? action}</span>
          {row.staff_reason ? (
            <span className="text-[11px] text-faint">{row.staff_reason}</span>
          ) : null}
        </div>
      )
    },
  },
  {
    key: 'actor',
    header: messages.fields.actor,
    secondary: true,
    cell: (row) => {
      if (!row.actor) return null
      return (
        <div className="flex flex-col">
          <span className="text-[12px]">{ACTOR_LABEL[row.actor] ?? row.actor}</span>
          {row.staff_user_id ? <Mono>{shortId(row.staff_user_id)}</Mono> : null}
        </div>
      )
    },
  },
  {
    key: 'subject',
    header: messages.fields.entity,
    align: 'right',
    cell: (row) => (row.subject_user_id ? <Mono>{shortId(row.subject_user_id)}</Mono> : null),
  },
]
