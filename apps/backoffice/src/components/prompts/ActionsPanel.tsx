import Link from 'next/link'
import { Button, ConfirmDialog } from '@/components/ui'
import { activatePromptVersionAction, archivePromptVersionAction } from '@/lib/actions/prompts'
import { promptMessages } from '@/lib/messages/prompts'
import type { PromptRecord } from '@/lib/queries/prompts'
import {
  ACTIVATE_FIELDS,
  ARCHIVE_FIELDS,
  PROMPT_REASON_MAX,
  PROMPT_REASON_MIN,
  newPromptPath,
  promptEditPath,
  versionReference,
} from './contract'

/**
 * The three things that can be done to a version, each behind the confirmation
 * its consequence deserves.
 *
 * ---------------------------------------------------------------------------
 * THE CONTROLS DIFFER BY STATUS BECAUSE THE LIFECYCLE DOES
 * ---------------------------------------------------------------------------
 *
 * A draft can be edited, activated or thrown away. An active version can only be
 * superseded — its body is frozen because a week of usage rows are attributed to
 * that exact text — so the control offered is "start a new draft from this one",
 * which is how a prompt is actually revised. An archived version offers the same
 * copy-forward and nothing else: it cannot be reactivated, because reactivating
 * would make the same version number mean two different periods of traffic.
 *
 * ---------------------------------------------------------------------------
 * THE CONFIRMATIONS SAY WHAT WILL HAPPEN, INCLUDING THE PART NOBODY ASKED ABOUT
 * ---------------------------------------------------------------------------
 *
 * The activation dialog names the version it will archive, because that
 * archiving is a second effect of pressing one button and an operator should not
 * discover it afterwards. When the two bodies are byte-identical — the
 * fingerprints match — it says so, since activating a copy of what is already
 * serving changes nothing but the record.
 *
 * Archiving the *active* version additionally asks for the feature's name to be
 * typed. It is the one control here that can leave a feature with no versioned
 * prompt at all, and muscle memory should not be able to carry anyone through
 * it.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS COMPONENT DECIDES: NOTHING
 * ---------------------------------------------------------------------------
 *
 * `canWrite` and `canActivate` decide what is *drawn*. The Server Actions
 * re-establish the session, re-verify the CSRF token and ask
 * `admin_role_permissions` again — `runAdminAction` for the activation,
 * `assertPermissionAtSource` for the archive — and audit the refusal. Hiding a
 * button is not security; this panel assumes it is not.
 */
export function ActionsPanel({
  record,
  activeVersion,
  canWrite,
  canActivate,
  csrf,
}: {
  record: PromptRecord
  /**
   * The version currently serving this feature: an object when one is serving,
   * `null` when none is, and `undefined` when the read that would have answered
   * failed. The three are kept apart because the dialog says a different
   * sentence for each, and "ilk etkin prompt" would be a claim rather than a
   * fact if it were shown for an unanswered question.
   */
  activeVersion: { version: number; fingerprint: string } | null | undefined
  canWrite: boolean
  canActivate: boolean
  /** `{ name, value }` from `csrfField(session)`. */
  csrf: { name: string; value: string }
}) {
  if (!canWrite && !canActivate) {
    return <p className="text-[12px] text-faint">{promptMessages.actions.noPermission}</p>
  }

  const reason = {
    label: promptMessages.actions.reasonLabel,
    placeholder: promptMessages.actions.reasonPlaceholder,
    minLength: PROMPT_REASON_MIN,
    maxLength: PROMPT_REASON_MAX,
  }

  const summary = (
    <div className="rounded-md border border-hairline px-3 py-2">
      <p className="font-mono text-[12px] text-ink">
        {versionReference(record.feature, record.version)}
      </p>
      <p className="mt-0.5 text-[11px] text-faint">
        {promptMessages.table.characters(record.body_length)} ·{' '}
        {record.model ?? promptMessages.detail.factModelEmpty}
      </p>
    </div>
  )

  const identicalToActive =
    activeVersion != null && activeVersion.fingerprint === record.body_fingerprint

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {record.status === 'draft' && canWrite ? (
          <Button asChild size="md" variant="secondary">
            <Link href={promptEditPath(record.id)}>{promptMessages.actions.edit}</Link>
          </Button>
        ) : null}

        {record.status !== 'draft' && canWrite ? (
          <Button asChild size="md" variant="secondary">
            <Link href={newPromptPath(record.feature, record.id)}>
              {promptMessages.actions.newVersion}
            </Link>
          </Button>
        ) : null}

        {record.status === 'draft' && canActivate ? (
          <ConfirmDialog
            trigger={<Button variant="primary">{promptMessages.actions.activate}</Button>}
            title={promptMessages.actions.activateTitle}
            description={promptMessages.actions.activateBody}
            confirmLabel={promptMessages.actions.activateConfirm}
            action={activatePromptVersionAction}
            hiddenFields={{
              [csrf.name]: csrf.value,
              [ACTIVATE_FIELDS.promptId]: record.id,
            }}
            reason={reason}
            note={identicalToActive ? promptMessages.actions.activateNoDiff : null}
            destructive={false}
          >
            <div className="flex flex-col gap-2">
              {summary}
              {activeVersion === undefined ? null : (
                <p className="text-[12px] text-muted">
                  {activeVersion === null
                    ? promptMessages.actions.activateFirst(record.feature)
                    : promptMessages.actions.activateReplaces(
                        record.feature,
                        activeVersion.version,
                      )}
                </p>
              )}
            </div>
          </ConfirmDialog>
        ) : null}

        {record.status !== 'archived' && canWrite ? (
          <ConfirmDialog
            trigger={<Button variant="danger">{promptMessages.actions.archive}</Button>}
            title={promptMessages.actions.archiveTitle}
            description={
              record.status === 'active'
                ? promptMessages.actions.archiveActiveBody
                : promptMessages.actions.archiveDraftBody
            }
            confirmLabel={promptMessages.actions.archiveConfirm}
            action={archivePromptVersionAction}
            hiddenFields={{
              [csrf.name]: csrf.value,
              [ARCHIVE_FIELDS.promptId]: record.id,
            }}
            reason={reason}
            // Retiring the live version leaves the feature without a versioned
            // prompt. Typing the feature's own name is the friction that
            // separates that from archiving a draft nobody used.
            {...(record.status === 'active' ? { confirmPhrase: record.feature } : {})}
            destructive
          >
            {summary}
          </ConfirmDialog>
        ) : null}
      </div>

      {record.status === 'archived' ? (
        <p className="text-[12px] text-faint">{promptMessages.actions.archived}</p>
      ) : null}

      {record.status !== 'draft' && canWrite ? (
        <p className="text-[11px] text-faint">{promptMessages.actions.newVersionHint}</p>
      ) : null}

      {record.status === 'draft' && !canActivate ? (
        <p className="text-[12px] text-faint">{promptMessages.actions.noActivatePermission}</p>
      ) : null}
    </div>
  )
}
