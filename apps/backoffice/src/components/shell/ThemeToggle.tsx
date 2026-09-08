'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useState, type ComponentType } from 'react'
import { messages } from '@/lib/messages'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  themeAttribute,
  type ThemeChoice,
} from './shell-contract.ts'

/**
 * Light, dark, or whatever the operating system says.
 *
 * The choice is applied twice: to `document.documentElement` immediately, so
 * the switch is instant and needs no round trip, and to a cookie, so the server
 * stamps the same attribute on the next render and there is no flash of the
 * other theme. Those two must agree — that is why both live in this one
 * handler rather than one here and one in an effect.
 *
 * Dark is a designed theme, not an inversion: `globals.css` redefines the
 * palette and the chart ramp for the dark surface, each validated against it.
 */

const CHOICES: readonly {
  value: ThemeChoice
  label: string
  Icon: ComponentType<{ className?: string }>
}[] = [
  { value: 'light', label: messages.topbar.themeLight, Icon: Sun },
  { value: 'dark', label: messages.topbar.themeDark, Icon: Moon },
  { value: 'system', label: messages.topbar.themeSystem, Icon: Monitor },
]

export function ThemeToggle({ current }: { current: ThemeChoice }) {
  const [choice, setChoice] = useState<ThemeChoice>(current)

  function apply(next: ThemeChoice): void {
    setChoice(next)
    const attribute = themeAttribute(next)
    if (attribute === undefined) delete document.documentElement.dataset['theme']
    else document.documentElement.dataset['theme'] = attribute
    document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`
  }

  const active = CHOICES.find((entry) => entry.value === choice) ?? CHOICES[2]
  const ActiveIcon = active?.Icon ?? Monitor

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={messages.topbar.theme}>
          <ActiveIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{messages.topbar.theme}</DropdownMenuLabel>
        {CHOICES.map((entry) => (
          <DropdownMenuCheckboxItem
            key={entry.value}
            checked={entry.value === choice}
            onSelect={() => {
              apply(entry.value)
            }}
          >
            <entry.Icon className="size-3.5" />
            {entry.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
