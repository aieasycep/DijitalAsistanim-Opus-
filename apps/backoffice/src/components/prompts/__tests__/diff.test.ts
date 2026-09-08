import { describe, expect, it } from 'vitest'
import { DIFF_CONTEXT_LINES, diffPromptBodies, diffScale, splitLines, type DiffRow } from '../diff'

/**
 * The diff is the one place in the prompt area where a wrong answer is
 * invisible: a missing hunk looks exactly like an unchanged prompt, and the
 * whole point of the screen is that an operator trusts it before pressing
 * "etkinleştir". So the properties that matter are asserted directly.
 *
 * `diff.ts` imports nothing, which is why this runs under the root vitest
 * config with no aliases and no request context.
 */

function flatten(diff: ReturnType<typeof diffPromptBodies>): readonly DiffRow[] {
  return diff.hunks.flatMap((hunk) => hunk.rows)
}

/** Reconstruct the baseline from the diff: every row except the added ones. */
function leftOf(rows: readonly DiffRow[]): readonly string[] {
  return rows.filter((row) => row.kind !== 'added').map((row) => row.text)
}

/** Reconstruct the new version: every row except the removed ones. */
function rightOf(rows: readonly DiffRow[]): readonly string[] {
  return rows.filter((row) => row.kind !== 'removed').map((row) => row.text)
}

