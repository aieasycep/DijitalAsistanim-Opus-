import type { MessageTree } from '../../engine.ts'

export const privacy = {
  title: 'Privacy and security',
  subtitle: 'What we do with your data, in plain words.',

  encryption: 'Data is encrypted in transit and at rest.',
  noAdSale: 'Your data is not sold to advertisers.',

  principle: {
    yourData: 'Your data is yours.',
    yourDataBody: 'Delete your account and it all goes. You can export it any time.',
    minimal: 'We read only what we need.',
    minimalBody: 'Folders and calendars you switch off are never opened.',
    noTraining: 'Your mail is not used to train general models.',
    noTrainingBody: 'Analysis happens for your account alone.',
    approval: 'Nothing leaves without your approval.',
    approvalBody: 'Sending mail and writing to your calendar is asked every single time.',
    tokens: 'Your connection keys never reach your device.',
    tokensBody: 'Provider tokens are kept encrypted on the server.',
  },

  analytics: {
    title: 'Usage measurement',
    body: 'We count which screens are used. Mail content, names and addresses are never sent.',
    toggle: 'Allow anonymous usage measurement',
    crashToggle: 'Send crash reports',
    crashHint: 'Technical details are sent so we can fix bugs.',
  },

  dataExport: {
    title: 'Download your data',
    body: 'Take everything in your account as a machine-readable file.',
    request: 'Request an export',
    status: {
      requested: 'Requested',
      processing: 'Preparing',
      ready: 'Ready to download',
      failed: 'Could not be prepared',
      expired: 'The link has expired',
    },
    ready: 'Your file is ready. The link works until {date}.',
    download: 'Download',
    requestAgain: 'Request again',
    hint: 'We will notify you when it is ready.',
  },

  deleteHistory: {
    title: 'Delete history',
    body: 'Remove analysis older than a date you choose.',
    olderThan: 'Older than:',
    confirm: 'Delete',
    confirmTitle: 'Delete the selected history?',
    confirmBody: 'This cannot be undone. The original mail at your provider is untouched.',
    done: 'History deleted.',
  },

  deleteAccount: {
    title: 'Delete account',
    body: 'Your account and all analysis are permanently deleted.',
    warning: 'This cannot be undone.',
    keepsProviderData: 'The original mail at your provider is not deleted.',
    confirmLabel: 'Type your email address to confirm',
    confirmWord: 'DELETE',
    confirm: 'Permanently delete my account',
    cancelSubscriptionNote: 'You also need to cancel the subscription from your store account.',
    done: 'Your account has been deleted. Thank you for the time you spent here.',
  },

  audit: {
    title: 'Action log',
    body: 'Every external action taken on your behalf is recorded here.',
    empty: 'No external actions yet.',
    entry: '{time} · {action}',
  },

  permissions: {
    title: 'Device permissions',
    notifications: 'Notifications',
    microphone: 'Microphone',
    camera: 'Camera',
    photos: 'Photos',
    contacts: 'Contacts',
    granted: 'Granted',
    denied: 'Not granted',
    manage: 'Manage in device settings',
  },

  policyLink: 'Read the Privacy Policy',
  termsLink: 'Read the Terms of Use',
  contact: 'Write to us with any privacy question.',
} satisfies MessageTree
