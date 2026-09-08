import type { Metadata } from 'next'
import { BILLING_PATH, GRANTS_PATH, GrantForm, firstParam, isUuidParam } from '@/components/grants'
import { Card, PageHeader } from '@/components/ui'
import { MAX_REASON_LENGTH, MIN_REASON_LENGTH } from '@/lib/admin-action'
import { csrfField, requirePermission } from '@/lib/auth'
import { grantMessages } from '@/lib/messages/grants'

export const metadata: Metadata = { title: grantMessages.form.title }
export const dynamic = 'force-dynamic'

/**
 * Write a temporary Pro grant.
 *
 * ---------------------------------------------------------------------------
 * WHO MAY OPEN THIS
 * ---------------------------------------------------------------------------
 *
 * `billing.grant`, checked server-side before the form is drawn — not
 * `billing.read`, which is what the list needs. An operator who may read the
 * ledger and not add to it never reaches this page, and if they post the form
 * anyway `runAdminAction` refuses it against `admin_role_permissions` and
 * writes a `failure` audit row naming the account they aimed it at.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE PAGE DOES NOT DO
 * ---------------------------------------------------------------------------
 *
 * It does not validate the length of the grant.
 * `admin_entitlement_grants_days_range` is the authority on that, and the form
 * says so where the field is; a value it refuses comes back as a field error
 * reporting the refusal rather than as a bound this page invented. The same
 * goes for the overlap rule: the trigger refuses a second live window and the
 * form explains the refusal, because a check here would be a race the database
 * has already won.
 *
 * The reason bounds are the console's own and are passed in from
 * `@/lib/admin-action`, which is `server-only` — the form is a Client Component
 * and cannot import it, so the two numbers travel as props and the server
 * re-checks both.
 */
export default async function NewGrantPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePermission('billing.grant')
  const raw = await searchParams

  // Pre-fill only from a value that is already a uuid: this is how a link from
  // a user record arrives, and anything else is dropped rather than echoed back
  // into an input.
  const initialUserId = firstParam(raw, 'user')
  const csrf = csrfField(session)

  return (
    <>
      <PageHeader
        title={grantMessages.form.title}
        description={grantMessages.form.description}
        breadcrumbs={[
          { label: grantMessages.area.breadcrumbBilling, href: BILLING_PATH },
          { label: grantMessages.area.breadcrumbGrants, href: GRANTS_PATH },
          { label: grantMessages.form.title },
        ]}
      />

      <Card>
        <GrantForm
          csrf={csrf}
          initialUserId={isUuidParam(initialUserId) ? initialUserId : ''}
          minReasonLength={MIN_REASON_LENGTH}
          maxReasonLength={MAX_REASON_LENGTH}
        />
      </Card>
    </>
  )
}
