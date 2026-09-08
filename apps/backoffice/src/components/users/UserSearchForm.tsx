'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { PAGE_PARAM, SEARCH_PARAM, parseUserSearch, redactAddress } from './params'
import { userMessages } from './messages'

/**
 * The user lookup box.
 *
 * The shared `Filters` bar handles the selects; this control exists separately
 * because of one rule it has to enforce that a generic text filter cannot:
 * **a full address must never reach the URL.**
 *
 * A support conversation usually starts with the person's own address, and the
 * natural thing for an operator to do is paste it. If this were an ordinary
 * search input, that address would land in the query string, then in the
 * browser history, the server access log and every downstream trace — for a
 * tool whose entire premise is that it cannot identify a user. So the input is
 * normalised here, before navigation: a whole address is reduced to the same
 * `y•••@example.com` mask `bo_redact_email()` produces in the view, and it is
 * the mask that is searched for. The lookup still lands on the right account;
 * the address never leaves this keystroke.
 *
 * The two inputs the tool cannot use — a partial id, an unrecognised string —
 * are refused here too, with the reason, rather than being sent off to return
 * an empty table that explains nothing.
 */
export function UserSearchForm({ initialValue }: { initialValue: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [value, setValue] = useState(initialValue)
  const [notice, setNotice] = useState<string | null>(null)

  function navigate(next: string): void {
    const params = new URLSearchParams(window.location.search)
    if (next === '') params.delete(SEARCH_PARAM)
    else params.set(SEARCH_PARAM, next)
    // A new search always starts at the first page; keeping the old offset
    // would show page four of a one-row result.
    params.delete(PAGE_PARAM)
    const query = params.toString()
    startTransition(() => {
      router.replace(query === '' ? pathname : `${pathname}?${query}`)
    })
  }

  function submit(): void {
    const search = parseUserSearch(value)

    switch (search.kind) {
      case 'empty':
        setNotice(null)
        setValue('')
        navigate('')
        return
      case 'user_id':
        setNotice(null)
        navigate(search.userId)
        return
      case 'redacted':
        setNotice(null)
        setValue(search.redacted)
        navigate(search.redacted)
        return
      case 'domain': {
        // Store the canonical `@domain` form so the field and the URL agree
        // after the replace; `ornek.com` and `@ornek.com` are the same search.
        const canonical = `@${search.domain}`
        setNotice(null)
        setValue(canonical)
        navigate(canonical)
        return
      }
      case 'full_address': {
        // Replace what is on screen too: leaving the address in the field
        // invites it into the next screenshot or copy-paste.
        const masked = redactAddress(value.trim())
        setValue(masked)
        setNotice(userMessages.list.maskedNotice)
        navigate(masked)
        return
      }
      case 'id_fragment':
        setNotice(userMessages.list.rejectedFragment)
        return
      default:
        setNotice(userMessages.list.rejectedUnparsed)
        return
    }
  }

  function clear(): void {
    setValue('')
    setNotice(null)
    navigate('')
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <form
        className="flex min-w-0 flex-col gap-1"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <label className="bo-kicker" htmlFor="kullanici-ara">
          {userMessages.list.searchLabel}
        </label>
        <div className="flex flex-wrap gap-1">
          <input
            id="kullanici-ara"
            name={SEARCH_PARAM}
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
              if (notice !== null) setNotice(null)
            }}
            placeholder={userMessages.list.searchPlaceholder}
            spellCheck={false}
            autoComplete="off"
            disabled={pending}
            aria-describedby="kullanici-ara-ipucu"
            className="h-7 min-w-64 flex-1 rounded-md border border-hairline bg-surface px-2 font-mono text-[12px] text-ink placeholder:font-sans placeholder:text-faint disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={pending}
            className="h-7 rounded-md bg-primary px-2.5 text-[12px] font-medium text-on-primary disabled:opacity-60"
          >
            {userMessages.list.searchSubmit}
          </button>
          {value !== '' ? (
            <button
              type="button"
              onClick={clear}
              disabled={pending}
              className="h-7 rounded-md border border-hairline px-2.5 text-[12px] font-medium text-muted hover:text-ink disabled:opacity-60"
            >
              {userMessages.list.searchClear}
            </button>
          ) : null}
        </div>
      </form>

      <p id="kullanici-ara-ipucu" className="text-[11px] text-faint">
        {userMessages.list.searchHint}
      </p>

      {notice ? (
        <p
          role="status"
          className="max-w-xl rounded-md bg-warning-soft px-2.5 py-1.5 text-[12px] text-warning-text"
        >
          {notice}
        </p>
      ) : null}
    </div>
  )
}
