import { systemClock } from '@da/domain'
import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ADMINS_INVITE_PATH,
  ADMINS_PATH,
  ADMIN_ROLES,
  ADMIN_SORT_KEYS,
  ADMIN_STATUSES,
  AdminResultBanner,
  AdminTable,
  DEFAULT_ADMIN_SORT,
  InviteTable,
  LIST_PARAMS,
  MFA_FILTERS,
  RESULT_PARAMS,
  ROLES_PATH,
  firstParam,
  hrefWithQuery,
  isAdminSortKey,
  isFiltered,
  listParamValues,
  parseAdminListParams,
  toQueryRecord,
  withoutResultParams,
  type AdminSort,
} from '@/components/admins'
import {
  Button,
  Card,
  Filters,
  PageHeader,
  StatGrid,
  StatTile,
  TABLE_PARAMS,
  parseColumnVisibility,
  parseSort,
} from '@/components/ui'
import { csrfField, requirePermission, sessionCan } from '@/lib/auth'
import { formatCompact } from '@/lib/format'
import { messages } from '@/lib/messages'
import { adminMessages, adminStatusLabels, mfaFilterLabels } from '@/lib/messages/admins'
import { ROLE_LABELS_TR } from '@/lib/permissions'
import {
  listAdmins,
  listPendingInvites,
  loadAdminSummary,
  loadNamedAdmins,
  settle,
  type NamedAdmin,
} from '@/lib/queries/admins'

/**
 * Who may open this console, and as what.
 *
 * ---------------------------------------------------------------------------
 * WHO MAY OPEN THIS PAGE
 * ---------------------------------------------------------------------------
 *
 * `admin.read`, checked server-side before anything renders. The sidebar entry
 * is a courtesy; this page refuses the same URL typed into the address bar.
 * `admin.invite` decides whether the invite button and the revoke controls are
 * drawn — and only that: the Server Actions ask `admin_role_permissions` again
 * at the moment of acting, and audit the refusal.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE NUMBERS COME FROM
 * ---------------------------------------------------------------------------
 *
 * Six `count=exact` HEAD requests against `bo_admin_users` and one against
 * `admin_invites`, each over an indexed column, plus one bounded page of the
 * roster with its exact total. Nothing on this screen is counted in JavaScript,
 * and the browser is never handed the roster to slice.
 *
 * The three loads are settled separately, so a summary that fails costs its own
 * panel and the list still renders. Neither ever falls through to the empty
 * state: "no admins" and "the query failed" are different sentences here, and
 * confusing them on the page that says who has access would be the most
 * expensive mistake this console could make.
 *
 * ---------------------------------------------------------------------------
 * PRIVACY
 * ---------------------------------------------------------------------------
 *
 * Every address on this page is the masked form `bo_redact_email()` produces.
 * An admin is a person too, and this list is read by their colleagues. The one
 * unredacted address the console renders is the reader's own, in the top bar.
 * There is no impersonation control here and there is none anywhere else.
 */

export const metadata: Metadata = { title: adminMessages.list.title }
export const dynamic = 'force-dynamic'

