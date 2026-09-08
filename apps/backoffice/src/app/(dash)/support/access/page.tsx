import { systemClock } from '@da/domain'
import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Button,
  Card,
  Filters,
  PageHeader,
  StatGrid,
  StatTile,
  TABLE_PARAMS,
  parseColumnVisibility,
} from '@/components/ui'
import { GrantTable } from '@/components/support-access/GrantTable'
import { ResultBanner } from '@/components/support-access/ResultBanner'
import {
  GRANT_STATUS_OPTIONS,
  LIST_PARAMS,
  RESULT_PARAMS,
  SUPPORT_ACCESS_NEW_PATH,
  SUPPORT_ACCESS_PATH,
  firstParam,
  grantListParamValues,
  parseGrantListParams,
  toQueryRecord,
} from '@/components/support-access/contract'
import { requirePermission, sessionCan } from '@/lib/auth'
import { formatCompact } from '@/lib/format'
import { messages } from '@/lib/messages'
import { GRANT_STATUS_LABELS_TR, supportAccessMessages } from '@/lib/messages/support-access'
import { listGrants, loadGrantSummary, settle } from '@/lib/queries/support-access'

export const metadata: Metadata = { title: supportAccessMessages.list.title }
export const dynamic = 'force-dynamic'

/**
 * Every Support Access grant the platform has ever issued, in every state.
 *
 * ---------------------------------------------------------------------------
 * WHO MAY OPEN THIS
 * ---------------------------------------------------------------------------
 *
 * `support.access.request` or `support.access.approve`. The guard is
 * server-side and runs before anything renders; the sidebar entry is a
 * courtesy, and this page would refuse the same URL typed into the address bar.
 *
 * The list is deliberately not scoped to the viewer's own requests. This is the
 * review surface for the one mechanism in the product that can show an operator
 * a user's content, and a review surface that only shows you your own work
 * reviews nothing. Nothing on it is content: the requester and the subject
 * arrive redacted from `bo_redact_email()`, and the free text is the operator's
 * own written reason — the thing the record exists to preserve.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE FOUR NUMBERS COME FROM
 * ---------------------------------------------------------------------------
 *
 * Four `count=exact` HEAD requests against `bo_support_access_grants` and
 * `bo_support_access_reveals` — real `count(*)`s over an index, with no row
 * bodies crossing the wire. "Şu anda etkin" reads the view's own `is_live`,
 * which is computed from the timestamps rather than from the stored status, so
 * a grant whose window closed before the cleanup job ran is not counted as
 * live. Each tile that can be narrowed to links to its own filtered view; the
 * two that cannot have no link rather than a link that goes nowhere.
 */
