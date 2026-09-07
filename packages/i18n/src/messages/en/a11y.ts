import type { MessageTree } from '../../engine.ts'

/** Screen-reader labels and hints. Every one describes the action, not the icon. */
export const a11y = {
  tab: {
    today: 'Today tab',
    flow: 'Flow tab',
    plan: 'Plan tab',
    assistant: 'Assistant tab',
    settings: 'Settings tab',
    selected: 'Selected',
  },

  button: {
    back: 'Go back',
    close: 'Close',
    menu: 'Open the menu',
    profile: 'Profile and settings',
    more: 'More options',
    refresh: 'Refresh',
    search: 'Search',
    filter: 'Open filters',
    capture: 'Capture something new',
    voice: 'Ask by voice',
    send: 'Send',
    approve: 'Approve the action',
    reject: 'Reject the action',
    edit: 'Edit',
    delete: 'Delete',
    snooze: 'Snooze',
    markDone: 'Mark as done',
    play: 'Play the audio briefing',
    pause: 'Pause the audio briefing',
    expand: 'Expand',
    collapse: 'Collapse',
    addVip: 'Add to VIP list',
    openSource: 'Open the source',
  },

  hint: {
    swipeActions: 'Swipe left or right for options',
    doubleTapToOpen: 'Double-tap to open',
    longPressForOptions: 'Long-press for options',
    pullToRefresh: 'Pull down to refresh',
    adjustsValue: 'Swipe up or down to change the value',
  },

  state: {
    loading: 'Loading',
    loaded: 'Loaded',
    empty: 'The list is empty',
    error: 'An error occurred',
    selected: 'Selected',
    notSelected: 'Not selected',
    expanded: 'Expanded',
    collapsed: 'Collapsed',
    unread: 'Unread',
    critical: 'Critical importance',
    vip: 'VIP contact',
    proposed: 'Proposed, not real yet',
  },

  item: {
    email: 'Mail from {sender}: {subject}',
    emailWithTime: 'Mail from {sender}: {subject}, {time}',
    event: 'Event: {title}, {time}',
    task: 'Task: {title}',
    commitment: 'Promise: {title}',
    reminder: 'Reminder: {title}, {time}',
    approval: 'Waiting for approval: {title}',
    person: 'Person: {name}',
    capture: 'Capture: {title}',
    briefingSection: '{section} section, {count} items',
  },

  progress: {
    label: 'Progress',
    value: '{percent} percent',
    step: 'Step {current} of {total}',
  },

  announcement: {
    saved: 'Saved',
    deleted: 'Deleted',
    sent: 'Sent',
    approved: 'Approved',
    rejected: 'Rejected',
    newItems: '{count} new items arrived',
    briefingReady: 'Your briefing is ready',
    syncComplete: 'Sync complete',
  },

  image: {
    avatar: 'Profile photo of {name}',
    avatarInitials: 'Initials of {name}',
    capturePreview: 'Preview of the captured image',
    decorative: '',
  },

  chart: {
    dayLoad: 'Day load chart: {percent} full',
    weekLoad: 'Meeting distribution for the week',
    timeSaved: 'Time saved chart',
  },

  form: {
    required: 'Required field',
    optional: 'Optional field',
    invalid: 'Invalid value: {reason}',
    characterCount: '{current} of {max} characters',
  },
} satisfies MessageTree
