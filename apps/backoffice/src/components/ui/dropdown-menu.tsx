'use client'

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from './utils.ts'

/**
 * The popup menu, on Radix — the admin menu in the toolbar and the column
 * visibility list on every table.
 *
 * Same reasoning as the dialog: roving tabindex, type-ahead, arrow keys,
 * Escape, outside-click, collision-aware placement and `aria-activedescendant`
 * are the whole feature, and they are what a hand-rolled menu gets wrong.
 *
 * Menus here never carry a destructive action. Deleting, disconnecting and
 * revoking all require a typed reason, and a reason cannot be typed into a menu
 * item — those live behind `ConfirmDialog`.
 */

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = 'end',
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'bo-pop-motion z-50 min-w-44 overflow-hidden rounded-lg border border-hairline',
          'bg-surface p-1 shadow-lift',
          'max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

const ITEM_BASE = cn(
  'flex w-full cursor-default items-center gap-2 rounded px-2 py-1.5 text-[12px] text-ink outline-none',
  'data-[highlighted]:bg-surface2 data-[highlighted]:text-ink',
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-55',
  '[&_svg]:size-3.5 [&_svg]:shrink-0',
)

export function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(ITEM_BASE, className)}
      {...props}
    />
  )
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(ITEM_BASE, 'relative pl-6', className)}
      {...props}
    >
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check aria-hidden="true" className="size-3 text-primary" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      className={cn('bo-kicker px-2 py-1.5', className)}
      {...props}
    />
  )
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('-mx-1 my-1 h-px bg-hairline', className)}
      {...props}
    />
  )
}
