import type { EnvironmentDescriptor } from '@/lib/env'
import { environmentBannerText } from '@/lib/env'
import { messages } from '@/lib/messages'
import { cn } from '@/components/ui/utils'

/**
 * Which deployment this console is pointed at.
 *
 * The chip is always rendered, including in production. That is deliberate and
 * it is the opposite of the usual advice: a banner that only appears on staging
 * teaches operators that *no banner* means production, and "no banner" is also
 * what a broken banner looks like. A chip that always says something can only
 * be wrong out loud.
 *
 * Production is rendered quietly — a neutral chip — and everything else is
 * rendered in amber, because the risk being flagged is the reverse one: an
 * operator who believes they are on staging while disconnecting a real
 * customer's mailbox. The `title` carries the project reference, which is how
 * "am I really on staging?" gets answered from the screen instead of from a
 * deployment dashboard.
 *
 * `describeEnvironment()` throws in a browser rather than guessing, so the
 * descriptor is resolved on the server and handed down as a prop — none of the
 * variables it reads are `NEXT_PUBLIC_`, and a client-side read would report
 * "development" while pointed at production.
 */
export function EnvironmentBadge({ environment }: { environment: EnvironmentDescriptor }) {
  const detail = [
    environmentBannerText(environment),
    environment.release === null ? null : `release ${environment.release.slice(0, 12)}`,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ')

  return (
    <span
      title={detail}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold tracking-[0.06em] uppercase',
        environment.isProduction
          ? 'border-hairline text-faint'
          : 'border-warning/40 bg-warning-soft text-warning-text',
      )}
    >
      <span className="sr-only">{messages.topbar.environmentLabel}: </span>
      {environment.code}
      {environment.projectRef === null ? null : (
        <span className="hidden font-normal normal-case opacity-70 xl:inline">
          {environment.projectRef}
        </span>
      )}
    </span>
  )
}
