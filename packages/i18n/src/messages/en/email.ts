import type { MessageTree } from '../../engine.ts'

export const email = {
  title: 'Mail',
  actions: {
    draftReply: 'Draft a reply',
    createTask: 'Create a task',
    addToCalendar: 'Add to calendar',
    remind: 'Remind me',
    openOriginal: 'Open the original',
  },
  summary: {
    title: 'Summary',
    hint: 'A long thread, down to three sentences.',
    regenerate: 'Summarise again',
    good: 'Good summary',
    bad: 'Poor summary',
    thanks: 'Thanks — noted.',
  },
  keyPoints: 'Key points',
  askedOfYou: 'Asked of you',
  nothingAskedOfYou: 'Nothing is being asked of you.',
  deadlineFound: 'Deadline: {date}',
  amountFound: 'Amount: {amount}',
  peopleMentioned: 'People mentioned',
  linksFound: 'Links',
  attachments: 'Attachments',
  attachmentSize: '{size}',

  header: {
    from: 'From',
    to: 'To',
    cc: 'Cc',
    date: 'Date',
    subject: 'Subject',
    showDetails: 'Show details',
    hideDetails: 'Hide details',
  },

  thread: {
    expand: 'Show the whole thread',
    collapse: 'Hide the thread',
    olderMessages: { one: '1 older message', other: '{count} older messages' },
    quotedText: 'Quoted text',
  },

  body: {
    showOriginal: 'Show the original text',
    showSummary: 'Back to the summary',
    externalImagesBlocked: 'Remote images were blocked for safety.',
    loadImages: 'Load images',
    truncated: 'This message was shortened.',
  },

  importance: {
    label: 'Importance',
    critical: 'Critical',
    high: 'High',
    normal: 'Normal',
    low: 'Low',
    change: 'Change importance',
  },

  feedback: {
    notImportant: 'Not important',
    moreLikeThis: 'Show me more like this',
    markVip: 'Make this person a VIP',
    muteSender: 'Mute this sender',
    stopFollowing: 'Stop following this thread',
    saved: 'Your preference was saved.',
  },

  taskCreated: 'Task created',
  reminderCreated: 'Reminder set',
  eventProposed: 'Event proposal prepared',
  markedDone: 'Closed',
  snoozed: 'Snoozed until {time}',

  unsubscribe: {
    title: 'Want off this list?',
    body: 'The sender offers an unsubscribe link.',
    action: 'Open the unsubscribe link',
  },

  security: {
    warning: 'This message contains a security alert.',
    phishingHint: 'Check the sender’s address before clicking any link.',
    externalSender: 'This sender is outside your organisation.',
  },
} satisfies MessageTree
