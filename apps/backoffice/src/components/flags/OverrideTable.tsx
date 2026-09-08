import type { Clock } from '@da/domain'
import Link from 'next/link'
import { MAX_REASON_LENGTH, MIN_REASON_LENGTH } from '@/lib/admin-action'
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Mono,
  type Column,
  type TableLocation,
} from '@/components/ui'
import type { BoFeatureFlagOverrideRow } from '@/lib/db'
import { formatDateTime, formatRelative } from '@/lib/format'
import { flagMessages } from '@/lib/messages/flags'
import type { FlagAdmin } from '@/lib/queries/flags'
import { removeFlagOverrideAction } from '@/lib/actions/flags'
import { OVERRIDES_PAGE_SIZE, OVERRIDE_FIELDS, OVERRIDE_PAGE_PARAM, userPath } from './contract'
import { adminLabel, overrideValueTone } from './presentation'

/**
 * The per-user pins on one flag.
 *
 * ---------------------------------------------------------------------------
 * WHY LAPSED PINS STAY IN THE LIST
 * ---------------------------------------------------------------------------
 *
 * An expired override no longer affects evaluation — `feature_flag_is_enabled()`
 * filters on `expires_at > now()` — but it is still listed, marked, and sorted
 * below the live ones. That is the point: a forgotten debugging pin is how a
 * "50% rollout" quietly becomes something else, and the only way anybody
 * notices is by seeing it here. `admin_cleanup_expired()` deletes it seven days
 * after it lapses, which is long enough for that to happen.
 *
 * The address is `y•••@example.com` because `bo_feature_flag_overrides` passes
 * `profiles.email` through `bo_redact_email()`. The reason is the operator's
 * own sentence, which is the thing the record exists to preserve.
 *
 * Removal is the one delete this console performs, and it is audited by
 * `removeFlagOverrideAction` naming the flag, the user and a written reason.
 */
export function OverrideTable({
  rows,
  total,
  page,
  flagId,
  admins,
  location,
  clock,
  canWrite,
  csrf,
  error,
}: {
  rows: readonly BoFeatureFlagOverrideRow[]
  /** Exact count from Postgres, never `rows.length`. */
  total: number
  page: number
  flagId: string
  admins: ReadonlyMap<string, FlagAdmin>
  location: TableLocation
  clock: Clock
  canWrite: boolean
  csrf: { name: string; value: string }
  error: string | null
}) {
  const columns: readonly Column<BoFeatureFlagOverrideRow>[] = [
    {
      key: 'user',
      header: flagMessages.overrides.columnUser,
      hideable: false,
      cell: (row) => (
        <Link href={userPath(row.user_id)} className="flex flex-col hover:underline">
          <span className="text-[12px] text-ink">{row.user_email_redacted}</span>
          <Mono>{row.user_id.slice(0, 8)}</Mono>
        </Link>
      ),
    },
    {
      key: 'value',
      header: flagMessages.overrides.columnValue,
      width: 'w-28',
      hideable: false,
      cell: (row) => (
        <Badge tone={overrideValueTone(row.enabled, row.is_expired)}>
          {row.enabled ? flagMessages.overrides.valueOn : flagMessages.overrides.valueOff}
        </Badge>
      ),
    },
    {
      key: 'reason',
      header: flagMessages.overrides.columnReason,
      cell: (row) => <span className="line-clamp-2 text-[12px] text-muted">{row.reason}</span>,
    },
    {
      key: 'expiry',
      header: flagMessages.overrides.columnExpiry,
      width: 'w-40',
      cell: (row) => {
        if (row.expires_at === null) {
          return (
            <span className="text-[12px] text-warning-text">{flagMessages.overrides.noExpiry}</span>
          )
        }
        return (
          <span className="flex flex-col">
            <span className="text-[12px] whitespace-nowrap text-ink">
              {formatDateTime(row.expires_at)}
            </span>
            <span className="text-[11px] text-faint">
              {row.is_expired
                ? flagMessages.overrides.expired
                : formatRelative(row.expires_at, clock)}
            </span>
          </span>
        )
      },
    },
    {
      key: 'created',
      header: flagMessages.overrides.columnCreated,
      width: 'w-36',
      secondary: true,
      cell: (row) => (
        <span className="flex flex-col">
          <span className="text-[12px] whitespace-nowrap">{formatDateTime(row.created_at)}</span>
          <span className="text-[11px] text-faint">
            {adminLabel(admins.get(row.created_by_admin_user_id))}
          </span>
        </span>
      ),
    },
    {
      key: 'action',
      header: flagMessages.overrides.columnAction,
      align: 'right',
      width: 'w-28',
      hideable: false,
      cell: (row) =>
        canWrite ? (
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="sm">
                {flagMessages.overrides.removeLabel}
              </Button>
            }
            title={flagMessages.overrides.removeTitle}
            description={flagMessages.overrides.removeBody}
            confirmLabel={flagMessages.overrides.removeConfirm}
            action={removeFlagOverrideAction}
            hiddenFields={{
              [csrf.name]: csrf.value,
              [OVERRIDE_FIELDS.flagId]: flagId,
              [OVERRIDE_FIELDS.overrideId]: row.override_id,
            }}
            reason={{
              label: flagMessages.overrides.reasonLabel,
              placeholder: flagMessages.overrides.reasonPlaceholder,
              minLength: MIN_REASON_LENGTH,
              maxLength: MAX_REASON_LENGTH,
            }}
            destructive
          >
            <div className="rounded-md border border-hairline px-3 py-2">
              <p className="text-[12px] text-ink">{row.user_email_redacted}</p>
              <p className="mt-0.5 text-[11px] text-faint">
                {row.enabled ? flagMessages.overrides.valueOn : flagMessages.overrides.valueOff} ·{' '}
                {row.reason}
              </p>
            </div>
          </ConfirmDialog>
        ) : null,
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.override_id}
      caption={flagMessages.overrides.tableCaption}
      error={error}
      emptyMessage={flagMessages.overrides.empty}
      location={location}
      pagination={{
        page,
        pageSize: OVERRIDES_PAGE_SIZE,
        total,
        pageParam: OVERRIDE_PAGE_PARAM,
      }}
      rowTone={(row) => (row.is_expired ? 'default' : 'warning')}
    />
  )
}
