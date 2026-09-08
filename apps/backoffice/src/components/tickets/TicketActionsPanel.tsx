import { Badge, Button, Card, ConfirmDialog } from '@/components/ui'
import type { SupportTicketTableRow } from '@/lib/db'
import { ticketMessages, ticketPriorityLabels, ticketStatusLabels } from '@/lib/messages/tickets'
import type { TicketAdmin } from '@/lib/queries/tickets'
import { CSRF_FIELD_NAME } from '@/lib/session-cookies'
import {
  TICKET_FIELDS,
  TICKET_PRIORITIES,
  TICKET_REASON_MAX,
  TICKET_REASON_MIN,
  WORKING_TICKET_STATUSES,
  isReopenable,
  type TicketPriority,
  type TicketStatus,
} from './contract'
import { AssignForm, type AssignableAdminOption } from './AssignForm'
import { adminLabel, priorityTone, statusTone } from './presentation'

/**
 * Everything an operator may do to this ticket, and nothing they may not.
 *
 * ---------------------------------------------------------------------------
 * ONE CONTROL, ONE OUTCOME
 * ---------------------------------------------------------------------------
 *
 * Each status and each priority is its own button behind its own confirmation,
 * carrying its target in a hidden field. The value the ticket already has is
 * rendered as a badge rather than as a button, because a control that does
 * nothing when pressed is worse than no control: it teaches an operator that
 * the screen sometimes ignores them.
 *
 * The transitions that are not available from the ticket's current state are
 * not rendered as disabled buttons either. A resolved ticket shows "yeniden
 * aç" and no working-status buttons, and the panel says why in a sentence —
 * the same rule the Server Action enforces, so what is on screen and what the
 * server will accept are the same set.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS NOT HERE
 * ---------------------------------------------------------------------------
 *
 * No delete. `support_tickets` is the record of what support was asked and what
 * it did, and 0019 gives the console exactly one deletable table, which this is
 * not. A ticket that should not have been opened is closed with a reason, and
 * the reason is the point.
 *
 * No "kullanıcı olarak giriş yap", no mailbox preview, no content of any kind.
 *
 * ---------------------------------------------------------------------------
 * PERMISSIONS
 * ---------------------------------------------------------------------------
 *
 * `canWrite` and `canAssign` decide what is *rendered*. What may actually
 * *happen* is decided by `requirePermissionAction` and a second check against
 * the database inside the Server Action, which run whether or not the control
 * was ever drawn.
 */

export interface TicketActionsPanelProps {
  ticket: SupportTicketTableRow
  assignee: TicketAdmin | undefined
  /** Admins holding `support.ticket.write`, from `bo_admin_permissions`. */
  assignableAdmins: readonly TicketAdmin[]
  currentAdminUserId: string
  canWrite: boolean
  canAssign: boolean
  csrfToken: string
  returnTo: string
  assignAction: (formData: FormData) => void | Promise<void>
  statusAction: (formData: FormData) => void | Promise<void>
  priorityAction: (formData: FormData) => void | Promise<void>
  resolveAction: (formData: FormData) => void | Promise<void>
  reopenAction: (formData: FormData) => void | Promise<void>
}

