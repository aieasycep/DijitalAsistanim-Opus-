/**
 * Analytics contract.
 *
 * Two rules, both enforced by types rather than convention:
 *   1. Only the events listed here may be sent.
 *   2. A property value may only be a boolean, a number, or a member of a
 *      closed enum — never free text. That makes it structurally impossible to
 *      put a subject line, a person's name, an address or an assistant answer
 *      into a payload.
 */

export const ANALYTICS_EVENTS = [
  'onboarding_started',
  'onboarding_completed',
  'account_connected',
  'calendar_connected',
  'first_analysis_completed',
  'first_brief_opened',
  'insight_opened',
  'action_approved',
  'action_rejected',
  'meeting_prep_opened',
  'followup_completed',
  'assistant_query',
  'capture_completed',
  'paywall_viewed',
  'trial_started',
  'subscription_started',
  'referral_shared',
  'referral_redeemed',
  'settings_changed',
  'export_requested',
  'account_deleted',
] as const

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number]

/** The only value types a property may take. Strings are rejected by design. */
export type AnalyticsValue = number | boolean | AnalyticsEnum

/**
 * Closed vocabularies safe to send. Anything not in this union cannot be a
 * property value, which is what keeps user content out of the payload.
 */
export type AnalyticsEnum =
  | 'google'
  | 'microsoft'
  | 'apple'
  | 'device'
  | 'demo'
  | 'mail'
  | 'calendar'
  | 'tasks'
  | 'contacts'
  | 'free'
  | 'pro'
  | 'monthly'
  | 'annual'
  | 'morning'
  | 'midday'
  | 'evening'
  | 'weekly'
  | 'email_send'
  | 'calendar_create'
  | 'calendar_update'
  | 'task_create'
  | 'reminder_create'
  | 'commitment_create'
  | 'camera'
  | 'photo'
  | 'pdf'
  | 'file'
  | 'link'
  | 'text'
  | 'ios'
  | 'android'
  | 'light'
  | 'dark'
  | 'system'
  | 'tr'
  | 'en'
  | 'voice'
  | 'typed'
  | 'today'
  | 'flow'
  | 'plan'
  | 'assistant'
  | 'settings'
  | 'paywall'
  | 'success'
  | 'failure'

export type AnalyticsProperties = Record<string, AnalyticsValue>

/**
 * Property keys that must never appear, checked at runtime by the adapter as a
 * second line of defence behind the type system (a plain `as` cast could
 * otherwise slip past it).
 */
export const FORBIDDEN_ANALYTICS_KEYS: readonly string[] = [
  'email',
  'email_address',
  'subject',
  'body',
  'snippet',
  'name',
  'display_name',
  'sender',
  'recipient',
  'person',
  'title',
  'content',
  'text',
  'query',
  'answer',
  'summary',
  'token',
  'url',
  'location',
  'phone',
]

export interface AnalyticsViolation {
  key: string
  reason: 'forbidden_key' | 'free_text_value'
}

/**
 * Validate a payload before it leaves the device. Returns the violations
 * found; the adapter drops the event rather than sending a redacted version,
 * because a partially-scrubbed payload is still a payload someone has to audit.
 */
export function findAnalyticsViolations(properties: AnalyticsProperties): AnalyticsViolation[] {
  const violations: AnalyticsViolation[] = []
  for (const [key, value] of Object.entries(properties)) {
    const lowered = key.toLowerCase()
    if (FORBIDDEN_ANALYTICS_KEYS.some((f) => lowered === f || lowered.endsWith(`_${f}`))) {
      violations.push({ key, reason: 'forbidden_key' })
      continue
    }
    if (typeof value === 'string' && !isAnalyticsEnum(value)) {
      violations.push({ key, reason: 'free_text_value' })
    }
  }
  return violations
}

const ANALYTICS_ENUM_VALUES: ReadonlySet<string> = new Set<AnalyticsEnum>([
  'google',
  'microsoft',
  'apple',
  'device',
  'demo',
  'mail',
  'calendar',
  'tasks',
  'contacts',
  'free',
  'pro',
  'monthly',
  'annual',
  'morning',
  'midday',
  'evening',
  'weekly',
  'email_send',
  'calendar_create',
  'calendar_update',
  'task_create',
  'reminder_create',
  'commitment_create',
  'camera',
  'photo',
  'pdf',
  'file',
  'link',
  'text',
  'ios',
  'android',
  'light',
  'dark',
  'system',
  'tr',
  'en',
  'voice',
  'typed',
  'today',
  'flow',
  'plan',
  'assistant',
  'settings',
  'paywall',
  'success',
  'failure',
])

export function isAnalyticsEnum(value: string): value is AnalyticsEnum {
  return ANALYTICS_ENUM_VALUES.has(value)
}
