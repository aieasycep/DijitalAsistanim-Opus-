import { systemClock } from '@da/domain'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  ActionsPanel,
  DiffView,
  FEATURE_VERSION_LIMIT,
  LIST_PARAMS,
  PROMPTS_PATH,
  PromptBody,
  PromptFacts,
  PromptNotes,
  PromptResultBanner,
  RESULT_PARAMS,
  ModelUsagePanel,
  TrailTable,
  UsagePanel,
  VersionsTable,
  diffPromptBodies,
  firstParam,
  hrefWithQuery,
  isUuidParam,
  promptPath,
  toQueryRecord,
  versionReference,
  withoutResultParams,
  type DiffBaselineKind,
} from '@/components/prompts'
import { Card, CardError, PageHeader } from '@/components/ui'
import { csrfField, requirePermission, sessionCan } from '@/lib/auth'
import { formatNumber } from '@/lib/format'
import { promptMessages, promptStatusHints } from '@/lib/messages/prompts'
import {
  countPromptTrail,
  listFeatureVersions,
  loadActiveRecord,
  loadModelUsage,
  loadPreviousRecord,
  loadPromptAdmins,
  loadPromptMetrics,
  loadPromptRecord,
  loadPromptTrail,
  settle,
  type PromptAdmin,
  type PromptRecord,
} from '@/lib/queries/prompts'

export const metadata: Metadata = { title: promptMessages.list.title }
export const dynamic = 'force-dynamic'

/**
 * One prompt version: what it says, what it changes, what it cost, and who
 * decided it.
 *
 * ---------------------------------------------------------------------------
 * WHO MAY OPEN THIS
 * ---------------------------------------------------------------------------
 *
 * `prompt.read`. Every control that writes is drawn only for the permission it
 * needs — `prompt.write` for drafting and archiving, `prompt.activate` for
 * putting a version in front of users — and that is a rendering decision rather
 * than the check: `runAdminAction` asks `admin_role_permissions` again at the
 * moment of acting and writes a `failure` audit row when the answer is no.
 *
 * ---------------------------------------------------------------------------
 * THE DIFF IS THE PAGE'S REASON TO EXIST
 * ---------------------------------------------------------------------------
 *
 * Nobody should activate a prompt they have not compared with what is serving
 * today, so the baseline is chosen for the question the operator is actually
 * asking:
 *
 *   - a draft or an archived version is read against the **active** version —
 *     "what would change if I pressed the button";
 *   - the active version is read against the **previous** one — comparing it
 *     with itself would show nothing, and what matters then is what changed when
 *     it went live;
 *   - the first version of a feature has no baseline, and the page says so
 *     rather than rendering an empty diff that looks like "no changes".
 *
 * ---------------------------------------------------------------------------
 * SEVEN LOADS, SETTLED SEPARATELY
 * ---------------------------------------------------------------------------
 *
 * The record itself is the only one that can 404 the page. Everything else — the
 * usage row, the comparison, the sibling versions, the trail, the model totals —
 * fails into its own panel, because an operator investigating a regression must
 * not lose the four panels that were working in order to be told the fifth was
 * not.
 */
