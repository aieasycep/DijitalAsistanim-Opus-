import { Button, ConfirmDialog } from '@/components/ui'
import { publishAnnouncementAction, unpublishAnnouncementAction } from '@/lib/actions/announcements'
import {
  STATE_HINTS_TR,
  announcementMessages,
  type AnnouncementState,
} from '@/lib/messages/announcements'
import type { AnnouncementReach } from '@/lib/queries/announcements'
import { ReachPanel } from './ReachPanel'
import { ANNOUNCEMENT_FIELDS, ANNOUNCEMENT_REASON_MAX, ANNOUNCEMENT_REASON_MIN } from './contract'

/**
 * The one control that changes what users see.
 *
 * ---------------------------------------------------------------------------
 * THE CONFIRMATION STATES THE AUDIENCE, NOT JUST THE ACT
 * ---------------------------------------------------------------------------
 *
 * "Yayınla?" with a yes button is a confirmation that confirms nothing: nobody
 * pressing it has been told what they are about to do. So the dialog carries the
 * reach estimate — the count `estimateReach` took in Postgres from the row's own
 * targeting — and the list of dimensions that count could not narrow by, so an
 * operator publishing to "Herkes" sees the number of accounts that actually
 * means before the button appears.
 *
 * Neither dialog claims the action cannot be undone, because both can: a
 * published notice can be unpublished and a draft can be republished. What
 * cannot be undone is that people saw it, and the note says exactly that rather
 * than the stock line.
 *
 * ---------------------------------------------------------------------------
 * THE BUTTON IS NOT THE PERMISSION
 * ---------------------------------------------------------------------------
 *
 * `canWrite` decides whether a control renders. What decides whether a publish
 * happens is `runAdminAction`, which re-asks `admin_role_permissions` and audits
 * the refusal — so an operator who posts this form without the permission leaves
 * a `failure` row on the announcement they aimed it at.
 */

export interface PublishPanelProps {
  announcementId: string
  state: AnnouncementState
  /** `{ name, value }` from `csrfField(session)`. */
  csrf: { name: string; value: string }
  canWrite: boolean
  /** The estimate, or null when the count could not be taken. */
  reach: AnnouncementReach | null
  reachError: string | null
}

export function PublishPanel({
  announcementId,
  state,
  csrf,
  canWrite,
  reach,
  reachError,
}: PublishPanelProps) {
  const published = state !== 'draft'
  const hiddenFields = {
    [ANNOUNCEMENT_FIELDS.announcementId]: announcementId,
    [csrf.name]: csrf.value,
  }

  return (
    <div className="flex flex-col gap-3">
      <StateNotice state={state} />

      {!canWrite ? (
        <p className="text-[12px] text-faint">{announcementMessages.publish.noPermission}</p>
      ) : published ? (
        <ConfirmDialog
          trigger={
            <Button size="md" variant="danger">
              {announcementMessages.publish.unpublishTrigger}
            </Button>
          }
          title={announcementMessages.publish.unpublishTitle}
          description={announcementMessages.publish.unpublishDescription}
          confirmLabel={announcementMessages.publish.unpublishConfirm}
          action={unpublishAnnouncementAction}
          hiddenFields={hiddenFields}
          note={announcementMessages.publish.unpublishNote}
          destructive={false}
          reason={{
            name: ANNOUNCEMENT_FIELDS.reason,
            label: announcementMessages.publish.unpublishReasonLabel,
            placeholder: announcementMessages.publish.unpublishReasonPlaceholder,
            description: announcementMessages.publish.publishReasonDescription,
            minLength: ANNOUNCEMENT_REASON_MIN,
            maxLength: ANNOUNCEMENT_REASON_MAX,
          }}
        />
      ) : (
        <ConfirmDialog
          trigger={
            <Button size="md" variant="primary">
              {announcementMessages.publish.publishTrigger}
            </Button>
          }
          title={announcementMessages.publish.publishTitle}
          description={announcementMessages.publish.publishDescription}
          confirmLabel={announcementMessages.publish.publishConfirm}
          action={publishAnnouncementAction}
          hiddenFields={hiddenFields}
          note={announcementMessages.publish.publishNote}
          destructive={false}
          reason={{
            name: ANNOUNCEMENT_FIELDS.reason,
            label: announcementMessages.publish.publishReasonLabel,
            placeholder: announcementMessages.publish.publishReasonPlaceholder,
            description: announcementMessages.publish.publishReasonDescription,
            minLength: ANNOUNCEMENT_REASON_MIN,
            maxLength: ANNOUNCEMENT_REASON_MAX,
          }}
        >
          <ReachPanel reach={reach} error={reachError} compact />
        </ConfirmDialog>
      )}
    </div>
  )
}

/** The state, as a sentence about the people using the app. */
function StateNotice({ state }: { state: AnnouncementState }) {
  const notice =
    state === 'draft'
      ? { text: announcementMessages.publish.draftNotice, tone: 'bg-surface2 text-muted' }
      : state === 'scheduled'
        ? {
            text: announcementMessages.publish.scheduledNotice,
            tone: 'bg-info-soft text-info-text',
          }
        : state === 'ended'
          ? { text: announcementMessages.publish.endedNotice, tone: 'bg-surface2 text-muted' }
          : {
              text: announcementMessages.publish.liveNotice,
              tone: 'bg-success-soft text-success-text',
            }

  return (
    <div className={`rounded-md px-3 py-2 ${notice.tone}`}>
      <p className="text-[13px] font-semibold">{notice.text}</p>
      <p className="mt-0.5 text-[12px] opacity-90">{STATE_HINTS_TR[state]}</p>
    </div>
  )
}
