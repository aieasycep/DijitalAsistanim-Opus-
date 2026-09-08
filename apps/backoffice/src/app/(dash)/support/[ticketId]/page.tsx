import { systemClock } from '@da/domain'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  AddNoteForm,
  SUPPORT_PATH,
  SubjectContextPanel,
  TICKET_RESULT_PARAMS,
  TicketActionsPanel,
  TicketBodyPanel,
  TicketHistoryPanel,
  TicketNotesPanel,
  TicketResultBanner,
  TicketSummaryPanel,
  isTicketOutcome,
  panelError,
  ticketPath,
  type TicketOutcome,
} from '@/components/tickets'
import { Badge, Mono, PageHeader } from '@/components/ui'
import {
  addTicketNoteAction,
  assignTicketAction,
  changeTicketPriorityAction,
  changeTicketStatusAction,
  reopenTicketAction,
  resolveTicketAction,
} from '@/lib/actions/tickets'
import { csrfField, requirePermission, sessionCan } from '@/lib/auth'
import { ticketMessages, ticketStatusLabels } from '@/lib/messages/tickets'
import { attempt } from '@/lib/queries/shared'
import {
  loadAssignableAdmins,
  loadSubjectContext,
  loadTicket,
  loadTicketAdmins,
  loadTicketHistory,
  loadTicketNotes,
  loadTicketSubjects,
  type TicketAdmin,
} from '@/lib/queries/tickets'
import { isUuid } from '@/lib/redact'
import { statusTone } from '@/components/tickets/presentation'

