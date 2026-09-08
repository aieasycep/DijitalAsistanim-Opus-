import {
  Badge,
  Card,
  type Column,
  DataTable,
  Mono,
  Num,
  connectionTone,
  syncTone,
} from '@/components/ui'
import type { BoAccountRow, BoSyncHealthRow } from '@/lib/db'
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { enumLabels, labelFor, messages } from '@/lib/messages'
import { missingReadScopes, type Settled } from '@/lib/queries/users'
import { PanelNote } from './DefinitionList'
import { userMessages } from './messages'

/**
 * Connections and sync freshness — where "my briefing did not arrive" is
 * usually answered.
 *
 * The two failure modes that account for most of those calls are visible here
 * and nowhere else: an account whose grant is missing a read scope (the app
 * connected, then silently synced nothing), and a sync state that has not run
 * in far longer than its cadence. Both are computed from columns that describe
 * capability and timing, never from anything that was read out of a mailbox.
 */

const accountColumns: readonly Column<BoAccountRow>[] = [
  {
    key: 'provider',
    header: messages.fields.provider,
    cell: (row) => (
      <div className="flex flex-col">
        <span className="flex items-center gap-1.5">
          {labelFor(enumLabels.provider, row.provider)}
          {row.is_primary ? (
            <Badge tone="primary">{userMessages.detail.accountPrimary}</Badge>
          ) : null}
        </span>
        <span className="text-[11px] text-faint">
          {row.kinds.map((kind) => labelFor(enumLabels.accountKind, kind)).join(' · ')}
        </span>
      </div>
    ),
  },
  {
    key: 'status',
    header: messages.fields.status,
    cell: (row) => (
      <div className="flex flex-col gap-0.5">
        <Badge tone={connectionTone(row.status)} dot>
          {labelFor(enumLabels.connectionStatus, row.status)}
        </Badge>
        {row.last_error_code ? <Mono>{row.last_error_code}</Mono> : null}
      </div>
    ),
  },
  {
    key: 'email',
    header: messages.fields.email,
    secondary: true,
    cell: (row) => <Mono>{row.email_redacted ?? row.email_domain}</Mono>,
  },
  {
    key: 'scopes',
    header: userMessages.detail.accountScopes,
    align: 'right',
    cell: (row) => {
      const missing = missingReadScopes(row)
      return (
        <div className="flex flex-col items-end gap-0.5">
          <Num>{formatNumber(row.granted_scope_count)}</Num>
          {missing.length > 0 ? (
            <Badge tone="critical" title={missing.flatMap((entry) => entry.scopes).join(', ')}>
              {userMessages.detail.accountMissingScopes}:{' '}
              {missing.map((entry) => labelFor(enumLabels.accountKind, entry.kind)).join(', ')}
            </Badge>
          ) : null}
        </div>
      )
    },
  },
  {
    key: 'credentials',
    header: userMessages.detail.accountCredentials,
    secondary: true,
    cell: (row) =>
      row.has_stored_credentials ? (
        <div className="flex flex-col">
          <span className="text-[12px] text-muted">
            {userMessages.detail.accountCredentialsStored}
            {row.credential_key_version === null ? '' : ` · v${row.credential_key_version}`}
          </span>
          <span
            className="text-[11px] text-faint"
            title={formatDateTime(row.access_token_expires_at)}
          >
            {userMessages.detail.accountTokenExpiry}: {formatRelative(row.access_token_expires_at)}
          </span>
        </div>
      ) : (
        <Badge tone="critical">{userMessages.detail.accountCredentialsMissing}</Badge>
      ),
  },
  {
    key: 'synced',
    header: messages.fields.lastRunAt,
    align: 'right',
    cell: (row) => (
      <div className="flex flex-col items-end">
        <span title={formatDateTime(row.last_synced_at)}>{formatRelative(row.last_synced_at)}</span>
        {row.sync_error_count > 0 ? (
          <span className="text-[11px] text-critical-text">
            {formatNumber(row.sync_error_count)} / {formatNumber(row.sync_resource_count)}
          </span>
        ) : null}
      </div>
    ),
  },
]

