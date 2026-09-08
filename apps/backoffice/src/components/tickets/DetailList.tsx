import type { ReactNode } from 'react'

/**
 * A label/value list, for the panels that are a set of facts rather than a
 * table.
 *
 * `null`, `undefined` and `''` render an em dash rather than a blank box: a
 * value that is genuinely absent has to look different from a value the page
 * forgot to fetch, and an empty cell reads as the second.
 */

export interface DetailItem {
  label: string
  value: ReactNode
  /** Full width, for a value that will not fit beside its label. */
  wide?: boolean
}

export function DetailList({ items }: { items: readonly DetailItem[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className={item.wide === true ? 'sm:col-span-2' : undefined}>
          <dt className="bo-kicker">{item.label}</dt>
          <dd className="mt-0.5 text-[13px] text-ink">
            {item.value === null || item.value === undefined || item.value === '' ? (
              <span className="text-faint">—</span>
            ) : (
              item.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}
