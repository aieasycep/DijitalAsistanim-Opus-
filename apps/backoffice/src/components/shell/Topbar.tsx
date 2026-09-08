import { Suspense } from 'react'
import type { EnvironmentDescriptor } from '@/lib/env'
import { messages } from '@/lib/messages'
import { ROLE_LABELS_TR, type AdminRole } from '@/lib/permissions'
import { AdminMenu } from './AdminMenu.tsx'
import { CommandPalette, type PaletteNavItem } from './CommandPalette.tsx'
import { EnvironmentBadge } from './EnvironmentBadge.tsx'
import { HealthIndicator } from './HealthIndicator.tsx'
import type { ThemeChoice } from './shell-contract.ts'

/**
 * The toolbar: search, health, environment, and who you are.
 *
 * Four things, and each of them answers a question an operator has before they
 * have finished reading the page — where do I go, is anything on fire, is this
 * real customer data, and am I signed in as the right person. Nothing else
 * belongs here; a toolbar that grows a fifth control grows a sixth.
 *
 * The health chip is the one part that needs a query, so it is wrapped in its
 * own `Suspense` boundary: a slow health probe delays a chip, not the page
 * behind it.
 */

export interface TopbarProps {
  environment: EnvironmentDescriptor
  email: string
  displayName: string | null
  role: AdminRole
  permissionCount: number
  theme: ThemeChoice
  /** Destinations this operator may open, for the palette. */
  paletteItems: readonly PaletteNavItem[]
  /** Where the health chip leads. */
  healthHref: string
}

export function Topbar({
  environment,
  email,
  displayName,
  role,
  permissionCount,
  theme,
  paletteItems,
  healthHref,
}: TopbarProps) {
  return (
    <header
      aria-label={messages.topbar.label}
      className="sticky top-0 z-30 flex h-11 shrink-0 items-center gap-2 border-b border-hairline bg-surface/95 px-3 backdrop-blur"
    >
      <CommandPalette items={paletteItems} />

      <div className="ml-auto flex items-center gap-2">
        <Suspense fallback={<HealthChipFallback />}>
          <HealthIndicator href={healthHref} />
        </Suspense>

        <EnvironmentBadge environment={environment} />

        <AdminMenu
          email={email}
          displayName={displayName}
          roleLabel={ROLE_LABELS_TR[role]}
          permissionCount={permissionCount}
          theme={theme}
        />
      </div>
    </header>
  )
}

/**
 * The chip before its query settles. Grey and wordless: it must not imply a
 * reading, and "operational" is a reading.
 */
function HealthChipFallback() {
  return (
    <span className="flex h-7 items-center gap-1.5 rounded-md border border-hairline px-2 text-[12px] text-faint">
      <span aria-hidden="true" className="bo-skeleton size-1.5 rounded-full" />
      <span className="sr-only">{messages.states.loading}</span>
      <span aria-hidden="true" className="bo-skeleton hidden h-2.5 w-24 lg:block" />
    </span>
  )
}
