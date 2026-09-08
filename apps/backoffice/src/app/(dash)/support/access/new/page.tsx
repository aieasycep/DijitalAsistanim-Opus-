import { systemClock } from '@da/domain'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Badge, Card, CardError, PageHeader } from '@/components/ui'
import { ConsequenceNotice } from '@/components/support-access/ConsequenceNotice'
import { GrantStatusBadge } from '@/components/support-access/GrantStatusBadge'
import { RequestForm } from '@/components/support-access/RequestForm'
import { ScopeChips } from '@/components/support-access/ScopeList'
import { SubjectLookupForm } from '@/components/support-access/SubjectLookupForm'
import { SubjectOperationsPanel } from '@/components/support-access/SubjectOperationsPanel'
import {
  NEW_SUBJECT_PARAM,
  SUPPORT_ACCESS_PATH,
  firstParam,
  grantHref,
  isUuidParam,
  userHref,
} from '@/components/support-access/contract'
import { csrfField, requirePermission } from '@/lib/auth'
import { formatDateTime } from '@/lib/format'
import { supportAccessMessages } from '@/lib/messages/support-access'
import {
  findLiveGrantFor,
  listSubjectGrants,
  loadSubjectOperations,
  loadSubjectSummary,
  settle,
} from '@/lib/queries/support-access'
import {
  DEFAULT_SUPPORT_ACCESS_WINDOW_MINUTES,
  MAX_SUPPORT_ACCESS_REASON,
  MAX_SUPPORT_ACCESS_WINDOW_MINUTES,
  MIN_SUPPORT_ACCESS_REASON,
  SUPPORT_ACCESS_WINDOW_OPTIONS,
} from '@/lib/support-access'

export const metadata: Metadata = { title: supportAccessMessages.request.title }
export const dynamic = 'force-dynamic'

/**
 * Ask for Support Access.
 *
 * ---------------------------------------------------------------------------
 * WHO MAY OPEN THIS
 * ---------------------------------------------------------------------------
 *
 * `support.access.request`, server-side. Opening the form grants nothing and
 * submitting it grants nothing either: the row lands as `pending_approval`, and
 * only a *different* admin holding `support.access.approve` can make it usable
 * — `support_access_grants_four_eyes` is a check constraint, not a policy this
 * page could relax.
 *
 * ---------------------------------------------------------------------------
 * THE ORDER OF THIS PAGE IS THE ARGUMENT
 * ---------------------------------------------------------------------------
 *
 *   1. What you are about to be able to see, for how long, and that every view
 *      is recorded against your name.
 *   2. Everything about this account you can already see *without* asking —
 *      connection health, last sync, processed and failed counts, all from
 *      `bo_user_detail`, none of it content, none of it requiring anybody's
 *      approval. Most support calls end here.
 *   3. Who has asked about this account before, and whether you already hold a
 *      live grant over it — `support_access_grants_one_active` will refuse a
 *      second one, so it is better to know now than after writing a paragraph.
 *   4. The form.
 *
 * The bounds it renders are read from `@/lib/support-access` and passed down as
 * props rather than restated: the twenty-character reason floor and the
 * twenty-four hour ceiling are database constraints, and a form that disagreed
 * with them would be a form whose submissions fail.
 */
