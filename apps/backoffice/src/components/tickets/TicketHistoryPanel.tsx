import type { Clock } from '@da/domain'
import { Badge, Card, CardEmpty, CardError } from '@/components/ui'
import type { BoAuditRow } from '@/lib/db'
import { formatDateTime, formatRelative } from '@/lib/format'
import { ticketMessages } from '@/lib/messages/tickets'
import type { TicketAdmin } from '@/lib/queries/tickets'
import { adminLabel } from './presentation'

/**
 * Everything privileged that has happened to this ticket.
 *
 * These are `audit_logs` rows, read back through `bo_audit`, written by this
 * module's own Server Actions and by nothing else. Each one names the operator,
 * the action, the sentence they typed and whether it worked — which is the
 * question "who reassigned this and why" had no answer to before.
 *
 * `admin_reason` is a real column rather than a metadata key, so the 400-day
 * metadata sweep in `cleanup_expired_retention()` cannot erase it. A failed
 * attempt is shown as plainly as a successful one: an operator trying and
 * failing to close a ticket four times is exactly what a trail is for.
 */

export interface TicketHistoryPanelProps {
  rows: readonly BoAuditRow[] | null
  /** From `messages.errors`, never a raw exception string. */
  error: string | null
  /** `admin_users.id` → the staff row, for the actor column. */
  actors: ReadonlyMap<string, TicketAdmin>
  clock: Clock
}

export function TicketHistoryPanel({ rows, error, actors, clock }: TicketHistoryPanelProps) {
  return (
    <Card
      title={ticketMessages.detail.sectionHistory}
      description={ticketMessages.detail.sectionHistoryDescription}
    >
      {error !== null ? (
        <CardError message={error} hint={ticketMessages.queue.errorHint} />
      ) : rows === null || rows.length === 0 ? (
        <CardEmpty message={ticketMessages.detail.historyEmpty} />
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.audit_id} className="rounded-md border border-hairline px-3 py-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[12px] font-semibold text-ink">
                  {row.action === null
                    ? ticketMessages.audit.actionLabel
                    : (ticketMessages.audit.actionLabels[row.action] ?? row.action)}
                </span>
                {row.outcome === 'failure' ? (
                  <Badge tone="critical">{ticketMessages.audit.outcomeFailure}</Badge>
                ) : (
                  <Badge tone="success">{ticketMessages.audit.outcomeSuccess}</Badge>
                )}
                <span
                  className="ml-auto text-[11px] text-faint"
                  title={formatDateTime(row.created_at)}
                >
                  {formatRelative(row.created_at, clock)}
                </span>
              </div>

              <p className="mt-1 text-[12px] text-muted">
                <span className="bo-kicker mr-1">{ticketMessages.audit.actorLabel}</span>
                {row.actor_admin_user_id === null
                  ? ticketMessages.audit.unknownActor
                  : adminLabel(actors.get(row.actor_admin_user_id))}
              </p>

              {row.admin_reason === null ? null : (
                <p className="mt-1 text-[12px] leading-relaxed text-ink">
                  <span className="bo-kicker mr-1">{ticketMessages.audit.reasonLabel}</span>
                  {row.admin_reason}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
