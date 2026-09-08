import Link from 'next/link'
import type { ReactNode } from 'react'
import { systemClock, type Clock } from '@da/domain'
import { Badge, Card, CardEmpty, CardError, Mono } from '@/components/ui'
import type { BoAuditRow } from '@/lib/db'
import { formatDateTime, formatRelative, shortId } from '@/lib/format'
import { actorBucketOf, userDetailHref } from './contract'
import { actorTone, outcomeBucketOf, outcomeTone } from './format'
import { reviewHref, type ParamValues } from './href'
import { ACTOR_LABEL, OUTCOME_LABEL, actionLabel, auditMessages } from './messages'
import { ReviewForm } from './ReviewForm'

/**
 * One entry, expanded, with everything the trail knows about it and everything
 * anyone has since said about it.
 *
 * The `metadata_keys` line is the panel's most useful sentence for an assessor:
 * it is the complete list of keys the metadata document holds, printed without
 * a single value. If a writer ever put something it should not into an audit
 * row, this is where the key name would appear — and it would still be
 * unreadable, because `bo_audit` does not project the document.
 */

export interface ReviewPanelProps {
  /** The entry, or null when the id in the URL matches nothing. */
  entry: BoAuditRow | null
  reviews: readonly BoAuditRow[]
  /** Non-null when either query failed; the panel says so instead of blanking. */
  error?: string | null
  action: (formData: FormData) => void | Promise<void>
  params: ParamValues
  returnTo: string
  clock?: Clock
}

export function ReviewPanel({
  entry,
  reviews,
  error = null,
  action,
  params,
  returnTo,
  clock = systemClock,
}: ReviewPanelProps) {
  const closeHref = reviewHref(params, null)

  return (
    <Card
      title={auditMessages.review.section}
      description={auditMessages.review.effectNote}
      action={
        <Link
          href={closeHref}
          className="rounded-md border border-hairline px-2.5 py-1 text-[12px] font-medium text-muted transition-colors hover:border-primary/40 hover:text-ink"
        >
          {auditMessages.review.close}
        </Link>
      }
    >
      {error !== null ? (
        <CardError message={error} hint={auditMessages.log.backToLog} />
      ) : entry === null ? (
        <CardEmpty message={auditMessages.review.notFound} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="flex flex-col gap-3">
            <EntryFacts entry={entry} clock={clock} />
            <ReviewForm action={action} entryId={entry.audit_id} returnTo={returnTo} />
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="bo-kicker">{auditMessages.review.existing}</h3>
            {reviews.length === 0 ? (
              <p className="text-[12px] text-muted">{auditMessages.review.existingEmpty}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {reviews.map((review) => (
                  <li key={review.audit_id} className="rounded-md bg-surface2/60 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="info">{auditMessages.review.marked}</Badge>
                      <Mono>{shortId(review.staff_user_id)}</Mono>
                      <span className="text-[11px] text-faint">
                        {formatDateTime(review.created_at)} ·{' '}
                        {formatRelative(review.created_at, clock)}
                      </span>
                    </div>
                    {review.staff_reason !== null ? (
                      <p className="mt-1 text-[12px] text-ink">{review.staff_reason}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

function EntryFacts({ entry, clock }: { entry: BoAuditRow; clock: Clock }) {
  const actorBucket = actorBucketOf(entry.actor)
  const outcomeBucket = outcomeBucketOf(entry.outcome)

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12px]">
      <Fact label={auditMessages.review.entry}>
        <Mono>{entry.audit_id}</Mono>
      </Fact>

      <Fact label={auditMessages.columns.time}>
        <span className="text-ink">{formatDateTime(entry.created_at)}</span>
        <span className="ml-2 text-faint">{formatRelative(entry.created_at, clock)}</span>
      </Fact>

      <Fact label={auditMessages.columns.action}>
        <span className="text-ink">{actionLabel(entry.action)}</span>
        <span className="ml-2">
          <Mono>{entry.action ?? '—'}</Mono>
        </span>
      </Fact>

      <Fact label={auditMessages.columns.actor}>
        <Badge tone={actorTone(actorBucket)}>{ACTOR_LABEL[actorBucket]}</Badge>
        {entry.staff_user_id !== null ? (
          <span className="ml-2">
            <Mono>{entry.staff_user_id}</Mono>
          </span>
        ) : null}
        {entry.staff_role !== null ? (
          <span className="ml-2 text-faint">{entry.staff_role}</span>
        ) : null}
      </Fact>

      <Fact label={auditMessages.columns.subject}>
        {entry.subject_user_id === null ? (
          <span className="text-faint">—</span>
        ) : (
          <Link
            href={userDetailHref(entry.subject_user_id)}
            className="font-mono text-[12px] text-primary-on-soft underline-offset-2 hover:underline"
          >
            {entry.subject_user_id}
          </Link>
        )}
      </Fact>

      <Fact label={auditMessages.columns.entity}>
        <span className="text-muted">{entry.entity_type ?? '—'}</span>
        {entry.entity_id !== null ? (
          <span className="ml-2">
            <Mono>{entry.entity_id}</Mono>
          </span>
        ) : null}
      </Fact>

      <Fact label={auditMessages.columns.outcome}>
        <Badge tone={outcomeTone(outcomeBucket)}>{OUTCOME_LABEL[outcomeBucket]}</Badge>
        {entry.outcome !== null ? (
          <span className="ml-2">
            <Mono>{entry.outcome}</Mono>
          </span>
        ) : null}
      </Fact>

      {entry.staff_reason !== null ? (
        <Fact label={auditMessages.columns.reason}>
          <span className="text-ink">{entry.staff_reason}</span>
        </Fact>
      ) : null}

      <Fact label={auditMessages.columns.metadata}>
        {entry.metadata_keys === null || entry.metadata_keys.length === 0 ? (
          <span className="text-faint">—</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {entry.metadata_keys.map((key) => (
              <span
                key={key}
                className="rounded bg-surface2 px-1.5 py-0.5 font-mono text-[11px] text-muted"
              >
                {key}
              </span>
            ))}
          </span>
        )}
      </Fact>
    </dl>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="bo-kicker whitespace-nowrap">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  )
}
