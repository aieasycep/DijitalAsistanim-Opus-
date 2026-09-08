import { fixedClock, systemClock } from '@da/domain'
import type { Metadata } from 'next'
import {
  BILLING_PAGE_SIZE,
  BILLING_RECONCILIATION_PATH,
  BillingTabs,
  DEFAULT_RECONCILIATION_RULE,
  PAGE_PARAM,
  Pagination,
  RULE_PARAM,
  ReconciliationTable,
  RefreshForm,
  RuleTiles,
  billingMessages,
  isReconciliationRuleId,
  parsePage,
  type ReconciliationRuleId,
} from '@/components/billing'
import { Card, PageHeader } from '@/components/ui'
import { requirePermission } from '@/lib/auth'
import { listReconciliation, loadRuleCounts, reconcile, settle } from '@/lib/queries/billing'
import { refreshBillingAction } from '../actions'

/**
 * Entitlement reconciliation: the accounts whose stored subscription row and
 * computed entitlement do not agree.
 *
 * This is the page billing bugs are found on. Six rules, each a predicate
 * Postgres evaluates over `bo_user_detail`; the tiles carry the exact count for
 * every rule and are themselves the filter, so the number and the list can
 * never disagree about which rule is being shown.
 *
 * The whole page runs on one frozen instant. A rule count taken at 12:00:00.4
 * and a row list taken at 12:00:00.9 would occasionally disagree about whether
 * a period had just lapsed, and a reconciliation screen that contradicts itself
 * is worse than no screen.
 */

export const metadata: Metadata = { title: billingMessages.reconciliation.title }
export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

function firstValue(raw: string | string[] | undefined): string | null {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0] ?? null
  return null
}

function parseRule(raw: string | string[] | undefined): ReconciliationRuleId {
  const value = firstValue(raw)
  return value !== null && isReconciliationRuleId(value) ? value : DEFAULT_RECONCILIATION_RULE
}

export default async function BillingReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requirePermission('billing.read')
  const params = await searchParams

  const ruleId = parseRule(params[RULE_PARAM])
  const page = parsePage(firstValue(params[PAGE_PARAM]))
  const clock = fixedClock(systemClock.now())

  const values: Record<string, string> = {
    [RULE_PARAM]: ruleId,
    [PAGE_PARAM]: page > 1 ? String(page) : '',
  }

  const query = new URLSearchParams()
  query.set(RULE_PARAM, ruleId)
  if (page > 1) query.set(PAGE_PARAM, String(page))
  const selfHref = `${BILLING_RECONCILIATION_PATH}?${query.toString()}`

  const [counts, list] = await Promise.all([
    settle(() => loadRuleCounts(clock)),
    settle(() => listReconciliation(ruleId, page, clock)),
  ])

  const rule = billingMessages.rules[ruleId]
  const rows = list.ok ? list.value.rows.map((row) => reconcile(row, clock)) : []
  const total = list.ok ? list.value.total : 0

  return (
    <>
      <PageHeader
        title={billingMessages.reconciliation.title}
        description={billingMessages.reconciliation.description}
        action={<RefreshForm action={refreshBillingAction} returnTo={selfHref} />}
      >
        <BillingTabs current={BILLING_RECONCILIATION_PATH} />
      </PageHeader>

      <div className="flex flex-col gap-4">
        <Card
          title={billingMessages.reconciliation.ruleSectionTitle}
          description={billingMessages.reconciliation.ruleSectionDescription}
        >
          <RuleTiles
            counts={counts.ok ? counts.value : []}
            active={ruleId}
            error={counts.ok ? null : counts.message}
          />
        </Card>

        <Card title={rule.label} description={rule.description} flush>
          <ReconciliationTable
            rows={rows}
            total={total}
            error={list.ok ? null : list.message}
            emptyMessage={billingMessages.reconciliation.listEmpty}
            nowMs={clock.now().getTime()}
          />
          <div className="px-3 pb-2">
            <Pagination
              basePath={BILLING_RECONCILIATION_PATH}
              values={values}
              page={page}
              pageSize={BILLING_PAGE_SIZE}
              total={total}
            />
          </div>
        </Card>

        <div className="flex flex-col gap-1 px-1 text-[11px] text-faint">
          <p>{billingMessages.reconciliation.method}</p>
          <p>{billingMessages.reconciliation.caveat}</p>
          <p>{billingMessages.area.aggregateNote}</p>
        </div>
      </div>
    </>
  )
}
