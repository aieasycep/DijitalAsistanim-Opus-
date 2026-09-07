import type { MessageTree } from '../../engine.ts'

export const paywall = {
  title: 'Dijital Asistan Pro',
  subtitle: 'Let the assistant work at full strength.',
  headline: 'Let it track your whole day for you.',

  price: {
    monthly: '199 TL / month',
    annual: '1,490 TL / year',
    annualPerMonth: '{price} a month',
    annualSaving: 'Save {percent} on the annual plan',
    trial: 'Try it free for {days} days',
    trialThenMonthly: '{days} days free, then {price}',
    renewalNote: 'Renews automatically unless you cancel.',
    storeNote: 'Billed through your store account.',
  },

  plan: {
    free: 'Free',
    pro: 'Pro',
    current: 'Your current plan',
    recommended: 'Recommended',
    monthly: 'Monthly',
    annual: 'Annual',
  },

  freeFeatures: {
    title: 'On the free plan',
    briefing: 'One morning briefing a day',
    accounts: 'One mail account',
    mail: 'Basic mail prioritisation',
    calendar: 'Calendar view',
    assistant: '{count} assistant questions a day',
    capture: '{count} captures a month',
    rules: '{count} priority rules',
    vip: '{count} VIP people',
  },

  proFeatures: {
    title: 'On Pro',
    briefings: 'Four briefings: morning, midday, evening and weekly',
    audio: 'Audio briefings',
    accounts: 'Unlimited mail and calendar accounts',
    assistant: 'Unlimited assistant questions',
    meetingPrep: 'Meeting prep and post-meeting summaries',
    replies: 'Unlimited reply drafts',
    capture: 'Unlimited captures',
    rules: 'Unlimited priority rules and VIPs',
    followUps: 'Automatic follow-ups and promise tracking',
    search: 'Search by meaning',
    widgets: 'Every home-screen widget',
    priority: 'Priority support',
  },

  proof: {
    timeSaved: 'People save about {hours} hours a week.',
    scanned: 'We have read {count} messages for you so far.',
    yourSaving: 'You saved {minutes} minutes this week.',
  },

  cta: {
    startTrial: 'Start the free trial',
    subscribe: 'Go Pro',
    continueFree: 'Continue free',
    restore: 'Restore purchases',
    manage: 'Manage subscription',
  },

  lock: {
    title: 'This is a Pro feature',
    body: '{feature} needs the Pro plan.',
    action: 'See Pro',
  },
  limit: {
    title: 'You have reached the limit',
    body: 'This plan is capped at {limit}. Pro removes the cap.',
    action: 'Remove the limit',
  },

  purchase: {
    processing: 'Completing the purchase',
    success: 'Welcome. Pro is unlocked.',
    cancelled: 'The purchase was not completed.',
    failed: 'The purchase could not be completed. Check your store account.',
    alreadySubscribed: 'You are already on Pro.',
  },

  legal:
    'The subscription renews automatically at the end of each period. You can cancel any time from your store account.',
  terms: 'Terms of Use',
  privacy: 'Privacy Policy',
} satisfies MessageTree
