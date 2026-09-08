import { systemClock } from '@da/domain'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { Badge, Card, CardError, PageHeader, StatGrid, StatTile } from '@/components/ui'
import { DecisionPanel } from '@/components/support-access/DecisionPanel'
import { DecisionTrail } from '@/components/support-access/DecisionTrail'
import { FactList, PanelNote, type Fact } from '@/components/support-access/Facts'
import { GrantStatusBadge } from '@/components/support-access/GrantStatusBadge'
import { ResultBanner } from '@/components/support-access/ResultBanner'
import { RevealLogTable } from '@/components/support-access/RevealLogTable'
import { ScopeUsageList } from '@/components/support-access/ScopeList'
import {
  REVEAL_PAGE_PARAM,
  RESULT_PARAMS,
  SUPPORT_ACCESS_PATH,
  effectiveStatus,
  firstParam,
  grantHref,
  isLapsedButUnswept,
  isUuidParam,
  orderedScopes,
  toQueryRecord,
  userHref,
} from '@/components/support-access/contract'
import { csrfField, requirePermission, sessionCan } from '@/lib/auth'
import { describeEnvironment, dangerousActionNote } from '@/lib/env'
import { formatCompact, formatDateTime, formatRelative } from '@/lib/format'
import {
  GRANT_LAPSED_NOTE_TR,
  GRANT_STATUS_HINTS_TR,
  GRANT_STATUS_LABELS_TR,
  supportAccessMessages,
} from '@/lib/messages/support-access'
import { ROLE_LABELS_TR } from '@/lib/permissions'
import {
  SCOPE_SENSITIVITY_ORDER,
  formatMinutesRemainingTr,
  shortId,
  type SupportAccessScope,
} from '@/lib/redact'
import {
  countRevealsByScope,
  listReveals,
  loadAdminSummary,
  loadGrant,
  loadGrantTrail,
  loadTicketReference,
  settle,
} from '@/lib/queries/support-access'

export const metadata: Metadata = { title: supportAccessMessages.detail.title }
export const dynamic = 'force-dynamic'

/**
 * One Support Access grant, end to end.
 *
 * ---------------------------------------------------------------------------
 * WHO MAY OPEN THIS
 * ---------------------------------------------------------------------------
 *
 * `support.access.request` or `support.access.approve`, server-side, before
 * anything renders. Holding either lets an operator *read* the record; acting
 * on it is a separate question the controls and the Server Actions both ask
 * again — `DecisionPanel` will not draw an Approve button for the requester,
 * and `runAdminAction` re-checks the permission against
 * `admin_role_permissions` whether or not a button was drawn.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS ON SCREEN AND WHERE IT COMES FROM
 * ---------------------------------------------------------------------------
 *
 *   - the grant itself, from `bo_support_access_grants` (one row);
 *   - the reveal count per granted scope, one exact `count(*)` each, so a scope
 *     that was asked for and never spent reads as zero rather than vanishing;
 *   - the reveal log, a server-paginated page of `bo_support_access_reveals`
 *     with the exact total beside it;
 *   - the decision trail, from `bo_audit` filtered on `support_access_grant_id`
 *     — which is where the denial and revocation reasons live, since the grant
 *     view does not project them;
 *   - the requester's and approver's roster rows, for a role label and a
 *     redacted address.
 *
 * Not one of those is content. This page governs access; it does not exercise
 * it, and no code path from here reaches an `sa_reveal_*` function.
 */
