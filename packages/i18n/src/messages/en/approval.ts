import type { MessageTree } from '../../engine.ts'

export const approval = {
  title: 'Approvals',
  subtitle: 'Anything done on your behalf lands here first.',
  pendingTab: 'Pending',
  historyTab: 'History',

  status: {
    pending: 'Waiting for approval',
    approved: 'Approved',
    rejected: 'Rejected',
    executing: 'Running',
    executed: 'Done',
    failed: 'Failed',
    expired: 'Expired',
  },
  statusHint: {
    pending: 'Nothing is sent until you approve it.',
    approved: 'Approved and queued.',
    rejected: 'You rejected it; nothing happened.',
    executing: 'Running right now.',
    executed: 'Completed at {time}.',
    failed: 'It did not go through. Nothing left the app.',
    expired: 'Cancelled because it was not approved in time.',
  },

  actionType: {
    email_send: 'Send an email',
    calendar_create: 'Create an event',
    calendar_update: 'Update an event',
    task_create: 'Create a task',
    reminder_create: 'Set a reminder',
    commitment_create: 'Track as a promise',
  },
  actionTypeDescription: {
    email_send: 'This will be sent from your account.',
    calendar_create: 'This will be added to your calendar.',
    calendar_update: 'This event will change and attendees will be notified.',
    task_create: 'This will be added to your task list.',
    reminder_create: 'This reminder will be set for you.',
    commitment_create: 'This promise will start being tracked.',
  },
  externalEffect: 'This affects someone other than you.',
  internalOnly: 'This stays inside the app.',

  decide: {
    approve: 'Approve',
    edit: 'Edit',
    reject: 'Reject',
    approveAndSend: 'Approve and send',
    rejectReason: 'Why are you rejecting it? (optional)',
    rejectPlaceholder: 'For example: the date is wrong',
    confirmTitle: 'Are you sure?',
    confirmBody: 'Approving makes this happen straight away.',
  },

  edit: {
    title: 'Edit the action',
    hint: 'Only the marked fields can be changed.',
    lockedField: 'This field is locked for safety.',
    changes: { one: '1 field changed', other: '{count} fields changed' },
    noChanges: 'You have not changed anything.',
    invalid: 'That change cannot be accepted.',
    save: 'Save changes',
  },

  preview: {
    title: 'What will happen',
    to: 'To',
    cc: 'Cc',
    subject: 'Subject',
    body: 'Body',
    when: 'When',
    until: 'Until',
    where: 'Where',
    person: 'Person',
    attendees: 'Attendees',
    dueDate: 'Due',
    notes: 'Notes',
  },

  expiry: {
    expiresIn: 'Expires in {duration} minutes',
    expiresSoon: 'Expires shortly',
    expired: 'Expired',
    recreate: 'Prepare again',
  },

  retry: {
    attempt: 'Attempt {count}',
    willRetry: 'Retrying in {seconds} seconds',
    retryNow: 'Retry now',
    givenUp: 'Out of retries. You can prepare it again by hand.',
  },

  approved: 'Approved.',
  rejected: 'Rejected. Nothing happened.',
  executed: 'Done.',
  failed: 'It did not go through.',
  count: {
    zero: 'Nothing waiting',
    one: '1 action waiting',
    other: '{count} actions waiting',
  },
  promise: 'No mail is sent and no event is created without your approval.',
  source: 'This came from',
} satisfies MessageTree
