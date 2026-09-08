import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ADMINS_PATH,
  AUDIT_PATH,
  AccessPanel,
  AdminFacts,
  AdminResultBanner,
  PermissionList,
  RESULT_PARAMS,
  ROLES_PATH,
  RolePanel,
  SessionTable,
  TrailTable,
  adminPath,
  firstParam,
  isUuidParam,
  type AssignableRoleOption,
} from '@/components/admins'
import { Card, PageHeader } from '@/components/ui'
import { MAX_REASON_LENGTH, MIN_REASON_LENGTH } from '@/lib/admin-action'
import { csrfField, requirePermission, sessionCan } from '@/lib/auth'
import { dangerousActionNote, describeEnvironment } from '@/lib/env'
import { adminMessages } from '@/lib/messages/admins'
import {
  loadAdmin,
  loadAdminAccountFacts,
  loadAdminPermissions,
  loadAdminSessions,
  loadAdminTrail,
  loadAssignableRoles,
  loadNamedAdmins,
  settle,
  type NamedAdmin,
} from '@/lib/queries/admins'

/**
 * One administrator: what they are, what they can do, where they are signed in,
 * and everything that has been done to their account.
 *
 * ---------------------------------------------------------------------------
 * WHO MAY OPEN THIS PAGE
 * ---------------------------------------------------------------------------
 *
 * `admin.read`, checked server-side before anything renders.
 * `admin.role.write` decides whether the role picker is drawn and
 * `admin.disable` whether the access controls are — and only that. Every
 * Server Action behind them re-establishes the session, re-verifies the CSRF
 * token and asks `admin_role_permissions` again through `runAdminAction`, which
 * writes an audit row for the refusal as well as for the change.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS ON THIS PAGE THAT IS NOT ON THE ROSTER
 * ---------------------------------------------------------------------------
 *
 * The effective permission set, read per account from `bo_admin_permissions` —
 * not the role's entry in a TypeScript table, the rows the database returns for
 * this `admin_user_id`, which is the same join every route guard consults.
 *
 * The session list, from `bo_admin_sessions`, which does not reference
 * `token_hash`, `ip_hash` or `user_agent`: a session list that leaks the token
 * hash is a session list that can be attacked offline.
 *
 * The trail, from `bo_audit` filtered to this account's entity id — successes
 * and refusals alike.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS NOT ON IT
 * ---------------------------------------------------------------------------
 *
 * No delete: `admin_users` carries `on delete restrict` on the audit table's
 * foreign keys so a DELETE fails loudly rather than orphaning accountability,
 * and `@/lib/db` will not delete from this table at all. No "sign in as": this
 * console cannot act as anybody, and that absence is the product's promise.
 */

export const metadata: Metadata = { title: adminMessages.detail.kicker }
export const dynamic = 'force-dynamic'

