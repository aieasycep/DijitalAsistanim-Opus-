import type { MessageTree } from '../../engine.ts'

export const assistant = {
  title: 'Assistant',
  subtitle: 'Ask across your own data.',
  inputPlaceholder: 'Ask something',
  send: 'Send',
  stop: 'Stop',
  thinking: 'Thinking',
  searching: 'Searching your records',
  newThread: 'New conversation',
  threads: 'Conversations',
  renameThread: 'Rename the conversation',
  deleteThread: 'Delete the conversation',
  deleteThreadConfirm: 'Delete this conversation?',

  suggested: {
    title: 'You could ask',
    focus: 'What should I focus on today?',
    replies: 'Who am I supposed to reply to?',
    tomorrow: 'Is tomorrow busy?',
    person: 'What did I last discuss with Mehmet?',
  },

  sources: {
    title: 'Sources',
    count: { one: '1 source', other: '{count} sources' },
    show: 'Show sources',
    hide: 'Hide sources',
    open: 'Open the source',
    hint: 'The answer rests only on these records.',
  },

  answer: {
    noData: 'I could not find anything that answers this.',
    partial: 'What I have does not fully cover this. Here is what I could find:',
    uncertain: 'Not stated in the source.',
    outOfScope: 'This is outside your own data, so I am not going to guess.',
    copy: 'Copy the answer',
    good: 'That helped',
    bad: 'That did not help',
    thanks: 'Thanks — we have learned from it.',
  },

  action: {
    title: 'Suggested action',
    hint: 'It happens once you approve it.',
    draftReply: 'Draft a reply',
    createEvent: 'Create an event',
    createTask: 'Create a task',
    createReminder: 'Set a reminder',
    createCommitment: 'Track as a promise',
  },

  memory: {
    title: 'What I remember',
    learned: 'I learned this about you: {fact}',
    forget: 'Forget this',
    forgotten: 'Forgotten.',
    manage: 'Manage what has been learned',
  },

  limits: {
    dailyLeft: {
      zero: 'You have used today’s questions.',
      one: '1 question left today.',
      other: '{count} questions left today.',
    },
    upgrade: 'Unlimited questions come with Pro.',
  },

  disclaimer: 'The assistant only uses what is in your connected accounts.',
  privacyNote: 'Your questions are never used for advertising.',
  error: 'The answer could not be prepared. Try asking again.',
} satisfies MessageTree
