import { promptMessages } from '@/lib/messages/prompts'
import { splitLines } from './diff'

/**
 * The prompt itself, with line numbers.
 *
 * The numbers are not decoration: they are the same numbers the diff's gutter
 * prints, so "the change is at line 34" is a sentence that resolves on both
 * screens. They are `select-none` so copying the body out copies the prompt and
 * not a column of digits.
 *
 * The text is rendered as text — `whitespace-pre-wrap` in a monospaced face —
 * and never as markup. Indentation and blank lines are part of an instruction to
 * a model, and this is the one place in the console where preserving them
 * exactly is the point.
 */
export function PromptBody({ body }: { body: string }) {
  const lines = splitLines(body)

  return (
    <div className="bo-scroll max-h-[32rem] overflow-auto rounded-md border border-hairline bg-surface2/40">
      <table className="w-full border-collapse text-left font-mono text-[12px]">
        <caption className="sr-only">{promptMessages.detail.bodySection}</caption>
        <tbody>
          {lines.map((line, index) => (
            <tr key={index}>
              <td className="w-12 border-r border-hairline/60 px-2 py-0.5 text-right align-top text-[11px] text-faint tabular-nums select-none">
                {index + 1}
              </td>
              <td className="px-3 py-0.5 align-top break-words whitespace-pre-wrap text-ink">
                {line === '' ? ' ' : line}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The version's note, or the sentence that says there is none. */
export function PromptNotes({ notes }: { notes: string | null }) {
  const trimmed = notes?.trim() ?? ''
  if (trimmed === '') {
    return <p className="text-[12px] text-faint">{promptMessages.detail.notesEmpty}</p>
  }
  return <p className="max-w-prose text-[13px] whitespace-pre-wrap text-ink">{trimmed}</p>
}
