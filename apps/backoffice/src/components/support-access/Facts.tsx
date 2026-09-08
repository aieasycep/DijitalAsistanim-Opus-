import type { ReactNode } from 'react'

/**
 * The two dense primitives this area's panels are built from.
 *
 * A Support Access record is read by scanning down a column of labels — who,
 * about whom, under what reason, until when — so the fact list is a two-column
 * `<dl>` at every width rather than a row of cards. A missing value renders an
 * em dash rather than collapsing: a blank row and an absent row look identical
 * and mean very different things on a screen about permissions.
 */

export interface Fact {
  term: string
  value: ReactNode
  /** A second line under the value: a caveat, a raw timestamp, a count. */
  hint?: ReactNode
  /** Spans both columns, for a value that is itself a block. */
  wide?: boolean
}

export function FactList({ items }: { items: readonly Fact[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[minmax(9rem,15rem)_1fr]">
      {items.map((item) => (
        <div key={item.term} className={item.wide ? 'sm:col-span-2' : 'contents'}>
          <dt className="bo-kicker pt-0.5">{item.term}</dt>
          <dd className="mb-1 min-w-0 text-[13px] text-ink sm:mb-0">
            {item.value === null || item.value === undefined || item.value === '' ? (
              <span className="text-faint">—</span>
            ) : (
              item.value
            )}
            {item.hint ? <div className="mt-0.5 text-[11px] text-faint">{item.hint}</div> : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** A caveat inside a panel: what a number does not say, or why two disagree. */
export function PanelNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-hairline bg-surface2/50 px-3 py-2 text-[12px] text-muted">
      {children}
    </p>
  )
}
