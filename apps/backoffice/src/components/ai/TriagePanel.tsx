import { type Column, DataTable, Num, StatGrid, StatTile } from '@/components/ui'
import { formatCostMicros, formatDate, formatNumber } from '@/lib/format'
import { messages } from '@/lib/messages'
import type { DailySpend, SpendWindow } from '@/lib/queries/ai'
import { Bar } from './Bar'
import { formatAverage, formatRatio, ratioOf } from './format'
import { aiMessages } from './messages'

/**
 * The triage funnel, reported from the side the backoffice is allowed to see.
 *
 * The pipeline settles most mail deterministically — rules, VIPs, direct
 * addressing — and only what survives that gate is sent to a model, where it
 * writes exactly one `email_analysis` usage event. So the number of those
 * events *is* the count of messages that reached a model.
 *
 * What cannot be shown, and is stated on the panel rather than quietly omitted,
 * is the denominator: how much mail arrived in total. Counting `email_messages`
 * would mean a view over the mail table, and how much mail a person receives is
 * a fact about that person. The funnel is therefore expressed against the
 * connected mailbox count — calls per mailbox per day — which moves the moment
 * triage tightens or loosens, and never requires reading anyone's inbox.
 */

interface TriageDayRow extends DailySpend {
  allEvents: number
}

export function TriagePanel({
  spend,
  mailAccounts,
  mailAccountsError,
}: {
  spend: SpendWindow
  mailAccounts: number | null
  mailAccountsError: string | null
}) {
  const emailEvents = spend.emailAnalysis.events
  const share = ratioOf(emailEvents, spend.current.events)
  const perAccountPerDay =
    mailAccounts !== null && mailAccounts > 0 && spend.dayCount > 0
      ? emailEvents / mailAccounts / spend.dayCount
      : null

  const byDay = new Map(spend.daily.map((day) => [day.day, day]))
  const rows: readonly TriageDayRow[] = spend.emailAnalysisDaily.map((day) => ({
    ...day,
    allEvents: byDay.get(day.day)?.events ?? 0,
  }))
  const maxEvents = rows.reduce((max, row) => Math.max(max, row.events), 0)

  const columns: readonly Column<TriageDayRow>[] = [
    {
      key: 'day',
      header: aiMessages.fields.day,
      width: 'w-28',
      cell: (row) => formatDate(row.day),
    },
    {
      key: 'email',
      header: aiMessages.triage.dailyEmail,
      align: 'right',
      cell: (row) => (
        <div className="flex flex-col items-end">
          <Num>{formatNumber(row.events)}</Num>
          <Bar value={row.events} max={maxEvents} block tone="info" />
        </div>
      ),
    },
    {
      key: 'all',
      header: aiMessages.fields.events,
      align: 'right',
      secondary: true,
      cell: (row) => <Num>{formatNumber(row.allEvents)}</Num>,
    },
    {
      key: 'share',
      header: aiMessages.triage.emailShare,
      align: 'right',
      cell: (row) => <Num>{formatRatio(ratioOf(row.events, row.allEvents))}</Num>,
    },
    {
      key: 'cost',
      header: aiMessages.fields.cost,
      align: 'right',
      secondary: true,
      cell: (row) => <Num>{formatCostMicros(row.costMicros)}</Num>,
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <StatGrid>
        <StatTile
          label={aiMessages.triage.emailEvents}
          value={formatNumber(emailEvents)}
          hint={aiMessages.triage.totalEventsHint(formatNumber(spend.current.events))}
          tone="info"
        />
        <StatTile label={aiMessages.triage.emailShare} value={formatRatio(share)} />
        <StatTile
          label={aiMessages.triage.emailCost}
          value={formatCostMicros(spend.emailAnalysis.costMicros)}
          hint={formatRatio(ratioOf(spend.emailAnalysis.costMicros, spend.current.costMicros))}
        />
        <StatTile
          label={aiMessages.triage.perAccount}
          value={formatAverage(perAccountPerDay)}
          hint={
            mailAccountsError !== null
              ? mailAccountsError
              : mailAccounts === null || mailAccounts === 0
                ? aiMessages.triage.mailAccountsEmpty
                : aiMessages.triage.perAccountHint(formatNumber(mailAccounts))
          }
        />
      </StatGrid>

      <p className="text-[12px] leading-snug text-faint">{aiMessages.triage.denominatorNote}</p>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.day}
        error={null}
        errorHint={messages.errors.queryFailedHint}
        emptyMessage={aiMessages.spend.dailyEmpty}
        caption={aiMessages.triage.section}
      />
    </div>
  )
}
