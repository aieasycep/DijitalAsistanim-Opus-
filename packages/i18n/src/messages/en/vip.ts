import type { MessageTree } from '../../engine.ts'

export const vip = {
  title: 'VIP people',
  subtitle: 'Mail from these people always reaches you.',
  add: 'Add VIP',
  addTitle: 'Add a VIP',
  searchPlaceholder: 'Search by name or email',
  suggested: {
    title: 'Suggested',
    body: 'People you talk to most and reply to fastest.',
    reason: {
      frequent: 'You exchange mail often.',
      fastReply: 'You reply to them quickly.',
      manager: 'They appear in your meetings regularly.',
      family: 'Personal, not work.',
    },
  },
  added: '{name} is now a VIP',
  removed: '{name} is no longer a VIP',
  remove: 'Remove from VIP',
  removeConfirm: 'Remove {name} from your VIP list?',
  count: {
    one: '1 VIP',
    other: '{count} VIPs',
  },
  notifyAlways: 'Always notify',
  notifyAlwaysHint: 'Break through quiet hours for this person.',
  breakthroughQuietHours: 'Break through quiet hours',
  limitReached: 'You have reached the VIP limit for your plan.',
  empty: 'You have not marked anyone as VIP yet.',
  emptyHint: 'Start with the people you never want to miss.',
} satisfies MessageTree
