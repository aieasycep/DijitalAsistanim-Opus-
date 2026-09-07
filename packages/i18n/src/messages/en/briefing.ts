import type { MessageTree } from '../../engine.ts'

/**
 * Section keys mirror `BRIEFING_SECTIONS` exactly so the renderer can look a
 * section title up by its enum value without a mapping table.
 */
export const briefing = {
  title: 'Briefing',
  kind: {
    morning: 'Morning briefing',
    midday: 'Midday pulse',
    evening: 'Evening close',
    weekly: 'Weekly review',
  },
  kindSubtitle: {
    morning: 'What to know before the day starts',
    midday: 'What changed since this morning',
    evening: 'What is left from today, and tomorrow',
    weekly: 'The week behind you and the one ahead',
  },
  section: {
    priorities: 'Today’s priorities',
    schedule: 'Your schedule',
    expected_from_you: 'Waiting on you',
    waiting_on_others: 'You are waiting on',
    deadlines: 'Deadlines',
    personal: 'Personal',
  },
  sectionEmpty: {
    priorities: 'Nothing stands out today.',
    schedule: 'Your schedule is clear.',
    expected_from_you: 'Nobody is waiting on you.',
    waiting_on_others: 'You are not waiting on anyone.',
    deadlines: 'No deadlines coming up.',
    personal: 'Nothing new on the personal side.',
  },
  status: {
    queued: 'Queued',
    generating: 'Writing',
    ready: 'Ready',
    failed: 'Could not be prepared',
    skipped: 'Skipped',
  },
  statusHint: {
    queued: 'We will start on it shortly.',
    generating: 'Reading your mail and calendar.',
    ready: 'Ready as of {time}.',
    failed: 'This briefing could not be prepared. You can try again.',
    skipped: 'Skipped because there was nothing new to say.',
  },
  stats: {
    scanned: { one: '1 message read', other: '{count} messages read' },
    surfaced: { one: '1 thing surfaced', other: '{count} things surfaced' },
    silenced: { one: '1 message silenced', other: '{count} messages silenced' },
    meetings: { zero: 'No meetings', one: '1 meeting', other: '{count} meetings' },
    deadlines: { zero: 'No deadlines', one: '1 deadline', other: '{count} deadlines' },
    timeSaved: 'Saved you about {minutes} minutes',
  },
  push: {
    morning: 'Good morning. There are {count} things to know today.',
    morningQuiet: 'Good morning. Nothing urgent today.',
    midday: '{count} new things for this afternoon.',
    middayQuiet: 'Nothing new since this morning.',
    evening: 'Let us close the day. {count} items move to tomorrow.',
    eveningQuiet: 'Today closed clean. Tomorrow looks calm.',
    weekly: 'Your week is ready, in {count} points.',
    titleMorning: 'Your morning briefing is ready',
    titleMidday: 'Midday pulse',
    titleEvening: 'Evening close',
    titleWeekly: 'Weekly review',
  },
  audio: {
    listen: 'Listen',
    pause: 'Pause',
    resume: 'Resume',
    stop: 'Stop',
    generating: 'Preparing the audio',
    duration: '{minutes} minute listen',
    speed: 'Speed',
    unavailable: 'Audio cannot be prepared right now.',
    notInPlan: 'Audio briefings are part of Pro.',
  },
  item: {
    openSource: 'Open the source',
    why: 'Why is this here?',
    dismiss: 'Not interested',
    dismissed: 'We will not show this again.',
    act: 'Take action',
  },
  weekly: {
    title: 'Weekly review',
    subtitle: '{start} – {end}',
    handled: { one: '1 thing closed', other: '{count} things closed' },
    stillOpen: {
      zero: 'Nothing left open',
      one: '1 thing still open',
      other: '{count} things still open',
    },
    busiestDay: 'Your busiest day was {day}.',
    quietestDay: 'Your quietest day was {day}.',
    topContact: 'You wrote to {name} most.',
    meetingHours: 'You spent {hours} hours in meetings.',
    nextWeek: 'Next week',
    nextWeekLoad: 'Next week has {count} meetings so far.',
  },
  regenerate: 'Prepare again',
  archiveTitle: 'Past briefings',
  readingTime: '{minutes} minute read',
  signature: 'This briefing was written from your own data.',
} satisfies MessageTree

/** Evening close-out flow, addressed from the Today screen as `evening.*`. */
export const evening = {
  title: 'Close the day',
  subtitle: 'Let us tidy up what is left from today.',
  readyForTomorrow: 'Ready for tomorrow',
  leftOver: {
    zero: 'Nothing left from today.',
    one: '1 item left from today.',
    other: '{count} items left from today.',
  },
  carryOver: 'Move to tomorrow',
  carriedOver: 'Moved to tomorrow',
  closeItem: 'Close',
  tomorrowTitle: 'What is waiting tomorrow?',
  tomorrowMeetings: {
    zero: 'No meetings tomorrow.',
    one: '1 meeting tomorrow.',
    other: '{count} meetings tomorrow.',
  },
  tomorrowFirst: 'First up at {time}: {title}',
  tomorrowDeadlines: {
    zero: 'No deadlines tomorrow.',
    one: '1 deadline tomorrow.',
    other: '{count} deadlines tomorrow.',
  },
  prepSuggestion: 'Shall we hold {minutes} minutes tomorrow morning to prepare?',
  wrapUp: 'That is today closed. Rest well.',
} satisfies MessageTree