export default async function AdminDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ adminUserId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePermission('admin.read')

  const { adminUserId } = await params
  if (!isUuidParam(adminUserId)) notFound()

  const admin = await loadAdmin(adminUserId)
  if (admin === null) notFound()

  const raw = await searchParams
  const isSelf = session.adminUserId === admin.admin_user_id
  const canChangeRole = sessionCan(session, 'admin.role.write')
  const canDisable = sessionCan(session, 'admin.disable')
  const csrf = csrfField(session)
  const environmentNote = dangerousActionNote(describeEnvironment())

  const [account, permissions, sessions, trail, roles] = await Promise.all([
    settle(() => loadAdminAccountFacts(admin.admin_user_id)),
    settle(() => loadAdminPermissions(admin.admin_user_id)),
    settle(() => loadAdminSessions(admin.admin_user_id)),
    settle(async () => {
      const rows = await loadAdminTrail(admin.admin_user_id)
      const actors = await loadNamedAdmins(rows.map((row) => row.actor_admin_user_id)).catch(
        () => new Map<string, NamedAdmin>(),
      )
      return { rows, actors }
    }),
    settle(() => loadAssignableRoles()),
  ])

  const inviter =
    admin.invited_by_admin_user_id === null
      ? null
      : ((
          await loadNamedAdmins([admin.invited_by_admin_user_id]).catch(
            () => new Map<string, NamedAdmin>(),
          )
        ).get(admin.invited_by_admin_user_id) ?? null)

  const roleOptions: readonly AssignableRoleOption[] = roles.ok
    ? roles.value.map((role) => ({
        role: role.role,
        label: role.labelTr,
        description: role.descriptionTr,
      }))
    : []

  const title = admin.admin_name ?? admin.email_redacted ?? admin.admin_user_id

  return (
    <>
      <PageHeader
        title={title}
        kicker={adminMessages.detail.kicker}
        description={admin.role_label}
        breadcrumbs={[{ label: adminMessages.list.title, href: ADMINS_PATH }, { label: title }]}
        action={
          <Link
            href={ROLES_PATH}
            className="text-[12px] font-medium text-primary-on-soft underline underline-offset-2 hover:text-primary"
          >
            {adminMessages.list.rolesLink}
          </Link>
        }
      />

      <div className="flex flex-col gap-4">
        <AdminResultBanner
          outcome={firstParam(raw, RESULT_PARAMS.outcome)}
          subject={firstParam(raw, RESULT_PARAMS.subject)}
          dismissHref={adminPath(admin.admin_user_id)}
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex flex-col gap-4">
            <Card
              title={adminMessages.detail.factsSection}
              description={adminMessages.detail.factsDescription}
            >
              <AdminFacts
                admin={admin}
                account={account.ok ? account.value : null}
                inviter={inviter}
                isSelf={isSelf}
              />
            </Card>

            <Card
              title={adminMessages.detail.sessionsSection}
              description={adminMessages.detail.sessionsDescription}
              flush
            >
              <SessionTable
                rows={sessions.ok ? sessions.value.rows : []}
                total={sessions.ok ? sessions.value.total : 0}
                error={sessions.ok ? null : sessions.message}
              />
              <p className="border-t border-hairline px-4 py-2 text-[11px] text-faint">
                {adminMessages.detail.sessionsNote}
              </p>
            </Card>

            <Card
              title={adminMessages.detail.trailSection}
              description={adminMessages.detail.trailDescription}
              action={
                <Link
                  href={AUDIT_PATH}
                  className="text-[12px] font-medium text-primary-on-soft underline underline-offset-2 hover:text-primary"
                >
                  {adminMessages.detail.trailLink}
                </Link>
              }
              flush
            >
              <TrailTable
                rows={trail.ok ? trail.value.rows : []}
                actors={trail.ok ? trail.value.actors : new Map<string, NamedAdmin>()}
                error={trail.ok ? null : trail.message}
              />
            </Card>
          </div>

          <div className="flex flex-col gap-4">
            <Card
              title={adminMessages.detail.roleSection}
              description={adminMessages.detail.roleDescription}
            >
              <RolePanel
                adminUserId={admin.admin_user_id}
                currentRole={admin.role}
                currentRoleLabel={admin.role_label}
                options={roleOptions}
                csrf={csrf}
                canWrite={canChangeRole && roleOptions.length > 0}
                isSelf={isSelf}
                minReasonLength={MIN_REASON_LENGTH}
                maxReasonLength={MAX_REASON_LENGTH}
              />
            </Card>

            <Card
              title={adminMessages.detail.accessSection}
              description={adminMessages.detail.accessDescription}
            >
              <AccessPanel
                admin={admin}
                activeSessionCount={sessions.ok ? sessions.value.activeCount : 0}
                canDisable={canDisable}
                isSelf={isSelf}
                csrf={csrf}
                environmentNote={environmentNote}
              />
            </Card>

            <Card
              title={adminMessages.detail.permissionsSection}
              description={adminMessages.detail.permissionsDescription}
            >
              <PermissionList
                permissions={permissions.ok ? permissions.value : []}
                status={admin.status}
                error={permissions.ok ? null : permissions.message}
              />
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}
