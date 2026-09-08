'use client'

import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Field, Select, fieldControlProps } from '@/components/ui/field'
import { changeAdminRoleAction } from '@/lib/actions/admins'
import { adminMessages } from '@/lib/messages/admins'
import { ROLE_DESCRIPTIONS_TR, type AdminRole } from '@/lib/permissions'
import { ROLE_FIELDS } from './contract'

/**
 * Changing a role: choose, read what it means, then confirm in writing.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS A CLIENT COMPONENT
 * ---------------------------------------------------------------------------
 *
 * One reason: the sentence under the picker. A role is not a label, it is a set
 * of capabilities, and an operator choosing "Finans" should read what Finans
 * can do *while they are choosing it* rather than after they have applied it.
 * The description comes from `ROLE_DESCRIPTIONS_TR`, which mirrors
 * `admin_roles.description_tr` — the same sentence the roles page renders.
 *
 * The confirmation is `ConfirmDialog`, the same one every irreversible action
 * in this console goes through, so the reason field, its floor and the "this is
 * written to the audit log" line are the console's, not this screen's.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS COMPONENT DECIDES: NOTHING
 * ---------------------------------------------------------------------------
 *
 * The picker renders only for an operator the server said holds
 * `admin.role.write`, and that is a rendering decision, not the check.
 * `changeAdminRoleAction` re-establishes the session, re-verifies the CSRF
 * token and asks `admin_role_permissions` again through `runAdminAction`, which
 * audits the refusal. The reason is required by the database, not by the
 * disabled button.
 *
 * The list is the assignable set the server read from `admin_roles`, so a role
 * retired with `is_assignable = false` is not offered — and the action refuses
 * it again if it is posted anyway, because that column has no constraint behind
 * it and the console is its only enforcement.
 */

export interface AssignableRoleOption {
  readonly role: AdminRole
  readonly label: string
  readonly description: string
}

export function RolePanel({
  adminUserId,
  currentRole,
  currentRoleLabel,
  options,
  csrf,
  canWrite,
  isSelf,
  minReasonLength,
  maxReasonLength,
}: {
  adminUserId: string
  currentRole: AdminRole
  currentRoleLabel: string
  options: readonly AssignableRoleOption[]
  /** `{ name, value }` from `csrfField(session)`. */
  csrf: { name: string; value: string }
  canWrite: boolean
  /** Changing your own role is refused server-side; the panel says so up front. */
  isSelf: boolean
  minReasonLength: number
  maxReasonLength: number
}) {
  const baseId = useId()
  const roleId = `${baseId}-role`
  const [role, setRole] = useState<string>(currentRole)

  if (!canWrite) {
    return <p className="text-[12px] text-faint">{adminMessages.actions.noRolePermission}</p>
  }

  if (isSelf) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[13px] text-ink">
          {adminMessages.facts.role}: <span className="font-medium">{currentRoleLabel}</span>
        </p>
        <p className="text-[12px] text-warning-text">{adminMessages.detail.ownAccountNote}</p>
      </div>
    )
  }

  const selected = options.find((option) => option.role === role) ?? null
  const unchanged = role === currentRole

  return (
    <div className="flex flex-col gap-3">
      <Field
        htmlFor={roleId}
        label={adminMessages.actions.roleSelectLabel}
        description={selected?.description ?? ROLE_DESCRIPTIONS_TR[currentRole]}
      >
        <Select
          id={roleId}
          value={role}
          onChange={(event) => {
            setRole(event.target.value)
          }}
          {...fieldControlProps(roleId, { description: true })}
        >
          {options.map((option) => (
            <option key={option.role} value={option.role}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      {unchanged ? (
        <p className="text-[12px] text-faint">{adminMessages.actions.roleUnchanged}</p>
      ) : (
        <ConfirmDialog
          trigger={
            <Button variant="primary" size="md">
              {adminMessages.actions.changeRole}
            </Button>
          }
          title={adminMessages.actions.changeRoleTitle}
          description={adminMessages.actions.changeRoleBody}
          confirmLabel={adminMessages.actions.changeRoleConfirm}
          action={changeAdminRoleAction}
          hiddenFields={{
            [csrf.name]: csrf.value,
            [ROLE_FIELDS.adminUserId]: adminUserId,
            [ROLE_FIELDS.role]: role,
            // The role the page was rendered from. The action filters its
            // UPDATE on this value, so a second operator editing the same admin
            // matches no row and is told the page is stale rather than silently
            // overwriting the first.
            [ROLE_FIELDS.currentRole]: currentRole,
          }}
          reason={{
            label: adminMessages.actions.reasonLabel,
            placeholder: adminMessages.actions.reasonPlaceholder,
            minLength: minReasonLength,
            maxLength: maxReasonLength,
          }}
          destructive={false}
        >
          <div className="rounded-md border border-hairline px-3 py-2">
            <p className="text-[12px] text-ink">
              <span className="text-faint">{currentRoleLabel}</span>
              <span aria-hidden="true" className="mx-1.5">
                →
              </span>
              <span className="font-semibold">{selected?.label ?? role}</span>
            </p>
            <p className="mt-0.5 text-[11px] text-faint">
              {selected?.description ?? ROLE_DESCRIPTIONS_TR[currentRole]}
            </p>
          </div>
        </ConfirmDialog>
      )}
    </div>
  )
}
