import Link from 'next/link'
import { messages } from '@/lib/messages'
import { Button } from './button.tsx'
import { Input, Label } from './field.tsx'
import {
  RANGE_PARAMS,
  RANGE_PRESETS,
  RANGE_TIME_ZONE,
  type RangeParamNames,
  type RangePreset,
  type ResolvedRange,
} from './date-range.ts'
import { PAGINATION_RESET_PARAMS, withParams, type TableLocation } from './table-url.ts'
import { cn } from './utils.ts'

/**
 * The window picker: four shortcuts, two dates, and the timezone it all means.
 *
 * It has no client JavaScript. The shortcuts are links and the custom range is
 * a plain `GET` form pointed at the page's own path, so the control works
 * before hydration, survives a JS error elsewhere on the page, and can be
 * opened in a new tab. Every other parameter on the page rides along as a
 * hidden input, which is why a range change never silently drops a filter.
 *
 * The timezone line is not decoration. "Son 24 saat" is a different set of rows
 * in Istanbul than in UTC, and two operators comparing screens have to know
 * which one they are reading. `resolveRange()` measures in Istanbul; this says
 * so where the window is chosen.
 */

const PRESET_LABELS: Readonly<Record<RangePreset, string>> = Object.freeze({
  '24h': messages.range.last24h,
  '7d': messages.range.last7d,
  '30d': messages.range.last30d,
  '90d': messages.range.last90d,
})

const CORRECTION_MESSAGES: Readonly<Record<NonNullable<ResolvedRange['correction']>, string>> =
  Object.freeze({
    invalid_dates: messages.range.invalid,
    reversed: messages.range.invalid,
    future: messages.range.future,
    too_long: messages.range.invalid,
  })

export interface DateRangePickerProps {
  /** Where the control lives, and everything currently on its query string. */
  location: TableLocation
  /** The window `resolveRange()` produced from that query string. */
  range: ResolvedRange
  /** Which shortcuts to offer. Defaults to all four. */
  presets?: readonly RangePreset[]
  /** Override the parameter names when a page already uses `range` for something. */
  params?: Partial<RangeParamNames>
  /**
   * Parameters a range change clears. A keyset cursor points at a row in the
   * old result set and means nothing in the new one.
   */
  resetParams?: readonly string[]
  /** Accessible name for the group. Defaults to "Tarih aralığı". */
  label?: string
  className?: string
}

export function DateRangePicker({
  location,
  range,
  presets = RANGE_PRESETS,
  params,
  resetParams = PAGINATION_RESET_PARAMS,
  label,
  className,
}: DateRangePickerProps) {
  const names: RangeParamNames = { ...RANGE_PARAMS, ...params }
  const cleared = Object.fromEntries(resetParams.map((key) => [key, null]))

  // Every parameter the page carries that this control does not own, so the
  // GET form re-posts them instead of dropping them.
  const carried = Object.entries(location.query).filter(
    ([key, value]) =>
      value !== '' &&
      key !== names.range &&
      key !== names.from &&
      key !== names.to &&
      !resetParams.includes(key),
  )

  return (
    <section
      aria-label={label ?? messages.range.label}
      className={cn('bo-panel flex flex-wrap items-end gap-x-4 gap-y-2 px-3 py-2', className)}
    >
      <fieldset className="min-w-0">
        <legend className="bo-kicker mb-1">{messages.range.presetLabel}</legend>
        <div className="inline-flex rounded-md border border-hairline bg-surface2/60 p-0.5">
          {presets.map((preset) => {
            const active = range.selection === preset
            const href = withParams(location, {
              ...cleared,
              [names.range]: preset,
              // A preset window is computed from the clock, so the custom
              // dates must go: leaving them would make the URL ambiguous.
              [names.from]: null,
              [names.to]: null,
            })
            return active ? (
              <span
                key={preset}
                aria-current="true"
                className="rounded bg-surface px-2.5 py-1 text-[12px] font-semibold text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]"
              >
                {PRESET_LABELS[preset]}
              </span>
            ) : (
              <Link
                key={preset}
                href={href}
                scroll={false}
                className="rounded px-2.5 py-1 text-[12px] font-medium text-muted transition-colors hover:text-ink"
              >
                {PRESET_LABELS[preset]}
              </Link>
            )
          })}
        </div>
      </fieldset>

      <form method="get" action={location.path} className="flex flex-wrap items-end gap-2">
        {carried.map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <input type="hidden" name={names.range} value="custom" />

        <div className="flex flex-col gap-1">
          <Label htmlFor="bo-range-from">{messages.range.from}</Label>
          <Input
            id="bo-range-from"
            type="date"
            name={names.from}
            defaultValue={range.fromDate}
            max={range.today}
            required
            className="w-36"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="bo-range-to">{messages.range.to}</Label>
          <Input
            id="bo-range-to"
            type="date"
            name={names.to}
            defaultValue={range.toDate}
            max={range.today}
            required
            className="w-36"
          />
        </div>

        <Button type="submit" variant="primary" size="sm">
          {messages.range.apply}
        </Button>
      </form>

      <p className="ml-auto self-end text-right text-[11px] text-faint">
        <span className="block">
          {range.selection === 'custom'
            ? messages.range.summary(range.fromDate, range.toDate)
            : PRESET_LABELS[range.selection]}
        </span>
        <span className="block">{messages.range.timeZoneNote(RANGE_TIME_ZONE)}</span>
      </p>

      {range.correction !== null ? (
        <p
          role="status"
          className="w-full rounded-md bg-warning-soft px-2 py-1 text-[11px] text-warning-text"
        >
          {CORRECTION_MESSAGES[range.correction]}
        </p>
      ) : null}
    </section>
  )
}
