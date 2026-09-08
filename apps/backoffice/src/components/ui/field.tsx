import type { ComponentProps, ReactNode } from 'react'
import { cn } from './utils.ts'

/**
 * The form atoms: a label, a text input, a native select, a textarea, and the
 * wrapper that ties them together with a description and an error.
 *
 * The select is the browser's own rather than a Radix listbox. In a dense
 * console a native `<select>` is faster to operate, works before hydration,
 * posts inside a plain `<form>` with no hidden input, and is already accessible
 * — a custom popup would be more code for less. Where a control genuinely needs
 * to be a popup (column visibility, the admin menu) this file is not what gets
 * used; `dropdown-menu.tsx` is.
 *
 * `Field` exists so the association between a control, its description and its
 * error is made once. A control described by prose that is not wired with
 * `aria-describedby` is prose a screen reader never reaches.
 */

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label
      data-slot="label"
      className={cn(
        'text-[11px] font-semibold tracking-[0.08em] text-faint uppercase',
        'peer-disabled:opacity-55',
        className,
      )}
      {...props}
    />
  )
}

const CONTROL_BASE = cn(
  'w-full rounded-md border border-hairline bg-surface text-ink',
  'placeholder:text-faint',
  'transition-colors focus-visible:border-primary',
  'disabled:cursor-not-allowed disabled:opacity-55',
  'aria-[invalid=true]:border-critical',
)

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      className={cn(CONTROL_BASE, 'h-7 px-2 text-[12px]', className)}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(CONTROL_BASE, 'min-h-16 resize-y px-2 py-1.5 text-[12px]', className)}
      {...props}
    />
  )
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn(CONTROL_BASE, 'h-7 px-2 text-[12px]', className)}
      {...props}
    >
      {children}
    </select>
  )
}

export interface FieldProps {
  /** Must match the control's `id`. */
  htmlFor: string
  label: string
  /** Explains the field. Wired to the control with `aria-describedby`. */
  description?: ReactNode
  /** Non-null renders the field invalid and announces the message. */
  error?: string | null
  /** Rendered on the label row, right-aligned — a character counter, usually. */
  meta?: ReactNode
  required?: boolean
  children: ReactNode
  className?: string
}

/** The ids `Field` generates, so the control can point at them. */
export function fieldIds(htmlFor: string): { description: string; error: string } {
  return { description: `${htmlFor}-description`, error: `${htmlFor}-error` }
}

/**
 * Wire a control to its `Field`. Spread the result onto the input:
 *
 *   <Field htmlFor="reason" label="Gerekçe" error={error}>
 *     <Textarea id="reason" {...fieldControlProps('reason', { error })} />
 *   </Field>
 */
export function fieldControlProps(
  htmlFor: string,
  options: { description?: boolean; error?: string | null } = {},
): { 'aria-describedby': string | undefined; 'aria-invalid': boolean } {
  const ids = fieldIds(htmlFor)
  const described = [
    options.description === true ? ids.description : null,
    options.error ? ids.error : null,
  ].filter((value): value is string => value !== null)
  return {
    'aria-describedby': described.length > 0 ? described.join(' ') : undefined,
    'aria-invalid': Boolean(options.error),
  }
}

export function Field({
  htmlFor,
  label,
  description,
  error = null,
  meta,
  required = false,
  children,
  className,
}: FieldProps) {
  const ids = fieldIds(htmlFor)
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor}>
          {label}
          {required ? (
            <span aria-hidden="true" className="ml-0.5 text-critical-text">
              *
            </span>
          ) : null}
        </Label>
        {meta ? <span className="text-[11px] text-faint">{meta}</span> : null}
      </div>
      {children}
      {description ? (
        <p id={ids.description} className="text-[11px] text-faint">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={ids.error} role="alert" className="text-[11px] font-medium text-critical-text">
          {error}
        </p>
      ) : null}
    </div>
  )
}
