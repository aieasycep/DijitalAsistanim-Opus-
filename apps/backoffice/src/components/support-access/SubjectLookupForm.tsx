import { Button } from '@/components/ui/button'
import { supportAccessMessages } from '@/lib/messages/support-access'
import { NEW_SUBJECT_PARAM, SUPPORT_ACCESS_NEW_PATH } from './contract'

/**
 * Pull up the account before deciding whether to ask for anything.
 *
 * A plain `GET` form, submitting to this page's own path: no client component,
 * no JavaScript, no state. It sets `?user=`, the page re-renders with that
 * account's operational panel and its grant history, and the request form below
 * arrives pre-filled.
 *
 * That ordering is the argument the screen makes. An operator who looks at
 * "743 processed, 2 failed, last sync 10:42" first will often close the tab
 * without submitting anything, which is the outcome this whole section is
 * designed to produce.
 */
export function SubjectLookupForm({ value }: { value: string }) {
  return (
    <form
      method="get"
      action={SUPPORT_ACCESS_NEW_PATH}
      className="flex flex-wrap items-end gap-2"
      role="search"
    >
      <label className="flex min-w-0 flex-col gap-1" htmlFor="support-access-subject-lookup">
        <span className="bo-kicker">{supportAccessMessages.request.subjectLabel}</span>
        <input
          id="support-access-subject-lookup"
          name={NEW_SUBJECT_PARAM}
          defaultValue={value}
          autoComplete="off"
          spellCheck={false}
          placeholder={supportAccessMessages.request.subjectPlaceholder}
          className="h-7 w-full min-w-72 rounded-md border border-hairline bg-surface px-2 font-mono text-[12px] text-ink placeholder:text-faint"
        />
      </label>
      <Button type="submit" variant="secondary">
        {supportAccessMessages.request.lookupSubmit}
      </Button>
    </form>
  )
}
