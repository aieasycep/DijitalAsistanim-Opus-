import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Card, Filters, PageHeader } from '@/components/ui'
import { Pagination } from '@/components/users/Pagination'
import { UserListTable } from '@/components/users/UserListTable'
import { UserSearchForm } from '@/components/users/UserSearchForm'
import { userMessages } from '@/components/users/messages'
import {
  DELETED_FILTERS,
  DELETED_PARAM,
  HEALTH_FILTERS,
  HEALTH_PARAM,
  ONBOARDING_FILTERS,
  ONBOARDING_PARAM,
  PLAN_PARAM,
  SORT_PARAM,
  SUBSCRIPTION_STATUSES,
  USERS_PAGE_SIZE,
  USER_SORTS,
  isQueryableSearch,
  parseUserListParams,
  userListParamValues,
} from '@/components/users/params'
import { requireStaff } from '@/lib/auth'
import { listUsers, settle } from '@/lib/queries/users'
import { enumLabels, labelFor, messages } from '@/lib/messages'

export const metadata: Metadata = { title: userMessages.list.title }
export const dynamic = 'force-dynamic'

const BASE_PATH = '/users'

/**
 * User lookup.
 *
 * The whole page is one query against `bo_users`, filtered and ordered by
 * whatever is in the URL, plus the exact total from PostgREST for pagination.
 * There is no second pass in JavaScript: a filter narrows the SQL, and the row
 * count under the table is the count the database returned, not the length of
 * the array on screen.
 *
 * Two of its behaviours are worth naming, because they are the privacy design
 * rather than the feature list:
 *
 *   - A full address typed into the search box is masked before it is used, and
 *     the URL only ever holds the mask. `UserSearchForm` does that on the way
 *     in; the redirect below does it again for a URL that arrived by hand, so
 *     an address pasted straight into the location bar does not survive the
 *     first render.
 *
 *   - A search the tool refuses to run — a partial id, an unrecognised string —
 *     never becomes a request. The table renders the reason and, where there is
 *     one, a working alternative.
 */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireStaff('support')
  const rawParams = await searchParams
  const params = parseUserListParams(rawParams)
  const values = userListParamValues(params)

  // An address reached the URL some other way than the form. Replace it with
  // its mask before anything renders, so it is not what the operator copies,
  // bookmarks or screenshots.
  if (params.search.kind === 'full_address') {
    const next = new URLSearchParams()
    for (const [key, value] of Object.entries(values)) {
      if (value !== '') next.set(key, value)
    }
    redirect(`${BASE_PATH}?${next.toString()}`)
  }

  const page = await settle(() => listUsers(params))

  const refusal =
    params.search.kind === 'id_fragment'
      ? userMessages.list.rejectedFragment
      : params.search.kind === 'unparsed'
        ? userMessages.list.rejectedUnparsed
        : null

  const emptyMessage =
    refusal ??
    (isQueryableSearch(params.search) && params.search.kind !== 'empty'
      ? userMessages.list.emptySearch
      : userMessages.list.empty)

  const rows = page.ok ? page.value.rows : []
  const total = page.ok ? page.value.total : 0

  return (
    <>
      <PageHeader title={userMessages.list.title} description={userMessages.list.description}>
        <div className="flex flex-col gap-2">
          <div className="bo-panel px-3 py-2">
            <UserSearchForm initialValue={params.searchRaw} />
          </div>

          <Filters
            controls={[
              {
                kind: 'select',
                param: PLAN_PARAM,
                label: userMessages.list.planLabel,
                options: SUBSCRIPTION_STATUSES.map((status) => ({
                  value: status,
                  label: labelFor(enumLabels.subscriptionStatus, status),
                })),
              },
              {
                kind: 'select',
                param: HEALTH_PARAM,
                label: userMessages.list.healthLabel,
                options: HEALTH_FILTERS.map((value) => ({
                  value,
                  label: labelFor(userMessages.health, value),
                })),
              },
              {
                kind: 'select',
                param: ONBOARDING_PARAM,
                label: userMessages.list.onboardingLabel,
                options: ONBOARDING_FILTERS.map((value) => ({
                  value,
                  label: labelFor(userMessages.onboardingFilter, value),
                })),
              },
              {
                kind: 'segmented',
                param: DELETED_PARAM,
                label: userMessages.list.deletedLabel,
                options: DELETED_FILTERS.map((value) => ({
                  value,
                  label: labelFor(userMessages.deletedFilter, value),
                })),
              },
              {
                kind: 'segmented',
                param: SORT_PARAM,
                label: userMessages.list.sortLabel,
                options: USER_SORTS.map((value) => ({
                  value,
                  label: labelFor(userMessages.sort, value),
                })),
              },
            ]}
            values={values}
          />
        </div>
      </PageHeader>

      <div className="flex flex-col gap-3">
        {refusal ? (
          <p
            role="status"
            className="rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning-text"
          >
            {refusal}
          </p>
        ) : null}

        <UserListTable
          rows={rows}
          total={total}
          error={page.ok ? null : page.message}
          emptyMessage={emptyMessage}
          emptyAction={
            refusal === null && params.searchRaw !== '' ? (
              <Link
                href={BASE_PATH}
                className="inline-flex h-7 items-center rounded-md border border-hairline px-2.5 text-[12px] font-medium text-muted hover:text-ink"
              >
                {messages.filters.reset}
              </Link>
            ) : null
          }
        />

        {page.ok ? (
          <Pagination
            basePath={BASE_PATH}
            values={values}
            page={params.page}
            pageSize={USERS_PAGE_SIZE}
            total={total}
          />
        ) : null}

        <Card title={userMessages.detail.sectionBoundary}>
          <p className="text-[13px] text-muted">{userMessages.detail.boundaryIntro}</p>
        </Card>
      </div>
    </>
  )
}
