import type { Metadata } from 'next'
import { systemClock, toIsoDate } from '@da/domain'
import { NavShell } from '@/components/NavShell'
import {
  ACTION_COUNT_LIMIT,
  ACTION_DISCOVERY_LIMIT,
  ACTOR_BUCKETS,
  ACTOR_LABEL,
  AUDIT_ACTIONS_PATH,
  ActionBreakdownPanel,
  ActorBreakdownPanel,
  AuditTabs,
  GroupBreakdownPanel,
  LOG_PARAMS,
  OUTCOME_BUCKETS,
  OUTCOME_LABEL,
  OutcomeBreakdownPanel,
  RESET_PARAMS,
  RangePicker,
  RefreshForm,
  auditMessages,
  groupTotals,
  isActorBucket,
  isOutcomeBucket,
  isUuid,
  withParams,
  type ActorBucket,
  type OutcomeBucket,
  type ParamValues,
} from '@/components/audit'
import { type FilterControl, Filters, PageHeader } from '@/components/ui'
import { requireStaff } from '@/lib/auth'
import { OPS_TIME_ZONE } from '@/lib/format'
import {
  loadActionBreakdown,
  loadActorBreakdown,
  loadOutcomeBreakdown,
  rangePresetOptions,
  resolveRange,
  settle,
  type AuditScope,
} from '@/lib/queries/audit'
import { refreshAuditAction } from '../actions'

/**
 * What the platform did, by kind.
 *
 * The log answers "what happened at 14:32"; this answers "what does a normal
 * week look like, and is this one normal". It is the view an assessor is
 * actually helped by: the shape of the system's activity, with the staff
 * actions — the only ones a person caused — marked and countable against the
 * automated majority.
 *
 * Every row is an exact `count(*)` over the same range and filters the log is
 * showing, issued in bounded waves rather than as one burst. The remainder line
 * is the honest part: the action vocabulary is open at the database level, so
 * the page prints total-minus-counted rather than implying that the tokens it
 * knows about are all the tokens there are.
 *
 * Three independent loads, each settled on its own.
 */

export const metadata: Metadata = { title: auditMessages.breakdown.title }
export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

function firstValue(raw: string | string[] | undefined): string | null {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0] ?? null
  return null
}

export default async function AuditBreakdownPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await requireStaff('ops')
  const params = await searchParams
  const clock = systemClock

  const range = resolveRange(
    firstValue(params[LOG_PARAMS.from]),
    firstValue(params[LOG_PARAMS.to]),
    clock,
  )

  const actorRaw = firstValue(params[LOG_PARAMS.actor])
  const actor: ActorBucket | null = actorRaw !== null && isActorBucket(actorRaw) ? actorRaw : null

  const outcomeRaw = firstValue(params[LOG_PARAMS.outcome])
  const outcome: OutcomeBucket | null =
    outcomeRaw !== null && isOutcomeBucket(outcomeRaw) ? outcomeRaw : null

  const userRaw = firstValue(params[LOG_PARAMS.user])
  const subjectUserId = userRaw !== null && isUuid(userRaw) ? userRaw : null

  // The action filter is deliberately not read here: this page *is* the
  // per-action breakdown, and pinning it to one action would leave a table with
  // a single row and three empty panels.
  const scope: AuditScope = { range, actor, action: null, outcome, subjectUserId }

  const values: ParamValues = {
    [LOG_PARAMS.from]: range.fromDate,
    [LOG_PARAMS.to]: range.toDate,
    [LOG_PARAMS.actor]: actor ?? '',
    [LOG_PARAMS.outcome]: outcome ?? '',
    [LOG_PARAMS.user]: subjectUserId ?? '',
  }

  const returnTo = withParams(AUDIT_ACTIONS_PATH, values)

  const [actions, actors, outcomes] = await Promise.all([
    settle(() => loadActionBreakdown(scope)),
    settle(() => loadActorBreakdown(scope)),
    settle(() => loadOutcomeBreakdown(scope)),
  ])

  const actionBreakdown = actions.ok ? actions.value : null
  const groups = groupTotals(actionBreakdown)

  const presets = rangePresetOptions(clock)

  const filterControls: readonly FilterControl[] = [
    {
      kind: 'select',
      param: LOG_PARAMS.actor,
      label: auditMessages.actor.filterLabel,
      options: ACTOR_BUCKETS.map((bucket) => ({ value: bucket, label: ACTOR_LABEL[bucket] })),
    },
    {
      kind: 'select',
      param: LOG_PARAMS.outcome,
      label: auditMessages.outcome.filterLabel,
      options: OUTCOME_BUCKETS.map((bucket) => ({ value: bucket, label: OUTCOME_LABEL[bucket] })),
    },
    {
      kind: 'search',
      param: LOG_PARAMS.user,
      label: auditMessages.filters.user,
      placeholder: auditMessages.filters.userPlaceholder,
    },
  ]

  const notices: string[] = []
  if (range.clamped) notices.push(auditMessages.log.rangeClamped)
  if (range.swapped) notices.push(auditMessages.log.rangeSwapped)

  return (
    <NavShell session={session}>
      <PageHeader
        title={auditMessages.breakdown.title}
        description={auditMessages.breakdown.description}
        action={
          <div className="flex items-center gap-2">
            <AuditTabs current={AUDIT_ACTIONS_PATH} params={values} />
            <RefreshForm action={refreshAuditAction} returnTo={returnTo} />
          </div>
        }
      >
        <RangePicker
          presets={presets}
          values={values}
          from={range.fromDate}
          to={range.toDate}
          active={range.preset}
          today={toIsoDate(clock.now(), OPS_TIME_ZONE)}
        />
        <Filters controls={filterControls} values={values} resetParams={[...RESET_PARAMS]} />
      </PageHeader>

      {notices.length > 0 ? (
        <div
          role="status"
          className="mb-4 flex flex-wrap gap-x-4 gap-y-1 rounded-md bg-info-soft px-3 py-2 text-[12px] text-info-text"
        >
          {notices.map((notice) => (
            <span key={notice}>{notice}</span>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        <ActionBreakdownPanel
          breakdown={actionBreakdown}
          error={actions.ok ? null : actions.message}
          params={values}
          discoveryLimit={ACTION_DISCOVERY_LIMIT}
          countLimit={ACTION_COUNT_LIMIT}
        />

        <div className="grid gap-4 xl:grid-cols-3">
          <GroupBreakdownPanel
            rows={groups}
            total={actionBreakdown?.total ?? 0}
            error={actions.ok ? null : actions.message}
          />
          <ActorBreakdownPanel
            breakdown={actors.ok ? actors.value : null}
            error={actors.ok ? null : actors.message}
            params={values}
          />
          <OutcomeBreakdownPanel
            breakdown={outcomes.ok ? outcomes.value : null}
            error={outcomes.ok ? null : outcomes.message}
            params={values}
          />
        </div>
      </div>
    </NavShell>
  )
}
