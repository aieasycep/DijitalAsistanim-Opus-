# The AI pipeline

## The rule everything else serves

> The assistant never states a date, an amount, an attendee, a price or a
> booking that is not written in the source. When it cannot tell, it says
> **"Kaynakta kesinleşmiyor."**

A wrong summary is embarrassing. A confidently invented deadline makes someone
miss a real one. Everything below exists to make the second failure structurally
difficult rather than merely discouraged.

---

## Three stages, and why most mail never reaches a model

### Stage 1 — deterministic bulk filters

No model call. Runs on headers and the sender:

| Signal                                            | Outcome                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `CATEGORY_PROMOTIONS`, `SPAM` provider labels     | promotion, low                                                                                          |
| `Precedence: bulk \| list \| junk`                | promotion, low                                                                                          |
| `List-Unsubscribe` **and** not addressed directly | promotion, low                                                                                          |
| `noreply@`, `no-reply@`, `notifications@`, …      | information, low — _unless_ the text carries security, finance, travel, shipment or deadline vocabulary |

**A VIP or an explicit rule bypasses stage 1 entirely.** If someone said a
sender matters, a provider label does not overrule them. That is the single
most important line in the triage module.

### Stage 2 — vocabulary that settles the category

Still no model call. Turkish and English term lists resolve the obvious cases:
a security alert, a stated deadline, a meeting invitation, an invoice, a
flight, a delivery. These go to the model _with_ a presumed category, which
makes the prompt shorter and the answer more consistent.

### Stage 3 — what is genuinely ambiguous

Everything left. Before spending anything, the pipeline hashes
`(sender, subject, body)` normalised for whitespace and case, and looks the
fingerprint up: identical content is never classified twice, which matters
because the same newsletter reaches thousands of users.

The pipeline is designed so that roughly four messages in five never reach a
model. That is the design target, not a measurement — nothing here records the
achieved ratio.

---

## Grounding: how an invented date is stopped

Every field that could be invented is **nullable and paired with a verbatim
quote**:

```ts
deadline:      isoInstantSchema.nullable(),
deadlineQuote: z.string().max(600).nullable(),   // required whenever deadline is set
```

The model must return the sentence it read the date from. `verifyQuotes` then
looks for that sentence in the source, normalised for whitespace, curly quotes
and dash variants, and case-folded with Turkish rules — `İYİ` matches `iyi`,
which a naive `toLowerCase()` gets wrong.

If the quote is not found, `stripUnverifiedClaims` removes the claim and keeps
everything else. The summary survives; the unverifiable deadline does not. It
does not reject the whole response, because throwing away a mostly-correct
analysis over one bad field helps nobody.

A second, independent check runs for dates specifically:
`verifyDateAgainstSource` re-extracts every date expression from the source
with a deterministic parser and confirms the proposed instant is one of them,
within tolerance. To get a date past both, a model would have to invent a
sentence _and_ have that sentence parse to the same instant.

Vague language yields nothing at all. "Yakında", "en kısa sürede", "müsait
olduğunuzda", "ASAP" — the extractor returns no date, because a made-up
deadline is worse than no deadline.

### Confidence

| Band      | Behaviour                                                         |
| --------- | ----------------------------------------------------------------- |
| ≥ 0.6     | stated plainly                                                    |
| 0.3 – 0.6 | shown hedged, and anything actionable asks for confirmation first |
| < 0.3     | dropped                                                           |

---

## What each call does

| Function            | Purpose                             | Grounded by                                 |
| ------------------- | ----------------------------------- | ------------------------------------------- |
| `initial-analysis`  | First-run pass over recent history  | quote verification per thread               |
| `briefing-generate` | Morning / midday / evening / weekly | only rows already stored; no new claims     |
| `reply-draft`       | A reply in the user's tone          | the thread; never sends                     |
| `meeting-prep`      | Who, what was said, what is open    | linked threads and commitments              |
| `assistant-ask`     | Free-form question                  | citations; `grounded: false` when it cannot |
| `capture-create`    | Link, photo, document, note         | the captured content                        |
| `detect-followups`  | Threads awaiting a reply            | deterministic pre-filter, then the model    |

Nothing in this table writes to a provider. When a turn implies a write, the
model returns a `proposedAction`, the server turns it into a pending approval,
and the person decides. The response schema has no shape that can express
"sent" — only "proposed".

---

## Prompting

- **Turkish first.** Prompts, examples and outputs are Turkish by default;
  English mirrors them. A model asked in English about Turkish mail produces
  translated summaries, which read as though written by someone who was not
  there.
- **The user's own vocabulary.** Learned preferences and VIP names are passed
  in, so the summary calls the person what the user calls them.
- **No chain-of-thought in the output.** The schema has no field for it. What
  is stored is the conclusion and the evidence.
- **Refusal is a valid answer.** Every prompt ends by stating that "kaynakta
  kesinleşmiyor" is preferred over a guess, and the schema's nullable fields
  make that expressible.

## Providers

Anthropic or OpenAI, configured by environment variable, behind one adapter
interface in `supabase/functions/_shared/ai.ts`. Two model tiers: a cheap one
for classification, a stronger one for briefings and assistant answers.

With no key configured, the pipeline runs stages 1 and 2 and stops. Items
appear with deterministic categories and no summary. The app works; it is just
quieter. Nothing crashes and nothing is fabricated to fill the gap.

## Cost control

- Stages 1 and 2 are designed to remove roughly 80% of mail before any spend.
  That is the target the pipeline is shaped around; nothing in this repository
  measures the real ratio, and it will vary with the mailbox.
- Content fingerprints deduplicate identical text across users.
- `ai_usage_events` records tokens per user per day; the free tier is capped,
  and a runaway loop costs a rejection rather than an invoice.
- One message, one model call. What is bounded is **concurrency**, not batch
  size: `MODEL_CONCURRENCY = 3` in `_shared/ingest.ts` runs three analyses at a
  time — enough to hide latency, few enough to stay inside the provider's rate
  limit and the function's memory budget. Failures are settled per item, so one
  bad message does not lose the batch.

## Feedback

`ai_feedback` records thumbs up/down against the specific output. It feeds
`learned_preferences`, which sit at tier 8 of the priority bands — above the
model's own opinion, below any rule the user wrote. Turning off "learn from how
I use it" ignores the table entirely, which is tested rather than asserted.
