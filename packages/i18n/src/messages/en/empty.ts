import type { MessageTree } from '../../engine.ts'

export const empty = {
  noImportantEmail: 'Everything is under control.',
  noImportantEmailHint: 'Nothing in your mail is waiting on you today.',
  noMeeting: 'Your calendar is quiet today.',
  noMeetingHint: 'A good day for deep work.',
  noFollowUp: 'Nothing is waiting on a reply.',
  noFollowUpHint: 'Everything you sent has been answered.',

  today: {
    allClear: 'You are set for today.',
    allClearHint: 'We will tell you if something comes up.',
  },
  flow: {
    title: 'Nothing to show in the flow.',
    hint: 'Try another filter, or sync your accounts.',
    filtered: 'Nothing matches this filter.',
  },
  mail: {
    title: 'No mail in this category.',
    hint: 'New messages will collect here.',
    inboxZero: 'Nothing new left to read.',
  },
  calendar: {
    title: 'No events on this day.',
    hint: 'Your calendar looks clear.',
    week: 'No meetings scheduled this week.',
  },
  commitment: {
    title: 'You have no open promises.',
    hint: 'Say "I will handle it" in a message and we will track it here.',
    othersOwe: 'You are not waiting on anything.',
  },
  task: {
    title: 'Your task list is empty.',
    hint: 'You can create a task from a message or a note.',
  },
  reminder: {
    title: 'No reminders set.',
    hint: 'Set one so an important thing does not slip.',
  },
  search: {
    title: 'No results.',
    hint: 'Try another word, or a person’s name.',
    start: 'Search mail, meetings, people and notes.',
  },
  capture: {
    title: 'You have not captured anything yet.',
    hint: 'Add a photo, a PDF, a link or a note and we will take it from there.',
  },
  approval: {
    title: 'Nothing waiting for approval.',
    hint: 'When an action is prepared, you get asked first.',
    history: 'No completed actions yet.',
  },
  assistant: {
    title: 'What would you like to know?',
    hint: 'One of the questions below is a good start.',
  },
  briefing: {
    title: 'No briefing yet.',
    hint: 'Your first one will be ready in the morning.',
    skipped: 'This briefing was skipped: there was nothing new to say.',
  },
  person: {
    title: 'No history with this person.',
    hint: 'It will build up as you write to each other.',
  },
  vip: {
    title: 'Nobody is on your VIP list.',
    hint: 'Add the people whose messages you cannot miss.',
  },
  rules: {
    title: 'No priority rules yet.',
    hint: 'You can add a rule for a sender or a keyword.',
  },
  notifications: {
    title: 'No notifications.',
    hint: 'We will tell you here when something matters.',
  },
  insight: {
    title: 'No patterns to draw on yet.',
    hint: 'This fills up after a few days of use.',
  },
  lifeEvent: {
    title: 'No deliveries, flights or payments being tracked.',
    hint: 'They land here automatically as soon as they show up in your mail.',
  },
  referral: {
    title: 'You have not invited anyone yet.',
    hint: 'Share your code and you both get something.',
  },
  offline: {
    title: 'You are offline.',
    hint: 'This section fills in by itself once you reconnect.',
  },
  error: {
    title: 'This section could not load.',
    hint: 'Trying again usually sorts it out.',
  },
} satisfies MessageTree
