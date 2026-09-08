import { formatNumber, formatRatio } from '@/lib/format'
import { promptMessages } from '@/lib/messages/prompts'
import { versionLabel, type DiffBaselineKind } from './contract'
import { diffScale, type DiffRow, type PromptDiff } from './diff'

/**
 * The change, rendered.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS UNIFIED AND NOT SIDE BY SIDE
 * ---------------------------------------------------------------------------
 *
 * A prompt is prose, and prose lines are long. Two 50-character columns on a
 * 1440-pixel console wrap every line twice and turn a three-line change into a
 * wall — which is how an operator ends up approving something they skimmed. One
 * column with both line numbers in the gutter keeps every line at full width and
 * puts the added and removed lines next to each other where they are compared.
 *
 * ---------------------------------------------------------------------------
 * COLOUR IS NOT THE ONLY SIGNAL
 * ---------------------------------------------------------------------------
 *
 * Every row carries a `+` or `−` marker and a `<td>`-level screen-reader label
 * as well as its background, so the diff survives a monochrome print, a
 * colour-blind reader and a screen reader. The backgrounds are the console's own
 * `success-soft` / `critical-soft` tokens, which are defined for both themes —
 * nothing here hard-codes a hex.
 */

const ROW_CLASS: Readonly<Record<DiffRow['kind'], string>> = {
  equal: '',
  added: 'bg-success-soft',
  removed: 'bg-critical-soft',
}

const TEXT_CLASS: Readonly<Record<DiffRow['kind'], string>> = {
  equal: 'text-muted',
  added: 'text-success-text',
  removed: 'text-critical-text',
}

const MARKER: Readonly<Record<DiffRow['kind'], string>> = {
  equal: ' ',
  added: '+',
  removed: '−',
}

const SR_LABEL: Readonly<Record<DiffRow['kind'], string>> = {
  equal: '',
  added: promptMessages.diff.legendAdded,
  removed: promptMessages.diff.legendRemoved,
}

export function DiffView({
  diff,
  baseline,
  baselineVersion,
  currentVersion,
}: {
  diff: PromptDiff
  /** Which version the comparison was taken against. */
  baseline: DiffBaselineKind
  /** The baseline's number, or null when there is no baseline. */
  baselineVersion: number | null
  currentVersion: number
}) {
  if (baseline === 'none') {
    return (
      <p className="rounded-md bg-surface2 px-3 py-2 text-[12px] text-muted">
        {promptMessages.diff.baselineNone}
      </p>
    )
  }

  const scale = diffScale(diff)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-muted">
        {baseline === 'active'
          ? promptMessages.diff.baselineActive
          : promptMessages.diff.baselinePrevious}
      </p>

      <div className="flex flex-wrap items-center gap-3 text-[12px]">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-surface2 px-2 py-1">
          <span className="bo-kicker">{promptMessages.diff.columnBaseline}</span>
          <span className="font-mono text-ink">
            {baselineVersion === null ? '—' : versionLabel(baselineVersion)}
          </span>
        </span>
        <span aria-hidden="true" className="text-faint">
          →
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-md bg-primary-soft px-2 py-1">
          <span className="bo-kicker text-primary-on-soft">
            {promptMessages.diff.columnCurrent}
          </span>
          <span className="font-mono text-primary-on-soft">{versionLabel(currentVersion)}</span>
        </span>

        <span className="text-success-text">
          +{formatNumber(diff.added)} {promptMessages.diff.added}
        </span>
        <span className="text-critical-text">
          −{formatNumber(diff.removed)} {promptMessages.diff.removed}
        </span>
        {diff.identical ? null : (
          <span className="text-faint">
            {promptMessages.diff.scale(formatRatio(scale.ratio, 0))}
          </span>
        )}
      </div>

      {diff.identical ? (
        <p role="status" className="rounded-md bg-info-soft px-3 py-2 text-[12px] text-info-text">
          {promptMessages.diff.identical}
        </p>
      ) : null}

      {diff.truncated ? (
        <p
          role="status"
          className="rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning-text"
        >
          {promptMessages.diff.truncated}
        </p>
      ) : null}

      {scale.substantial && !diff.truncated ? (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning-text">
          {promptMessages.diff.substantial}
        </p>
      ) : null}

      {diff.hunks.length === 0 ? null : (
        <div className="bo-scroll overflow-x-auto rounded-md border border-hairline">
          <table className="w-full border-collapse text-left font-mono text-[12px]">
            <caption className="sr-only">{promptMessages.diff.section}</caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">
                  {promptMessages.diff.columnBaseline} {promptMessages.diff.lineNumber}
                </th>
                <th scope="col">
                  {promptMessages.diff.columnCurrent} {promptMessages.diff.lineNumber}
                </th>
                <th scope="col">{promptMessages.diff.section}</th>
              </tr>
            </thead>
            <tbody>
              {diff.hunks.map((hunk, hunkIndex) => (
                <DiffHunkRows
                  key={`${hunkIndex}-${hunk.rows[0]?.left ?? 'x'}-${hunk.rows[0]?.right ?? 'x'}`}
                  skipped={hunk.skipped}
                  rows={hunk.rows}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function DiffHunkRows({ skipped, rows }: { skipped: number; rows: readonly DiffRow[] }) {
  return (
    <>
      {skipped > 0 ? (
        <tr className="border-y border-hairline bg-surface2/60">
          <td colSpan={3} className="px-3 py-1 text-center text-[11px] text-faint">
            · {promptMessages.diff.unchanged(skipped)} ·
          </td>
        </tr>
      ) : null}
      {rows.map((row, index) => (
        <tr key={`${row.left ?? 'a'}-${row.right ?? 'b'}-${index}`} className={ROW_CLASS[row.kind]}>
          <td className="w-12 border-r border-hairline/60 px-2 py-0.5 text-right align-top text-[11px] text-faint tabular-nums select-none">
            {row.left ?? ''}
          </td>
          <td className="w-12 border-r border-hairline/60 px-2 py-0.5 text-right align-top text-[11px] text-faint tabular-nums select-none">
            {row.right ?? ''}
          </td>
          <td className={`px-3 py-0.5 align-top ${TEXT_CLASS[row.kind]}`}>
            {SR_LABEL[row.kind] === '' ? null : (
              <span className="sr-only">{SR_LABEL[row.kind]}: </span>
            )}
            <span aria-hidden="true" className="mr-2 inline-block w-2 opacity-70">
              {MARKER[row.kind]}
            </span>
            <span className="break-words whitespace-pre-wrap">
              {row.text === '' ? ' ' : row.text}
            </span>
          </td>
        </tr>
      ))}
    </>
  )
}
