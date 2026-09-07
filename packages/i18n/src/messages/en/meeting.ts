import type { MessageTree } from '../../engine.ts'

export const meeting = {
  title: 'Meeting prep',
  twoMinuteSummary: 'Two-minute brief',
  subtitle: 'What to know before you walk in.',
  readyIn: '{minutes} minutes until the meeting.',
  startsNow: 'The meeting is starting.',

  prep: {
    agenda: 'Agenda',
    agendaFromInvite: 'Taken from the invite',
    noAgenda: 'The invite has no agenda.',
    context: 'Background',
    lastMeeting: 'You last met on {date}.',
    lastEmails: 'Recent threads',
    openItems: 'Open items',
    noOpenItems: 'Nothing is open with these people.',
    yourCommitments: 'What you promised',
    theirCommitments: 'What they promised',
    documents: 'Related documents',
    questions: 'Questions you could ask',
    risks: 'Worth watching',
  },

  attendees: {
    title: 'Who is coming',
    role: '{role}',
    lastContact: 'Last contact: {time}',
    firstMeeting: 'Your first meeting with this person.',
    frequentContact: 'Someone you write to often.',
    external: 'Outside your organisation',
    unknown: 'We do not know anything about them.',
  },

  action: {
    generatePrep: 'Prepare a brief',
    regenerate: 'Prepare again',
    join: 'Join the meeting',
    openInvite: 'Open the invite',
    addNote: 'Add a note',
    shareSummary: 'Share the summary',
  },

  post: {
    title: 'After the meeting',
    subtitle: 'What came out of it?',
    howDidItGo: 'How did it go?',
    notesLabel: 'Your notes',
    notesPlaceholder: 'Write down what was discussed.',
    extractActions: 'Pull out the actions',
    extracted: 'We found {count} actions in your notes.',
    yourActions: 'On you',
    theirActions: 'On them',
    nextStep: 'Next step',
    scheduleFollowUp: 'Propose a follow-up',
    sendSummary: 'Send the summary by mail',
    summaryDraft: 'A summary draft is ready — read it before sending.',
    noActions: 'No actions came out of it.',
    saved: 'Your notes were saved.',
  },

  quality: {
    tooManyMeetings: 'You have {count} meetings this week.',
    couldBeEmail: 'This one looks like it could have been an email.',
    noAgendaWarning: 'Meetings without an agenda tend to run long.',
  },

  unavailable: 'We could not find enough to brief you on this meeting.',
  notInPlan: 'Meeting prep is part of Pro.',
} satisfies MessageTree
