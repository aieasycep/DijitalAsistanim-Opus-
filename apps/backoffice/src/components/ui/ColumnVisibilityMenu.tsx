'use client'

import { Columns3 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition, type ReactNode } from 'react'
import { messages } from '@/lib/messages'
import { Button } from './button.tsx'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu.tsx'

/**
 * The column picker.
 *
 * The only client component in the table, and only because a popup needs
 * roving focus and an outside-click listener. It holds no state of its own:
 * every option is a URL the server already computed, and choosing one is a
 * navigation. That is what keeps the menu and the rendered table from ever
 * disagreeing about which columns are on.
 *
 * `router.replace` rather than `push`: hiding a column is a change of view, not
 * a step in a journey, and it should not fill the back button with them.
 */

export interface ColumnVisibilityOption {
  key: string
  /** The column's own header, rendered on the server and handed over as a node. */
  label: ReactNode
  visible: boolean
  /** Where clicking goes: the same table with this column flipped. */
  href: string
}

export function ColumnVisibilityMenu({
  options,
  resetHref,
  canReset,
}: {
  options: readonly ColumnVisibilityOption[]
  resetHref: string
  canReset: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function go(href: string): void {
    startTransition(() => {
      router.replace(href, { scroll: false })
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-busy={pending}>
          <Columns3 aria-hidden="true" />
          {messages.table.columns}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent>
        <DropdownMenuLabel>{messages.table.columnsLabel}</DropdownMenuLabel>
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.key}
            checked={option.visible}
            // `onSelect` rather than `onCheckedChange` so the menu stays open
            // and an operator can flip three columns without reopening it.
            onSelect={(event) => {
              event.preventDefault()
              go(option.href)
            }}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}

        {canReset ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault()
                go(resetHref)
              }}
            >
              {messages.table.columnsReset}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
