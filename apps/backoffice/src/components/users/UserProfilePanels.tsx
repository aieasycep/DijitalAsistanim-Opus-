import { isValidTimeZone, systemClock, toIsoDate, type Clock, type Entitlements } from '@da/domain'
import { Badge, Card, CardError, Mono, subscriptionTone } from '@/components/ui'
import type { BoReferralRow, BoUserDetailRow } from '@/lib/db'
import { formatDate, formatDateTime, formatDuration, formatNumber } from '@/lib/format'
import { enumLabels, labelFor, messages } from '@/lib/messages'
import type { Settled } from '@/lib/queries/users'
import { DefinitionList, PanelNote, type Definition } from './DefinitionList'
import { userEnumLabels, userMessages } from './messages'

/**
 * Who this account is, what it is entitled to, and whether it ever finished
 * setting itself up — the three questions every support call opens with.
 *
 * The identity panel is the whole privacy design in miniature: it shows a uuid
 * and a mask, and there is no fourth field it could grow into, because
 * `bo_user_detail` does not select `display_name`, `given_name`, `avatar_url`
 * or the raw address at all.
 */

/** The user's own calendar day, which is the one a briefing is dated by. */
export function userLocalDate(timeZone: string, clock: Clock = systemClock): string | null {
  if (!isValidTimeZone(timeZone)) return null
  return toIsoDate(clock.now(), timeZone)
}

export function UserIdentityPanel({
  row,
  clock = systemClock,
}: {
  row: BoUserDetailRow
  clock?: Clock
}) {
  const localDate = userLocalDate(row.time_zone, clock)

  const items: readonly Definition[] = [
    {
      term: userMessages.detail.userId,
      value: <Mono>{row.user_id}</Mono>,
    },
    {
      term: userMessages.detail.emailRedacted,
      value: <Mono>{row.email_redacted}</Mono>,
      hint: row.email_domain
        ? `${userMessages.detail.emailDomain}: ${row.email_domain}`
        : undefined,
    },
    {
      term: userMessages.detail.locale,
      value: labelFor(userEnumLabels.locale, row.locale),
    },
    {
      term: userMessages.detail.timeZone,
      value: <Mono>{row.time_zone}</Mono>,
      hint: localDate
        ? `${userMessages.detail.localDate}: ${formatDate(localDate)}`
        : messages.fields.unknown,
    },
    {
      term: userMessages.detail.createdAt,
      value: formatDateTime(row.created_at),
    },
    {
      term: userMessages.detail.updatedAt,
      value: formatDateTime(row.updated_at),
    },
  ]

  const withDeletion: readonly Definition[] = row.is_deleted
    ? [
        ...items,
        {
          term: userMessages.detail.deletedAt,
          value: (
            <span className="flex items-center gap-2">
              <Badge tone="critical">{userMessages.detail.deletedBadge}</Badge>
              {formatDateTime(row.deleted_at)}
            </span>
          ),
        },
      ]
    : items

  return (
    <Card title={userMessages.detail.sectionIdentity}>
      <DefinitionList items={withDeletion} />
    </Card>
  )
}

export function UserPlanPanel({
  row,
  entitlements,
  referral,
}: {
  row: BoUserDetailRow
  entitlements: Entitlements
  referral: Settled<BoReferralRow | null>
}) {
  const items: Definition[] = [
    {
      term: userMessages.detail.plan,
      value: (
        <Badge tone={entitlements.plan === 'pro' ? 'primary' : 'neutral'}>
          {entitlements.plan === 'pro' ? userMessages.detail.planPro : userMessages.detail.planFree}
        </Badge>
      ),
    },
    {
      term: userMessages.detail.entitlementSource,
      value: labelFor(userEnumLabels.entitlementSource, entitlements.source),
    },
    {
      term: userMessages.detail.subscriptionStatus,
      value: (
        <Badge tone={subscriptionTone(row.subscription_status)}>
          {labelFor(enumLabels.subscriptionStatus, row.subscription_status)}
        </Badge>
      ),
    },
    {
      term: userMessages.detail.subscriptionStore,
      value: row.subscription_store
        ? labelFor(userEnumLabels.subscriptionStore, row.subscription_store)
        : null,
    },
    {
      term: userMessages.detail.periodEnd,
      value: formatDateTime(row.subscription_period_end),
    },
    {
      term: userMessages.detail.trialEnds,
      value: formatDateTime(row.trial_ends_at),
    },
  ]

  if (referral.ok && referral.value) {
    const code = referral.value
    items.push(
      {
        term: userMessages.detail.referralCode,
        value: <Mono>{code.code}</Mono>,
        hint: `${userMessages.detail.referralRedemptions}: ${formatNumber(code.redemption_count)}`,
      },
      {
        term: userMessages.detail.referralCredits,
        value: `${formatNumber(code.credit_active_count)} × ${formatNumber(code.bonus_days_total)} ${messages.units.days}`,
        hint:
          code.credit_revoked_count > 0
            ? userMessages.detail.referralRevoked(formatNumber(code.credit_revoked_count))
            : undefined,
      },
    )
  } else if (referral.ok) {
    items.push({
      term: userMessages.detail.referralCode,
      value: <span className="text-faint">{userMessages.detail.referralNone}</span>,
    })
  }

  return (
    <Card title={userMessages.detail.sectionPlan}>
      <div className="flex flex-col gap-3">
        <DefinitionList items={items} />
        {referral.ok ? null : (
          <CardError message={referral.message} hint={messages.errors.queryFailedHint} />
        )}
        <PanelNote>{userMessages.detail.entitlementCaveat}</PanelNote>
      </div>
    </Card>
  )
}

export function UserOnboardingPanel({ row }: { row: BoUserDetailRow }) {
  const completedAt = row.onboarding_completed_at
  const durationSeconds =
    completedAt === null
      ? null
      : Math.max(
          0,
          Math.round((new Date(completedAt).getTime() - new Date(row.created_at).getTime()) / 1000),
        )

  const items: readonly Definition[] = [
    {
      term: userMessages.detail.sectionOnboarding,
      value: row.is_onboarded ? (
        <Badge tone="success">{userMessages.detail.onboarded}</Badge>
      ) : (
        <Badge tone="warning">{userMessages.detail.onboardingIncomplete}</Badge>
      ),
    },
    {
      term: userMessages.detail.onboardingCompletedAt,
      value: formatDateTime(completedAt),
    },
    {
      term: userMessages.detail.onboardingDuration,
      value: durationSeconds === null ? null : formatDuration(durationSeconds),
    },
  ]

  return (
    <Card title={userMessages.detail.sectionOnboarding}>
      <div className="flex flex-col gap-3">
        <DefinitionList items={items} />
        {row.is_onboarded ? null : (
          <PanelNote>{userMessages.detail.onboardingIncompleteHint}</PanelNote>
        )}
      </div>
    </Card>
  )
}
