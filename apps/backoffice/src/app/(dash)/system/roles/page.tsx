import type { Metadata } from 'next'
import Link from 'next/link'
import { ADMINS_PATH, RoleMatrixTable, UnobservableRoles } from '@/components/admins'
import { Button, Card, PageHeader, StatGrid, StatTile } from '@/components/ui'
import { requirePermission } from '@/lib/auth'
import { formatCompact } from '@/lib/format'
import { adminMessages } from '@/lib/messages/admins'
import {
  loadRoleMatrix,
  matrixPermissionRows,
  settle,
  unobservableReason,
} from '@/lib/queries/admins'

/**
 * What each role may actually do.
 *
 * ---------------------------------------------------------------------------
 * THE MATRIX IS READ, NOT DECLARED
 * ---------------------------------------------------------------------------
 *
 * Every tick on this page is a row `bo_admin_permissions` returned — the view
 * over `admin_role_permissions`, which is what `admin_has_permission()` and
 * `admin_permissions_for()` consult on every request. So the page cannot drift
 * from what the database enforces: if a migration widens a role, this table
 * widens on the next load without an edit anywhere in the console.
 *
 * The console's query surface has no path to `admin_role_permissions` itself —
 * `@/lib/db` exposes the `bo_*` views and the operator-owned tables, and that
 * table is neither — so the matrix is read the only way the surface allows: one
 * representative active admin per role. That view has no rows for a role nobody
 * active holds, and this page reports those roles as unreadable rather than
 * filling the gap from a TypeScript constant. An honest `?` is worth more than
 * a confident tick nobody checked.
 *
 * ---------------------------------------------------------------------------
 * WHY IT ALSO SHOWS THE CONSOLE'S MIRROR
 * ---------------------------------------------------------------------------
 *
 * `decideAccess()` grants the *intersection* of the database's answer and
 * `ROLE_PERMISSIONS` in `@/lib/permissions` — deliberately, so that a row
 * inserted into `admin_role_permissions` outside a reviewed migration grants
 * nothing until the matrix has been read and reviewed too. That makes "what the
 * database says" and "what this console will act on" two different sets, and a
 * matrix page that showed only one of them would be hiding the difference. Both
 * are drawn; a disagreement is counted, and the tile that counts it is the
 * point of the screen.
 *
 * ---------------------------------------------------------------------------
 * WHO MAY OPEN THIS PAGE
 * ---------------------------------------------------------------------------
 *
 * `admin.read`, checked server-side. It is a read-only screen: there is no
 * control on it, because the matrix is changed by a reviewed migration and
 * nothing else. A button here would be a lie about where authorization lives.
 */

export const metadata: Metadata = { title: adminMessages.roles.title }
export const dynamic = 'force-dynamic'

export default async function RolesPage() {
  await requirePermission('admin.read')

  const matrix = await settle(() => loadRoleMatrix())

  if (!matrix.ok) {
    return (
      <>
        <PageHeader
          title={adminMessages.roles.title}
          description={adminMessages.roles.description}
          meta={adminMessages.roles.meta}
        />
        <Card title={adminMessages.roles.matrixSection}>
          <p role="alert" className="text-[12px] text-critical-text">
            {matrix.message}
          </p>
        </Card>
      </>
    )
  }

  const groups = matrixPermissionRows(matrix.value)
  const roleCount = matrix.value.entries.length

  return (
    <>
      <PageHeader
        title={adminMessages.roles.title}
        description={adminMessages.roles.description}
        meta={adminMessages.roles.meta}
        breadcrumbs={[
          { label: adminMessages.list.title, href: ADMINS_PATH },
          { label: adminMessages.roles.title },
        ]}
        action={
          <Button asChild size="md" variant="secondary">
            <Link href={ADMINS_PATH}>{adminMessages.roles.backToAdmins}</Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <StatGrid>
          <StatTile
            label={adminMessages.roles.tileRoles}
            hint={adminMessages.roles.tileRolesHint}
            value={formatCompact(roleCount)}
          />
          <StatTile
            label={adminMessages.roles.tileAssignable}
            hint={adminMessages.roles.tileAssignableHint}
            value={formatCompact(matrix.value.assignableCount)}
          />
          <StatTile
            label={adminMessages.roles.tileObservable}
            hint={adminMessages.roles.tileObservableHint}
            value={`${formatCompact(matrix.value.observableCount)} / ${formatCompact(roleCount)}`}
            tone={matrix.value.observableCount === roleCount ? 'neutral' : 'info'}
          />
          <StatTile
            label={adminMessages.roles.tileDrift}
            hint={adminMessages.roles.tileDriftHint}
            value={formatCompact(matrix.value.driftCount)}
            tone={matrix.value.driftCount > 0 ? 'warning' : 'success'}
          />
        </StatGrid>

        <UnobservableRoles matrix={matrix.value} reasonFor={unobservableReason} />

        <p
          className={
            matrix.value.driftCount > 0
              ? 'rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning-text'
              : 'text-[12px] text-faint'
          }
        >
          {matrix.value.driftCount > 0
            ? adminMessages.roles.driftNote
            : adminMessages.roles.noDrift}
        </p>

        <Card
          title={adminMessages.roles.matrixSection}
          description={adminMessages.roles.matrixDescription}
          flush
        >
          <RoleMatrixTable matrix={matrix.value} groups={groups} />
        </Card>

        <ul className="flex flex-col gap-1 text-[11px] text-faint">
          {matrix.value.entries
            .filter(
              (entry) =>
                entry.observable &&
                entry.declaredCount !== null &&
                entry.declaredCount !== entry.database.size,
            )
            .map((entry) => (
              <li key={entry.role.role} className="text-warning-text">
                {entry.role.labelTr}:{' '}
                {adminMessages.roles.countMismatch(entry.declaredCount ?? 0, entry.database.size)}
              </li>
            ))}
        </ul>
      </div>
    </>
  )
}
