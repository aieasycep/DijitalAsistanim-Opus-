'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { messages } from '@/lib/messages'

/**
 * The filter bar. Every control here changes the URL, and the server re-queries
 * from the URL — there is no client-side filtering of a list that was already
 * fetched, and no control that only looks like it does something.
 *
 * Current values arrive as props from the Server Component that already parsed
 * `searchParams`. That keeps the URL the single source of truth (a filtered
 * view is linkable and shareable between operators) and avoids
 * `useSearchParams`, which would force a Suspense boundary on every page.
 */

export interface FilterOption {
  value: string
  label: string
}

export interface SelectFilter {
  kind: 'select'
  /** Query-string parameter this control owns. */
  param: string
  label: string
  options: readonly FilterOption[]
  /** Label for the "no filter" choice. */
  allLabel?: string
}

export interface SegmentedFilter {
  kind: 'segmented'
  param: string
  label: string
  options: readonly FilterOption[]
}

export interface SearchFilter {
  kind: 'search'
  param: string
  label: string
  placeholder?: string
}

export type FilterControl = SelectFilter | SegmentedFilter | SearchFilter

export interface FiltersProps {
  controls: readonly FilterControl[]
  /** Current value of every parameter on the page, including `sayfa`. */
  values: Readonly<Record<string, string>>
  /** Parameters cleared alongside a filter change, e.g. the page cursor. */
  resetParams?: readonly string[]
}

export function Filters({ controls, values, resetParams = ['sayfa'] }: FiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()

  function navigate(next: Record<string, string>): void {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(next)) {
      if (value !== '') params.set(key, value)
    }
    const query = params.toString()
    startTransition(() => {
      router.replace(query === '' ? pathname : `${pathname}?${query}`)
    })
  }

  function setParam(param: string, value: string): void {
    const next: Record<string, string> = { ...values, [param]: value }
    for (const cleared of resetParams) {
      if (cleared !== param) delete next[cleared]
    }
    navigate(next)
  }

  function reset(): void {
    const next: Record<string, string> = { ...values }
    for (const control of controls) delete next[control.param]
    for (const cleared of resetParams) delete next[cleared]
    navigate(next)
  }

  const isFiltered = controls.some((control) => (values[control.param] ?? '') !== '')

  return (
    <div
      className="bo-panel flex flex-wrap items-end gap-3 px-3 py-2"
      aria-busy={pending}
      aria-label={messages.filters.label}
    >
      {controls.map((control) => {
        const current = values[control.param] ?? ''

        if (control.kind === 'segmented') {
          return (
            <fieldset key={control.param} className="min-w-0">
              <legend className="bo-kicker mb-1">{control.label}</legend>
              <div className="inline-flex rounded-md border border-hairline bg-surface2/60 p-0.5">
                {control.options.map((option) => {
                  const active = current === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={active}
                      disabled={pending}
                      onClick={() => {
                        setParam(control.param, option.value)
                      }}
                      className={[
                        'rounded px-2.5 py-1 text-[12px] font-medium transition-colors disabled:opacity-60',
                        active
                          ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]'
                          : 'text-muted hover:text-ink',
                      ].join(' ')}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          )
        }

        if (control.kind === 'select') {
          return (
            <label key={control.param} className="flex min-w-0 flex-col gap-1">
              <span className="bo-kicker">{control.label}</span>
              <select
                value={current}
                disabled={pending}
                onChange={(event) => {
                  setParam(control.param, event.target.value)
                }}
                className="h-7 min-w-36 rounded-md border border-hairline bg-surface px-2 text-[12px] text-ink disabled:opacity-60"
              >
                <option value="">{control.allLabel ?? messages.filters.all}</option>
                {control.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )
        }

        return (
          <form
            key={control.param}
            className="flex min-w-0 flex-col gap-1"
            onSubmit={(event) => {
              event.preventDefault()
              const data = new FormData(event.currentTarget)
              setParam(control.param, String(data.get(control.param) ?? ''))
            }}
          >
            <label className="bo-kicker" htmlFor={`filter-${control.param}`}>
              {control.label}
            </label>
            <div className="flex gap-1">
              <input
                id={`filter-${control.param}`}
                name={control.param}
                defaultValue={current}
                placeholder={control.placeholder}
                disabled={pending}
                className="h-7 min-w-48 rounded-md border border-hairline bg-surface px-2 text-[12px] text-ink placeholder:text-faint disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={pending}
                className="h-7 rounded-md bg-primary px-2.5 text-[12px] font-medium text-on-primary disabled:opacity-60"
              >
                {messages.filters.search}
              </button>
            </div>
          </form>
        )
      })}

      {isFiltered ? (
        <button
          type="button"
          onClick={reset}
          disabled={pending}
          className="h-7 self-end rounded-md border border-hairline px-2.5 text-[12px] font-medium text-muted hover:text-ink disabled:opacity-60"
        >
          {messages.filters.reset}
        </button>
      ) : null}
    </div>
  )
}
