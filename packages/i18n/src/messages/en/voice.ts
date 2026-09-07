import type { MessageTree } from '../../engine.ts'

export const voice = {
  title: 'Ask by voice',
  tapToSpeak: 'Tap to speak',
  listening: 'Listening',
  listeningHint: 'Tap again when you are done.',
  processing: 'Turning it into text',
  transcribing: 'Transcribing',
  holdToTalk: 'Hold and speak',
  releaseToSend: 'Release to send',
  cancelHint: 'Swipe up to cancel',
  cancelled: 'Cancelled.',
  tooShort: 'That was very short. Try speaking a little longer.',
  tooLong: 'Recordings can be at most {seconds} seconds.',
  silence: 'We did not hear anything.',
  noise: 'It is noisy here — the words were hard to make out.',

  transcript: {
    label: 'What we heard',
    edit: 'Fix it',
    confirm: 'That is right',
    rerecord: 'Record again',
  },

  permission: {
    title: 'Microphone permission needed',
    body: 'We need the microphone so you can ask by voice.',
    allow: 'Allow',
    openSettings: 'Open settings',
    denied: 'Microphone access is off.',
  },

  playback: {
    play: 'Play',
    pause: 'Pause',
    replay: 'Play from the start',
    speed: '{value}× speed',
  },

  privacy: 'Your recording is not kept once it has been transcribed.',
  error: 'The audio could not be processed. Try again?',
  offline: 'Asking by voice needs a connection.',
} satisfies MessageTree
