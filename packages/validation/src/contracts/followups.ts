import { FOLLOW_UP_ACTIONS, type FollowUpAction } from '@da/domain'
import { z } from 'zod'
import { isoInstantSchema, uuidSchema } from '../primitives.ts'
import { rowSchema } from './common.ts'

/**
 * The `followups` group — `followup-nudge` and `detect-followups`.
 *
 * Four decisions, each of them a defect this file makes impossible:
 *
 *  1. **The domain names the actions.** `FOLLOW_UP_ACTIONS` in `@da/domain` is
 *     `draft_nudge | remind_tomorrow | close` — the three buttons on the
 *     follow-up card, named by the layer that decides what they mean. The
 *     function had invented a second vocabulary (`draft | snooze | close`) and
 *     required it, while the client sent no action at all: every nudge request
 *     ever made was rejected as malformed, so the button had never worked in a
 *     shipped build. `satisfies z.ZodType<FollowUpAction>` makes adding a
 *     fourth action in the domain a compile error here rather than a 422 at
 *     runtime, and the field defaults to `draft_nudge` — the only one of the
 *     three that produces something to read.
 *
 *  2. **Every action answers with the follow-up as it now stands.** One
 *     envelope, not three: `followUp` is the row after the write, and `draft`
 *     is non-null only for `draft_nudge`. This is also why dismissing and
 *     closing stopped being client-side table writes. `dismiss_count` is the
 *     column the engine backs off with — `evaluateFollowUp` widens its patience
 *     by `2 ** dismissCount` and gives up entirely past `MAX_DISMISSALS` — and
 *     it was incremented only by a branch nothing ever reached, so a user who
 *     pressed "remind me" every day was asked again every day forever. The
 *     count the domain reads is now the count the user's taps produce.
 *
 *  3. **"Tomorrow" is computed once, by the domain, on the app's clock.**
 *     `nextWorkingDay` states what the button means (the next working day, so a
 *     Friday nudge is not due again on Saturday) and the app is where the
 *     user's zone and the injected clock live, so the instant is computed there
 *     and travels as `remindAt`. The function stores what it is told instead of
 *     re-deriving it from a second rule — it used to add a flat 24 hours, which
 *     disagreed with both the domain and the caller.
 *
 *  4. **A draft is text, and only text.** The nudge crosses the wire as a
 *     subject and a body; nothing here creates an approval and nothing here
 *     sends. The user reads the draft, proposes it, and `approval-decide` is
 *     the only path that ever puts a mail on the network — which is what makes
 *     "hiçbir şey onayın olmadan gönderilmez" a property of the code rather
 *     than a line in the copy.
 */

/** The three things a surfaced follow-up can be answered with. */
export const followUpAction = z.enum(FOLLOW_UP_ACTIONS) satisfies z.ZodType<FollowUpAction>

// ── followup-nudge ──────────────────────────────────────────────────────────

/**
 * What to do with one follow-up.
 *
 * `remindAt` is required exactly when it is read, so a "remind me tomorrow"
 * that forgot to say when fails on the caller's device with a message about
 * the request — rather than silently writing a null `due_at` and dropping the
 * follow-up out of both the overdue and the upcoming group.
 */
export const followupNudgeRequest = z
  .object({
    followUpId: uuidSchema,
    action: followUpAction.default('draft_nudge'),
    /** When to ask again. Read for `remind_tomorrow`, ignored otherwise. */
    remindAt: isoInstantSchema.nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.action === 'remind_tomorrow' && value.remindAt === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['remindAt'],
        message: 'remind_tomorrow needs the instant to ask again at',
      })
    }
  })

export type FollowupNudgeRequest = z.infer<typeof followupNudgeRequest>

/**
 * The nudge the model wrote.
 *
 * Subject and body only: the recipient, the thread and the message being
 * answered are all on the follow-up the caller already holds, and the account
 * the mail would leave from belongs to the thread, not to the draft. Sending
 * is a separate, approved act — see decision 4 above.
 */
export const followupNudgeDraft = z.object({
  followUpId: uuidSchema,
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(8000),
})

export type FollowupNudgeDraft = z.infer<typeof followupNudgeDraft>

/**
 * The follow-up after the action, and the draft when the action produced one.
 *
 * The row stays permissive — its columns are pinned by migration 0005 and
 * narrowed by the mapper — while the envelope around it is fixed here, because
 * the envelope is what drifts: the function used to answer
 * `{ status, draft, threadId, connectedAccountId, to }` while the client
 * parsed `{ followUpId, subject, body, approvalId }`, and the two shapes had
 * not one field in common.
 */
export const followupNudgeResponse = z.object({
  followUp: rowSchema,
  /** Null for `remind_tomorrow` and `close`: only a nudge writes text. */
  draft: followupNudgeDraft.nullable(),
})

export type FollowupNudgeResponse = z.infer<typeof followupNudgeResponse>

// ── detect-followups ────────────────────────────────────────────────────────

/**
 * What the hourly sweep did.
 *
 * There is no request: the function runs on the cron secret, over every user,
 * and takes no arguments. The counts are its whole answer — they are read in
 * the function log, which is why each one names a decision the sweep made
 * rather than a row it touched:
 *
 *   - `replied`  — threads the other side answered, no longer watched;
 *   - `closed`   — threads the domain has given up on, because the user
 *                  dismissed them past `MAX_DISMISSALS`;
 *   - `surfaced` — follow-ups now due, which the app shows as overdue;
 *   - `created`  — sent mail that asked for something and is now watched.
 */
export const detectFollowupsResponse = z.object({
  replied: z.number().int().min(0),
  closed: z.number().int().min(0),
  surfaced: z.number().int().min(0),
  created: z.number().int().min(0),
})

export type DetectFollowupsResponse = z.infer<typeof detectFollowupsResponse>
