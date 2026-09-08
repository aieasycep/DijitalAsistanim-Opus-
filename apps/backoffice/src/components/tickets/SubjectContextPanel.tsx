import type { Clock } from '@da/domain'
import Link from 'next/link'
// The approval action vocabulary already has Turkish names in the approvals
// module. Reading them from there rather than re-typing them is what stops two
// screens from disagreeing about what `email_send` is called.
import { actionTypeLabels } from '@/components/approvals'
import {
  Badge,
  Card,
  CardEmpty,
  CardError,
  Mono,
  connectionTone,
  countTone,
  subscriptionTone,
} from '@/components/ui'
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { enumLabels, labelFor } from '@/lib/messages'
import { ticketMessages } from '@/lib/messages/tickets'
import type { SubjectContext, TicketSubject } from '@/lib/queries/tickets'
import { DetailList, type DetailItem } from './DetailList'

/**
 * Is their side actually working?
 *
 * The question most support calls really are, answered without opening
 * anything the caller wrote. Every value here is a count, a status or a
 * timestamp from `bo_user_detail`, `bo_accounts` and `bo_approvals` — views
 * that carry no content column at all, so "743 processed, 2 failed" is
 * available and the 743 messages are not.
 *
 * The panel deliberately stops there. There is no button that opens a mailbox,
 * no "sign in as this user", and no preview of anything. Reading content
 * requires an approved, four-eyes, time-limited Support Access grant, which
 * lives in its own area and leaves its own reveal record.
 */

export interface SubjectContextPanelProps {
  /** Null when the ticket is not attached to a user at all. */
  userId: string | null
  subject: TicketSubject | undefined
  context: SubjectContext | null
  /** From `messages.errors`, never a raw exception string. */
  error: string | null
  clock: Clock
}

export function SubjectContextPanel({
  userId,
  subject,
  context,
  error,
  clock,
}: SubjectContextPanelProps) {
  return (
    <Card
      title={ticketMessages.detail.sectionContext}
      description={ticketMessages.detail.sectionContextDescription}
      action={
        userId === null ? null : (
          <Link
            href={`/users/${userId}`}
            className="text-[12px] font-medium text-primary-on-soft underline underline-offset-2 hover:text-primary"
          >
            {ticketMessages.detail.openUser}
          </Link>
        )
      }
    >
      {userId === null ? (
        <CardEmpty message={ticketMessages.detail.noSubjectUser} />
      ) : error !== null ? (
        <CardError message={error} hint={ticketMessages.queue.errorHint} />
      ) : context === null || context.detail === null ? (
        <CardEmpty message={ticketMessages.detail.contextEmpty} />
      ) : (
        <ContextBody context={context} subject={subject} clock={clock} />
      )}
    </Card>
  )
}