describe('splitLines', () => {
  it('treats every newline convention as the same prompt', () => {
    expect(splitLines('a\r\nb\rc\nd')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('keeps a trailing blank line, because it is part of the instruction', () => {
    expect(splitLines('a\n')).toEqual(['a', ''])
  })
})

describe('diffPromptBodies', () => {
  it('reports an identical body as identical and emits no hunks', () => {
    const diff = diffPromptBodies(
      'Sen bir asistansın.\nKısa yanıt ver.',
      'Sen bir asistansın.\nKısa yanıt ver.',
    )
    expect(diff.identical).toBe(true)
    expect(diff.added).toBe(0)
    expect(diff.removed).toBe(0)
    expect(diff.hunks).toHaveLength(0)
  })

  it('treats a CRLF rewrite of the same text as no change at all', () => {
    const diff = diffPromptBodies('bir\niki\nüç', 'bir\r\niki\r\nüç')
    expect(diff.identical).toBe(true)
  })

  it('counts a single replaced line as one addition and one removal', () => {
    const diff = diffPromptBodies('bir\niki\nüç', 'bir\nİKİ\nüç')
    expect(diff.identical).toBe(false)
    expect(diff.added).toBe(1)
    expect(diff.removed).toBe(1)
  })

  it('counts a pure insertion without inventing a removal', () => {
    const diff = diffPromptBodies('bir\nüç', 'bir\niki\nüç')
    expect(diff.added).toBe(1)
    expect(diff.removed).toBe(0)
  })

  it('counts a pure deletion without inventing an addition', () => {
    const diff = diffPromptBodies('bir\niki\nüç', 'bir\nüç')
    expect(diff.added).toBe(0)
    expect(diff.removed).toBe(1)
  })

  it('numbers the gutters against each side independently', () => {
    const rows = flatten(diffPromptBodies('bir\nüç', 'bir\niki\nüç'))
    const added = rows.find((row) => row.kind === 'added')
    expect(added?.left).toBeNull()
    expect(added?.right).toBe(2)

    const removedOnly = flatten(diffPromptBodies('bir\niki\nüç', 'bir\nüç')).find(
      (row) => row.kind === 'removed',
    )
    expect(removedOnly?.right).toBeNull()
    expect(removedOnly?.left).toBe(2)
  })

  it('is lossless: the rendered rows rebuild both bodies exactly', () => {
    const baseline = ['giriş', 'kural bir', 'kural iki', 'kural üç', 'kapanış'].join('\n')
    const updated = [
      'giriş',
      'kural bir',
      'kural iki (yeni)',
      'kural dört',
      'kural üç',
      'kapanış',
    ].join('\n')

    // Small enough that nothing is elided, so the hunks hold every row.
    const rows = flatten(diffPromptBodies(baseline, updated))
    expect(leftOf(rows).join('\n')).toBe(baseline)
    expect(rightOf(rows).join('\n')).toBe(updated)
  })

  it('elides long identical runs and reports how many lines it hid', () => {
    const filler = Array.from({ length: 40 }, (_unused, index) => `satır ${index}`)
    const baseline = [...filler, 'son'].join('\n')
    const updated = [...filler, 'yeni son'].join('\n')

    const diff = diffPromptBodies(baseline, updated)
    expect(diff.added).toBe(1)
    expect(diff.removed).toBe(1)
    expect(diff.hunks).toHaveLength(1)

    const hunk = diff.hunks[0]
    expect(hunk).toBeDefined()
    // 41 baseline lines, of which the change plus its context are kept.
    expect(hunk?.skipped).toBe(40 - DIFF_CONTEXT_LINES)
    expect(hunk?.rows.filter((row) => row.kind === 'equal')).toHaveLength(DIFF_CONTEXT_LINES)
  })

  it('keeps context on both sides of a change in the middle', () => {
    const lines = Array.from({ length: 30 }, (_unused, index) => `satır ${index}`)
    const changed = [...lines]
    changed[15] = 'değişti'

    const diff = diffPromptBodies(lines.join('\n'), changed.join('\n'))
    const rows = flatten(diff)
    const equalBefore = rows.filter((row) => row.kind === 'equal' && (row.left ?? 0) < 16)
    const equalAfter = rows.filter((row) => row.kind === 'equal' && (row.left ?? 0) > 16)
    expect(equalBefore).toHaveLength(DIFF_CONTEXT_LINES)
    expect(equalAfter).toHaveLength(DIFF_CONTEXT_LINES)
  })

  it('reports the line counts of both sides', () => {
    const diff = diffPromptBodies('a\nb', 'a\nb\nc\nd')
    expect(diff.leftLines).toBe(2)
    expect(diff.rightLines).toBe(4)
  })

  it('falls back to block mode and says so when the window is too large', () => {
    // Two bodies with no shared prefix, suffix or line, well past the cell
    // budget: 1400 x 1400 = 1.96M cells.
    const left = Array.from({ length: 1400 }, (_unused, index) => `sol ${index}`).join('\n')
    const right = Array.from({ length: 1400 }, (_unused, index) => `sağ ${index}`).join('\n')

    const diff = diffPromptBodies(left, right)
    expect(diff.truncated).toBe(true)
    expect(diff.removed).toBe(1400)
    expect(diff.added).toBe(1400)
  })

  it('stays aligned for a realistically sized prompt revision', () => {
    const baseline = Array.from({ length: 400 }, (_unused, index) => `kural ${index}`).join('\n')
    const updated = Array.from({ length: 400 }, (_unused, index) =>
      index === 200 ? 'kural 200 — yeniden yazıldı' : `kural ${index}`,
    ).join('\n')

    const diff = diffPromptBodies(baseline, updated)
    expect(diff.truncated).toBe(false)
    expect(diff.added).toBe(1)
    expect(diff.removed).toBe(1)
  })
})

describe('diffScale', () => {
  it('measures the change against the larger body', () => {
    const diff = diffPromptBodies(
      Array.from({ length: 10 }, (_unused, index) => `satır ${index}`).join('\n'),
      Array.from({ length: 10 }, (_unused, index) => (index < 2 ? 'yeni' : `satır ${index}`)).join(
        '\n',
      ),
    )
    // Two lines replaced: two added and two removed over ten lines.
    expect(diffScale(diff).ratio).toBeCloseTo(0.4, 5)
    expect(diffScale(diff).substantial).toBe(true)
  })

  it('never exceeds one, however much was rewritten', () => {
    const diff = diffPromptBodies('a\nb\nc', 'x\ny\nz')
    expect(diffScale(diff).ratio).toBe(1)
  })

  it('calls a small edit small', () => {
    const baseline = Array.from({ length: 50 }, (_unused, index) => `satır ${index}`).join('\n')
    const updated = `${baseline}\nek satır`
    expect(diffScale(diffPromptBodies(baseline, updated)).substantial).toBe(false)
  })
})
