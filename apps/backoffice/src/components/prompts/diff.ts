/**
 * A line diff between two prompt bodies.
 *
 * ---------------------------------------------------------------------------
 * WHY THE DIFF IS THE POINT
 * ---------------------------------------------------------------------------
 *
 * Activating a prompt version changes what the model is told, for everybody, at
 * once. The question an operator has to be able to answer before pressing that
 * button is not "is this text good" but "what does this change" — and two
 * thousand words rendered side by side answers nothing. So the console computes
 * the difference and shows only that, with the surrounding lines for context.
 *
 * The same computation is what makes a regression traceable afterwards: an
 * `ai_usage_events` row names the version that produced it, this file names the
 * lines that version added, and between them "this prompt made things worse"
 * stops being an impression.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS PURE, AND HERE
 * ---------------------------------------------------------------------------
 *
 * No imports at all. The diff runs on the server (a prompt body never needs to
 * reach a browser to be compared) but it is a function of two strings, so it is
 * testable without a database and safe on either side of the client boundary.
 *
 * ---------------------------------------------------------------------------
 * THE ALGORITHM, AND ITS CEILING
 * ---------------------------------------------------------------------------
 *
 * Common prefix and suffix are trimmed first — two versions of a prompt usually
 * differ in one paragraph — and the remaining window is diffed with a
 * longest-common-subsequence table. That table is quadratic, so it has a stated
 * cell budget: past it the window is reported as one removed block and one added
 * block, `truncated` is set, and the screen says so. A diff that quietly stopped
 * being a diff would be worse than one that admits it ran out of room.
 */

// ===========================================================================
// Shape
// ===========================================================================

export type DiffRowKind = 'equal' | 'added' | 'removed'

export interface DiffRow {
  kind: DiffRowKind
  /** 1-based line number in the baseline, or null for an added line. */
  left: number | null
  /** 1-based line number in the new version, or null for a removed line. */
  right: number | null
  text: string
}

/**
 * A contiguous run of interesting lines.
 *
 * `skipped` is how many identical lines were elided immediately before it, so
 * the screen can render "· 42 satır aynı ·" rather than pretending the two
 * bodies are adjacent.
 */
export interface DiffHunk {
  skipped: number
  rows: readonly DiffRow[]
}

export interface PromptDiff {
  /** True when the two bodies are byte-identical after newline normalisation. */
  identical: boolean
  added: number
  removed: number
  leftLines: number
  rightLines: number
  /** The comparison window exceeded the cell budget and was not aligned. */
  truncated: boolean
  hunks: readonly DiffHunk[]
}

// ===========================================================================
// Bounds
// ===========================================================================

/** Identical lines kept either side of a change, so a hunk reads in context. */
export const DIFF_CONTEXT_LINES = 3

/**
 * The alignment budget, in table cells.
 *
 * 1.5 million is roughly a 1200×1200-line window — far past any real system
 * prompt — and costs a few megabytes for the duration of one render.
 */
export const MAX_DIFF_CELLS = 1_500_000

// ===========================================================================
// Lines
// ===========================================================================

/**
 * Split a body into lines on any newline convention.
 *
 * A prompt written on Windows and one written on macOS are the same prompt; a
 * diff that reported every line as changed because of `\r` would be noise where
 * the whole value is signal.
 */
export function splitLines(text: string): readonly string[] {
  return text.replace(/\r\n?/g, '\n').split('\n')
}

function value(list: readonly number[], index: number): number {
  return list[index] ?? 0
}

function lineAt(lines: readonly string[], index: number): string {
  return lines[index] ?? ''
}

// ===========================================================================
// The diff
// ===========================================================================

export function diffPromptBodies(baseline: string, updated: string): PromptDiff {
  const left = splitLines(baseline)
  const right = splitLines(updated)

  if (baseline.replace(/\r\n?/g, '\n') === updated.replace(/\r\n?/g, '\n')) {
    return {
      identical: true,
      added: 0,
      removed: 0,
      leftLines: left.length,
      rightLines: right.length,
      truncated: false,
      hunks: [],
    }
  }

  // Trim what is unambiguously shared. Two versions of the same prompt normally
  // differ in one region, and this turns a quadratic problem into a small one.
  const limit = Math.min(left.length, right.length)
  let prefix = 0
  while (prefix < limit && lineAt(left, prefix) === lineAt(right, prefix)) prefix += 1

  let suffix = 0
  while (
    suffix < limit - prefix &&
    lineAt(left, left.length - 1 - suffix) === lineAt(right, right.length - 1 - suffix)
  ) {
    suffix += 1
  }

  const midLeft = left.slice(prefix, left.length - suffix)
  const midRight = right.slice(prefix, right.length - suffix)

  const truncated = midLeft.length * midRight.length > MAX_DIFF_CELLS
  const middle = truncated
    ? blockRows(midLeft, midRight, prefix)
    : alignedRows(midLeft, midRight, prefix)

  const rows: DiffRow[] = []
  for (let index = 0; index < prefix; index += 1) {
    rows.push({ kind: 'equal', left: index + 1, right: index + 1, text: lineAt(left, index) })
  }
  rows.push(...middle)
  for (let index = 0; index < suffix; index += 1) {
    const leftLine = left.length - suffix + index
    const rightLine = right.length - suffix + index
    rows.push({
      kind: 'equal',
      left: leftLine + 1,
      right: rightLine + 1,
      text: lineAt(left, leftLine),
    })
  }

  let added = 0
  let removed = 0
  for (const row of rows) {
    if (row.kind === 'added') added += 1
    if (row.kind === 'removed') removed += 1
  }

  return {
    identical: false,
    added,
    removed,
    leftLines: left.length,
    rightLines: right.length,
    truncated,
    hunks: toHunks(rows),
  }
}

