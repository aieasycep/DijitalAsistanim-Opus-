import { systemClock } from '@da/domain'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { Card, CardError, PageHeader, StatGrid, StatTile } from '@/components/ui'
import { PanelNote } from '@/components/support-access/Facts'
import { GrantStatusBadge } from '@/components/support-access/GrantStatusBadge'
import { RevealForm } from '@/components/support-access/RevealForm'
import { RevealLogTable } from '@/components/support-access/RevealLogTable'
import { RevealNotice } from '@/components/support-access/RevealNotice'
import { RevealScopePicker } from '@/components/support-access/RevealScopePicker'
import {
  REVEAL_PAGE_PARAM,
  REVEAL_SCOPE_PARAM,
  SUPPORT_ACCESS_PATH,
  firstParam,
  grantHref,
  isUuidParam,
  orderedScopes,
  revealHref,
  toQueryRecord,
} from '@/components/support-access/contract'
import {
  DEFAULT_REVEAL_LISTING_LIMIT,
  MAX_REVEAL_RANGE_DAYS,
  REVEAL_LISTING_LIMIT_OPTIONS,
  SCOPE_INPUT_KIND,
  revealAvailability,
  selectRevealScope,
} from '@/components/support-access/reveal'
import { csrfField, requirePermission } from '@/lib/auth'
import { formatCompact, formatDateTime, istanbulToday } from '@/lib/format'
import { supportAccessMessages } from '@/lib/messages/support-access'
import {
  REVEAL_DENIAL_MESSAGES_TR,
  SCOPE_LABELS_TR,
  SCOPE_SENSITIVITY_ORDER,
  formatMinutesRemainingTr,
  shortId,
  type SupportAccessScope,
} from '@/lib/redact'
import { countRevealsByScope, listReveals, loadGrant, settle } from '@/lib/queries/support-access'

export const metadata: Metadata = { title: supportAccessMessages.reveal.title }
export const dynamic = 'force-dynamic'

/**
 * The reveal console: the one screen in this product that shows an operator a
 * user's own words.
 *
 * ---------------------------------------------------------------------------
 * WHO MAY OPEN THIS
 * ---------------------------------------------------------------------------
 *
 * `support.access.reveal`, server-side, before anything renders — held by
 * `support` and `super_admin`, and deliberately not by `operations`, who
 * approve grants and may not spend them. Holding the permission is not enough
 * to see anything: every control on the page is drawn from
 * `revealAvailability()`, which asks the reveal gate itself whether *this*
 * operator may spend *this* grant on *that* scope right now, and a grant
 * belonging to somebody else or one whose window has closed renders a sentence
 * instead of a form.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS ON SCREEN BEFORE ANYTHING IS OPENED
 * ---------------------------------------------------------------------------
 *
 * Nothing that is content. The grant row, the operator's own written reason,
 * the countdown, the number of records already opened under this grant and the
 * log of which ones — all from `bo_support_access_grants` and
 * `bo_support_access_reveals`, neither of which has a content column to
 * project. Content appears only inside `RevealForm`, only after a submit, and
 * only as the return value of an `sa_reveal_*` call that logged itself in the
 * same statement.
 *
 * ---------------------------------------------------------------------------
 * WHY THE NUMBERS ARE ON THE PAGE THAT SPENDS THEM
 * ---------------------------------------------------------------------------
 *
 * "43 dakika" and "12 kayıt açıldı" are on the grant record too, and they are
 * repeated here on purpose. An operator working a ticket is on this screen, not
 * on the record, and the two facts that should be hardest to ignore — how long
 * they have, and how much they have already taken — belong where the decision
 * to take more is actually made.
 */
