import type { Metadata } from 'next'
import { Card, PageHeader } from '@/components/ui'
import { FLAGS_PATH, FlagForm } from '@/components/flags'
import { MAX_REASON_LENGTH, MIN_REASON_LENGTH } from '@/lib/admin-action'
import { csrfField, requirePermission } from '@/lib/auth'
import { flagMessages } from '@/lib/messages/flags'

export const metadata: Metadata = { title: flagMessages.form.createTitle }
export const dynamic = 'force-dynamic'

/**
 * Open a new feature flag.
 *
 * ---------------------------------------------------------------------------
 * WHO MAY OPEN THIS
 * ---------------------------------------------------------------------------
 *
 * `flags.write`, checked server-side before the form renders — a read-only
 * operator who types this URL is refused here, not at the submit button.
 * `createFlagAction` then asks the same question again against
 * `admin_role_permissions` and audits the refusal.
 *
 * ---------------------------------------------------------------------------
 * WHY THE DEFAULT IS OFF AT ZERO PERCENT
 * ---------------------------------------------------------------------------
 *
 * Creating a flag should not be capable of turning something on. The form opens
 * with the main switch off and the rollout at zero, so the act of recording a
 * flag changes nothing for anybody; enabling it is a second, separately audited
 * decision made on the flag's own page. The kill switch is not offered at all
 * here — a flag that has never been on has nothing to stop.
 */
export default async function NewFlagPage() {
  const session = await requirePermission('flags.write')

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: flagMessages.detail.breadcrumb, href: FLAGS_PATH },
          { label: flagMessages.form.createTitle },
        ]}
        title={flagMessages.form.createTitle}
        description={flagMessages.form.createDescription}
        meta={flagMessages.list.meta}
      />

      <Card title={flagMessages.form.createTitle}>
        <FlagForm
          mode="create"
          csrf={csrfField(session)}
          minReasonLength={MIN_REASON_LENGTH}
          maxReasonLength={MAX_REASON_LENGTH}
          values={{
            key: '',
            description: '',
            enabled: false,
            rolloutPercentage: 0,
            platforms: [],
            plans: [],
            minAppVersion: null,
            maxAppVersion: null,
            killSwitch: false,
          }}
        />
      </Card>
    </>
  )
}
