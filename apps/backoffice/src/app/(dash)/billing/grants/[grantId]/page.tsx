import { systemClock } from '@da/domain'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  BILLING_PATH,
  EntitlementSourcePanel,
  GRANTS_PATH,
  GrantFacts,
  GrantResultBanner,
  GrantTrailTable,
  RESULT_PARAMS,
  RevokeGrantControl,
  firstParam,
  grantPath,
  isUuidParam,
} from '@/components/grants'
import { Card, PageHeader } from '@/components/ui'
import { csrfField, requirePermission, sessionCan } from '@/lib/auth'
import { shortId } from '@/lib/format'
import { grantMessages } from '@/lib/messages/grants'
import {
  grantEffect,
  loadGrant,
  loadGrantAdmins,
  loadGrantPicture,
  loadGrantTrail,
  loadRevocationReasons,
  settle,
  type GrantAdmin,
} from '@/lib/queries/grants'

export const metadata: Metadata = { title: grantMessages.detail.titlePrefix }
export const dynamic = 'force-dynamic'

/**
 * One grant: what was decided, what it is actually doing, and what has happened
 * to it since.
 *
 * ---------------------------------------------------------------------------
 * THE MIDDLE PANEL IS THE POINT
 * ---------------------------------------------------------------------------
 *
 * The facts at the top are what somebody wrote down. The panel under them is
 * what the product is actually doing with the account, answered by
 * `resolveEntitlements()` in @da/domain rather than by this console — including
 * the part nobody enjoys reading, which is that the resolver has no parameter
 * for an operator grant at all. A screen that drew a green tick beside a live
 * grant would be inventing a branch of a function that does not have one.
 *
 * ---------------------------------------------------------------------------
 * FOUR LOADS, SETTLED SEPARATELY
 * ---------------------------------------------------------------------------
 *
 * The grant itself is the exception: without it there is no page, so a missing
 * row is a 404 and a failed read is the error boundary. The entitlement
 * picture, the revocation reason and the audit trail each carry their own
 * failure into their own panel, because a trail that will not load must not
 * take the grant's own facts down with it.
 */
export default async function GrantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ grantId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePermission('billing.read')
  const { grantId } = await params
  const raw = await searchParams
  const clock = systemClock

  if (!isUuidParam(grantId)) notFound()

  const row = await loadGrant(grantId)
  if (row === null) notFound()

  const [picture, trail, reasons] = await Promise.all([
    settle(() => loadGrantPicture(row.user_id, clock)),
    settle(() => loadGrantTrail(row.grant_id)),
    settle(() => loadRevocationReasons([row.grant_id])),
  ])

  const adminIds = [
    row.granted_by_admin_user_id,
    row.revoked_by_admin_user_id,
    ...(trail.ok ? trail.value.map((entry) => entry.actor_admin_user_id) : []),
  ]
  const admins = await loadGrantAdmins(adminIds).catch(() => new Map<string, GrantAdmin>())

  const effect = grantEffect(row, picture.ok ? picture.value : null)
  const canRevoke = sessionCan(session, 'billing.revoke')
  const canSeeAccounts = session.redactionLevel === 'metadata'
  const csrf = csrfField(session)

  return (
    <>
      <PageHeader
        title={`${grantMessages.detail.titlePrefix} · ${shortId(row.grant_id)}`}
        description={grantMessages.list.description}
        breadcrumbs={[
          { label: grantMessages.area.breadcrumbBilling, href: BILLING_PATH },
          { label: grantMessages.area.breadcrumbGrants, href: GRANTS_PATH },
          { label: shortId(row.grant_id) },
        ]}
        action={<RevokeGrantControl row={row} csrf={csrf} canRevoke={canRevoke} />}
      />

      <div className="flex flex-col gap-4">
        <GrantResultBanner
          outcome={firstParam(raw, RESULT_PARAMS.outcome)}
          grantId={firstParam(raw, RESULT_PARAMS.grant)}
          dismissHref={grantPath(row.grant_id)}
        />

        <Card title={grantMessages.detail.factsSection}>
          <GrantFacts
            row={row}
            grantedBy={admins.get(row.granted_by_admin_user_id)}
            revokedBy={
              row.revoked_by_admin_user_id === null
                ? undefined
                : admins.get(row.revoked_by_admin_user_id)
            }
            revokedReason={reasons.ok ? (reasons.value.get(row.grant_id) ?? null) : null}
            canSeeAccounts={canSeeAccounts}
            clock={clock}
          />
        </Card>

        <Card title={grantMessages.truth.section} description={grantMessages.truth.description}>
          <EntitlementSourcePanel
            picture={picture.ok ? picture.value : null}
            effect={effect}
            grantId={row.grant_id}
            error={picture.ok ? null : picture.message}
          />
        </Card>

        <Card
          title={grantMessages.trail.section}
          description={grantMessages.trail.description}
          flush
        >
          <GrantTrailTable
            rows={trail.ok ? trail.value : []}
            admins={admins}
            error={trail.ok ? null : trail.message}
          />
        </Card>

        <Link
          href={GRANTS_PATH}
          className="self-start text-[12px] font-medium text-primary-on-soft hover:underline"
        >
          {grantMessages.detail.backToList}
        </Link>
      </div>
    </>
  )
}
