import type { MessageTree } from '../../engine.ts'

/**
 * One entry per `ERROR_CODES` member — the error surface looks these up as
 * `errors.<code>`, so the keys stay snake_case to match the codes exactly.
 * Wording is plain and non-technical: it says what happened and what to do.
 */
export const errors = {
  network_offline: 'No connection. We will pick up where you left off once you are back online.',
  network_timeout: 'That took too long. Want to try again?',
  server_unavailable: 'We cannot be reached right now. Let us try again shortly.',
  rate_limited: 'That was a bit quick. Try again in a few minutes.',
  unauthorized: 'Your session has ended. You will need to sign in again.',
  forbidden: 'You do not have access to this.',
  not_found: 'We could not find that. It may have been deleted.',
  validation_failed: 'Something in the details is not right. Could you check the fields?',
  oauth_failed: 'The account could not be connected. It is worth one more try.',
  oauth_denied: 'Permission was not granted. We need it to continue.',
  oauth_expired: 'The connection to your account has expired. Reconnecting is enough.',
  oauth_scope_missing:
    'A permission this feature needs was not granted. You can reconnect the account.',
  oauth_revoked: 'Access to your account was revoked. We cannot read anything until you reconnect.',
  provider_unavailable: 'The connected service is not responding. We will sync once it is back.',
  mail_provider_unavailable:
    'Your mail provider cannot be reached right now. You can still read what we already have.',
  calendar_provider_unavailable:
    'Your calendar provider cannot be reached right now. Your schedule is shown as of the last sync.',
  sync_delayed: 'Syncing is taking longer than usual. New items may arrive a little late.',
  sync_conflict:
    'This was changed somewhere else too. Let us fetch the latest version and try again.',
  ai_unavailable: 'The assistant cannot answer right now. Try again in a moment.',
  ai_invalid_output:
    'We were not confident about that result, so we are not showing it. Try again?',
  ai_quota_exceeded: 'You have reached today’s assistant limit. It resets tomorrow.',
  capture_failed: 'We could not read that. A clearer photo or a different file usually works.',
  upload_failed: 'The file could not be uploaded. Check your connection and try again.',
  file_too_large: 'That file is too large. The limit is {limit}.',
  unsupported_file_type: 'We cannot read this file type. Try a photo, a PDF or a text file.',
  url_not_allowed:
    'We cannot open that link. For safety we only read publicly reachable addresses.',
  approval_expired: 'This approval has expired. For safety you will need to prepare it again.',
  approval_already_executed: 'This action already happened. We did not send it twice.',
  approval_illegal_edit:
    'This field cannot be changed at the approval stage. Try preparing it again.',
  approval_execution_failed:
    'The action could not be completed. Nothing was sent — you can try again.',
  subscription_error:
    'We could not read your subscription. Your purchases are safe; we will check again shortly.',
  entitlement_required: 'This feature is part of Pro. Want to see what is included?',
  plan_limit_reached: 'You have reached the limit on this plan. Pro removes it.',
  referral_invalid: 'That invite code is not valid. Could you check it?',
  referral_self: 'You cannot use your own invite code.',
  referral_already_used: 'You have already used this invite code.',
  referral_not_eligible: 'Invite rewards only apply to new accounts.',
  export_failed: 'The export could not be completed. You can request it again.',
  permission_denied: 'This needs a device permission. You can turn it on in Settings.',
  unknown: 'Something unexpected happened. Trying again usually sorts it out.',

  title: {
    generic: 'Something went wrong',
    offline: 'No connection',
    permission: 'Permission needed',
    limit: 'Limit reached',
  },

  action: {
    retry: 'Try again',
    reconnect: 'Reconnect',
    openSettings: 'Open settings',
    signIn: 'Sign in',
    seePlans: 'See plans',
    dismiss: 'Dismiss',
    report: 'Report',
  },

  toast: {
    saved: 'Saved',
    saveFailed: 'Could not save',
    deleted: 'Deleted',
    deleteFailed: 'Could not delete',
    queuedOffline: 'You are offline. We will send this once you reconnect.',
  },

  bootDetail: {
    label: 'Technical detail',
    copy: 'Copy detail',
    copied: 'Copied',
  },

  boundary: {
    title: 'Something went wrong',
    description: 'An unexpected error occurred opening this screen. Your data is untouched.',
    action: 'Reload the screen',
  },

  offlineBanner: 'You are offline. Showing the most recent information we have.',
  staleBanner: 'This is from {time}. Pull down to refresh.',
  supportHint: 'If it keeps happening, write to us from the Help section.',
} satisfies MessageTree
