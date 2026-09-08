import type { Clock } from '@da/domain'
import { CardError } from '@/components/ui'
import type { BoUserDetailRow } from '@/lib/db'
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { supportAccessMessages } from '@/lib/messages/support-access'

/**
 * What an operator can already see about this account without any grant at all.
 *
 * This panel is on the request form on purpose. Every figure below is a count,
 * a state or a timestamp that migration 0017/0019 computed inside Postgres, and
 * `bo_user_detail` has no content column to project — "743 e-posta işlendi, 2
 * başarısız, son senkronizasyon 10:42" is the answer to most support calls, and
 * it costs nobody's privacy.
 *
 * If the answer is on this panel, the form underneath it should not be
 * submitted. That is the argument the screen is making, and it can only make it
 * by showing the real numbers — which is why every value here comes from a
 * query rather than from a reassuring paragraph.
 */
export function SubjectOperationsPanel({
  detail,
  clock,
  error,
}: {
  detail: BoUserDetailRow | null
  clock: Clock
  error: string | null
}) {
  if (error !== null) {
    return <CardError message={error} hint={supportAccessMessages.request.metadataUnavailable} />
  }
  if (detail === null) {
    return (
      <p className="text-[12px] text-faint">{supportAccessMessages.request.metadataUnavailable}</p>
    )
  }

  const labels = supportAccessMessages.request.metadata

  const figures: readonly { label: string; value: string; hint?: string; alarming?: boolean }[] = [
    {
      label: labels.accounts,
      value: formatNumber(detail.account_connected_count),
      hint: `${formatNumber(detail.account_count)} tanımlı`,
    },
    {
      label: labels.accountsError,
      value: formatNumber(detail.account_error_count),
      alarming: detail.account_error_count > 0,
    },
    {
      label: labels.lastSync,
      value: formatRelative(detail.last_synced_at, clock),
      hint: formatDateTime(detail.last_synced_at),
    },
    {
      label: labels.syncErrors,
      value: formatNumber(detail.sync_error_count),
      alarming: detail.sync_error_count > 0,
    },
    {
      label: labels.emailMessages,
      value: formatNumber(detail.email_message_count),
      hint: `${formatNumber(detail.email_thread_count)} konu`,
    },
    {
      label: labels.emailMessages30d,
      value: formatNumber(detail.email_message_count_30d),
    },
    {
      label: labels.calendarEvents,
      value: formatNumber(detail.calendar_event_count),
      hint: `${formatNumber(detail.calendar_event_count_30d)} son 30 günde`,
    },
    {
      label: labels.assistantMessages,
      value: formatNumber(detail.assistant_message_count),
      hint: formatRelative(detail.assistant_last_message_at, clock),
    },
    {
      label: labels.approvalsPending,
      value: formatNumber(detail.approval_pending_count),
    },
    {
      label: labels.approvalsFailed,
      value: formatNumber(detail.approval_failed_count),
      alarming: detail.approval_failed_count > 0,
    },
    {
      label: labels.briefingsFailed,
      value: formatNumber(detail.briefing_failed_count_30d),
      alarming: detail.briefing_failed_count_30d > 0,
    },
    {
      label: labels.notificationsFailed,
      value: formatNumber(detail.notification_failed_count_30d),
      hint: `${formatNumber(detail.notification_sent_count_30d)} gönderildi`,
      alarming: detail.notification_failed_count_30d > 0,
    },
    {
      label: labels.lastEmail,
      value: formatRelative(detail.email_last_message_at, clock),
      hint: formatDateTime(detail.email_last_message_at),
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-muted">{supportAccessMessages.request.metadataDescription}</p>
      <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {figures.map((figure) => (
          <div key={figure.label} className="rounded-md border border-hairline px-2.5 py-2">
            <dt className="bo-kicker">{figure.label}</dt>
            <dd
              className={[
                'mt-0.5 text-[16px] leading-5 font-semibold tabular-nums',
                figure.alarming === true ? 'text-critical-text' : 'text-ink',
              ].join(' ')}
            >
              {figure.value}
            </dd>
            {figure.hint === undefined ? null : (
              <dd className="mt-0.5 text-[11px] text-faint">{figure.hint}</dd>
            )}
          </div>
        ))}
      </dl>
    </div>
  )
}