export default async function PromptDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ promptId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePermission('prompt.read')
  const { promptId } = await params
  const raw = await searchParams
  const clock = systemClock

  if (!isUuidParam(promptId)) notFound()

  const record = await loadPromptRecord(promptId)
  if (record === null) notFound()

  const [metrics, comparison, versions, trail, trailCount] = await Promise.all([
    settle(() => loadPromptMetrics(promptId)),
    settle(() => resolveComparison(record)),
    settle(() => listFeatureVersions(record.feature)),
    settle(() => loadPromptTrail(promptId)),
    settle(() => countPromptTrail(promptId)),
  ])

  // Only after the record is known: the model comes off it, and a version with
  // no model recorded has no model-wide total to fetch.
  const model = record.model
  const modelUsage = model === null ? null : await settle(() => loadModelUsage(model, 30, clock))

  // One lookup for every operator named anywhere on the page: whoever wrote the
  // version, whoever activated it, and every actor in the trail. A failure here
  // leaves those cells reading "Bilinmiyor", which is true, rather than blanking
  // three panels.
  const adminIds: (string | null)[] = [record.created_by, record.activated_by]
  if (trail.ok) {
    for (const row of trail.value) adminIds.push(row.actor_admin_user_id)
  }
  const admins = await loadPromptAdmins(adminIds).catch(() => new Map<string, PromptAdmin>())

  const canWrite = sessionCan(session, 'prompt.write')
  const canActivate = sessionCan(session, 'prompt.activate')
  const csrf = csrfField(session)
  const selfHref = promptPath(promptId)
  const dismissHref = hrefWithQuery(selfHref, withoutResultParams(toQueryRecord(raw)))

  const baseline = comparison.ok ? comparison.value.baseline : null
  const baselineKind: DiffBaselineKind = comparison.ok ? comparison.value.kind : 'none'
  const diff = baseline === null ? null : diffPromptBodies(baseline.body, record.body)

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: promptMessages.area.breadcrumb, href: '/ai' },
          { label: promptMessages.detail.breadcrumb, href: PROMPTS_PATH },
          {
            label: record.feature,
            href: `${PROMPTS_PATH}?${LIST_PARAMS.feature}=${encodeURIComponent(record.feature)}`,
          },
          { label: versionReference(record.feature, record.version) },
        ]}
        kicker={record.feature}
        title={versionReference(record.feature, record.version)}
        description={promptStatusHints[record.status]}
        meta={promptMessages.list.meta}
      />

      <div className="flex flex-col gap-4">
        <PromptResultBanner
          outcome={firstParam(raw, RESULT_PARAMS.outcome)}
          feature={firstParam(raw, RESULT_PARAMS.feature)}
          version={firstParam(raw, RESULT_PARAMS.version)}
          dismissHref={dismissHref}
        />

        <Card
          title={promptMessages.actions.section}
          description={promptMessages.actions.description}
        >
          <ActionsPanel
            record={record}
            activeVersion={comparison.ok ? comparison.value.active : undefined}
            canWrite={canWrite}
            canActivate={canActivate}
            csrf={csrf}
          />
        </Card>

        <Card title={promptMessages.diff.section} description={promptMessages.diff.description}>
          {comparison.ok ? (
            diff === null ? (
              <DiffView
                diff={EMPTY_DIFF}
                baseline="none"
                baselineVersion={null}
                currentVersion={record.version}
              />
            ) : (
              <DiffView
                diff={diff}
                baseline={baselineKind}
                baselineVersion={baseline?.version ?? null}
                currentVersion={record.version}
              />
            )
          ) : (
            <CardError message={comparison.message} />
          )}
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card title={promptMessages.detail.facts}>
            <PromptFacts
              record={record}
              createdBy={record.created_by === null ? undefined : admins.get(record.created_by)}
              activatedBy={
                record.activated_by === null ? undefined : admins.get(record.activated_by)
              }
              clock={clock}
            />
          </Card>

          <Card
            title={promptMessages.detail.notesSection}
            description={promptMessages.detail.notesDescription}
          >
            <PromptNotes notes={record.notes} />
          </Card>
        </div>

        <Card
          title={promptMessages.detail.bodySection}
          description={promptMessages.detail.bodyDescription}
          action={
            <span className="text-[11px] text-faint tabular-nums">
              {promptMessages.table.characters(record.body_length)}
            </span>
          }
        >
          <PromptBody body={record.body} />
        </Card>

        <Card title={promptMessages.usage.section} description={promptMessages.usage.description}>
          {metrics.ok ? (
            <UsagePanel metrics={metrics.value} clock={clock} />
          ) : (
            <CardError message={metrics.message} />
          )}
        </Card>

        <Card title={promptMessages.usage.modelSection}>
          {modelUsage === null ? (
            <ModelUsagePanel usage={null} />
          ) : modelUsage.ok ? (
            <ModelUsagePanel usage={modelUsage.value} />
          ) : (
            <CardError message={modelUsage.message} />
          )}
        </Card>

        <Card
          title={promptMessages.detail.versionsSection}
          description={promptMessages.detail.versionsDescription}
          action={
            versions.ok && versions.value.length >= FEATURE_VERSION_LIMIT ? (
              <span className="text-[11px] text-faint">
                {promptMessages.detail.versionsTruncated(FEATURE_VERSION_LIMIT)}
              </span>
            ) : versions.ok ? (
              <span className="text-[11px] text-faint tabular-nums">
                {formatNumber(versions.value.length)}
              </span>
            ) : null
          }
          flush
        >
          <VersionsTable
            rows={versions.ok ? versions.value : []}
            currentPromptId={promptId}
            clock={clock}
            error={versions.ok ? null : versions.message}
          />
        </Card>

        <Card
          title={promptMessages.trail.section}
          description={promptMessages.trail.description}
          action={
            trailCount.ok ? (
              <span className="text-[11px] text-faint tabular-nums">
                {formatNumber(trailCount.value)}
              </span>
            ) : null
          }
          flush
        >
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

/** The shape `DiffView` renders when there is nothing to compare against. */
const EMPTY_DIFF = {
  identical: false,
  added: 0,
  removed: 0,
  leftLines: 0,
  rightLines: 0,
  truncated: false,
  hunks: [],
} as const

interface Comparison {
  kind: DiffBaselineKind
  /** The body the diff is taken against, or null when there is none. */
  baseline: PromptRecord | null
  /** The version serving this feature, for the activation dialog's copy. */
  active: { version: number; fingerprint: string } | null
}

/**
 * Which version this one is read against, and what is serving the feature.
 *
 * Two reads at most, and the second is only taken when the first cannot be the
 * baseline — a draft with an active sibling needs no second query.
 */
async function resolveComparison(record: PromptRecord): Promise<Comparison> {
  const active = await loadActiveRecord(record.feature)
  const summary =
    active === null ? null : { version: active.version, fingerprint: active.body_fingerprint }

  if (active !== null && active.id !== record.id) {
    return { kind: 'active', baseline: active, active: summary }
  }

  const previous = await loadPreviousRecord(record.feature, record.version)
  return {
    kind: previous === null ? 'none' : 'previous',
    baseline: previous,
    active: summary,
  }
}
