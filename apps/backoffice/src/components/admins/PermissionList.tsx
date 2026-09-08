import { EmptyState } from '@/components/ui'
import { adminMessages } from '@/lib/messages/admins'
import { PERMISSION_LABELS_TR, type AdminPermission, type AdminStatus } from '@/lib/permissions'
import { permissionNamespace } from './presentation'

/**
 * The permissions the database actually returns for one account.
 *
 * Not "what the role should carry" and not a TypeScript constant filtered by a
 * role name: this is the rows `bo_admin_permissions` produced for this
 * `admin_user_id`, which is the same join `admin_permissions_for()` uses to
 * answer every route guard in the console.
 *
 * A disabled account has no rows in that view at all — deny by default falls
 * out of the view rather than out of a filter someone might forget — so an
 * empty result is a real answer here, and the panel says which of the two
 * empties it is by looking at the account's own status rather than guessing.
 */
export function PermissionList({
  permissions,
  status,
  error,
}: {
  permissions: readonly AdminPermission[]
  status: AdminStatus
  error: string | null
}) {
  if (error !== null) {
    return (
      <p role="alert" className="text-[12px] text-critical-text">
        {error}
      </p>
    )
  }

  if (permissions.length === 0) {
    return (
      <EmptyState
        message={
          status === 'active'
            ? adminMessages.detail.permissionsEmpty
            : adminMessages.detail.permissionsEmptyDisabled
        }
      />
    )
  }

  const groups = new Map<string, AdminPermission[]>()
  for (const permission of permissions) {
    const namespace = permissionNamespace(permission)
    const bucket = groups.get(namespace)
    if (bucket === undefined) groups.set(namespace, [permission])
    else bucket.push(permission)
  }

  return (
    <div className="flex flex-col gap-3">
      {[...groups.entries()].map(([namespace, members]) => (
        <section key={namespace}>
          <h3 className="bo-kicker mb-1.5">{namespace}</h3>
          <ul className="flex flex-col gap-1">
            {members.map((permission) => (
              <li key={permission} className="flex items-baseline gap-2 text-[12px]">
                <span aria-hidden="true" className="text-success-text">
                  ✓
                </span>
                <span className="text-ink">{PERMISSION_LABELS_TR[permission]}</span>
                <code className="ml-auto shrink-0 font-mono text-[11px] text-faint">
                  {permission}
                </code>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
