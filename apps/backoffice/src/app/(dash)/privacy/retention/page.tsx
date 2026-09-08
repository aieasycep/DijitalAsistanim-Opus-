import type { Metadata } from 'next'
import Link from 'next/link'
import {
  PRIVACY_PATH,
  PRIVACY_RETENTION_PATH,
  RefreshForm,
  RetentionTable,
  SWEEP_RUN_LIMIT,
  StatCell,
  SweepRunTable,
  privacyMessages,
} from '@/components/privacy'
import { Card, StatGrid, PageHeader } from '@/components/ui'
import { requirePermission } from '@/lib/auth'
import { formatNumber, formatRelative } from '@/lib/format'
import { loadRetentionHealth, loadSweepHealth, settle } from '@/lib/queries/privacy'
import { refreshPrivacyAction } from '../actions'

/**
 * Saklama süpürmesi — did the nightly job actually run, and is anything left
 * behind that should be gone.
 *
 * The obvious way to build this page would be to read how many rows the sweep
 * deleted from its own audit row. That number does not exist:
 * `cleanup_expired_retention()` returns its per-table summary to the caller and
 * the audit row keeps only two counters, and `bo_audit` exposes metadata key
 * *names* with no values at all. Rather than invent a figure, this page measures
 * the thing that actually matters for compliance — what is still in the database
 * past its horizon — with a `count(*)` per observable table.
 *
 * That measurement is stronger than a self-reported deletion count, because it
 * looks at the data instead of at the job's opinion of itself. Where it cannot
 * be taken at all, the table says so: seven of the twelve swept tables have no
 * `bo_*` view, on purpose, because a view over `email_messages` is exactly what
 * this product promises does not exist.
 */

export const metadata: Metadata = { title: privacyMessages.retention.title }
export const dynamic = 'force-dynamic'

export default async function RetentionPage() {
  await requirePermission('privacy.read')

  const [sweep, retention] = await Promise.all([
    settle(() => loadSweepHealth(SWEEP_RUN_LIMIT)),
    settle(() => loadRetentionHealth()),
  ])

  const sweepError = sweep.ok ? null : sweep.message
  const retentionError = retention.ok ? null : retention.message

  return (
    <>
      <PageHeader
        title={privacyMessages.retention.title}
        description={privacyMessages.retention.description}
        kicker={
          <Link href={PRIVACY_PATH} className="underline underline-offset-2 hover:text-muted">
            {privacyMessages.retention.kicker}
          </Link>
        }
        action={<RefreshForm action={refreshPrivacyAction} returnTo={PRIVACY_RETENTION_PATH} />}
      />

      <div className="flex flex-col gap-4">
        <StatGrid>
          <StatCell
            label={privacyMessages.retention.lastRun}
            error={sweepError}
            value={
              sweep.ok
                ? sweep.value.lastRunAt === null
                  ? privacyMessages.stats.noSweep
                  : formatRelative(sweep.value.lastRunAt)
                : null
            }
            hint={privacyMessages.stats.lastSweepHint}
            tone={sweep.ok && sweep.value.late ? 'warning' : 'neutral'}
          />
          <StatCell
            label={privacyMessages.retention.runsInWindow}
            error={sweepError}
            value={sweep.ok ? formatNumber(sweep.value.runsLast7d) : null}
            hint={
              sweep.ok
                ? privacyMessages.retention.runsExpected(sweep.value.expectedLast7d)
                : undefined
            }
            tone={
              sweep.ok && sweep.value.runsLast7d < sweep.value.expectedLast7d
                ? 'warning'
                : 'neutral'
            }
          />
          <StatCell
            label={privacyMessages.retention.arrears}
            error={retentionError}
            value={retention.ok ? formatNumber(retention.value.conclusiveArrears) : null}
            hint={privacyMessages.retention.arrearsHint}
            tone={retention.ok && retention.value.conclusiveArrears > 0 ? 'critical' : 'neutral'}
          />
          <StatCell
            label={privacyMessages.retention.unobserved}
            error={retentionError}
            value={retention.ok ? formatNumber(retention.value.blindCount) : null}
            hint={privacyMessages.retention.unobservedHint}
          />
        </StatGrid>

        <Card
          title={privacyMessages.retention.tablesSection}
          description={privacyMessages.retention.tablesDescription}
          flush
        >
          <RetentionTable
            tables={retention.ok ? retention.value.tables : []}
            error={retentionError}
          />
        </Card>

        <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
          <Card
            title={privacyMessages.retention.runsSection}
            description={privacyMessages.retention.runsDescription}
            flush
          >
            <SweepRunTable runs={sweep.ok ? sweep.value.runs : []} error={sweepError} />
          </Card>

          <Card title={privacyMessages.overview.retentionSection}>
            <div className="flex flex-col gap-3 text-[12px] leading-relaxed text-muted">
              <p>{privacyMessages.retention.auditNote}</p>
              <p>{privacyMessages.retention.countsNote}</p>
              <p className="rounded-md bg-surface2/70 p-3 text-faint">
                {privacyMessages.retention.blindNote}
              </p>
            </div>
          </Card>
        </div>

        <p className="text-[11px] text-faint">{privacyMessages.overview.privacyNote}</p>
      </div>
    </>
  )
}
