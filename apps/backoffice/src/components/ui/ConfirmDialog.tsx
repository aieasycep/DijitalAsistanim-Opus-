'use client'

import { AlertTriangle } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { MAX_REASON_LENGTH, MIN_REASON_LENGTH } from '@/lib/permissions'
import { messages } from '@/lib/messages'
import { Button } from './button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog.tsx'
import { Field, Textarea, fieldControlProps } from './field.tsx'
import { cn } from './utils.ts'

/**
 * The dialog in front of every action that cannot be undone.
 *
 * ---------------------------------------------------------------------------
 * WHY THE REASON IS A FIELD AND NOT A CHECKBOX
 * ---------------------------------------------------------------------------
 *
 * `audit_logs_enforce_accountability()` refuses to record a sensitive action
 * without an actor and a written reason: disabling an account, disconnecting an
 * integration, granting Pro, activating a prompt, revealing content. The
 * database is the enforcement, and this dialog is where the sentence gets
 * typed. The same floor applies in both places (3 characters, 280 ceiling), so
 * a reason this form accepts is one Postgres will accept.
 *
 * The dialog states, in the operator's own language, that what they write is
 * kept and attributable. That is not a warning for its own sake — a reviewer
 * reading "test" six months later has no way to reconstruct what happened, and
 * an operator who knows the sentence is read writes a better one.
 *
 * ---------------------------------------------------------------------------
 * FOCUS
 * ---------------------------------------------------------------------------
 *
 * Radix owns it: the tab ring is trapped inside the panel, Escape closes,
 * focus returns to the trigger, and the page behind is inert to a screen
 * reader. The reason field takes focus on open, so the first keystroke lands
 * where it is needed rather than on the confirm button.
 *
 * ---------------------------------------------------------------------------
 * THE BUTTON IS DISABLED UNTIL THE FORM IS VALID — AND THAT IS NOT THE CHECK
 * ---------------------------------------------------------------------------
 *
 * Client-side validation here is a courtesy, not a control. The Server Action
 * re-checks the permission, the CSRF token and the reason, because a disabled
 * button stops nobody who can post a form.
 */

export interface ConfirmReasonConfig {
  /** Form field name. Defaults to `reason`, which is what the actions expect. */
  name?: string
  label?: string
  placeholder?: string
  /** Defaults to the database's own floor. Support Access raises it to 20. */
  minLength?: number
  maxLength?: number
  /** Replaces the default "this is written to the audit log" sentence. */
  description?: ReactNode
}

