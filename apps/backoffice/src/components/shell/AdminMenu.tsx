'use client'

import { LogOut } from 'lucide-react'
import { signOutAction } from '@/app/session-actions'
import { messages } from '@/lib/messages'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/components/ui/utils'
import { ThemeToggle } from './ThemeToggle.tsx'
import type { ThemeChoice } from './shell-contract.ts'

/**
 * The operator, and the two things they can do about being one: change the
 * theme, or stop being signed in.
 *
 * The address shown here is the only unredacted email in the console, and it
 * belongs to the person reading the screen — it is how they notice they are
 * signed in as the wrong account before acting as it. Every other address,
 * including another admin's, is redacted by `bo_*`.
 *
 * There is no "switch user", no "view as", and no impersonation. Support
 * questions that genuinely need a user's content go through Support Access:
 * a written reason, a second person's approval, a time limit, and a row in
 * `support_access_reveals` naming exactly what was seen.
 */

export interface AdminMenuProps {
  /** The operator's own address, in full. */
  email: string
  displayName: string | null
  roleLabel: string
  /** How many permissions the role carries — a fact, not a claim. */
  permissionCount: number
  theme: ThemeChoice
}

function initialsOf(displayName: string | null, email: string): string {
  const source = displayName?.trim() ?? ''
  if (source.length > 0) {
    const parts = source.split(/\s+/u).filter((part) => part.length > 0)
    const first = parts[0]?.[0] ?? ''
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
    return `${first}${last}`.toLocaleUpperCase('tr-TR')
  }
  return (email[0] ?? '?').toLocaleUpperCase('tr-TR')
}

export function AdminMenu({
  email,
  displayName,
  roleLabel,
  permissionCount,
  theme,
}: AdminMenuProps) {
  return (
    <div className="flex items-center gap-1">
      <ThemeToggle current={theme} />

      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'flex h-7 items-center gap-2 rounded-md border border-hairline pr-2 pl-1',
            'transition-colors hover:bg-surface2',
          )}
          aria-label={messages.topbar.accountLabel}
        >
          <span
            aria-hidden="true"
            className="flex size-5 items-center justify-center rounded bg-primary-soft text-[10px] font-bold text-primary-on-soft"
          >
            {initialsOf(displayName, email)}
          </span>
          <span className="hidden max-w-40 truncate text-[12px] text-ink md:inline">
            {displayName ?? email}
          </span>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="min-w-56">
          <DropdownMenuLabel>{messages.nav.signedInAs}</DropdownMenuLabel>
          <div className="px-2 pb-2">
            <p className="truncate text-[12px] font-medium text-ink">{displayName ?? email}</p>
            {displayName === null ? null : (
              <p className="truncate text-[11px] text-muted">{email}</p>
            )}
            <p className="mt-1 text-[11px] text-faint">
              {roleLabel} · {messages.topbar.permissions(permissionCount)}
            </p>
          </div>

          <DropdownMenuSeparator />

          <form action={signOutAction}>
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full text-left">
                <LogOut aria-hidden="true" />
                {messages.nav.signOut}
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
