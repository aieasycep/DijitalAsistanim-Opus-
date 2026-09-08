import { Badge } from '@/components/ui/Badge'
// Type-only, so nothing from the server-only query module is pulled in: the
// counts this renders are exactly what `countRevealsByScope` returns, and
// re-declaring their shape here would be a second definition of one row.
import type { ScopeRevealCount } from '@/lib/queries/support-access'
import { SCOPE_DESCRIPTIONS_TR, SCOPE_LABELS_TR, SCOPE_SENSITIVITY_ORDER } from '@/lib/redact'
import { orderedScopes } from './contract'

/**
 * What a grant unlocks, in the operator's language.
 *
 * The labels and the descriptions come from `@/lib/redact`, beside the guard
 * that decides whether a scope may actually be spent, so the sentence on this
 * screen and the rule in `evaluateReveal()` cannot drift apart. Scopes are
 * always rendered least-revealing first: a reader scanning a grant should reach
 * `E-posta içeriği` last and notice that they did.
 */

export function ScopeChips({ scopes }: { scopes: readonly string[] }) {
  const ordered = orderedScopes(scopes, SCOPE_SENSITIVITY_ORDER)
  if (ordered.length === 0) {
    return <span className="text-faint">—</span>
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {ordered.map((scope) => (
        <Badge key={scope} tone="info" title={SCOPE_DESCRIPTIONS_TR[scope]}>
          {SCOPE_LABELS_TR[scope]}
        </Badge>
      ))}
    </span>
  )
}

/**
 * The granted scopes with what each one was actually used for.
 *
 * A scope that was granted and never spent renders as zero rather than being
 * left out: "we asked for the mailbox and never opened it" is exactly the kind
 * of thing a reviewer of this record needs to be able to see.
 */
export function ScopeUsageList({ usage }: { usage: readonly ScopeRevealCount[] }) {
  if (usage.length === 0) {
    return <span className="text-[12px] text-faint">—</span>
  }
  return (
    <ul className="flex flex-col gap-2">
      {usage.map((entry) => (
        <li
          key={entry.scope}
          className="flex items-start justify-between gap-3 border-b border-hairline/70 pb-2 last:border-b-0 last:pb-0"
        >
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink">{SCOPE_LABELS_TR[entry.scope]}</p>
            <p className="mt-0.5 text-[11px] text-faint">{SCOPE_DESCRIPTIONS_TR[entry.scope]}</p>
          </div>
          <Badge tone={entry.count > 0 ? 'warning' : 'neutral'}>
            <span className="tabular-nums">{entry.count}</span>
          </Badge>
        </li>
      ))}
    </ul>
  )
}
