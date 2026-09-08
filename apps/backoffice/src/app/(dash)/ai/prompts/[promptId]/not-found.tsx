import Link from 'next/link'
import { PROMPTS_PATH } from '@/components/prompts/contract'
import { promptMessages } from '@/lib/messages/prompts'

/**
 * A prompt id that resolves to nothing.
 *
 * Imported from the leaf contract rather than the `@/components/prompts` barrel:
 * the barrel also re-exports server components that reach `@/lib/db` and its
 * service-role key, and this file sits on a route that Next may render
 * statically.
 *
 * Two ways to get here in normal operation: a mistyped or stale link, and an id
 * from an old incident report. A version is never deleted by this console —
 * archiving is the retirement — so the copy does not suggest somebody removed
 * it, and it says plainly that the audit rows keyed to that id still resolve.
 */
export default function PromptNotFound() {
  return (
    <div className="bo-panel mx-auto max-w-md p-6 text-center">
      <h1 className="text-[16px] font-semibold text-ink">{promptMessages.detail.notFound}</h1>
      <p className="mt-1 text-[13px] text-muted">{promptMessages.detail.notFoundHint}</p>
      <Link
        href={PROMPTS_PATH}
        className="mt-4 inline-flex h-8 items-center rounded-md bg-primary px-4 text-[13px] font-medium text-on-primary hover:bg-primary-pressed"
      >
        {promptMessages.detail.backToList}
      </Link>
    </div>
  )
}
