import type { MessageTree } from '../../engine.ts'

export const referral = {
  title: 'Invite a friend',
  subtitle: 'You both get {days} days of Pro.',
  yourCode: 'Your code',
  copyCode: 'Copy code',
  codeCopied: 'Code copied',
  shareTitle: 'Share',
  shareMessage: 'I use Digital Assistant to run my day. Use my code {code} and get {days} days of Pro.',
  share: 'Share',
  howItWorks: {
    title: 'How it works',
    stepOne: 'Share your code.',
    stepTwo: 'Your friend uses it when they sign up.',
    stepThree: 'You both get {days} days of Pro.',
  },
  redeem: {
    title: 'Have a code?',
    label: 'Invite code',
    placeholder: 'ABCD1234',
    action: 'Redeem',
    redeeming: 'Checking',
    success: 'Done. {days} days of Pro added.',
    invalid: 'That code is not valid.',
    self: 'You cannot use your own code.',
    alreadyUsed: 'You have already used an invite code.',
    notEligible: 'This code is not eligible for your account.',
  },
  stats: {
    title: 'Your invites',
    joined: {
      one: '1 person joined',
      other: '{count} people joined',
    },
    earned: {
      one: '1 bonus day earned',
      other: '{count} bonus days earned',
    },
    pending: {
      one: '1 invite pending',
      other: '{count} invites pending',
    },
    limitReached: 'You have reached the invite limit.',
  },
  list: {
    title: 'Who joined',
    empty: 'No one has joined with your code yet.',
    joinedAt: 'Joined {date}',
    creditPending: 'Bonus pending',
    creditGranted: 'Bonus added',
  },
} satisfies MessageTree