export default async function AdminsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePermission('admin.read')

  const raw = await searchParams
  const params = parseAdminListParams(raw)
  const nowIso = systemClock.now().toISOString()

  const parsedSort = parseSort(firstParam(raw, TABLE_PARAMS.sort) || undefined, ADMIN_SORT_KEYS)
  const sort: AdminSort =
    parsedSort !== null && isAdminSortKey(parsedSort.key)
      ? { key: parsedSort.key, direction: parsedSort.direction }
      : DEFAULT_ADMIN_SORT

  const canInvite = sessionCan(session, 'admin.invite')

  const [summary, roster, invites] = await Promise.all([
    settle(() => loadAdminSummary(nowIso)),
    settle(async () => {
      const page = await listAdmins(params, sort)
      // A failed name lookup must not take the table with it: the column then
      // reads a short id, which is true, rather than blanking the list.
      const inviters = await loadNamedAdmins(
        page.rows.map((row) => row.invited_by_admin_user_id),
      ).catch(() => new Map<string, NamedAdmin>())
      return { page, inviters }
    }),
    settle(async () => {
      const page = await listPendingInvites(params.invitePage)
      const inviters = await loadNamedAdmins(page.rows.map((row) => row.invited_by)).catch(
        () => new Map<string, NamedAdmin>(),
      )
      return { page, inviters }
    }),
  ])

  const query = toQueryRecord(raw)
  const tableQuery = withoutResultParams(query)
  const dismissHref = hrefWithQuery(ADMINS_PATH, tableQuery)
  const filtered = isFiltered(params)
  const csrf = csrfField(session)

  const searchNotice =
    params.search.kind === 'rejected'
      ? params.search.why === 'full_address'
        ? adminMessages.list.searchInvalidAddress
        : adminMessages.list.searchTooShort
      : null

  return (
    <>
      <PageHeader
        title={adminMessages.list.title}
        description={adminMessages.list.description}
        meta={adminMessages.list.meta}
        action={
          <div className="flex items-center gap-2">
            <Button asChild size="md" variant="secondary">
              <Link href={ROLES_PATH}>{adminMessages.list.rolesLink}</Link>
            </Button>
            {canInvite ? (
              <Button asChild size="md" variant="primary">
                <Link href={ADMINS_INVITE_PATH}>{adminMessages.list.invite}</Link>
              </Button>
            ) : null}
          </div>
        }
      >
        <Filters
          controls={[
            {
              kind: 'select',
              param: LIST_PARAMS.role,
              label: adminMessages.filters.role,
              options: ADMIN_ROLES.map((role) => ({ value: role, label: ROLE_LABELS_TR[role] })),
            },
            {
              kind: 'select',
              param: LIST_PARAMS.status,
              label: adminMessages.filters.status,
              options: ADMIN_STATUSES.map((status) => ({
                value: status,
                label: adminStatusLabels[status],
              })),
            },
            {
              kind: 'select',
              param: LIST_PARAMS.mfa,
              label: adminMessages.filters.mfa,
              options: MFA_FILTERS.map((value) => ({ value, label: mfaFilterLabels[value] })),
            },
            {
              kind: 'search',
              param: LIST_PARAMS.q,
              label: adminMessages.filters.search,
              placeholder: adminMessages.filters.searchPlaceholder,
            },
          ]}
          values={{ ...query, ...listParamValues(params, firstParam(raw, LIST_PARAMS.q)) }}
        />
      </PageHeader>

      <div className="flex flex-col gap-4">
        <AdminResultBanner
          outcome={firstParam(raw, RESULT_PARAMS.outcome)}
          subject={firstParam(raw, RESULT_PARAMS.subject)}
          dismissHref={dismissHref}
        />

        {searchNotice === null ? null : (
          <p
            role="status"
            className="rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning-text"
          >
            {searchNotice}
          </p>
        )}

        {canInvite ? null : (
          <p className="text-[12px] text-faint">{adminMessages.list.noInvitePermission}</p>
        )}

        {summary.ok ? (
          <StatGrid>
            <StatTile
              label={adminMessages.tiles.total}
              hint={adminMessages.tiles.totalHint}
              value={formatCompact(summary.value.total)}
              href={ADMINS_PATH}
            />
            <StatTile
              label={adminMessages.tiles.active}
              hint={adminMessages.tiles.activeHint}
              value={formatCompact(summary.value.active)}
              href={`${ADMINS_PATH}?${LIST_PARAMS.status}=active`}
            />
            <StatTile
              label={adminMessages.tiles.mfaMissing}
              hint={adminMessages.tiles.mfaMissingHint}
              value={formatCompact(summary.value.mfaMissing)}
              tone={summary.value.mfaMissing > 0 ? 'warning' : 'neutral'}
              href={`${ADMINS_PATH}?${LIST_PARAMS.status}=active&${LIST_PARAMS.mfa}=yok`}
            />
            <StatTile
              label={adminMessages.tiles.superAdmin}
              hint={adminMessages.tiles.superAdminHint}
              value={formatCompact(summary.value.superAdmins)}
              tone={summary.value.superAdmins > 0 ? 'primary' : 'critical'}
              href={`${ADMINS_PATH}?${LIST_PARAMS.role}=super_admin&${LIST_PARAMS.status}=active`}
            />
            <StatTile
              label={adminMessages.tiles.disabled}
              hint={adminMessages.tiles.disabledHint}
              value={formatCompact(summary.value.disabled)}
              href={`${ADMINS_PATH}?${LIST_PARAMS.status}=disabled`}
            />
            <StatTile
              label={adminMessages.tiles.pendingInvites}
              hint={adminMessages.tiles.pendingInvitesHint}
              value={formatCompact(summary.value.pendingInvites)}
              tone={summary.value.pendingInvites > 0 ? 'info' : 'neutral'}
            />
          </StatGrid>
        ) : (
          <Card title={adminMessages.list.title}>
            <p role="alert" className="text-[12px] text-critical-text">
              {summary.message}
            </p>
          </Card>
        )}

        <AdminTable
          rows={roster.ok ? roster.value.page.rows : []}
          total={roster.ok ? roster.value.page.total : 0}
          page={params.page}
          sort={sort}
          inviters={roster.ok ? roster.value.inviters : new Map<string, NamedAdmin>()}
          location={{ path: ADMINS_PATH, query: tableQuery }}
          hiddenColumns={parseColumnVisibility(firstParam(raw, TABLE_PARAMS.columns) || undefined)}
          error={roster.ok ? null : roster.message}
          emptyMessage={filtered ? adminMessages.list.emptyFiltered : adminMessages.list.empty}
          emptyAction={
            filtered ? (
              <Link
                href={ADMINS_PATH}
                className="inline-flex h-7 items-center rounded-md border border-hairline px-2.5 text-[12px] font-medium text-muted hover:text-ink"
              >
                {messages.filters.reset}
              </Link>
            ) : null
          }
          filtered={filtered}
        />

        <Card
          title={adminMessages.invites.section}
          description={adminMessages.invites.description}
          flush
        >
          <InviteTable
            rows={invites.ok ? invites.value.page.rows : []}
            total={invites.ok ? invites.value.page.total : 0}
            page={params.invitePage}
            inviters={invites.ok ? invites.value.inviters : new Map<string, NamedAdmin>()}
            location={{ path: ADMINS_PATH, query: tableQuery }}
            canInvite={canInvite}
            csrf={csrf}
            nowIso={nowIso}
            error={invites.ok ? null : invites.message}
          />
        </Card>

        <p className="text-[11px] text-faint">{adminMessages.list.privacyNote}</p>
      </div>
    </>
  )
}
