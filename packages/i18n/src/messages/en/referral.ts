import type { MessageTree } from '../../engine.ts'

export const referral = {
  title: 'Invite a friend',
  subtitle: 'You both get {days} days of Pro.',
  explain: 'Share your code. When your friend signs up, you both get {days} days of Pro.',

  code: {
    label: 'Your invite code',
    copy: 'Copy the code',
    copied: 'Code copied.',
    share: 'Share',
    shareMessage:
      'Try Dijital Asistan — it keeps track of your mail and calendar for you. With code {code} we both get {days} days of Pro.',
    regenerate: 'Generate a new code',
  },

  redeem: {
    title: 'Enter an invite code',
    label: 'Code',
    placeholder: '8-character code',
    action: 'Redeem',
    success: 'Code accepted. {days} days of Pro have been added.',
    invalid: 'That code is not valid.',
    self: 'You cannot use your own code.',
    alreadyUsed: 'You have already used this code.',
    notEligible: 'Invite rewards only apply to new accounts.',
  },

  stats: {
    title: 'Your invites',
    invited: { zero: 'Nobody has joined yet', one: '1 person joined', other: '{count} people joined' },
    earned: {
      zero: 'No days earned yet',
      one: '1 day of Pro earned',
      other: '{count} days of Pro earned',
    },
    pending: { one: '1 invite pending', other: '{count} invites pending' },
    remaining: { one: '1 invite left', other: '{count} invites left' },
    limitReached: 'You have reached the invite limit.',
  },

  list: {
    title: 'Who joined',
    joinedOn: 'Joined on {date}',
    creditGranted: '{days} days added',
    creditPending: 'Pending',
    empty: 'You have not invited anyone yet.',
  },

  banner: {
    title: '{days} days of Pro, free',
    body: 'Invite a friend and you both get it.',
    action: 'Invite',
  },

  terms: 'Rewards apply to new accounts only, and each account can be rewarded once.',
} satisfies MessageTree
