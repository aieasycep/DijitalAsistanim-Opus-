import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { supportAccessMessages } from '@/lib/messages/support-access'
import { isOutcomeKey } from './contract'

/**
 * What the last action actually did, said in one sentence.
 *
 * The outcome arrives as a token on the URL and is matched against a closed
 * set, so a hand-edited `?result=` cannot put text on the screen — an
 * unrecognised value renders nothing at all rather than a blank banner.
 *
 * Every one of the tokens is a real outcome of a real attempt. There is no
 * branch here that reports success for something that did not happen, and the
 * two that name a database rule — the four-eyes constraint and the one-live-
 * grant index — say which rule refused rather than showing a generic failure
 * over a refusal the operator could act on.
 */
export function ResultBanner({ outcome }: { outcome: string }) {
  if (!isOutcomeKey(outcome)) return null
  const entry = supportAccessMessages.outcomes[outcome]

  const tone =
    entry.tone === 'success'
      ? 'border-success/40 bg-success-soft text-success-text'
      : entry.tone === 'warning'
        ? 'border-warning/40 bg-warning-soft text-warning-text'
        : 'border-critical/40 bg-critical-soft text-critical-text'

  const Icon =
    entry.tone === 'success' ? CheckCircle2 : entry.tone === 'warning' ? Info : AlertTriangle

  return (
    <div
      role={entry.tone === 'success' ? 'status' : 'alert'}
      className={`flex items-start gap-2 rounded-md border px-3 py-2 ${tone}`}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold">{entry.title}</p>
        <p className="mt-0.5 text-[12px] opacity-90">{entry.body}</p>
      </div>
    </div>
  )
}
