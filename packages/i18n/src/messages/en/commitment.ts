import type { MessageTree } from '../../engine.ts'

export const commitment = {
  title: 'Promises',
  subtitle: 'Promises made in your threads, tracked here.',

  direction: {
    user_owes: 'You owe this',
    other_owes: 'They owe this',
  },
  directionShort: {
    user_owes: 'Yours',
    other_owes: 'Theirs',
  },

  status: {
    open: 'Open',
    done: 'Done',
    snoozed: 'Snoozed',
    cancelled: 'Cancelled',
    overdue: 'Overdue',
  },

  card: {
    youPromised: 'You promised {name}.',
    theyPromised: '{name} promised you.',
    dueOn: 'Due: {date}',
    noDate: 'No date given.',
    overdueBy: { one: '1 day overdue', other: '{count} days overdue' },
    dueIn: { one: '1 day left', other: '{count} days left' },
    dueToday: 'Today',
    fromEmail: 'Taken from this message',
    quote: '“{quote}”',
  },

  action: {
    markDone: 'Mark as done',
    reopen: 'Reopen',
    cancel: 'Cancel',
    snooze: 'Snooze',
    setDate: 'Set a date',
    changeDate: 'Change the date',
    remind: 'Remind me',
    nudge: 'Send a nudge',
    openSource: 'Open the source',
    addManually: 'Add one by hand',
  },

  create: {
    title: 'Add a promise',
    whatLabel: 'What was promised?',
    whatPlaceholder: 'For example: I will send the proposal by Friday',
    whoLabel: 'To / from whom',
    dueLabel: 'By when',
    directionLabel: 'Direction',
    save: 'Save',
  },

  detected: {
    title: 'We spotted a promise',
    body: 'We read a commitment in this sentence. Is that right?',
    confirm: 'Yes, track it',
    reject: 'Not a promise',
    rejected: 'Fine — we will not track it.',
  },

  count: {
    open: { zero: 'No open promises', one: '1 open promise', other: '{count} open promises' },
    overdue: { one: '1 promise overdue', other: '{count} promises overdue' },
    dueToday: {
      zero: 'Nothing due today',
      one: '1 promise due today',
      other: '{count} promises due today',
    },
  },

  done: 'Promise closed.',
  cancelled: 'Promise cancelled.',
  snoozedTo: 'Snoozed until {date}.',
} satisfies MessageTree
