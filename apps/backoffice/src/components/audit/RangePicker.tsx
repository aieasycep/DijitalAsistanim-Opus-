'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { LOG_PARAMS, RESET_PARAMS, type RangePreset } from './contract'
import { RANGE_PRESET_LABEL, auditMessages } from './messages'

/**
 * The date range, as five shortcuts and two date inputs over the same two
 * parameters.
 *
 * Both halves write `bas` and `bit` — there is no second "preset" parameter
 * that could disagree with them — so a range an operator reached by pressing
 * "30 gün" is the same URL as one they typed, and a link pasted into a ticket
 * always means the same days.
 *
 * The shortcut dates are computed on the server from the injected clock and
 * handed down as plain strings. This component never asks what day it is,
 * which is why there is no `new Date()` in it and why a frozen clock renders a
 * stable page.
 *
 * Every change clears the keyset cursor: a cursor points at a row in the old
 * result set and means nothing in the new one.
 */

export interface RangePresetChoice {
  key: RangePreset
  from: string
  to: string
}

export interface RangePickerProps {
  presets: readonly RangePresetChoice[]
  /** Current values of every parameter on the page, so none is dropped. */
  values: Readonly<Record<string, string>>
  from: string
  to: string
  /** The preset the current range happens to equal, if it equals one. */
  active: RangePreset | null
  /** Today in Istanbul: the furthest either input may go. */
  today: string
}

export function RangePicker({ presets, values, from, to, active, today }: RangePickerProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()

  function navigate(nextFrom: string, nextTo: string): void {
    const params = new URLSearchParams()
    const next: Record<string, string> = { ...values }
    for (const cleared of RESET_PARAMS) delete next[cleared]
    next[LOG_PARAMS.from] = nextFrom
    next[LOG_PARAMS.to] = nextTo

    for (const [key, value] of Object.entries(next)) {
      if (value !== '') params.set(key, value)
    }
    const query = params.toString()
    startTransition(() => {
      router.replace(query === '' ? pathname : `${pathname}?${query}`)
    })
  }

  return (
    <div
      className="bo-panel flex flex-wrap items-end gap-3 px-3 py-2"
      aria-busy={pending}
      aria-label={auditMessages.log.rangeLabel}
    >
      <fieldset className="min-w-0">
        <legend className="bo-kicker mb-1">{auditMessages.range.presetLabel}</legend>
        <div className="inline-flex rounded-md border border-hairline bg-surface2/60 p-0.5">
          {presets.map((preset) => {
            const selected = active === preset.key
            return (
              <button
                key={preset.key}
                type="button"
                aria-pressed={selected}
                disabled={pending}
                onClick={() => {
                  navigate(preset.from, preset.to)
                }}
                className={[
                  'rounded px-2.5 py-1 text-[12px] font-medium transition-colors disabled:opacity-60',
                  selected
                    ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]'
                    : 'text-muted hover:text-ink',
                ].join(' ')}
              >
                {RANGE_PRESET_LABEL[preset.key]}
              </button>
            )
          })}
        </div>
      </fieldset>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          const nextFrom = String(data.get(LOG_PARAMS.from) ?? '')
          const nextTo = String(data.get(LOG_PARAMS.to) ?? '')
          if (nextFrom === '' || nextTo === '') return
          navigate(nextFrom, nextTo)
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="bo-kicker">{auditMessages.log.rangeFrom}</span>
          <input
            type="date"
            name={LOG_PARAMS.from}
            defaultValue={from}
            max={today}
            required
            disabled={pending}
            className="h-7 rounded-md border border-hairline bg-surface px-2 text-[12px] text-ink disabled:opacity-60"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="bo-kicker">{auditMessages.log.rangeTo}</span>
          <input
            type="date"
            name={LOG_PARAMS.to}
            defaultValue={to}
            max={today}
            required
            disabled={pending}
            className="h-7 rounded-md border border-hairline bg-surface px-2 text-[12px] text-ink disabled:opacity-60"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="h-7 rounded-md bg-primary px-2.5 text-[12px] font-medium text-on-primary disabled:opacity-60"
        >
          {auditMessages.log.rangeApply}
        </button>
      </form>

      <span className="ml-auto self-end text-[11px] text-faint">
        {active === null ? auditMessages.range.custom : auditMessages.log.rangeSummary(from, to)}
      </span>
    </div>
  )
}
