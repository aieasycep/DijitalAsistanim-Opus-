import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ActionResultBanner,
  FailingSyncTable,
  OPS_PATH,
  OPS_QUEUE_PATH,
  OPS_RESULT_PARAMS,
  QUEUE_PAGE_SIZE,
  QUEUE_PARAMS,
  RefreshForm,
  isResyncOutcome,
  opsMessages,
  type ResyncOutcome,
} from '@/components/ops'
import { Card, CardError, type FilterControl, Filters, PageHeader } from '@/components/ui'
import { requireStaff } from '@/lib/auth'
import { formatNumber } from '@/lib/format'
import { enumLabels, labelFor, messages } from '@/lib/messages'
import {
  OPS_PROVIDERS,
  OPS_RESOURCES,
  isOpsProvider,
  isOpsResource,
  loadFailingSync,
  loadFailingSyncCodes,
  settle,
} from '@/lib/queries/ops'
import { refreshOpsAction, resyncAccountAction } from '../actions'

/**
 * The full failing-sync queue.
 *
 * The dashboard shows the worst eight; this is all of them, filterable and
 * paginated. Every filter is a server-side re-query — the URL is the state, the
 * page reads it, Postgres does the filtering — so a filtered queue is a link an
 * operator can paste to a colleague and get the same rows.
 *
 * The error-code filter is built from the codes actually present in the queue,
 * so it can never offer a choice that returns nothing, and it disappears
 * entirely when the queue is empty.
 */

export const metadata: Metadata = { title: opsMessages.queue.title }
export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

function firstValue(raw: string | string[] | undefined): string | null {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0] ?? null
  return null
}

function parseOutcome(raw: string | string[] | undefined): ResyncOutcome | null {
  const value = firstValue(raw)
  return value !== null && isResyncOutcome(value) ? value : null
}

function parsePage(raw: string | string[] | undefined): number {
  const value = Number.parseInt(firstValue(raw) ?? '', 10)
  return Number.isFinite(value) && value > 1 ? value : 1
}