function ContextBody({
  context,
  subject,
  clock,
}: {
  context: SubjectContext
  subject: TicketSubject | undefined
  clock: Clock
}) {
  const detail = context.detail
  if (detail === null) return null

  const items: readonly DetailItem[] = [
    {
      label: ticketMessages.columns.subjectUser,
      value: subject?.emailRedacted ?? <Mono>{detail.user_id}</Mono>,
    },
    {
      label: ticketMessages.context.plan,
      value: (
        <Badge tone={subscriptionTone(detail.subscription_status)}>
          {labelFor(enumLabels.subscriptionStatus, detail.subscription_status)}
        </Badge>
      ),
    },
    {
      label: ticketMessages.context.connections,
      value: ticketMessages.context.connectionsValue(
        detail.account_connected_count,
        detail.account_count,
      ),
    },
    {
      label: ticketMessages.context.connectionErrors,
      value: (
        <Badge tone={countTone(detail.account_error_count)}>
          {formatNumber(detail.account_error_count)}
        </Badge>
      ),
    },
    {
      label: ticketMessages.context.lastSync,
      value:
        detail.last_synced_at === null ? null : (
          <span title={formatDateTime(detail.last_synced_at)}>
            {formatRelative(detail.last_synced_at, clock)}
          </span>
        ),
    },
    {
      label: ticketMessages.context.syncErrors,
      value: (
        <Badge tone={countTone(detail.sync_error_count)}>
          {formatNumber(detail.sync_error_count)}
        </Badge>
      ),
    },
    {
      label: ticketMessages.context.approvalsPending,
      value: formatNumber(context.pendingApprovalCount),
    },
    {
      label: ticketMessages.context.approvalsFailed,
      value: (
        <Badge tone={countTone(detail.approval_failed_count)}>
          {formatNumber(detail.approval_failed_count)}
        </Badge>
      ),
    },
    {
      label: ticketMessages.context.messages30d,
      value: formatNumber(detail.email_message_count_30d),
    },
    {
      label: ticketMessages.context.notificationsFailed,
      value: (
        <Badge tone={countTone(detail.notification_failed_count_30d)}>
          {formatNumber(detail.notification_failed_count_30d)}
        </Badge>
      ),
    },
    {
      label: ticketMessages.context.onboarding,
      value: detail.is_onboarded
        ? ticketMessages.context.onboardingDone
        : ticketMessages.context.onboardingPending,
    },
    {
      label: ticketMessages.context.deleted,
      value: detail.is_deleted ? (
        <Badge tone="critical">{formatDateTime(detail.deleted_at)}</Badge>
      ) : null,
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <DetailList items={items} />

      <section>
        <h3 className="bo-kicker mb-1.5">{ticketMessages.detail.accountsHeading}</h3>
        {context.accounts.length === 0 ? (
          <p className="text-[12px] text-faint">{ticketMessages.detail.accountsEmpty}</p>
        ) : (
          <div className="bo-scroll overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-hairline">
                  <th scope="col" className="bo-kicker py-1.5 pr-3">
                    {ticketMessages.context.accountColumns.provider}
                  </th>
                  <th scope="col" className="bo-kicker py-1.5 pr-3">
                    {ticketMessages.context.accountColumns.status}
                  </th>
                  <th scope="col" className="bo-kicker py-1.5 pr-3">
                    {ticketMessages.context.accountColumns.lastSync}
                  </th>
                  <th scope="col" className="bo-kicker py-1.5">
                    {ticketMessages.context.accountColumns.error}
                  </th>
                </tr>
              </thead>
              <tbody>
                {context.accounts.map((account) => (
                  <tr
                    key={account.account_id}
                    className="border-b border-hairline/70 last:border-0"
                  >
                    <td className="py-1.5 pr-3 text-[12px] text-ink">
                      {labelFor(enumLabels.provider, account.provider)}
                    </td>
                    <td className="py-1.5 pr-3">
                      <Badge tone={connectionTone(account.status)} dot>
                        {labelFor(enumLabels.connectionStatus, account.status)}
                      </Badge>
                    </td>
                    <td className="py-1.5 pr-3 text-[12px] text-muted">
                      {account.last_synced_at === null
                        ? '—'
                        : formatRelative(account.last_synced_at, clock)}
                    </td>
                    <td className="py-1.5 text-[12px]">
                      {account.last_error_code === null ? (
                        <span className="text-faint">—</span>
                      ) : (
                        <Mono>{account.last_error_code}</Mono>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h3 className="bo-kicker mb-1.5">{ticketMessages.detail.failuresHeading}</h3>
        {context.failedApprovals.length === 0 ? (
          <p className="text-[12px] text-faint">{ticketMessages.detail.failuresEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {context.failedApprovals.map((approval) => (
              <li
                key={approval.approval_id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-critical-soft/50 px-2 py-1.5 text-[12px]"
              >
                <span className="font-medium text-ink">
                  {labelFor(actionTypeLabels, approval.type)}
                </span>
                <Mono>{approval.failure_code ?? '—'}</Mono>
                <span className="text-muted">
                  {ticketMessages.context.failureColumns.attempts}: {approval.attempt_count}
                </span>
                <span className="ml-auto text-faint" title={formatDateTime(approval.created_at)}>
                  {formatRelative(approval.created_at, clock)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
