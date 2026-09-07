import type { MessageTree } from '../../engine.ts'

export const capture = {
  title: 'Capture',
  subtitle: 'Throw anything at it and we will make sense of it.',

  kind: {
    camera: 'Take a photo',
    photo: 'Choose from library',
    pdf: 'Add a PDF',
    file: 'Add a file',
    link: 'Add a link',
    text: 'Write a note',
  },
  kindHint: {
    camera: 'An invitation, a bill, a poster, a sign',
    photo: 'A saved screenshot or photo',
    pdf: 'A contract, a ticket, a report',
    file: 'A document or text file',
    link: 'An event page, a product, an article',
    text: 'Whatever is on your mind',
  },

  status: {
    uploading: 'Uploading',
    queued: 'Queued',
    analyzing: 'Reading it',
    ready: 'Ready',
    failed: 'Could not be read',
  },
  statusHint: {
    uploading: 'Sending your file.',
    queued: 'We will look at it shortly.',
    analyzing: 'Pulling out what is inside.',
    ready: 'Here is what we found.',
    failed: 'We could not read this. Try a different source.',
  },

  intent: {
    event: 'Event',
    task: 'Task',
    deadline: 'Deadline',
    person: 'Person',
    note: 'Note',
    payment: 'Payment',
    reservation: 'Booking',
    travel: 'Travel',
    product_info: 'Product info',
  },
  intentQuestion: 'What should we save this as?',

  extraction: {
    title: 'What we found',
    titleField: 'Title',
    dateField: 'Date',
    timeField: 'Time',
    locationField: 'Location',
    amountField: 'Amount',
    personField: 'Person',
    codeField: 'Reference',
    noteField: 'Note',
    notFound: 'This field does not appear in the source.',
    lowConfidence: 'We are not fully sure — worth a check.',
    edit: 'Fix it',
    verified: 'Verified in the source',
  },

  action: {
    saveAsEvent: 'Save as an event',
    saveAsTask: 'Save as a task',
    saveAsReminder: 'Set a reminder',
    saveAsNote: 'Keep as a note',
    addToPerson: 'Attach to a person',
    discard: 'Delete',
    retryAnalysis: 'Read it again',
    viewOriginal: 'View the original',
  },

  linkInput: {
    label: 'Link',
    placeholder: 'https://',
    invalid: 'That address does not look valid.',
    blocked: 'We cannot open that address for safety reasons.',
    fetching: 'Reading the page',
  },

  textInput: {
    label: 'Note',
    placeholder: 'Write what is on your mind.',
  },

  fileLimit: 'Files can be up to {size}.',
  supportedTypes: 'Photos, PDFs and text files are supported.',
  savedAs: 'Saved as a {type}.',
  discarded: 'Deleted.',
  history: 'Captures',
  monthlyLimit: 'You have used {used} of {limit} captures this month.',
  limitReached: 'You have reached the monthly capture limit. Pro removes it.',
} satisfies MessageTree
