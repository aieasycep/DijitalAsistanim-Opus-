'use client'

import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from 'react'
import { messages } from '@/lib/messages'
import type { NavIcon } from '@/lib/nav'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/components/ui/utils'
import { NAV_ICON_COMPONENTS } from './icons.tsx'
import { searchConsole, type ConsoleSearchResult } from './search-actions.ts'

/**
 * Ctrl/Cmd+K.
 *
 * ---------------------------------------------------------------------------
 * IT NAVIGATES, AND THAT IS ALL IT DOES
 * ---------------------------------------------------------------------------
 *
 * Every result is a destination. Nothing in here disables an account,
 * disconnects an integration or forces a resync — those need a written reason
 * and a confirmation, and neither fits in a search box. A palette that can
 * destroy something is a palette that will, the first time somebody types fast
 * and presses Enter on the wrong row.
 *
 * ---------------------------------------------------------------------------
 * TWO KINDS OF RESULT, FOR TWO REASONS
 * ---------------------------------------------------------------------------
 *
 * Pages are filtered on the client, from the list the server already trimmed to
 * this operator's permissions — instant, and no request for something the
 * browser already knows. Users and sync rows come from the server, because they
 * are data and the browser must not be holding a copy of the directory.
 *
 * ---------------------------------------------------------------------------
 * KEYBOARD
 * ---------------------------------------------------------------------------
 *
 * The input is an ARIA combobox owning a listbox: arrows move the active
 * option, Enter opens it, Escape closes the dialog, and `aria-activedescendant`
 * keeps the announcement in step without focus ever leaving the input. Radix
 * traps the tab ring and returns focus to whatever was focused before.
 */

export interface PaletteNavItem {
  readonly href: string
  readonly label: string
  readonly description: string
  readonly icon: NavIcon
  readonly group: string
}

interface Option {
  readonly id: string
  readonly href: string
  readonly primary: string
  readonly secondary: string
  readonly group: string
  readonly icon: NavIcon | null
  readonly badge: string | null
}

const MIN_QUERY = 2
const DEBOUNCE_MS = 220

