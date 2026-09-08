import {
  DEFAULT_RETENTION,
  RETENTION_DAYS,
  RETENTION_SWEEP,
  RETENTION_WINDOWS,
  retentionCutoff,
  systemClock,
  type Clock,
  type RetentionWindow,
} from '@da/domain'
import { Badge, Card, type Column, DataTable, Mono, Num } from '@/components/ui'
import type { BoAuditRow } from '@/lib/db'
import { formatDate, formatDateTime, formatNumber, formatRelative, shortId } from '@/lib/format'
import { labelFor, messages } from '@/lib/messages'
import type { Settled } from '@/lib/queries/users'
import { PanelNote } from './DefinitionList'
import { userEnumLabels, userMessages } from './messages'

/**
 * Retention, the privacy boundary, and this account's audit trail.
 *
 * The retention tables are read straight out of @da/domain — the same constants
 * `cleanup_expired_retention()` is written against — so the dates an operator
 * quotes to a user are the dates the sweep will actually act on. The user's own
 * choice of window is a `user_preferences` column that no `bo_*` view projects,
 * and the panel says so rather than showing the default as if it were theirs.
 */

interface RetentionRow {
  window: RetentionWindow
  days: number | null
  cutoff: string | null
}

const retentionColumns: readonly Column<RetentionRow>[] = [
  {
    key: 'window',
    header: userMessages.detail.retentionWindow,
    cell: (row) => (
      <span className="flex items-center gap-1.5">
        {labelFor(userEnumLabels.retentionWindow, row.window)}
        {row.window === DEFAULT_RETENTION ? (
          <Badge tone="primary">{userMessages.detail.retentionDefault}</Badge>
        ) : null}
      </span>
    ),
  },
  {
    key: 'days',
    header: userMessages.detail.retentionDays,
    align: 'right',
    cell: (row) =>
      row.days === null ? (
        <span className="text-faint">{userMessages.detail.retentionForever}</span>
      ) : (
        <Num>
          {formatNumber(row.days)} {messages.units.days}
        </Num>
      ),
  },
  {
    key: 'cutoff',
    header: userMessages.detail.retentionCutoff,
    align: 'right',
    cell: (row) => (row.cutoff === null ? null : formatDate(row.cutoff)),
  },
]

interface SweepRow {
  table: string
  window: string
  anonymized: boolean
}

const sweepColumns: readonly Column<SweepRow>[] = [
  {
    key: 'table',
    header: userMessages.detail.retentionTable,
    cell: (row) => (
      <div className="flex flex-col">
        <span>{labelFor(userEnumLabels.retentionTable, row.table)}</span>
        <Mono>{row.table}</Mono>
      </div>
    ),
  },
  {
    key: 'window',
    header: userMessages.detail.retentionDays,
    align: 'right',
    cell: (row) => row.window,
  },
  {
    key: 'anonymized',
    header: userMessages.detail.retentionAnonymize,
    align: 'right',
    secondary: true,
    cell: (row) => (row.anonymized ? <Badge tone="info">{userMessages.common.yes}</Badge> : null),
  },
]

export function UserRetentionPanel({ clock = systemClock }: { clock?: Clock }) {
  const now = clock.now()

  const windows: readonly RetentionRow[] = RETENTION_WINDOWS.map((window) => {
    const cutoff = retentionCutoff(window, now)
    return {
      window,
      days: RETENTION_DAYS[window],
      cutoff: cutoff === null ? null : cutoff.toISOString(),
    }
  })

  const sweeps: readonly SweepRow[] = RETENTION_SWEEP.map((entry) => ({
    table: entry.table,
    window:
      entry.fixedDays === undefined
        ? userMessages.detail.retentionUserChoice
        : `${formatNumber(entry.fixedDays)} ${messages.units.days}`,
    anonymized: (entry.anonymizeColumns?.length ?? 0) > 0,
  }))

  return (
    <Card
      title={userMessages.detail.sectionRetention}
      description={userMessages.detail.retentionTitle}
    >
      <div className="flex flex-col gap-3">
        <DataTable
          columns={retentionColumns}
          rows={windows}
          rowKey={(row) => row.window}
          caption={userMessages.detail.retentionTitle}
        />

        <section>
          <h3 className="bo-kicker mb-1.5">{userMessages.detail.retentionFixedTitle}</h3>
          <DataTable
            columns={sweepColumns}
            rows={sweeps}
            rowKey={(row) => row.table}
            caption={userMessages.detail.retentionFixedTitle}
          />
          <p className="mt-1.5 text-[11px] text-faint">{userMessages.detail.retentionFixedNote}</p>
        </section>

        <PanelNote>{userMessages.detail.retentionNote}</PanelNote>
      </div>
    </Card>
  )
}

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
      <span title={formatDateTime(row.created_at)}>{formatRelative(row.created_at)}</span>
    ),
  },
  {
    key: 'action',
    header: messages.fields.action,
    cell: (row) => {
      if (!row.action) return null
      return (
        <div className="flex flex-col">
          <span>{labelFor(userEnumLabels.auditAction, row.action)}</span>
          <Mono>{row.action}</Mono>
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
    key: 'outcome',
    header: messages.fields.status,
    secondary: true,
    cell: (row) =>
      row.outcome ? (
        <Badge tone={row.outcome === 'success' ? 'success' : 'warning'}>{row.outcome}</Badge>
      ) : null,
  },
  {
    key: 'reason',
    header: messages.fields.reason,
    cell: (row) => row.staff_reason,
  },
]

export function UserAuditPanel({ audit }: { audit: Settled<readonly BoAuditRow[]> }) {
  return (
    <Card title={userMessages.detail.sectionAudit} flush>
      <DataTable
        columns={auditColumns}
        rows={audit.ok ? audit.value : []}
        rowKey={(row) => row.audit_id}
        error={audit.ok ? null : audit.message}
        errorHint={messages.errors.queryFailedHint}
        emptyMessage={userMessages.detail.auditEmpty}
        caption={userMessages.detail.auditCaption}
      />
    </Card>
  )
}

/**
 * The refusal, written down.
 *
 * This panel exists because the alternative is an operator concluding that the
 * missing fields are an oversight and filing a ticket to add them. Saying which
 * questions the tool cannot answer — and that the answer is to ask the user, not
 * to widen the view — is what keeps the guarantee from eroding one reasonable
 * request at a time.
 */
export function PrivacyBoundaryPanel() {
  return (
    <Card title={userMessages.detail.sectionBoundary}>
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-muted">{userMessages.detail.boundaryIntro}</p>
        <ul className="grid gap-1 sm:grid-cols-2">
          {userMessages.detail.boundaryItems.map((item) => (
            <li key={item} className="flex items-start gap-2 text-[13px] text-ink">
              <span
                aria-hidden="true"
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-critical"
              />
              {item}
            </li>
          ))}
        </ul>
        <PanelNote>{userMessages.detail.boundaryClosing}</PanelNote>
      </div>
    </Card>
  )
}
