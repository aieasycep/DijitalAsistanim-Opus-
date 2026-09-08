import { MAX_REASON_LENGTH, MIN_REASON_LENGTH } from '@/lib/admin-action'
import { Button, ConfirmDialog } from '@/components/ui'
import type { BoFeatureFlagRow } from '@/lib/db'
import { flagMessages } from '@/lib/messages/flags'
import { toggleFlagAction, toggleKillSwitchAction } from '@/lib/actions/flags'
import { BOOLEAN_FALSE, BOOLEAN_TRUE, KILL_FIELDS, TOGGLE_FIELDS } from './contract'
import { audienceLine } from './presentation'

/**
 * The two switches, each behind a confirmation that states what it does.
 *
 * ---------------------------------------------------------------------------
 * THEY ARE DIFFERENT CONTROLS AND THE COPY SAYS SO
 * ---------------------------------------------------------------------------
 *
 * The main switch turns the flag off for everyone who is not individually
 * pinned — a per-user "açık" override survives it, which is precisely how an
 * operator who "turned it off" can still be looking at a bug report. The kill
 * switch is the one control the schema guarantees: `feature_flag_is_enabled()`
 * returns false on it before it reads anything else, overrides included. The
 * dialogs say that in full, because the difference is the whole reason both
 * exist.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS COMPONENT DECIDES: NOTHING
 * ---------------------------------------------------------------------------
 *
 * The buttons render only for an operator who holds `flags.write`, and that is
 * a rendering decision, not the check. `toggleFlagAction` and
 * `toggleKillSwitchAction` re-establish the session, re-verify the CSRF token
 * and ask `admin_role_permissions` again through `runAdminAction`, which audits
 * the refusal. Hiding a button is not security; this panel assumes it is not.
 */
export function SwitchPanel({
  flag,
  canWrite,
  csrf,
}: {
  flag: BoFeatureFlagRow
  canWrite: boolean
  /** `{ name, value }` from `csrfField(session)`. */
  csrf: { name: string; value: string }
}) {
  if (!canWrite) {
    return <p className="text-[12px] text-faint">{flagMessages.actions.noPermission}</p>
  }

  const reason = {
    label: flagMessages.actions.reasonLabel,
    placeholder: flagMessages.actions.reasonPlaceholder,
    minLength: MIN_REASON_LENGTH,
    maxLength: MAX_REASON_LENGTH,
  }

  const summary = (
    <div className="rounded-md border border-hairline px-3 py-2">
      <p className="font-mono text-[12px] text-ink">{flag.key}</p>
      <p className="mt-0.5 text-[11px] text-faint">{audienceLine(flag)}</p>
    </div>
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      {flag.enabled ? (
        <ConfirmDialog
          trigger={<Button variant="secondary">{flagMessages.actions.disable}</Button>}
          title={flagMessages.actions.disableTitle}
          description={flagMessages.actions.disableBody}
          confirmLabel={flagMessages.actions.disableConfirm}
          action={toggleFlagAction}
          hiddenFields={{
            [csrf.name]: csrf.value,
            [TOGGLE_FIELDS.flagId]: flag.flag_id,
            [TOGGLE_FIELDS.enabled]: BOOLEAN_FALSE,
          }}
          reason={reason}
          destructive
        >
          {summary}
        </ConfirmDialog>
      ) : (
        <ConfirmDialog
          trigger={<Button variant="primary">{flagMessages.actions.enable}</Button>}
          title={flagMessages.actions.enableTitle}
          description={flagMessages.actions.enableBody}
          confirmLabel={flagMessages.actions.enableConfirm}
          action={toggleFlagAction}
          hiddenFields={{
            [csrf.name]: csrf.value,
            [TOGGLE_FIELDS.flagId]: flag.flag_id,
            [TOGGLE_FIELDS.enabled]: BOOLEAN_TRUE,
          }}
          reason={reason}
          destructive={false}
        >
          {summary}
        </ConfirmDialog>
      )}

      {flag.kill_switch ? (
        <ConfirmDialog
          trigger={<Button variant="secondary">{flagMessages.actions.releaseKill}</Button>}
          title={flagMessages.actions.releaseKillTitle}
          description={flagMessages.actions.releaseKillBody}
          confirmLabel={flagMessages.actions.releaseKillConfirm}
          action={toggleKillSwitchAction}
          hiddenFields={{
            [csrf.name]: csrf.value,
            [KILL_FIELDS.flagId]: flag.flag_id,
            [KILL_FIELDS.killSwitch]: BOOLEAN_FALSE,
          }}
          reason={reason}
          destructive={false}
        >
          {summary}
        </ConfirmDialog>
      ) : (
        <ConfirmDialog
          trigger={<Button variant="danger">{flagMessages.actions.pullKill}</Button>}
          title={flagMessages.actions.pullKillTitle}
          description={flagMessages.actions.pullKillBody}
          confirmLabel={flagMessages.actions.pullKillConfirm}
          action={toggleKillSwitchAction}
          hiddenFields={{
            [csrf.name]: csrf.value,
            [KILL_FIELDS.flagId]: flag.flag_id,
            [KILL_FIELDS.killSwitch]: BOOLEAN_TRUE,
          }}
          reason={reason}
          // The one control that is guaranteed to stop a feature: the operator
          // must type the flag's own key, so muscle memory cannot carry anyone
          // through the most consequential button on the page.
          confirmPhrase={flag.key}
          destructive
        >
          {summary}
        </ConfirmDialog>
      )}
    </div>
  )
}