export default async function SupportAccessGrantPage({
  params,
  searchParams,
}: {
  params: Promise<{ grantId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePermission({
    anyOf: ['support.access.request', 'support.access.approve'],
  })

  const { grantId } = await params
  if (!isUuidParam(grantId)) notFound()

  const raw = await searchParams
  const revealPageRaw = Number(firstParam(raw, REVEAL_PAGE_PARAM))
  const revealPage =
    Number.isFinite(revealPageRaw) && revealPageRaw >= 1 ? Math.floor(revealPageRaw) : 1
  const clock = systemClock
  const now = clock.now()

  const loaded = await settle(() => loadGrant(grantId))

  if (!loaded.ok) {
    return (
      <>
        <DetailHeader />
        <CardError message={loaded.message} hint={supportAccessMessages.detail.notFoundHint} />
      </>
    )
  }
  const grant = loaded.value
  if (grant === null) notFound()

  const scopes: readonly SupportAccessScope[] = orderedScopes(grant.scopes, SCOPE_SENSITIVITY_ORDER)
  const requesterId = grant.admin_user_id
  const approverId = grant.approved_by_admin_user_id
  const ticketId = grant.ticket_id

  const [reveals, usage, trail, requester, approver, ticket] = await Promise.all([
    settle(() => listReveals({ grantId, page: revealPage })),
    settle(() => countRevealsByScope(grantId, scopes)),
    settle(() => loadGrantTrail(grantId)),
    settle(() => loadAdminSummary(requesterId)),
    approverId === null ? null : settle(() => loadAdminSummary(approverId)),
    ticketId === null ? null : settle(() => loadTicketReference(ticketId)),
  ])

  const status = effectiveStatus(grant, now)
  const lapsed = isLapsedButUnswept(grant, now)
  const environment = describeEnvironment()

  const facts: readonly Fact[] = [
    {
      term: supportAccessMessages.detail.holder,
      value: (
        <span className="flex flex-col">
          <span>{grant.admin_email_redacted}</span>
          <span className="text-[11px] text-faint">
            {ROLE_LABELS_TR[grant.admin_role]}
            {grant.admin_user_id === session.adminUserId
              ? ` · ${supportAccessMessages.filters.holderMine}`
              : ''}
          </span>
        </span>
      ),
      hint:
        requester.ok && requester.value !== null
          ? `${requester.value.active_session_count} etkin oturum · ${requester.value.support_access_active_count} etkin izin`
          : undefined,
    },
    {
      term: supportAccessMessages.detail.subject,
      value: (
        <Link href={userHref(grant.subject_user_id)} className="hover:underline">
          {grant.subject_email_redacted ?? shortId(grant.subject_user_id)}
        </Link>
      ),
      hint: grant.subject_user_id,
    },
    {
      term: supportAccessMessages.detail.requestedAt,
      value: formatDateTime(grant.requested_at),
      hint: formatRelative(grant.requested_at, clock),
    },
    {
      term: supportAccessMessages.detail.windowMinutes,
      value: formatMinutesRemainingTr(grant.window_minutes),
    },
    {
      term: supportAccessMessages.detail.approver,
      value:
        grant.approved_by_admin_user_id === null
          ? null
          : approver !== null && approver.ok && approver.value !== null
            ? `${approver.value.email_redacted} · ${ROLE_LABELS_TR[approver.value.role]}`
            : shortId(grant.approved_by_admin_user_id),
      hint:
        approver !== null && !approver.ok
          ? supportAccessMessages.detail.approverUnknown
          : grant.approved_at === null
            ? undefined
            : formatDateTime(grant.approved_at),
    },
    {
      term: supportAccessMessages.detail.grantedAt,
      value: grant.granted_at === null ? null : formatDateTime(grant.granted_at),
    },
    {
      term: supportAccessMessages.detail.expiresAt,
      value: formatDateTime(grant.expires_at),
      hint:
        status === 'active'
          ? formatMinutesRemainingTr(grant.minutes_remaining)
          : formatRelative(grant.expires_at, clock),
    },
    {
      term: supportAccessMessages.detail.deniedAt,
      value: grant.denied_at === null ? null : formatDateTime(grant.denied_at),
    },
    {
      term: supportAccessMessages.detail.revokedAt,
      value: grant.revoked_at === null ? null : formatDateTime(grant.revoked_at),
    },
    {
      term: supportAccessMessages.detail.ticket,
      value:
        grant.ticket_id === null ? null : ticket !== null && ticket.ok && ticket.value !== null ? (
          <span className="font-mono text-[12px]">{ticket.value.reference}</span>
        ) : (
          shortId(grant.ticket_id)
        ),
    },
    {
      term: supportAccessMessages.detail.consent,
      value: grant.has_recorded_consent ? (
        <Badge tone="success">{supportAccessMessages.detail.consentRecorded}</Badge>
      ) : (
        <Badge tone="neutral">{supportAccessMessages.detail.consentAbsent}</Badge>
      ),
      hint: grant.user_consent_at === null ? undefined : formatDateTime(grant.user_consent_at),
    },
  ]

  return (
    <>
      <DetailHeader
        kicker={<span className="font-mono">{shortId(grant.grant_id)}</span>}
        action={
          <GrantStatusBadge row={grant} now={now} minutesRemaining={grant.minutes_remaining} />
        }
      />

      <div className="flex flex-col gap-4">
        <ResultBanner outcome={firstParam(raw, RESULT_PARAMS.outcome)} />

        {lapsed ? <PanelNote>{GRANT_LAPSED_NOTE_TR}</PanelNote> : null}

        <StatGrid>
          <StatTile
            label={supportAccessMessages.detail.remaining}
            value={
              status === 'active'
                ? formatMinutesRemainingTr(grant.minutes_remaining)
                : GRANT_STATUS_LABELS_TR[status]
            }
            hint={GRANT_STATUS_HINTS_TR[status]}
            tone={status === 'active' ? 'primary' : 'neutral'}
          />
          {/*
            `reveal_count` is the sum of `item_count`, maintained by trigger:
            records opened, not calls made. The hint names the number of calls
            beside it — which is `listReveals().total`, the exact count from
            Postgres — so the two figures on this page explain each other
            instead of appearing to contradict.
          */}
          <StatTile
            label={supportAccessMessages.detail.revealsTile}
            value={formatCompact(grant.reveal_count)}
            hint={
              reveals.ok
                ? supportAccessMessages.detail.revealsTileHint(reveals.value.total)
                : grant.last_reveal_at === null
                  ? undefined
                  : formatRelative(grant.last_reveal_at, clock)
            }
            tone={grant.reveal_count > 0 ? 'warning' : 'neutral'}
          />
          <StatTile
            label={supportAccessMessages.columns.scopes}
            value={String(scopes.length)}
            hint={supportAccessMessages.detail.scopesDescription}
          />
          <StatTile
            label={supportAccessMessages.detail.windowMinutes}
            value={formatMinutesRemainingTr(grant.window_minutes)}
            hint={formatDateTime(grant.expires_at)}
          />
        </StatGrid>

        <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
          <Card title={supportAccessMessages.detail.summary}>
            <FactList items={facts} />
          </Card>

          <div className="flex flex-col gap-4">
            <Card
              title={supportAccessMessages.detail.reasonTitle}
              description={supportAccessMessages.detail.reasonDescription}
            >
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-ink">
                {grant.reason}
              </p>
            </Card>

            <Card title={supportAccessMessages.detail.decisionTitle}>
              <DecisionPanel
                grant={grant}
                csrf={csrfField(session)}
                viewerAdminUserId={session.adminUserId}
                canApprove={sessionCan(session, 'support.access.approve')}
                environmentNote={dangerousActionNote(environment)}
              />
            </Card>
          </div>
        </div>

        <Card
          title={supportAccessMessages.detail.scopesTitle}
          description={supportAccessMessages.detail.revealsByScope}
        >
          {usage.ok ? (
            <ScopeUsageList usage={usage.value} />
          ) : (
            <CardError message={usage.message} />
          )}
        </Card>

        <Card
          title={supportAccessMessages.detail.revealsTitle}
          description={supportAccessMessages.detail.revealsDescription}
          action={
            reveals.ok ? (
              <span className="text-[11px] text-faint tabular-nums">
                {supportAccessMessages.detail.revealsTotal(reveals.value.total)}
              </span>
            ) : null
          }
        >
          <div className="flex flex-col gap-3">
            {grant.reveal_count > 0 ? (
              <PanelNote>{supportAccessMessages.detail.revealsCountNote}</PanelNote>
            ) : null}
            <RevealLogTable
              rows={reveals.ok ? reveals.value.rows : []}
              total={reveals.ok ? reveals.value.total : 0}
              page={revealPage}
              location={{ path: grantHref(grantId), query: toQueryRecord(raw) }}
              clock={clock}
              error={reveals.ok ? null : reveals.message}
            />
          </div>
        </Card>

        <Card
          title={supportAccessMessages.detail.trailTitle}
          description={supportAccessMessages.detail.trailDescription}
          flush
        >
          <DecisionTrail
            rows={trail.ok ? trail.value : []}
            clock={clock}
            error={trail.ok ? null : trail.message}
          />
        </Card>
      </div>
    </>
  )
}

function DetailHeader({ kicker, action }: { kicker?: ReactNode; action?: ReactNode }) {
  return (
    <PageHeader
      title={supportAccessMessages.detail.title}
      description={supportAccessMessages.boundaryNote}
      kicker={kicker}
      action={action}
      breadcrumbs={[
        { label: supportAccessMessages.list.title, href: SUPPORT_ACCESS_PATH },
        { label: supportAccessMessages.detail.title },
      ]}
    />
  )
}