/**
 * The window when it fits the budget: a longest common subsequence, walked back
 * into removals, additions and the lines both sides kept.
 */
function alignedRows(
  midLeft: readonly string[],
  midRight: readonly string[],
  offset: number,
): readonly DiffRow[] {
  const n = midLeft.length
  const m = midRight.length
  const width = m + 1

  // table[i * width + j] = length of the LCS of midLeft[i..] and midRight[j..].
  const table: number[] = new Array<number>((n + 1) * width).fill(0)
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        lineAt(midLeft, i) === lineAt(midRight, j)
          ? value(table, (i + 1) * width + (j + 1)) + 1
          : Math.max(value(table, (i + 1) * width + j), value(table, i * width + (j + 1)))
    }
  }

  const rows: DiffRow[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (lineAt(midLeft, i) === lineAt(midRight, j)) {
      rows.push({
        kind: 'equal',
        left: offset + i + 1,
        right: offset + j + 1,
        text: lineAt(midLeft, i),
      })
      i += 1
      j += 1
    } else if (value(table, (i + 1) * width + j) >= value(table, i * width + (j + 1))) {
      rows.push({ kind: 'removed', left: offset + i + 1, right: null, text: lineAt(midLeft, i) })
      i += 1
    } else {
      rows.push({ kind: 'added', left: null, right: offset + j + 1, text: lineAt(midRight, j) })
      j += 1
    }
  }
  while (i < n) {
    rows.push({ kind: 'removed', left: offset + i + 1, right: null, text: lineAt(midLeft, i) })
    i += 1
  }
  while (j < m) {
    rows.push({ kind: 'added', left: null, right: offset + j + 1, text: lineAt(midRight, j) })
    j += 1
  }
  return rows
}

/**
 * The window when it does not fit: everything removed, then everything added.
 *
 * Correct but coarse — every line of the window is reported as changed, which
 * is true and unhelpful. `PromptDiff.truncated` is what the screen renders the
 * warning from.
 */
function blockRows(
  midLeft: readonly string[],
  midRight: readonly string[],
  offset: number,
): readonly DiffRow[] {
  const rows: DiffRow[] = []
  midLeft.forEach((text, index) => {
    rows.push({ kind: 'removed', left: offset + index + 1, right: null, text })
  })
  midRight.forEach((text, index) => {
    rows.push({ kind: 'added', left: null, right: offset + index + 1, text })
  })
  return rows
}

// ===========================================================================
// Hunks
// ===========================================================================

/**
 * Collapse long runs of identical lines, keeping `DIFF_CONTEXT_LINES` either
 * side of every change.
 *
 * A run is only worth eliding when it is longer than the context it would be
 * replaced by; otherwise the "· n satır aynı ·" marker costs more attention than
 * the lines it hides.
 */
function toHunks(rows: readonly DiffRow[]): readonly DiffHunk[] {
  const keep = new Array<boolean>(rows.length).fill(false)
  rows.forEach((row, index) => {
    if (row.kind === 'equal') return
    const from = Math.max(0, index - DIFF_CONTEXT_LINES)
    const to = Math.min(rows.length - 1, index + DIFF_CONTEXT_LINES)
    for (let cursor = from; cursor <= to; cursor += 1) keep[cursor] = true
  })

  const hunks: DiffHunk[] = []
  let current: DiffRow[] = []
  let skipped = 0
  let pending = 0

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    if (row === undefined) continue
    if (keep[index] === true) {
      if (current.length === 0) skipped = pending
      pending = 0
      current.push(row)
      continue
    }
    if (current.length > 0) {
      hunks.push({ skipped, rows: current })
      current = []
      skipped = 0
    }
    pending += 1
  }

  if (current.length > 0) hunks.push({ skipped, rows: current })
  return hunks
}

// ===========================================================================
// Summary
// ===========================================================================

export interface DiffScale {
  /** Lines touched, as a share of the larger of the two bodies. */
  ratio: number
  /** True when more than a third of the prompt changed: read it in full. */
  substantial: boolean
}

/**
 * How big the change is, relative to the prompt it changes.
 *
 * Three added lines mean one thing in a forty-line prompt and another in a four
 * hundred-line one, and an operator scanning a list of versions needs the second
 * number to read the first.
 */
export function diffScale(diff: PromptDiff): DiffScale {
  const denominator = Math.max(diff.leftLines, diff.rightLines, 1)
  const ratio = Math.min(1, (diff.added + diff.removed) / denominator)
  return { ratio, substantial: ratio >= 1 / 3 }
}
