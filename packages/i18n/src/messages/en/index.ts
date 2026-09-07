import type { MessageTree } from '../../engine.ts'
import { a11y } from './a11y.ts'
import { approval } from './approval.ts'
import { assistant } from './assistant.ts'
import { briefing } from './briefing.ts'
import { calendar } from './calendar.ts'
import { capture } from './capture.ts'
import { commitment } from './commitment.ts'
import { common } from './common.ts'
import { email } from './email.ts'
import { empty } from './empty.ts'
import { errors } from './errors.ts'
import { flow } from './flow.ts'
import { followup } from './followup.ts'
import { loading } from './loading.ts'
import { mail } from './mail.ts'
import { meeting } from './meeting.ts'
import { notifications } from './notifications.ts'
import { onboarding } from './onboarding.ts'
import { paywall } from './paywall.ts'
import { person } from './person.ts'
import { plan } from './plan.ts'
import { priority } from './priority.ts'
import { privacy } from './privacy.ts'
import { referral } from './referral.ts'
import { reminder } from './reminder.ts'
import { reply } from './reply.ts'
import { search } from './search.ts'
import { settings } from './settings.ts'
import { today } from './today.ts'
import { vip } from './vip.ts'
import { voice } from './voice.ts'
import { widgets } from './widgets.ts'

export const en = {
  common,
  errors,
  empty,
  loading,
  onboarding,
  today,
  briefing,
  flow,
  mail,
  email,
  reply,
  followup,
  plan,
  calendar,
  meeting,
  commitment,
  assistant,
  voice,
  capture,
  approval,
  reminder,
  priority,
  search,
  person,
  vip,
  settings,
  notifications,
  privacy,
  paywall,
  referral,
  widgets,
  a11y,
} satisfies MessageTree