export function UserAccountsPanel({ accounts }: { accounts: Settled<readonly BoAccountRow[]> }) {
  const rows = accounts.ok ? accounts.value : []
  const missingScopeCount = rows.filter((row) => missingReadScopes(row).length > 0).length

  return (
    <Card
      title={userMessages.detail.sectionAccounts}
      description={
        accounts.ok && rows.length === 0 ? userMessages.detail.accountsEmptyHint : undefined
      }
      flush
    >
      <DataTable
        columns={accountColumns}
        rows={rows}
        rowKey={(row) => row.account_id}
        error={accounts.ok ? null : accounts.message}
        errorHint={messages.errors.queryFailedHint}
        emptyMessage={userMessages.detail.accountsEmpty}
        caption={userMessages.detail.accountsCaption}
        rowTone={(row) =>
          row.status === 'error' || row.status === 'revoked'
            ? 'critical'
            : row.status === 'connected' && missingReadScopes(row).length > 0
              ? 'warning'
              : 'default'
        }
      />
      {missingScopeCount > 0 ? (
        <div className="border-t border-hairline p-3">
          <PanelNote>{userMessages.detail.accountMissingScopesHint}</PanelNote>
        </div>
      ) : null}
    </Card>
  )
}

const syncColumns: readonly Column<BoSyncHealthRow>[] = [
  {
    key: 'resource',
    header: userMessages.detail.syncResource,
    cell: (row) => (
      <div className="flex flex-col">
        <span>{labelFor(enumLabels.accountKind, row.resource)}</span>
        <span className="text-[11px] text-faint">
          {labelFor(enumLabels.provider, row.provider)}
        </span>
      </div>
    ),
  },
  {
    key: 'status',
    header: messages.fields.status,
    cell: (row) => (
      <div className="flex flex-wrap items-center gap-1">
        <Badge tone={syncTone(row.status)} dot>
          {labelFor(enumLabels.syncStatus, row.status)}
        </Badge>
        {row.is_stalled ? <Badge tone="critical">{userMessages.detail.syncStalled}</Badge> : null}
        {row.is_backfilling ? (
          <Badge tone="info">{userMessages.detail.syncBackfilling}</Badge>
        ) : null}
      </div>
    ),
  },
  {
    key: 'failures',
    header: messages.fields.failureCount,
    align: 'right',
    cell: (row) => (
      <div className="flex flex-col items-end">
        <Num>{formatNumber(row.consecutive_failures)}</Num>
        {row.last_error_code ? <Mono>{row.last_error_code}</Mono> : null}
      </div>
    ),
  },
  {
    key: 'since',
    header: userMessages.detail.syncSince,
    align: 'right',
    cell: (row) => (
      <span title={formatDateTime(row.last_run_at)}>{formatRelative(row.last_run_at)}</span>
    ),
  },
  {
    key: 'next',
    header: userMessages.detail.syncNextRun,
    align: 'right',
    secondary: true,
    cell: (row) => (
      <span title={formatDateTime(row.next_run_at)}>{formatRelative(row.next_run_at)}</span>
    ),
  },
]

export function UserSyncPanel({ sync }: { sync: Settled<readonly BoSyncHealthRow[]> }) {
  const rows = sync.ok ? sync.value : []

  return (
    <Card
      title={userMessages.detail.sectionSync}
      description={sync.ok && rows.length === 0 ? userMessages.detail.syncEmptyHint : undefined}
      flush
    >
      <DataTable
        columns={syncColumns}
        rows={rows}
        rowKey={(row) => row.sync_state_id}
        error={sync.ok ? null : sync.message}
        errorHint={messages.errors.queryFailedHint}
        emptyMessage={userMessages.detail.syncEmpty}
        caption={userMessages.detail.syncCaption}
        rowTone={(row) =>
          row.status === 'error' ? 'critical' : row.is_stalled ? 'warning' : 'default'
        }
      />
    </Card>
  )
}