export default async function NewSupportAccessRequestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePermission('support.access.request')
  const raw = await searchParams
  const requested = firstParam(raw, NEW_SUBJECT_PARAM)
  const subjectUserId = isUuidParam(requested) ? requested : ''
  const clock = systemClock

  const [subject, operations, history, liveGrant] = await Promise.all([
    subjectUserId === '' ? null : settle(() => loadSubjectSummary(subjectUserId)),
    subjectUserId === '' ? null : settle(() => loadSubjectOperations(subjectUserId)),
    subjectUserId === '' ? null : settle(() => listSubjectGrants(subjectUserId)),
    subjectUserId === ''
      ? null
      : settle(() => findLiveGrantFor(session.adminUserId, subjectUserId)),
  ])

  const subjectRow = subject !== null && subject.ok ? subject.value : null
  const subjectMissing = subject !== null && subject.ok && subject.value === null

  return (
    <>
      <PageHeader
        title={supportAccessMessages.request.title}
        description={supportAccessMessages.request.description}
        breadcrumbs={[
          { label: supportAccessMessages.list.title, href: SUPPORT_ACCESS_PATH },
          { label: supportAccessMessages.request.title },
        ]}
      />

      <div className="flex max-w-5xl flex-col gap-4">
        <ConsequenceNotice />

        <Card
          title={supportAccessMessages.request.lookupTitle}
          description={supportAccessMessages.request.lookupDescription}
        >
          <div className="flex flex-col gap-3">
            <SubjectLookupForm value={requested} />

            {requested !== '' && subjectUserId === '' ? (
              <p role="alert" className="text-[12px] font-medium text-critical-text">
                {supportAccessMessages.request.subjectInvalid}
              </p>
            ) : null}

            {subjectMissing ? (
              <p role="alert" className="text-[12px] font-medium text-critical-text">
                {supportAccessMessages.request.subjectUnknown}
              </p>
            ) : null}

            {subject !== null && !subject.ok ? (
              <CardError
                message={subject.message}
                hint={supportAccessMessages.request.subjectLookupFailed}
              />
            ) : null}

            {subjectRow === null ? null : (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-hairline bg-surface2/50 px-3 py-2">
                <Badge tone="success">{supportAccessMessages.request.subjectFound}</Badge>
                <span className="text-[13px] text-ink">{subjectRow.email_redacted}</span>
                <Link
                  href={userHref(subjectRow.user_id)}
                  className="text-[12px] text-primary-on-soft hover:underline"
                >
                  {supportAccessMessages.request.subjectOpen}
                </Link>
              </div>
            )}
          </div>
        </Card>

        <Card
          title={supportAccessMessages.request.metadataTitle}
          description={supportAccessMessages.request.metadataDescription}
        >
          {operations === null ? (
            <p className="text-[12px] text-faint">{supportAccessMessages.request.lookupPending}</p>
          ) : (
            <SubjectOperationsPanel
              detail={operations.ok ? operations.value : null}
              clock={clock}
              error={operations.ok ? null : operations.message}
            />
          )}
        </Card>

        {liveGrant !== null && liveGrant.ok && liveGrant.value !== null ? (
          <p
            role="alert"
            className="flex flex-wrap items-center gap-2 rounded-md bg-critical-soft px-3 py-2 text-[12px] text-critical-text"
          >
            <span>{supportAccessMessages.request.existingLive}</span>
            <Link
              href={grantHref(liveGrant.value.grant_id)}
              className="font-semibold underline underline-offset-2"
            >
              {supportAccessMessages.request.existingLiveOpen}
            </Link>
          </p>
        ) : null}

        {history === null ? null : (
          <Card
            title={supportAccessMessages.request.existingTitle}
            description={supportAccessMessages.request.existingDescription}
          >
            {!history.ok ? (
              <CardError message={history.message} />
            ) : history.value.length === 0 ? (
              <p className="text-[12px] text-faint">
                {supportAccessMessages.request.existingEmpty}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {history.value.map((grant) => (
                  <li
                    key={grant.grant_id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline/70 pb-2 last:border-b-0 last:pb-0"
                  >
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <GrantStatusBadge
                          row={grant}
                          now={clock.now()}
                          minutesRemaining={grant.minutes_remaining}
                        />
                        <span className="text-[12px] text-muted">{grant.admin_email_redacted}</span>
                        <span className="text-[11px] text-faint">
                          {formatDateTime(grant.requested_at)}
                        </span>
                      </span>
                      <ScopeChips scopes={grant.scopes} />
                    </span>
                    <Link
                      href={grantHref(grant.grant_id)}
                      className="text-[12px] font-medium text-primary-on-soft hover:underline"
                    >
                      {supportAccessMessages.list.detailLink}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <Card
          title={supportAccessMessages.request.title}
          description={supportAccessMessages.boundaryNote}
        >
          <RequestForm
            csrf={csrfField(session)}
            initialSubjectUserId={subjectUserId}
            minReasonLength={MIN_SUPPORT_ACCESS_REASON}
            maxReasonLength={MAX_SUPPORT_ACCESS_REASON}
            windowOptions={SUPPORT_ACCESS_WINDOW_OPTIONS}
            defaultWindowMinutes={DEFAULT_SUPPORT_ACCESS_WINDOW_MINUTES}
            maxWindowHours={MAX_SUPPORT_ACCESS_WINDOW_MINUTES / 60}
          />
        </Card>
      </div>
    </>
  )
}
