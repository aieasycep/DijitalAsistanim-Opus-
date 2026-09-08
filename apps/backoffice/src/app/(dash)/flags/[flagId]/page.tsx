import { systemClock } from '@da/domain'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Card, PageHeader, StatGrid, StatTile } from '@/components/ui'
import {
  FLAGS_PATH,
  FlagFacts,
  FlagForm,
  FlagResultBanner,
  OVERRIDE_PAGE_PARAM,
  OverrideForm,
  OverrideTable,
  RESULT_PARAMS,
  SwitchPanel,
  TargetingSummary,
  TrailTable,
  firstParam,
  flagPath,
  hrefWithQuery,
  isUuidParam,
  toQueryRecord,
  withoutResultParams,
} from '@/components/flags'
import { MAX_REASON_LENGTH, MIN_REASON_LENGTH } from '@/lib/admin-action'
import { csrfField, requirePermission, sessionCan } from '@/lib/auth'
import { formatCompact } from '@/lib/format'
import { flagMessages } from '@/lib/messages/flags'
import {
  countExpiredOverrides,
  countFlagTrail,
  listOverrides,
  loadFlag,
  loadFlagAdmins,
  loadFlagTrail,
  settle,
  type FlagAdmin,
} from '@/lib/queries/flags'

export const metadata: Metadata = { title: flagMessages.list.title }
export const dynamic = 'force-dynamic'

/**
 * One feature flag: what it is doing, who changed it, and the two ways to stop
 * it.
 *
 * ---------------------------------------------------------------------------
 * WHO MAY OPEN THIS
 * ---------------------------------------------------------------------------
 *
 * `flags.read`. Every control that writes is drawn only for `flags.write`, and
 * that is a rendering decision rather than the check — `runAdminAction` asks
 * `admin_role_permissions` again at the moment of acting and writes a `failure`
 * audit row when the answer is no.
 *
 * ---------------------------------------------------------------------------
 * THE PAGE'S ONE CLAIM
 * ---------------------------------------------------------------------------
 *
 * "Şu anki durum" is the state the evaluator would return, from
 * `bo_feature_flags.effective_state`, printed beside the four conditions in
 * full. Nothing on this screen recomputes it, and the edit form's preview uses
 * the same pure description helper, so what an operator reads before saving and
 * what they read after are produced by one piece of code.
 *
 * Five loads, settled separately, so a panel that cannot fetch says so where it
 * stands instead of taking the page down — and never renders as "no overrides"
 * or "no history", which on this screen would be the expensive lie.
 */