export default async function SupportAccessListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePermission({
    anyOf: ['support.access.request', 'support.access.approve'],
  })

  const raw = await searchParams
  const params = parseGrantListParams(raw)
  const clock = systemClock

  const [summary, page] = await Promise.all([
    settle(() => loadGrantSummary(clock)),
    settle(() => listGrants({ ...params, viewerAdminUserId: session.adminUserId })),
  ])

  const values = { ...toQueryRecord(raw), ...grantListParamValues(params) }
  const filtered =
    params.status !== null || params.liveOnly || params.holder !== null || params.subject !== null

  const canRequest = sessionCan(session, 'support.access.request')

  return (
    <>
      <PageHeader
        title={supportAccessMessages.list.title}
        description={supportAccessMessages.list.description}
        meta={supportAccessMessages.boundaryNote}
        action={
          canRequest ? (
            <Button asChild size="md" variant="primary">
              <Link href={SUPPORT_ACCESS_NEW_PATH}>{supportAccessMessages.list.newGrant}</Link>
            </Button>
          ) : null
        }
      >
        <Filters
          controls={[
            {
              kind: 'select',
              param: LIST_PARAMS.status,
              label: supportAccessMessages.filters.status,
              options: GRANT_STATUS_OPTIONS.map((status) => ({
                value: status,
                label: GRANT_STATUS_LABELS_TR[status],
              })),
            },
            {
              kind: 'segmented',
              param: LIST_PARAMS.live,
              label: supportAccessMessages.filters.liveOnly,
              options: [
                { value: '', label: messages.filters.all },
                { value: '1', label: supportAccessMessages.filters.liveOnly },
              ],
            },
            {
              kind: 'segmented',
              param: LIST_PARAMS.holder,
              label: supportAccessMessages.filters.holder,
              options: [
                { value: '', label: supportAccessMessages.filters.holderAll },
                { value: 'mine', label: supportAccessMessages.filters.holderMine },
              ],
            },
            {
              kind: 'search',
              param: LIST_PARAMS.subject,
              label: supportAccessMessages.filters.subject,
              placeholder: supportAccessMessages.filters.subjectPlaceholder,
            },
          ]}
          values={values}
        />
      </PageHeader>

      <div className="flex flex-col gap-4">
        <ResultBanner outcome={firstParam(raw, RESULT_PARAMS.outcome)} />

        {params.subjectRejected ? (
          <p
            role="status"
            className="rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning-text"
          >
            {supportAccessMessages.filters.subjectInvalid}
          </p>
        ) : null}

        {!canRequest ? (
          <p className="text-[12px] text-faint">{supportAccessMessages.list.noRequestPermission}</p>
        ) : null}

        {summary.ok ? (
          <StatGrid>
            <StatTile
              label={supportAccessMessages.tiles.pending}
              hint={supportAccessMessages.tiles.pendingHint}
              value={formatCompact(summary.value.pending)}
              tone={summary.value.pending > 0 ? 'warning' : 'neutral'}
              href={`${SUPPORT_ACCESS_PATH}?${LIST_PARAMS.status}=pending_approval`}
            />
            <StatTile
              label={supportAccessMessages.tiles.live}
              hint={supportAccessMessages.tiles.liveHint}
              value={formatCompact(summary.value.live)}
              tone={summary.value.live > 0 ? 'primary' : 'neutral'}
              href={`${SUPPORT_ACCESS_PATH}?${LIST_PARAMS.live}=1`}
            />
            <StatTile
              label={supportAccessMessages.tiles.reveals24h}
              hint={supportAccessMessages.tiles.reveals24hHint}
              value={formatCompact(summary.value.reveals24h)}
              tone={summary.value.reveals24h > 0 ? 'warning' : 'neutral'}
            />
            <StatTile
              label={supportAccessMessages.tiles.requested30d}
              hint={supportAccessMessages.tiles.requested30dHint}
              value={formatCompact(summary.value.requested30d)}
            />
          </StatGrid>
        ) : (
          <Card title={supportAccessMessages.list.title}>
            <p role="alert" className="text-[12px] text-critical-text">
              {summary.message}
            </p>
          </Card>
        )}

        <GrantTable
          rows={page.ok ? page.value.rows : []}
          total={page.ok ? page.value.total : 0}
          page={params.page}
          location={{ path: SUPPORT_ACCESS_PATH, query: toQueryRecord(raw) }}
          hiddenColumns={parseColumnVisibility(firstParam(raw, TABLE_PARAMS.columns))}
          clock={clock}
          viewerAdminUserId={session.adminUserId}
          error={page.ok ? null : page.message}
          emptyMessage={
            filtered ? supportAccessMessages.list.emptyFiltered : supportAccessMessages.list.empty
          }
          emptyAction={
            filtered ? (
              <Link
                href={SUPPORT_ACCESS_PATH}
                className="inline-flex h-7 items-center rounded-md border border-hairline px-2.5 text-[12px] font-medium text-muted hover:text-ink"
              >
                {messages.filters.reset}
              </Link>
            ) : null
          }
          filtered={filtered}
        />
      </div>
    </>
  )
}