export default async function SupportAccessRevealPage({
  params,
  searchParams,
}: {
  params: Promise<{ grantId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePermission('support.access.reveal')

  const { grantId } = await params
  if (!isUuidParam(grantId)) notFound()

  const raw = await searchParams
  const clock = systemClock
  const now = clock.now()

  const loaded = await settle(() => loadGrant(grantId))
  if (!loaded.ok) {
    return (
      <>
        <RevealHeader grantId={grantId} />
        <CardError message={loaded.message} hint={supportAccessMessages.detail.notFoundHint} />
      </>
    )
  }
  const grant = loaded.value
  if (grant === null) notFound()

  const availability = revealAvailability({
    row: grant,
    viewerAdminUserId: session.adminUserId,
    permissions: session.permissions,
    now,
  })
  const offered = availability.permitted ? availability.scopes : []
  const selection = selectRevealScope(firstParam(raw, REVEAL_SCOPE_PARAM), offered)

  const granted: readonly SupportAccessScope[] = orderedScopes(
    grant.scopes,
    SCOPE_SENSITIVITY_ORDER,
  )

  const revealPageRaw = Number(firstParam(raw, REVEAL_PAGE_PARAM))
  const revealPage =
    Number.isFinite(revealPageRaw) && revealPageRaw >= 1 ? Math.floor(revealPageRaw) : 1

  const [usage, reveals] = await Promise.all([
    settle(() => countRevealsByScope(grantId, granted)),
    settle(() => listReveals({ grantId, page: revealPage })),
  ])

  // Null rather than an empty map when the counts could not be read: a picker
  // that renders "never opened" from a failed query is worse than one that
  // renders nothing.
  const spent = usage.ok
    ? new Map<SupportAccessScope, number>(usage.value.map((entry) => [entry.scope, entry.count]))
    : null
  const today = istanbulToday(clock)

  return (
    <>
      <RevealHeader
        grantId={grantId}
        action={
          <GrantStatusBadge
            row={grant}
            now={now}
            minutesRemaining={availability.minutesRemaining}
          />
        }
      />

      <div className="flex flex-col gap-4">
        <RevealNotice
          subjectLabel={grant.subject_email_redacted ?? shortId(grant.subject_user_id)}
          subjectUserId={grant.subject_user_id}
          minutesRemaining={availability.minutesRemaining}
        />

        <StatGrid>
          <StatTile
            label={supportAccessMessages.reveal.remaining}
            value={formatMinutesRemainingTr(availability.minutesRemaining)}
            hint={supportAccessMessages.reveal.remainingHint}
            tone={availability.minutesRemaining > 0 ? 'primary' : 'critical'}
          />
          <StatTile
            label={supportAccessMessages.reveal.spent}
            value={formatCompact(grant.reveal_count)}
            hint={
              reveals.ok ? supportAccessMessages.reveal.spentHint(reveals.value.total) : undefined
            }
            tone={grant.reveal_count > 0 ? 'warning' : 'neutral'}
          />
          <StatTile
            label={supportAccessMessages.reveal.scopesTile}
            value={String(offered.length)}
            hint={supportAccessMessages.reveal.scopesTileHint(granted.length)}
          />
          <StatTile
            label={supportAccessMessages.reveal.expires}
            value={formatDateTime(grant.expires_at)}
            hint={supportAccessMessages.detail.expiresAt}
          />
        </StatGrid>

        <Card
          title={supportAccessMessages.reveal.grantTitle}
          description={supportAccessMessages.reveal.grantDescription}
          action={
            <Link
              href={grantHref(grantId)}
              className="text-[12px] font-medium text-primary-on-soft hover:underline"
            >
              {supportAccessMessages.reveal.backToGrant}
            </Link>
          }
        >
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-ink">{grant.reason}</p>
        </Card>

        {availability.permitted ? (
          <>
            <Card
              title={supportAccessMessages.reveal.scopePickerTitle}
              description={supportAccessMessages.reveal.scopePickerDescription}
            >
              <div className="flex flex-col gap-3">
                {selection.rejected ? (
                  <p
                    role="alert"
                    className="rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning-text"
                  >
                    {supportAccessMessages.reveal.scopeRejected}
                  </p>
                ) : null}
                <RevealScopePicker
                  grantId={grantId}
                  scopes={availability.scopes}
                  selected={selection.scope}
                  spent={spent}
                />
              </div>
            </Card>

            {selection.scope === null ? (
              <PanelNote>{supportAccessMessages.reveal.scopeNotChosen}</PanelNote>
            ) : (
              <Card
                title={supportAccessMessages.reveal.formTitle(SCOPE_LABELS_TR[selection.scope])}
              >
                <RevealForm
                  csrf={csrfField(session)}
                  grantId={grantId}
                  scope={selection.scope}
                  kind={SCOPE_INPUT_KIND[selection.scope]}
                  limitOptions={REVEAL_LISTING_LIMIT_OPTIONS}
                  defaultLimit={DEFAULT_REVEAL_LISTING_LIMIT}
                  defaultFrom={today}
                  defaultTo={today}
                  maxRangeDays={MAX_REVEAL_RANGE_DAYS}
                />
              </Card>
            )}
          </>
        ) : (
          <Card title={supportAccessMessages.reveal.refusedTitle}>
            <CardError
              message={REVEAL_DENIAL_MESSAGES_TR[availability.reason]}
              hint={supportAccessMessages.reveal.refusedHint}
              action={
                <Link
                  href={grantHref(grantId)}
                  className="text-[12px] font-semibold underline underline-offset-2"
                >
                  {supportAccessMessages.reveal.backToGrant}
                </Link>
              }
            />
          </Card>
        )}

        <Card
          title={supportAccessMessages.reveal.logTitle}
          description={supportAccessMessages.reveal.logDescription}
          flush
        >
          <RevealLogTable
            rows={reveals.ok ? reveals.value.rows : []}
            total={reveals.ok ? reveals.value.total : 0}
            page={revealPage}
            location={{ path: revealHref(grantId), query: toQueryRecord(raw) }}
            clock={clock}
            error={reveals.ok ? null : reveals.message}
          />
        </Card>
      </div>
    </>
  )
}

function RevealHeader({ grantId, action }: { grantId: string; action?: ReactNode }) {
  return (
    <PageHeader
      title={supportAccessMessages.reveal.title}
      description={supportAccessMessages.reveal.description}
      kicker={<span className="font-mono">{shortId(grantId)}</span>}
      action={action}
      breadcrumbs={[
        { label: supportAccessMessages.list.title, href: SUPPORT_ACCESS_PATH },
        { label: supportAccessMessages.detail.title, href: grantHref(grantId) },
        { label: supportAccessMessages.reveal.title },
      ]}
    />
  )
}