export default async function OpsSyncQueuePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireStaff('ops')
  const params = await searchParams

  const providerRaw = firstValue(params[QUEUE_PARAMS.provider])
  const resourceRaw = firstValue(params[QUEUE_PARAMS.resource])
  const codeRaw = firstValue(params[QUEUE_PARAMS.code])

  const provider = providerRaw !== null && isOpsProvider(providerRaw) ? providerRaw : null
  const resource = resourceRaw !== null && isOpsResource(resourceRaw) ? resourceRaw : null
  // A code is compared as an exact string in SQL, so an unknown one simply
  // returns no rows — there is nothing to validate it against and nothing it
  // can do beyond narrowing an `eq` filter.
  const code = codeRaw !== null && codeRaw.trim() !== '' ? codeRaw.trim().slice(0, 63) : null
  const page = parsePage(params[QUEUE_PARAMS.page])

  const outcome = parseOutcome(params[OPS_RESULT_PARAMS.outcome])
  const resultCode = firstValue(params[OPS_RESULT_PARAMS.code])
  const resultAccount = firstValue(params[OPS_RESULT_PARAMS.account])

  const readPage = (target: number) =>
    settle(() =>
      loadFailingSync({
        provider,
        resource,
        errorCode: code,
        limit: QUEUE_PAGE_SIZE,
        offset: (target - 1) * QUEUE_PAGE_SIZE,
      }),
    )

  const [firstRead, codeOptions] = await Promise.all([readPage(page), settle(loadFailingSyncCodes)])

  // A `sayfa` past the end — a stale bookmark, or a queue that shrank while it
  // was being worked — would otherwise show an empty table under a pager
  // claiming there are rows. Re-read the last real page instead, once, and only
  // in that case.
  const firstTotal = firstRead.ok ? firstRead.value.total : 0
  const pageCount = Math.max(1, Math.ceil(firstTotal / QUEUE_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const queue = currentPage === page ? firstRead : await readPage(currentPage)

  const total = queue.ok ? queue.value.total : 0
  const isFiltered = provider !== null || resource !== null || code !== null

  /** This page's address with the given overrides, minus any action result. */
  const hrefWith = (overrides: Readonly<Record<string, string | null>>): string => {
    const next = new URLSearchParams()
    const current: Record<string, string | null> = {
      [QUEUE_PARAMS.provider]: provider,
      [QUEUE_PARAMS.resource]: resource,
      [QUEUE_PARAMS.code]: code,
      [QUEUE_PARAMS.page]: currentPage > 1 ? String(currentPage) : null,
      ...overrides,
    }
    for (const [key, value] of Object.entries(current)) {
      if (value !== null && value !== '') next.set(key, value)
    }
    const query = next.toString()
    return query === '' ? OPS_QUEUE_PATH : `${OPS_QUEUE_PATH}?${query}`
  }

  const selfHref = hrefWith({})

  // The code choices are the codes the queue actually contains, with their
  // counts. A code that arrived in the URL but is no longer in the queue — the
  // last account carrying it was fixed a minute ago — is kept as an option so
  // the select still shows what is filtering the empty table it sits above.
  const codeChoices = (codeOptions.ok ? codeOptions.value : []).map((option) => ({
    value: option.code,
    label: `${option.code} (${formatNumber(option.count)})`,
  }))
  if (code !== null && !codeChoices.some((choice) => choice.value === code)) {
    codeChoices.unshift({ value: code, label: code })
  }

  const controls: FilterControl[] = [
    {
      kind: 'select',
      param: QUEUE_PARAMS.provider,
      label: opsMessages.queue.filterProvider,
      options: OPS_PROVIDERS.map((value) => ({
        value,
        label: labelFor(enumLabels.provider, value),
      })),
    },
    {
      kind: 'select',
      param: QUEUE_PARAMS.resource,
      label: opsMessages.queue.filterResource,
      options: OPS_RESOURCES.map((value) => ({
        value,
        label: labelFor(enumLabels.accountKind, value),
      })),
    },
  ]
  // Rendered only when there is something to choose: a select whose every
  // option is "Tümü" is a control that cannot change anything.
  if (codeChoices.length > 0) {
    controls.push({
      kind: 'select',
      param: QUEUE_PARAMS.code,
      label: opsMessages.queue.filterCode,
      options: codeChoices,
    })
  }

  return (
    <>
      <PageHeader
        title={opsMessages.queue.title}
        description={opsMessages.queue.description}
        kicker={
          <Link href={OPS_PATH} className="hover:text-ink">
            {opsMessages.queue.backToDashboard}
          </Link>
        }
        action={<RefreshForm action={refreshOpsAction} returnTo={selfHref} />}
      >
        <Filters
          controls={controls}
          values={{
            [QUEUE_PARAMS.provider]: provider ?? '',
            [QUEUE_PARAMS.resource]: resource ?? '',
            [QUEUE_PARAMS.code]: code ?? '',
            [QUEUE_PARAMS.page]: currentPage > 1 ? String(currentPage) : '',
          }}
          resetParams={[QUEUE_PARAMS.page]}
        />
      </PageHeader>

      {outcome ? (
        <ActionResultBanner
          outcome={outcome}
          code={resultCode}
          accountId={resultAccount}
          dismissHref={selfHref}
        />
      ) : null}

      <div className="flex flex-col gap-4">
        {codeOptions.ok ? null : (
          <Card title={opsMessages.queue.filterCode}>
            <CardError message={codeOptions.message} hint={messages.errors.queryFailedHint} />
          </Card>
        )}

        <Card
          title={opsMessages.failing.section}
          description={opsMessages.failing.description}
          flush
        >
          <FailingSyncTable
            rows={queue.ok ? queue.value.rows : []}
            total={total}
            error={queue.ok ? null : queue.message}
            action={resyncAccountAction}
            returnTo={selfHref}
            codeHref={(value) =>
              hrefWith({ [QUEUE_PARAMS.code]: value, [QUEUE_PARAMS.page]: null })
            }
            resultAccountId={resultAccount}
            resultOutcome={outcome}
            emptyMessage={
              isFiltered ? opsMessages.failing.emptyFiltered : opsMessages.failing.empty
            }
            emptyAction={
              isFiltered ? (
                <Link
                  href={OPS_QUEUE_PATH}
                  className="text-[12px] font-medium text-primary-on-soft underline underline-offset-2 hover:text-primary"
                >
                  {messages.filters.reset}
                </Link>
              ) : undefined
            }
          />
        </Card>

        {queue.ok && pageCount > 1 ? (
          <nav
            aria-label={opsMessages.queue.pageStatus(currentPage, pageCount)}
            className="bo-panel flex items-center justify-between px-3 py-2"
          >
            <PageLink
              href={hrefWith({
                [QUEUE_PARAMS.page]: currentPage > 2 ? String(currentPage - 1) : null,
              })}
              label={opsMessages.queue.pagePrevious}
              disabled={currentPage <= 1}
            />
            <span className="text-[12px] text-muted">
              {opsMessages.queue.pageStatus(currentPage, pageCount)}
            </span>
            <PageLink
              href={hrefWith({ [QUEUE_PARAMS.page]: String(currentPage + 1) })}
              label={opsMessages.queue.pageNext}
              disabled={currentPage >= pageCount}
            />
          </nav>
        ) : null}

        <p className="text-[11px] text-faint">{opsMessages.privacy.note}</p>
      </div>
    </>
  )
}

/**
 * A pager step. At the end of the range it renders as text rather than as a
 * link that goes back to where you already are.
 */
function PageLink({ href, label, disabled }: { href: string; label: string; disabled: boolean }) {
  if (disabled) {
    return <span className="text-[12px] text-disabled">{label}</span>
  }
  return (
    <Link
      href={href}
      className="rounded-md border border-hairline px-2.5 py-1 text-[12px] font-medium text-muted transition-colors hover:border-primary/40 hover:text-ink"
    >
      {label}
    </Link>
  )
}
