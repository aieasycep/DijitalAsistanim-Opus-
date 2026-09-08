import type { Metadata } from 'next'
import Link from 'next/link'
import { systemClock, toIsoDate } from '@da/domain'
import {
  ACTOR_BUCKETS,
  ACTOR_LABEL,
  AUDIT_PATH,
  AccessReceipt,
  AuditTable,
  AuditTabs,
  CANONICAL_ACTIONS,
  ENTRY_REVIEW_LIMIT,
  KeysetPager,
  LOG_PAGE_SIZE,
  LOG_PARAMS,
  OUTCOME_BUCKETS,
  OUTCOME_LABEL,
  RESET_PARAMS,
  RESULT_PARAMS,
  RangePicker,
  RefreshForm,
  ResultBanner,
  RetentionPanel,
  ReviewPanel,
  SummaryTiles,
  actionLabel,
  auditMessages,
  buildScopeKey,
  decodeCursor,
  dismissResultHref,
  isActorBucket,
  isOutcomeBucket,
  isPageDirection,
  isReviewOutcome,
  isUuid,
  withParams,
  type ActorBucket,
  type OutcomeBucket,
  type PageDirection,
  type ParamValues,
} from '@/components/audit'
import { type FilterControl, type FilterOption, Filters, PageHeader } from '@/components/ui'
import { requirePermission } from '@/lib/auth'
import { OPS_TIME_ZONE } from '@/lib/format'
import { messages } from '@/lib/messages'
import {
  countFailedRows,
  countMatching,
  countStaffRows,
  countUserLinkedRows,
  findAuditEntry,
  loadEntryReviews,
  loadLogPage,
  loadRetentionStatus,
  loadReviewMarks,
  rangePresetOptions,
  resolveRange,
  settle,
  type AuditScope,
  type ReviewMark,
} from '@/lib/queries/audit'
import { recordAuditAccessAction, recordEntryReviewAction, refreshAuditAction } from './actions'

/**
 * The audit log — the record of what the assistant and the staff did.
 *
 * This is the page a Google restricted-scope assessor or a KVKK auditor is
 * shown, so it is built to be used rather than demonstrated. The filters are
 * server-side re-queries, the totals are `count(*)`s, the pager is keyset so it
 * still works when the table has ten million rows in it, and the retention
 * panel measures the anonymisation rule instead of restating it.
 *
 * It is also the page that proves the product's central promise from the
 * inside. `bo_audit` is built over `audit_logs` without projecting the metadata
 * document at all — only the names of its keys, plus four scalars lifted
 * through `bo_identifier()`, which drops any value containing whitespace or an
 * `@`. So there is no query on this screen that could return a subject line, a
 * contact name or an address, and no mistake in this file could add one: the
 * column does not exist to be selected.
 *
 * Eight independent loads, each settled on its own, so a view that is slow or
 * missing costs its own panel and nothing else.
 */

export const metadata: Metadata = { title: auditMessages.log.title }
export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

