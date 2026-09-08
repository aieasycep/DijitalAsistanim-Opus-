import type { ReactNode } from 'react'

/**
 * A dense term/value list, for the facts about one account.
 *
 * A support screen is read by scanning down a column of labels, not across a
 * row of cards, so this is a two-column `<dl>` that stays a `<dl>` at every
 * width — the label column just narrows. Values that are missing render an em
 * dash rather than collapsing, because a blank row and an absent row look the
 * same and mean very different things.
 */

export interface Definition {
  term: string
  value: ReactNode
  /** A second line under the value: a comparison, a caveat, a raw timestamp. */
  hint?: ReactNode
  /** Spans both columns — used for a value that is itself a block. */
  wide?: boolean
}

export function DefinitionList({ items }: { items: readonly Definition[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[minmax(9rem,14rem)_1fr]">
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

/** A short explanatory paragraph inside a panel, for a caveat about the data. */
export function PanelNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-hairline bg-surface2/50 px-3 py-2 text-[12px] text-muted">
      {children}
    </p>
  )
}
