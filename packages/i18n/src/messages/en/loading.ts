import type { MessageTree } from '../../engine.ts'

export const loading = {
  generic: 'Loading',
  preparing: 'Preparing',
  almostDone: 'Almost there',
  thisMayTakeAMoment: 'This can take a few seconds.',

  today: 'Putting your day together',
  flow: 'Gathering the flow',
  mail: 'Reading your mail',
  email: 'Opening the message',
  calendar: 'Fetching your calendar',
  briefing: 'Writing your briefing',
  briefingAudio: 'Preparing the audio',
  meetingPrep: 'Preparing the meeting brief',
  reply: 'Drafting the reply',
  assistant: 'Thinking',
  assistantSearching: 'Searching your records',
  search: 'Searching',
  capture: 'Reading the capture',
  captureUpload: 'Uploading',
  transcribing: 'Transcribing',
  approval: 'Sending the action',
  sync: 'Syncing your accounts',
  backfill: 'Reading older mail',
  connecting: 'Connecting',
  disconnecting: 'Disconnecting',
  signingIn: 'Signing in',
  signingOut: 'Signing out',
  purchasing: 'Completing the purchase',
  restoring: 'Restoring purchases',
  exporting: 'Preparing your data',
  deleting: 'Deleting',
  saving: 'Saving',

  progress: {
    step: '{current} of {total}',
    percent: '{percent}%',
    itemsProcessed: { one: '1 item processed', other: '{count} items processed' },
    remaining: { one: '1 item left', other: '{count} items left' },
  },

  slow: {
    title: 'This is taking longer than usual',
    hint: 'We can carry on in the background and tell you when it is ready.',
    action: 'Continue in the background',
  },
} satisfies MessageTree
