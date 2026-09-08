import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { supportAccessMessages } from '@/lib/messages/support-access'
import { SCOPE_DESCRIPTIONS_TR, SCOPE_LABELS_TR, type SupportAccessScope } from '@/lib/redact'
import { revealHref } from './contract'

/**
 * The scopes this grant actually covers, and nothing else.
 *
 * The eight members of `support_access_scope` are not a menu. A grant names a
 * subset, `sa_assert_grant()` refuses everything outside it, and a picker that
 * listed all eight — greying out or not — would be offering seven doors into a
 * refusal. So the list is built from `revealAvailability()`, which asks the
 * reveal gate itself, and a scope that is not on it is not on the screen.
 *
 * Each entry carries what it opens, in plain Turkish, and how many times it has
 * already been spent under this grant. Both are there so the choice is made
 * with the cost in view: "eight kez açıldı" against a one-line reason is what a
 * reviewer will be reading in six months.
 */
export function RevealScopePicker({
  grantId,
  scopes,
  selected,
  spent,
}: {
  grantId: string
  /** Least revealing first. Only what this operator may actually spend now. */
  scopes: readonly SupportAccessScope[]
  selected: SupportAccessScope | null
  /** Reveal calls per scope so far, from `countRevealsByScope`. */
  spent: ReadonlyMap<SupportAccessScope, number>
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {scopes.map((scope) => {
        const isSelected = scope === selected
        const count = spent.get(scope) ?? 0
        return (
          <li key={scope}>
            <Link
              href={revealHref(grantId, scope)}
              aria-current={isSelected ? 'true' : undefined}
              className={[
                'flex items-start justify-between gap-3 rounded-md border px-3 py-2 transition-colors',
                isSelected
                  ? 'border-primary/50 bg-primary-soft'
                  : 'border-hairline hover:border-primary/40 hover:bg-surface2/50',
              ].join(' ')}
            >
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-ink">
                  {SCOPE_LABELS_TR[scope]}
                </span>
                <span className="mt-0.5 block text-[11px] text-faint">
                  {SCOPE_DESCRIPTIONS_TR[scope]}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {isSelected ? (
                  <Badge tone="primary">{supportAccessMessages.reveal.scopeSelected}</Badge>
                ) : null}
                <span className="text-[11px] text-faint tabular-nums">
                  {supportAccessMessages.reveal.scopeSpent(count)}
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