function firstValue(raw: string | string[] | undefined): string | null {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0] ?? null
  return null
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requirePermission('audit.read')
  const params = await searchParams
  const clock = systemClock

  // -------------------------------------------------------------------------
  // Parse. Anything unparseable is dropped rather than thrown on: a mistyped
  // URL should land an operator on a usable page, and the normalised values
  // below are what every link on the page is rebuilt from, so a bad parameter
  // cannot survive one click.
  // -------------------------------------------------------------------------
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

  // The action vocabulary is open at the database level, so an action from the
  // URL is accepted even when the canonical list has never heard of it — that
  // is how a token invented by a newer edge function stays reachable.
  const actionRaw = firstValue(params[LOG_PARAMS.action])
  const action = actionRaw !== null && actionRaw !== '' ? actionRaw.slice(0, 128) : null

  const userRaw = firstValue(params[LOG_PARAMS.user])
  const subjectUserId = userRaw !== null && isUuid(userRaw) ? userRaw : null
  const userRejected = userRaw !== null && userRaw !== '' && subjectUserId === null

  const cursor = decodeCursor(firstValue(params[LOG_PARAMS.cursor]))
  const directionRaw = firstValue(params[LOG_PARAMS.direction])
  const direction: PageDirection =
    directionRaw !== null && isPageDirection(directionRaw) ? directionRaw : 'ileri'

  const reviewRaw = firstValue(params[LOG_PARAMS.review])
  const openReviewId = reviewRaw !== null && isUuid(reviewRaw) ? reviewRaw : null

  const resultRaw = firstValue(params[RESULT_PARAMS.outcome])
  const resultOutcome = resultRaw !== null && isReviewOutcome(resultRaw) ? resultRaw : null
  const resultEntry = firstValue(params[RESULT_PARAMS.entry])

  const scope: AuditScope = { range, actor, action, outcome, subjectUserId }

  // The normalised parameter set. Every link, filter and form on the page is
  // built from this, so a rejected value is gone from the first click onwards.
  const values: ParamValues = {
    [LOG_PARAMS.from]: range.fromDate,
    [LOG_PARAMS.to]: range.toDate,
    [LOG_PARAMS.actor]: actor ?? '',
    [LOG_PARAMS.action]: action ?? '',
    [LOG_PARAMS.outcome]: outcome ?? '',
    [LOG_PARAMS.user]: subjectUserId ?? '',
    [LOG_PARAMS.cursor]: cursor === null ? '' : (firstValue(params[LOG_PARAMS.cursor]) ?? ''),
    [LOG_PARAMS.direction]: cursor === null ? '' : direction,
    [LOG_PARAMS.review]: openReviewId ?? '',
  }

  const returnTo = withParams(AUDIT_PATH, values)

  // -------------------------------------------------------------------------
  // Load. Seven independent queries, each settled on its own.
  // -------------------------------------------------------------------------
  const [logPage, total, staffCount, failedCount, linkedCount, retention, reviewTarget] =
    await Promise.all([
      settle(() => loadLogPage(scope, cursor, direction, LOG_PAGE_SIZE)),
      settle(() => countMatching(scope)),
      settle(() => countStaffRows(scope)),
      settle(() => countFailedRows(scope)),
      settle(() => countUserLinkedRows(scope)),
      settle(() => loadRetentionStatus(clock)),
      openReviewId === null
        ? Promise.resolve(null)
        : settle(async () => ({
            entry: await findAuditEntry(openReviewId),
            reviews: await loadEntryReviews(openReviewId, ENTRY_REVIEW_LIMIT),
          })),
    ])

  // The review markers depend on which rows landed, so they follow the page
  // rather than racing it. One `in` query over the page's own ids.
  const rows = logPage.ok ? logPage.value.rows : []
  const marks =
    rows.length === 0
      ? new Map<string, ReviewMark>()
      : await settle(() => loadReviewMarks(rows.map((row) => row.audit_id))).then((result) =>
          result.ok ? result.value : new Map<string, ReviewMark>(),
        )

  // The presets are ordered narrowest first, so the last one is the widest —
  // the whole retained window, and the only useful answer to an empty table.
  const presets = rangePresetOptions(clock)
  const widest = presets[presets.length - 1]

  const scopeKey = buildScopeKey({
    actor,
    action,
    outcome,
    userPrefix: subjectUserId === null ? null : subjectUserId.slice(0, 8),
    from: range.fromDate,
    to: range.toDate,
  })

  const actionOptions = buildActionOptions(action)
  const filterControls: readonly FilterControl[] = [
    {
      kind: 'select',
      param: LOG_PARAMS.actor,
      label: auditMessages.actor.filterLabel,
      options: ACTOR_BUCKETS.map((bucket) => ({ value: bucket, label: ACTOR_LABEL[bucket] })),
    },
    {
      kind: 'select',
      param: LOG_PARAMS.action,
      label: auditMessages.filters.action,
      options: actionOptions,
      allLabel: auditMessages.filters.actionAll,
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
  if (userRejected) notices.push(auditMessages.log.invalidUser)

  const widenHref =
    widest === undefined
      ? null
      : withParams(AUDIT_PATH, values, {
          [LOG_PARAMS.from]: widest.from,
          [LOG_PARAMS.to]: widest.to,
          [LOG_PARAMS.cursor]: null,
          [LOG_PARAMS.direction]: null,
        })

  return (
    <>
      <PageHeader
        title={auditMessages.log.title}
        description={auditMessages.log.description}
        action={
          <div className="flex items-center gap-2">
            <AuditTabs current={AUDIT_PATH} params={values} />
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

      {resultOutcome !== null ? (
        <ResultBanner
          outcome={resultOutcome}
          entryId={resultEntry}
          dismissHref={dismissResultHref(values)}
        />
      ) : null}

      <div className="flex flex-col gap-4">
        <AccessReceipt action={recordAuditAccessAction} scopeKey={scopeKey} />

        <SummaryTiles
          matching={total}
          staff={staffCount}
          failed={failedCount}
          userLinked={linkedCount}
          params={values}
        />

        {openReviewId !== null && reviewTarget !== null ? (
          <ReviewPanel
            entry={reviewTarget.ok ? reviewTarget.value.entry : null}
            reviews={reviewTarget.ok ? reviewTarget.value.reviews : []}
            error={reviewTarget.ok ? null : reviewTarget.message}
            action={recordEntryReviewAction}
            params={values}
            returnTo={returnTo}
            clock={clock}
          />
        ) : null}

        <AuditTable
          rows={rows}
          marks={marks}
          params={values}
          openReviewId={openReviewId}
          error={logPage.ok ? null : logPage.message}
          errorHint={messages.errors.queryFailedHint}
          errorAction={<RefreshForm action={refreshAuditAction} returnTo={returnTo} />}
          emptyAction={
            widenHref === null ? null : (
              <Link
                href={widenHref}
                className="text-[12px] font-medium text-primary-on-soft underline underline-offset-2"
              >
                {auditMessages.log.emptyWiden}
              </Link>
            )
          }
          total={total.ok ? total.value : undefined}
          clock={clock}
        />

        <KeysetPager
          params={values}
          shown={rows.length}
          total={total.ok ? total.value : null}
          hasNewer={logPage.ok ? logPage.value.hasNewer : false}
          hasOlder={logPage.ok ? logPage.value.hasOlder : false}
          newerCursor={logPage.ok ? logPage.value.newerCursor : null}
          olderCursor={logPage.ok ? logPage.value.olderCursor : null}
          paged={cursor !== null}
        />

        <RetentionPanel
          status={retention.ok ? retention.value : null}
          error={retention.ok ? null : retention.message}
          clock={clock}
        />
      </div>
    </>
  )
}

/**
 * The action menu.
 *
 * The canonical vocabulary, labelled and sorted by label, plus — when the URL
 * carries an action the list has never heard of — that token as its own entry,
 * so a filter arrived at from the breakdown page or from a pasted link renders
 * as selected instead of silently blank.
 */
function buildActionOptions(current: string | null): readonly FilterOption[] {
  const options: FilterOption[] = CANONICAL_ACTIONS.map((token) => ({
    value: token,
    label: `${actionLabel(token)} · ${token}`,
  })).sort((left, right) => left.label.localeCompare(right.label, 'tr'))

  if (current !== null && !CANONICAL_ACTIONS.includes(current)) {
    options.unshift({ value: current, label: auditMessages.filters.unknownAction(current) })
  }
  return options
}
