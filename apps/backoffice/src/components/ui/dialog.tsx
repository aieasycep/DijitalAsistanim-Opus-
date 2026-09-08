'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from './utils.ts'

/**
 * The modal, on Radix.
 *
 * Radix is here for exactly one reason: focus. A dialog that does not trap the
 * tab ring, does not return focus to the trigger on close, does not close on
 * Escape and does not mark the rest of the page `aria-hidden` is not a dialog —
 * it is a floating div that a keyboard operator falls out of. Re-implementing
 * that correctly is several hundred lines of edge cases; `@radix-ui/react-dialog`
 * has them, so this file is the styling and nothing else.
 *
 * `DialogTitle` is not optional. Radix warns without one, and a modal that
 * interrupts an operator without saying what it wants is the reason people
 * click the first button they see.
 */

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({
  className,
  children,
  showClose = true,
  closeLabel,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  showClose?: boolean
  /** Accessible name for the corner close button. Required when it is shown. */
  closeLabel?: string
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className="bo-overlay-motion fixed inset-0 z-50 bg-[var(--da-scrim)]"
        data-slot="dialog-overlay"
      />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'bo-pop-motion fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md',
          '-translate-x-1/2 -translate-y-1/2',
          'rounded-xl border border-hairline bg-surface p-5 shadow-lift',
          'max-h-[calc(100dvh-3rem)] overflow-y-auto',
          className,
        )}
        {...props}
      >
        {children}
        {showClose && closeLabel !== undefined ? (
          <DialogPrimitive.Close
            className={cn(
              'absolute top-3 right-3 flex size-6 items-center justify-center rounded-md',
              'text-faint transition-colors hover:bg-surface2 hover:text-ink',
            )}
          >
            <X aria-hidden="true" className="size-3.5" />
            <span className="sr-only">{closeLabel}</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader({ children }: { children: ReactNode }) {
  return <div className="mb-3 flex flex-col gap-1 pr-6">{children}</div>
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-[15px] leading-5 font-semibold text-ink', className)}
      {...props}
    />
  )
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-[12px] leading-[1.5] text-muted', className)}
      {...props}
    />
  )
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="mt-4 flex flex-wrap items-center justify-end gap-2">{children}</div>
}