export function TicketActionsPanel(props: TicketActionsPanelProps) {
  const { ticket, canWrite, canAssign } = props

  if (!canWrite && !canAssign) {
    return (
      <Card title={ticketMessages.detail.sectionActions}>
        <p className="text-[13px] text-muted">{ticketMessages.actions.readOnly}</p>
      </Card>
    )
  }

  const reopenable = isReopenable(ticket.status)

  return (
    <Card title={ticketMessages.detail.sectionActions}>
      <div className="flex flex-col gap-5">
        {canAssign ? <AssignSection {...props} /> : null}

        {canWrite ? (
          <>
            <StatusSection {...props} reopenable={reopenable} />
            <PrioritySection {...props} />
            <ResolutionSection {...props} reopenable={reopenable} />
          </>
        ) : null}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

function AssignSection({
  ticket,
  assignee,
  assignableAdmins,
  currentAdminUserId,
  csrfToken,
  returnTo,
  assignAction,
}: TicketActionsPanelProps) {
  const options: readonly AssignableAdminOption[] = assignableAdmins.map((admin) => ({
    adminUserId: admin.adminUserId,
    label: adminLabel(admin),
    isSelf: admin.adminUserId === currentAdminUserId,
  }))

  return (
    <section>
      <h3 className="text-[13px] font-semibold text-ink">{ticketMessages.actions.assignHeading}</h3>
      <p className="mt-0.5 mb-2 text-[12px] text-muted">
        {ticketMessages.actions.assignDescription}
      </p>
      <AssignForm
        action={assignAction}
        ticketId={ticket.id}
        returnTo={returnTo}
        csrfToken={csrfToken}
        currentAssigneeId={ticket.assigned_admin_user_id}
        currentAssigneeLabel={ticket.assigned_admin_user_id === null ? null : adminLabel(assignee)}
        options={options}
      />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

function StatusSection({
  ticket,
  csrfToken,
  returnTo,
  statusAction,
  reopenable,
}: TicketActionsPanelProps & { reopenable: boolean }) {
  const current = ticket.status as TicketStatus

  return (
    <section>
      <h3 className="text-[13px] font-semibold text-ink">{ticketMessages.actions.statusHeading}</h3>
      <p className="mt-0.5 mb-2 text-[12px] text-muted">
        {ticketMessages.actions.statusDescription}
      </p>

      <p className="mb-2 flex items-center gap-2 text-[12px] text-muted">
        <span className="bo-kicker">{ticketMessages.actions.statusCurrent}</span>
        <Badge tone={statusTone[current]} dot>
          {ticketStatusLabels[current]}
        </Badge>
      </p>

      {reopenable ? (
        <p className="rounded-md bg-surface2 px-3 py-2 text-[12px] text-muted">
          {ticketMessages.actions.statusLocked}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {WORKING_TICKET_STATUSES.filter((target) => target !== current).map((target) => (
            <StatusButton
              key={target}
              ticket={ticket}
              target={target}
              current={current}
              csrfToken={csrfToken}
              returnTo={returnTo}
              action={statusAction}
            />
          ))}
          <StatusButton
            ticket={ticket}
            target="closed"
            current={current}
            csrfToken={csrfToken}
            returnTo={returnTo}
            action={statusAction}
            destructive
          />
        </div>
      )}
    </section>
  )
}

function StatusButton({
  ticket,
  target,
  current,
  csrfToken,
  returnTo,
  action,
  destructive = false,
}: {
  ticket: SupportTicketTableRow
  target: TicketStatus
  current: TicketStatus
  csrfToken: string
  returnTo: string
  action: (formData: FormData) => void | Promise<void>
  destructive?: boolean
}) {
  const label = ticketStatusLabels[target]
  const closing = target === 'closed'

  return (
    <ConfirmDialog
      trigger={
        <Button variant={destructive ? 'danger' : 'secondary'} size="sm">
          {closing ? ticketMessages.actions.closeTrigger : label}
        </Button>
      }
      title={
        closing
          ? ticketMessages.actions.closeConfirmTitle
          : ticketMessages.actions.statusConfirmTitle(label)
      }
      description={
        closing
          ? ticketMessages.actions.closeConfirmBody
          : ticketMessages.actions.statusConfirmBody(ticketStatusLabels[current], label)
      }
      confirmLabel={
        closing
          ? ticketMessages.actions.closeConfirmAction
          : ticketMessages.actions.statusConfirmAction
      }
      action={action}
      destructive={destructive}
      hiddenFields={{
        [CSRF_FIELD_NAME]: csrfToken,
        [TICKET_FIELDS.ticketId]: ticket.id,
        [TICKET_FIELDS.returnTo]: returnTo,
        [TICKET_FIELDS.status]: target,
      }}
      reason={{
        name: TICKET_FIELDS.reason,
        minLength: TICKET_REASON_MIN,
        maxLength: TICKET_REASON_MAX,
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Priority
// ---------------------------------------------------------------------------

function PrioritySection({ ticket, csrfToken, returnTo, priorityAction }: TicketActionsPanelProps) {
  const current = ticket.priority as TicketPriority

  return (
    <section>
      <h3 className="text-[13px] font-semibold text-ink">
        {ticketMessages.actions.priorityHeading}
      </h3>
      <p className="mt-0.5 mb-2 text-[12px] text-muted">
        {ticketMessages.actions.priorityDescription}
      </p>

      <p className="mb-2 flex items-center gap-2 text-[12px] text-muted">
        <span className="bo-kicker">{ticketMessages.actions.priorityCurrent}</span>
        <Badge tone={priorityTone[current]}>{ticketPriorityLabels[current]}</Badge>
      </p>

      <div className="flex flex-wrap gap-2">
        {TICKET_PRIORITIES.filter((target) => target !== current).map((target) => (
          <ConfirmDialog
            key={target}
            trigger={<Button size="sm">{ticketPriorityLabels[target]}</Button>}
            title={ticketMessages.actions.priorityConfirmTitle(ticketPriorityLabels[target])}
            description={ticketMessages.actions.priorityConfirmBody(
              ticketPriorityLabels[current],
              ticketPriorityLabels[target],
            )}
            confirmLabel={ticketMessages.actions.priorityConfirmAction}
            action={priorityAction}
            destructive={false}
            hiddenFields={{
              [CSRF_FIELD_NAME]: csrfToken,
              [TICKET_FIELDS.ticketId]: ticket.id,
              [TICKET_FIELDS.returnTo]: returnTo,
              [TICKET_FIELDS.priority]: target,
            }}
            reason={{
              name: TICKET_FIELDS.reason,
              minLength: TICKET_REASON_MIN,
              maxLength: TICKET_REASON_MAX,
            }}
          />
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Resolution and reopening
// ---------------------------------------------------------------------------

function ResolutionSection({
  ticket,
  csrfToken,
  returnTo,
  resolveAction,
  reopenAction,
  reopenable,
}: TicketActionsPanelProps & { reopenable: boolean }) {
  const hidden = {
    [CSRF_FIELD_NAME]: csrfToken,
    [TICKET_FIELDS.ticketId]: ticket.id,
    [TICKET_FIELDS.returnTo]: returnTo,
  }

  return (
    <section>
      <h3 className="text-[13px] font-semibold text-ink">
        {reopenable ? ticketMessages.actions.reopenHeading : ticketMessages.actions.resolveHeading}
      </h3>
      <p className="mt-0.5 mb-2 text-[12px] text-muted">
        {reopenable
          ? ticketMessages.actions.reopenDescription
          : ticketMessages.actions.resolveDescription}
      </p>

      {reopenable ? (
        <ConfirmDialog
          trigger={<Button size="sm">{ticketMessages.actions.reopenTrigger}</Button>}
          title={ticketMessages.actions.reopenConfirmTitle}
          description={ticketMessages.actions.reopenConfirmBody}
          confirmLabel={ticketMessages.actions.reopenConfirmAction}
          action={reopenAction}
          hiddenFields={hidden}
          reason={{
            name: TICKET_FIELDS.reason,
            minLength: TICKET_REASON_MIN,
            maxLength: TICKET_REASON_MAX,
          }}
        />
      ) : (
        <ConfirmDialog
          trigger={
            <Button variant="primary" size="sm">
              {ticketMessages.actions.resolveTrigger}
            </Button>
          }
          title={ticketMessages.actions.resolveConfirmTitle}
          description={ticketMessages.actions.resolveConfirmBody}
          confirmLabel={ticketMessages.actions.resolveConfirmAction}
          action={resolveAction}
          destructive={false}
          hiddenFields={hidden}
          // The resolution note and the audit reason are one sentence, typed
          // once: it is stored on the ticket and it is what the trail records.
          reason={{
            name: TICKET_FIELDS.reason,
            label: ticketMessages.actions.resolveNoteLabel,
            placeholder: ticketMessages.actions.resolveNotePlaceholder,
            description: ticketMessages.actions.resolveNoteDescription,
            minLength: TICKET_REASON_MIN,
            maxLength: TICKET_REASON_MAX,
          }}
        />
      )}
    </section>
  )
}