export interface ConfirmDialogProps {
  /** The control that opens the dialog. Rendered as-is, wired by Radix. */
  trigger: ReactNode
  title: string
  /** What is about to happen, in one or two sentences. */
  description: ReactNode
  confirmLabel: string
  cancelLabel?: string
  /**
   * The Server Action the confirmation posts to. It re-checks everything: this
   * dialog collects input, it does not authorise anything.
   */
  action: (formData: FormData) => void | Promise<void>
  /** Hidden inputs the action needs — the entity id, the CSRF token. */
  hiddenFields?: Readonly<Record<string, string>>
  /** Present means a written reason is required before the button enables. */
  reason?: ConfirmReasonConfig
  /**
   * For the handful of actions with no undo at all: the operator must type this
   * exact string. Use the thing being destroyed — a reference, an email domain
   * — so muscle memory cannot carry someone through.
   */
  confirmPhrase?: string
  /** Rendered above the fields: a summary of exactly what will change. */
  children?: ReactNode
  /** An environment or policy note, e.g. `dangerousActionNote(environment)`. */
  note?: string | null
  /** Adds the "this cannot be undone" line and paints the button red. */
  destructive?: boolean
}

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel,
  action,
  hiddenFields,
  reason,
  confirmPhrase,
  children,
  note = null,
  destructive = true,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false)
  const [reasonValue, setReasonValue] = useState('')
  const [phraseValue, setPhraseValue] = useState('')
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const baseId = useId()

  const reasonId = `${baseId}-reason`
  const phraseId = `${baseId}-phrase`
  const minLength = reason?.minLength ?? MIN_REASON_LENGTH
  const maxLength = reason?.maxLength ?? MAX_REASON_LENGTH
  const trimmedReason = reasonValue.trim()

  const reasonError =
    reason === undefined || trimmedReason.length === 0
      ? null
      : trimmedReason.length < minLength
        ? messages.confirm.reasonTooShort(minLength)
        : trimmedReason.length > maxLength
          ? messages.confirm.reasonTooLong(maxLength)
          : null

  const reasonReady =
    reason === undefined || (trimmedReason.length >= minLength && trimmedReason.length <= maxLength)
  const phraseReady = confirmPhrase === undefined || phraseValue.trim() === confirmPhrase
  const ready = reasonReady && phraseReady

  // Every open starts from a blank form. Carrying the previous reason forward
  // is how the same sentence ends up attached to three unrelated actions.
  function onOpenChange(next: boolean): void {
    setOpen(next)
    if (!next) {
      setReasonValue('')
      setPhraseValue('')
    }
  }

  const close = useCallback(() => {
    onOpenChange(false)
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        closeLabel={cancelLabel ?? messages.confirm.cancel}
        onOpenAutoFocus={(event) => {
          if (reason === undefined) return
          event.preventDefault()
          reasonRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {destructive ? (
          <p className="mb-3 flex items-start gap-2 rounded-md bg-critical-soft px-3 py-2 text-[12px] text-critical-text">
            <AlertTriangle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
            <span>{messages.confirm.irreversible}</span>
          </p>
        ) : null}

        {note !== null ? (
          <p className="mb-3 rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning-text">
            {note}
          </p>
        ) : null}

        {children ? <div className="mb-3">{children}</div> : null}

        <form action={action} className="flex flex-col gap-3">
          {Object.entries(hiddenFields ?? {}).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}

          {reason !== undefined ? (
            <Field
              htmlFor={reasonId}
              label={reason.label ?? messages.confirm.reasonLabel}
              description={reason.description ?? messages.confirm.reasonDescription}
              error={reasonError}
              required
              meta={messages.confirm.reasonRemaining(Math.max(0, maxLength - reasonValue.length))}
            >
              <Textarea
                id={reasonId}
                ref={reasonRef}
                name={reason.name ?? 'reason'}
                value={reasonValue}
                onChange={(event) => {
                  setReasonValue(event.target.value)
                }}
                maxLength={maxLength}
                placeholder={reason.placeholder ?? messages.confirm.reasonPlaceholder}
                required
                {...fieldControlProps(reasonId, { description: true, error: reasonError })}
              />
            </Field>
          ) : null}

          {confirmPhrase !== undefined ? (
            <Field
              htmlFor={phraseId}
              label={messages.confirm.phraseLabel(confirmPhrase)}
              error={
                phraseValue.length > 0 && !phraseReady ? messages.confirm.phraseMismatch : null
              }
              required
            >
              <input
                id={phraseId}
                value={phraseValue}
                onChange={(event) => {
                  setPhraseValue(event.target.value)
                }}
                autoComplete="off"
                spellCheck={false}
                className={cn(
                  'h-7 w-full rounded-md border border-hairline bg-surface px-2 font-mono text-[12px] text-ink',
                  'focus-visible:border-primary aria-[invalid=true]:border-critical',
                )}
                {...fieldControlProps(phraseId, {
                  error:
                    phraseValue.length > 0 && !phraseReady ? messages.confirm.phraseMismatch : null,
                })}
              />
            </Field>
          ) : null}

          <p className="text-[11px] text-faint">{messages.confirm.auditNote}</p>

          <DialogFooter>
            <CancelButton onCancel={close}>{cancelLabel ?? messages.confirm.cancel}</CancelButton>
            <SubmitButton ready={ready} destructive={destructive}>
              {confirmLabel}
            </SubmitButton>
          </DialogFooter>

          <CloseWhenSettled onSettled={close} />
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CancelButton({ onCancel, children }: { onCancel: () => void; children: ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <Button type="button" variant="secondary" size="md" disabled={pending} onClick={onCancel}>
      {children}
    </Button>
  )
}

function SubmitButton({
  ready,
  destructive,
  children,
}: {
  ready: boolean
  destructive: boolean
  children: ReactNode
}) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      size="md"
      variant={destructive ? 'danger' : 'primary'}
      disabled={!ready || pending}
    >
      {pending ? messages.confirm.working : children}
    </Button>
  )
}

/**
 * Closes the dialog once the submission has settled.
 *
 * It watches `useFormStatus` rather than wrapping the action, because wrapping
 * would mean catching whatever the action throws — and a Server Action signals
 * a redirect by throwing. Swallowing that would leave an operator staring at a
 * dialog on a page that was supposed to have navigated.
 */
function CloseWhenSettled({ onSettled }: { onSettled: () => void }) {
  const { pending } = useFormStatus()
  const submitted = useRef(false)

  useEffect(() => {
    if (pending) {
      submitted.current = true
      return
    }
    if (submitted.current) {
      submitted.current = false
      onSettled()
    }
  }, [pending, onSettled])

  return null
}