export function CommandPalette({ items }: { items: readonly PaletteNavItem[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<ConsoleSearchResult | null>(null)
  const [active, setActive] = useState(0)
  const [searching, startSearch] = useTransition()
  const listRef = useRef<HTMLUListElement>(null)
  const baseId = useId()
  const listId = `${baseId}-list`

  // The global shortcut. `metaKey` for macOS, `ctrlKey` everywhere else; the
  // browser's own Ctrl+K (search bar) is pre-empted deliberately, because this
  // is an application window, not a document.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      setOpen((previous) => !previous)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  // Server lookup, debounced. Typing "9f3c" should not cost four queries.
  useEffect(() => {
    const trimmed = query.trim()
    if (!open || trimmed.length < MIN_QUERY) {
      setResult(null)
      return
    }
    const timer = setTimeout(() => {
      startSearch(async () => {
        setResult(await searchConsole(trimmed))
      })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [query, open])

  const options = useMemo(() => buildOptions(items, query, result), [items, query, result])

  // The active row is an index into a list that changes as results arrive.
  useEffect(() => {
    setActive(0)
  }, [query, result])

  const go = useCallback(
    (href: string) => {
      setOpen(false)
      setQuery('')
      setResult(null)
      router.push(href)
    },
    [router],
  )

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (options.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => (index + 1) % options.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => (index - 1 + options.length) % options.length)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActive(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActive(options.length - 1)
    } else if (event.key === 'Enter') {
      const option = options[active]
      if (option !== undefined) {
        event.preventDefault()
        go(option.href)
      }
    }
  }

  // Keep the highlighted row in view when the arrows walk past the fold.
  useEffect(() => {
    const list = listRef.current
    if (list === null) return
    const element = list.querySelector<HTMLElement>('[data-active="true"]')
    element?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const status = paletteStatus(query, result, searching, options.length)

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
        }}
        className={cn(
          'flex h-7 min-w-0 items-center gap-2 rounded-md border border-hairline bg-surface2/50 px-2',
          'text-[12px] text-faint transition-colors hover:border-primary/40 hover:text-muted',
          'w-40 lg:w-64',
        )}
      >
        <Search aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="truncate">{messages.topbar.searchPlaceholder}</span>
        <kbd className="ml-auto hidden shrink-0 rounded border border-hairline px-1 font-sans text-[10px] lg:inline">
          ⌘K
        </kbd>
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) {
            setQuery('')
            setResult(null)
          }
        }}
      >
        <DialogContent
          showClose={false}
          className="top-24 max-w-lg translate-y-0 p-0"
          aria-describedby={`${baseId}-hint`}
        >
          <DialogTitle className="sr-only">{messages.command.title}</DialogTitle>
          <DialogDescription id={`${baseId}-hint`} className="sr-only">
            {messages.command.description}
          </DialogDescription>

          <div className="flex items-center gap-2 border-b border-hairline px-3 py-2">
            <Search aria-hidden="true" className="size-4 shrink-0 text-faint" />
            <input
              type="text"
              role="combobox"
              aria-expanded={options.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                options[active] === undefined ? undefined : `${baseId}-option-${active}`
              }
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
              }}
              onKeyDown={onKeyDown}
              placeholder={messages.command.placeholder}
              aria-label={messages.command.placeholder}
              className="h-7 w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
            />
          </div>

          <ul
            id={listId}
            ref={listRef}
            role="listbox"
            aria-label={messages.command.title}
            className="bo-scroll max-h-80 py-1"
          >
            {options.map((option, index) => {
              const Icon = option.icon === null ? null : NAV_ICON_COMPONENTS[option.icon]
              const isActive = index === active
              const showGroup = index === 0 || options[index - 1]?.group !== option.group
              return (
                <li key={option.id}>
                  {showGroup ? (
                    <p className="bo-kicker px-3 pt-2 pb-1" aria-hidden="true">
                      {option.group}
                    </p>
                  ) : null}
                  <div
                    id={`${baseId}-option-${index}`}
                    role="option"
                    aria-selected={isActive}
                    data-active={isActive ? 'true' : 'false'}
                    onMouseEnter={() => {
                      setActive(index)
                    }}
                    onClick={() => {
                      go(option.href)
                    }}
                    className={cn(
                      'mx-1 flex cursor-default items-center gap-2 rounded px-2 py-1.5',
                      isActive ? 'bg-primary-soft text-primary-on-soft' : 'text-ink',
                    )}
                  >
                    {Icon === null ? (
                      <span aria-hidden="true" className="size-3.5 shrink-0" />
                    ) : (
                      <Icon aria-hidden="true" className="size-3.5 shrink-0 opacity-70" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{option.primary}</span>
                      <span className="block truncate text-[11px] text-faint">
                        {option.secondary}
                      </span>
                    </span>
                    {option.badge === null ? null : (
                      <span className="shrink-0 rounded bg-surface2 px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                        {option.badge}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>

          <p role="status" className="border-t border-hairline px-3 py-1.5 text-[11px] text-faint">
            {status}
          </p>
        </DialogContent>
      </Dialog>
    </>
  )
}

function paletteStatus(
  query: string,
  result: ConsoleSearchResult | null,
  searching: boolean,
  optionCount: number,
): string {
  const trimmed = query.trim()
  if (trimmed.length === 0) return messages.command.idle
  if (trimmed.length < MIN_QUERY) return messages.command.tooShort
  if (searching) return messages.command.searching
  if (result !== null && !result.ok) {
    return result.reason === 'unavailable' ? messages.command.failed : messages.command.tooShort
  }
  if (optionCount === 0) return messages.command.empty
  return messages.command.readOnlyNote
}

/**
 * Pages first, then people, then their sync rows.
 *
 * Page matching is a plain substring test over the label and the one-line
 * description, lowercased in Turkish — `İ` and `ı` are not what a default
 * lowercase does to them, and an operator typing "ışık" should not be defeated
 * by a locale.
 */
function buildOptions(
  items: readonly PaletteNavItem[],
  query: string,
  result: ConsoleSearchResult | null,
): readonly Option[] {
  const needle = query.trim().toLocaleLowerCase('tr-TR')
  const options: Option[] = []

  const pages =
    needle.length === 0
      ? items
      : items.filter(
          (item) =>
            item.label.toLocaleLowerCase('tr-TR').includes(needle) ||
            item.description.toLocaleLowerCase('tr-TR').includes(needle) ||
            item.href.includes(needle),
        )

  for (const item of pages) {
    options.push({
      id: `page:${item.href}`,
      href: item.href,
      primary: item.label,
      secondary: item.description,
      group: messages.command.groupPages,
      icon: item.icon,
      badge: item.group,
    })
  }

  if (result === null || !result.ok) return options

  for (const user of result.users) {
    options.push({
      id: `user:${user.userId}`,
      href: `/users/${user.userId}`,
      primary: user.emailRedacted ?? user.userId,
      secondary: messages.command.userResult(user.emailDomain),
      group: messages.command.groupUsers,
      icon: 'users',
      badge: user.isDeleted ? 'silinmiş' : user.subscriptionStatus,
    })
  }

  for (const job of result.jobs) {
    options.push({
      id: `job:${job.syncStateId}`,
      // The sync row's own page is the user it belongs to: that is where its
      // connection, its history and the resync control live.
      href: `/users/${job.userId}`,
      primary: messages.command.jobResult(job.provider, job.resource),
      secondary: job.lastErrorCode ?? job.status,
      group: messages.command.groupJobs,
      icon: 'refresh',
      badge: job.isStalled ? 'takıldı' : null,
    })
  }

  return options
}
