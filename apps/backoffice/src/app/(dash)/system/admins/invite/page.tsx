import type { Metadata } from 'next'
import { ADMINS_PATH, InviteForm, ROLES_PATH, type InviteRoleOption } from '@/components/admins'
import { Card, PageHeader } from '@/components/ui'
import { MAX_REASON_LENGTH, MIN_REASON_LENGTH } from '@/lib/admin-action'
import { csrfField, requirePermission } from '@/lib/auth'
import { adminMessages } from '@/lib/messages/admins'
import { loadAssignableRoles, settle } from '@/lib/queries/admins'

/**
 * Invite a colleague to the console.
 *
 * ---------------------------------------------------------------------------
 * WHO MAY OPEN THIS PAGE
 * ---------------------------------------------------------------------------
 *
 * `admin.invite`, checked server-side before anything renders. It is a
 * different permission from `admin.read` on purpose: reading the roster and
 * adding to it are different powers, and only `super_admin` holds the second.
 *
 * ---------------------------------------------------------------------------
 * THE TOKEN
 * ---------------------------------------------------------------------------
 *
 * The invite's token is generated inside the Server Action, hashed there, and
 * returned to the form exactly once. `admin_invites` stores only the SHA-256,
 * and `@/lib/db` refuses any read that names `token_hash` — so this page is the
 * one and only place the plaintext ever exists outside the operator's
 * clipboard, and the panel that shows it says so.
 *
 * ---------------------------------------------------------------------------
 * THE ROLE LIST IS THE DATABASE'S
 * ---------------------------------------------------------------------------
 *
 * `admin_roles.is_assignable` retires a role from this picker without touching
 * the admins already on it — Postgres cannot drop an enum member, so that flag
 * is how a role is decommissioned. The list comes from that table, and the
 * action refuses a retired role if one is posted anyway.
 */

export const metadata: Metadata = { title: adminMessages.invite.title }
export const dynamic = 'force-dynamic'

export default async function InviteAdminPage() {
  const session = await requirePermission('admin.invite')
  const roles = await settle(() => loadAssignableRoles())

  const options: readonly InviteRoleOption[] = roles.ok
    ? roles.value.map((role) => ({
        role: role.role,
        label: role.labelTr,
        description: role.descriptionTr,
      }))
    : []

  return (
    <>
      <PageHeader
        title={adminMessages.invite.title}
        description={adminMessages.invite.description}
        breadcrumbs={[
          { label: adminMessages.list.title, href: ADMINS_PATH },
          { label: adminMessages.invite.breadcrumb },
        ]}
      />

      <Card title={adminMessages.invite.title}>
        {roles.ok && options.length > 0 ? (
          <InviteForm
            options={options}
            csrf={csrfField(session)}
            minReasonLength={MIN_REASON_LENGTH}
            maxReasonLength={MAX_REASON_LENGTH}
          />
        ) : (
          // No picker without a role list. A form that offered a hardcoded set
          // of roles when `admin_roles` could not be read would be a form that
          // invites somebody into a role the database may have retired.
          <p role="alert" className="text-[12px] text-critical-text">
            {roles.ok ? adminMessages.errors.matrixFailed : roles.message}
          </p>
        )}
      </Card>

      <p className="mt-3 text-[11px] text-faint">
        {adminMessages.invite.roleHint} <span className="font-mono">{ROLES_PATH}</span>
      </p>
    </>
  )
}