export default async function FlagDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ flagId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePermission('flags.read')
  const { flagId } = await params
  const raw = await searchParams
  const clock = systemClock

  if (!isUuidParam(flagId)) notFound()

  const flag = await loadFlag(flagId)
  if (flag === null) notFound()

  const overridePageRaw = Number(firstParam(raw, OVERRIDE_PAGE_PARAM))
  const overridePage =
    Number.isFinite(overridePageRaw) && overridePageRaw >= 1 ? Math.floor(overridePageRaw) : 1

  const [overrides, expiredCount, trail, trailCount] = await Promise.all([
    settle(() => listOverrides({ flagId, page: overridePage })),
    settle(() => countExpiredOverrides(flagId)),
    settle(() => loadFlagTrail(flagId)),
    settle(() => countFlagTrail(flagId)),
  ])

  // One lookup for every staff member named anywhere on the page: the flag's
  // author and last editor, whoever pinned each override, and every actor in
  // the trail. A failure here leaves the columns reading "Bilinmiyor", which is
  // true, rather than blanking three panels.
  const adminIds: (string | null)[] = [flag.created_by_admin_user_id, flag.updated_by_admin_user_id]
  if (overrides.ok) {
    for (const row of overrides.value.rows) adminIds.push(row.created_by_admin_user_id)
  }
  if (trail.ok) {
    for (const row of trail.value) adminIds.push(row.actor_admin_user_id)
  }
  const admins = await loadFlagAdmins(adminIds).catch(() => new Map<string, FlagAdmin>())

  const canWrite = sessionCan(session, 'flags.write')
  const csrf = csrfField(session)
  const selfHref = flagPath(flagId)

  // The override table's page links are built from the query without the last
  // action's answer, so turning a page does not re-announce a kill switch.
  const tableQuery = withoutResultParams(toQueryRecord(raw))
  const dismissHref = hrefWithQuery(selfHref, tableQuery)

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: flagMessages.detail.breadcrumb, href: FLAGS_PATH },
          { label: flag.key },
        ]}
        title={flag.key}
        description={flag.description}
        meta={flagMessages.list.meta}
      />

      <div className="flex flex-col gap-4">
        <FlagResultBanner
          outcome={firstParam(raw, RESULT_PARAMS.outcome)}
          flagKey={firstParam(raw, RESULT_PARAMS.key)}
          dismissHref={dismissHref}
        />

        <StatGrid>
          <StatTile
            label={flagMessages.detail.rolloutTile}
            hint={flagMessages.detail.rolloutTileHint}
            value={`%${flag.rollout_percentage}`}
            tone={flag.rollout_percentage > 0 ? 'primary' : 'neutral'}
          />
          <StatTile
            label={flagMessages.detail.overrideLive}
            hint={flagMessages.detail.overrideLiveHint}
            value={formatCompact(flag.override_count)}
            tone={flag.override_count > 0 ? 'warning' : 'neutral'}
          />
          <StatTile
            label={flagMessages.detail.overrideExpired}
            hint={flagMessages.detail.overrideExpiredHint}
            value={expiredCount.ok ? formatCompact(expiredCount.value) : '—'}
          />
          <StatTile
            label={flagMessages.detail.auditCount}
            hint={flagMessages.detail.auditCountHint}
            value={trailCount.ok ? formatCompact(trailCount.value) : '—'}
          />
        </StatGrid>

        <Card
          title={flagMessages.detail.stateSection}
          description={flagMessages.detail.stateDescription}
        >
          <TargetingSummary state={flag.effective_state} targeting={flag} />

          <div className="mt-4 border-t border-hairline pt-3">
            <p className="bo-kicker">{flagMessages.detail.precedence}</p>
            <ol className="mt-1.5 flex list-inside list-decimal flex-col gap-1 text-[12px] text-muted">
              {flagMessages.detail.precedenceSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </Card>

        <Card title={flagMessages.actions.section} description={flagMessages.actions.description}>
          <SwitchPanel flag={flag} canWrite={canWrite} csrf={csrf} />
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card title={flagMessages.detail.facts}>
            <FlagFacts
              flag={flag}
              clock={clock}
              createdBy={
                flag.created_by_admin_user_id === null
                  ? undefined
                  : admins.get(flag.created_by_admin_user_id)
              }
              updatedBy={
                flag.updated_by_admin_user_id === null
                  ? undefined
                  : admins.get(flag.updated_by_admin_user_id)
              }
            />
          </Card>

          <Card title={flagMessages.form.editTitle} description={flagMessages.form.editDescription}>
            {canWrite ? (
              <FlagForm
                mode="edit"
                flagId={flag.flag_id}
                csrf={csrf}
                minReasonLength={MIN_REASON_LENGTH}
                maxReasonLength={MAX_REASON_LENGTH}
                values={{
                  key: flag.key,
                  description: flag.description,
                  enabled: flag.enabled,
                  rolloutPercentage: flag.rollout_percentage,
                  platforms: flag.platforms,
                  plans: flag.plans,
                  minAppVersion: flag.min_app_version,
                  maxAppVersion: flag.max_app_version,
                  killSwitch: flag.kill_switch,
                }}
              />
            ) : (
              <p className="text-[12px] text-faint">{flagMessages.actions.noPermission}</p>
            )}
          </Card>
        </div>

        <Card
          title={flagMessages.overrides.section}
          description={flagMessages.overrides.description}
        >
          <div className="flex flex-col gap-4">
            {canWrite ? (
              <div className="rounded-md border border-hairline p-3">
                <p className="text-[13px] font-semibold text-ink">
                  {flagMessages.overrides.addTitle}
                </p>
                <p className="mt-0.5 mb-3 text-[11px] text-faint">
                  {flagMessages.overrides.addDescription}
                </p>
                <OverrideForm
                  flagId={flag.flag_id}
                  csrf={csrf}
                  minReasonLength={MIN_REASON_LENGTH}
                  maxReasonLength={MAX_REASON_LENGTH}
                />
              </div>
            ) : (
              <p className="text-[12px] text-faint">{flagMessages.overrides.noPermission}</p>
            )}

            <OverrideTable
              rows={overrides.ok ? overrides.value.rows : []}
              total={overrides.ok ? overrides.value.total : 0}
              page={overridePage}
              flagId={flag.flag_id}
              admins={admins}
              location={{ path: selfHref, query: tableQuery }}
              clock={clock}
              canWrite={canWrite}
              csrf={csrf}
              error={overrides.ok ? null : overrides.message}
            />

            <p className="text-[11px] text-faint">{flagMessages.overrides.expiredNote}</p>
          </div>
        </Card>

        <Card title={flagMessages.trail.section} description={flagMessages.trail.description} flush>
          <TrailTable
            rows={trail.ok ? trail.value : []}
            admins={admins}
            clock={clock}
            error={trail.ok ? null : trail.message}
          />
        </Card>
      </div>
    </>
  )
}
