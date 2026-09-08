'use client'

import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from './utils.ts'

/**
 * The tooltip.
 *
 * It exists for one job the console genuinely has: a collapsed sidebar shows
 * icons, and an icon without a name is a guess. Radix's tooltip opens on hover
 * *and* on keyboard focus and is wired to the trigger with `aria-describedby`,
 * so the label reaches a keyboard operator and a screen reader as well as a
 * mouse.
 *
 * It is never the only place a fact appears. A tooltip is unreachable on touch
 * and invisible in print, so anything an operator must know to act is on the
 * page — the tooltip repeats it, it does not hold it.
 */

export const TooltipProvider = TooltipPrimitive.Provider
export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export function TooltipContent({
  className,
  sideOffset = 8,
  children,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'bo-pop-motion z-50 rounded-md border border-hairline bg-surface px-2 py-1',
          'text-[12px] font-medium text-ink shadow-lift',
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

/** Trigger plus content in one element, for the common single-string case. */
export function TooltipLabel({
  label,
  side = 'right',
  children,
}: {
  label: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}