/**
 * One ticket, and everything an operator needs to answer it.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS ON THIS PAGE
 * ---------------------------------------------------------------------------
 *
 * The ticket itself — what the user wrote to support and what support wrote
 * back — the audited history of every change, and the subject user's
 * operational state: connection health, last sync, plan, recent approval
 * failures. That last part is the answer to most calls, and none of it requires
 * reading anything the user wrote to anybody else.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS NOT, AND CANNOT BE
 * ---------------------------------------------------------------------------
 *
 * No mail, no calendar entry, no assistant message, no notification body, and
 * no way to become the user. The `bo_*` views this page reads carry no such
 * column, so it is not that the page declines to show content — it is that
 * there is no query it could run to obtain it. Content requires an approved,
 * four-eyes, time-limited Support Access grant, which is a different area with
 * its own reveal record.
 *
 * ---------------------------------------------------------------------------
 * FAILURE
 * ---------------------------------------------------------------------------
 *
 * The ticket is loaded first, because a missing ticket is a 404 rather than a
 * page of empty panels. Everything else is settled on its own, so one dead view
 * costs its own panel and the operator still gets the rest.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticketId: string }>
}): Promise<Metadata> {
  const { ticketId } = await params
  // A reference is not enough to identify a person and a subject line might be,
  // so the tab title carries the id and nothing else. Browser titles, window
  // titles and screen-share previews all leak.
  return { title: `${ticketMessages.detail.kicker} · ${ticketId.slice(0, 8)}` }
}

type SearchParams = Record<string, string | string[] | undefined>

export default async function TicketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ ticketId: string }>
  searchParams: Promise<SearchParams>
}) {
  const session = await requirePermission('support.ticket.read')
  const { ticketId } = await params
  const query = await searchParams
  const clock = systemClock

  if (!isUuid(ticketId)) notFound()

  const ticket = await loadTicket(ticketId)
  if (ticket === null) notFound()

  const canWrite = sessionCan(session, 'support.ticket.write')
  const canAssign = sessionCan(session, 'support.ticket.assign')

  const [notes, history, context, assignable] = await Promise.all([
    attempt(() => loadTicketNotes(ticket.id)),
    attempt(() => loadTicketHistory(ticket.id)),
    attempt(async () =>
      ticket.subject_user_id === null ? null : loadSubjectContext(ticket.subject_user_id),
    ),
    // Only fetched when it can be used: the picker is the only thing that
    // needs it, and an operator without the permission never sees one.
    canAssign ? attempt(() => loadAssignableAdmins()) : NO_ASSIGNABLE,
  ])

  // Every admin id this page will have to name, resolved in one request:
  // the assignee, whoever opened it, every note's author, every actor in the
  // history, and everyone the picker offers.
  const adminIds = [
    ticket.assigned_admin_user_id,
    ticket.opened_by_admin_user_id,
    ...(notes.ok ? notes.data.notes.map((note) => note.admin_user_id) : []),
    ...(history.ok ? history.data.map((row) => row.actor_admin_user_id) : []),
    ...(assignable.ok ? assignable.data.map((admin) => admin.adminUserId) : []),
  ].filter((id): id is string => id !== null && id !== '')

  const [admins, subjects] = await Promise.all([
    attempt(() => loadTicketAdmins(adminIds)),
    attempt(() =>
      loadTicketSubjects(ticket.subject_user_id === null ? [] : [ticket.subject_user_id]),
    ),
  ])

  const adminMap = admins.ok ? admins.data : EMPTY_ADMINS
  const subject =
    subjects.ok && ticket.subject_user_id !== null
      ? subjects.data.get(ticket.subject_user_id)
      : undefined

  const selfHref = ticketPath(ticket.id)
  const outcome = readOutcome(query)
  const csrf = csrfField(session)
  const firstResponsePending = ticket.first_response_at === null

  return (
    <>
      <PageHeader
        title={ticket.subject}
        breadcrumbs={[
          { label: ticketMessages.queue.title, href: SUPPORT_PATH },
          { label: ticket.reference },
        ]}
        kicker={
          <span className="flex flex-wrap items-center gap-2">
            {ticketMessages.detail.kicker}
            <Mono>{ticket.reference}</Mono>
            <Badge tone={statusTone[ticket.status]} dot>
              {ticketStatusLabels[ticket.status]}
            </Badge>
          </span>
        }
        action={
          <Link
            href={SUPPORT_PATH}
            className="inline-flex h-7 items-center rounded-md border border-hairline px-2.5 text-[12px] font-medium text-muted transition-colors hover:border-primary/40 hover:text-ink"
          >
            {ticketMessages.detail.backToQueue}
          </Link>
        }
      />

      {outcome === null ? null : (
        <TicketResultBanner
          outcome={outcome.outcome}
          reference={outcome.reference}
          dismissHref={selfHref}
        />
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <TicketSummaryPanel
            ticket={ticket}
            assignee={
              ticket.assigned_admin_user_id === null
                ? undefined
                : adminMap.get(ticket.assigned_admin_user_id)
            }
            openedBy={
              ticket.opened_by_admin_user_id === null
                ? undefined
                : adminMap.get(ticket.opened_by_admin_user_id)
            }
            subject={subject}
            clock={clock}
          />

          <TicketBodyPanel ticket={ticket} />

          <TicketNotesPanel
            notes={notes.ok ? notes.data : null}
            error={panelError(notes)}
            authors={adminMap}
            clock={clock}
            {...(canWrite
              ? {
                  composer: (
                    <AddNoteForm
                      action={addTicketNoteAction}
                      ticketId={ticket.id}
                      returnTo={selfHref}
                      csrfToken={csrf.value}
                      firstResponsePending={firstResponsePending}
                    />
                  ),
                }
              : {})}
          />

          <TicketHistoryPanel
            rows={history.ok ? history.data : null}
            error={panelError(history)}
            actors={adminMap}
            clock={clock}
          />
        </div>

        <div className="flex flex-col gap-4">
          <TicketActionsPanel
            ticket={ticket}
            assignee={
              ticket.assigned_admin_user_id === null
                ? undefined
                : adminMap.get(ticket.assigned_admin_user_id)
            }
            assignableAdmins={assignable.ok ? assignable.data : []}
            currentAdminUserId={session.adminUserId}
            canWrite={canWrite}
            canAssign={canAssign}
            csrfToken={csrf.value}
            returnTo={selfHref}
            assignAction={assignTicketAction}
            statusAction={changeTicketStatusAction}
            priorityAction={changeTicketPriorityAction}
            resolveAction={resolveTicketAction}
            reopenAction={reopenTicketAction}
          />

          <SubjectContextPanel
            userId={ticket.subject_user_id}
            subject={subject}
            context={context.ok ? context.data : null}
            error={panelError(context)}
            clock={clock}
          />

          <p className="text-[11px] text-faint">{ticketMessages.queue.privacyNote}</p>
        </div>
      </div>
    </>
  )
}

/** Stand-in for a failed lookup. Every panel renders its own fallback label. */
const EMPTY_ADMINS: ReadonlyMap<string, TicketAdmin> = new Map<string, TicketAdmin>()

/** The picker's data when the operator may not assign: absent, not empty-by-error. */
const NO_ASSIGNABLE = { ok: true, data: [] } as const

function readOutcome(
  params: SearchParams,
): { outcome: TicketOutcome; reference: string | null } | null {
  const raw = firstOf(params, TICKET_RESULT_PARAMS.outcome)
  if (raw === undefined || !isTicketOutcome(raw)) return null
  return { outcome: raw, reference: firstOf(params, TICKET_RESULT_PARAMS.reference) ?? null }
}

function firstOf(params: SearchParams, name: string): string | undefined {
  const raw = params[name]
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0]
  return undefined
}
