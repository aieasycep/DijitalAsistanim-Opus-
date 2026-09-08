import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from './utils.ts'

/**
 * The button, in the five shapes this console actually has.
 *
 * shadcn/ui's structure — `cva` variants, a `Slot`-based `asChild` so a `Link`
 * can wear the same clothes — with this system's palette rather than shadcn's
 * stock neutral ramp, so the indigo carries over untouched.
 *
 * `danger` is a separate variant rather than a red `default` because it is the
 * only one whose caller is *required* to put a confirmation in front of it.
 * `ghost` is for toolbar affordances that would otherwise fill a header with
 * boxes. Nothing here is decorative: a button with no handler and no form is a
 * dead control, and the specification forbids it.
 *
 * Sizes are dense on purpose. `sm` (28px) is the toolbar and table default;
 * `md` (32px) is a form's primary action; `icon` is square and must always be
 * given an `aria-label` by its caller.
 */

export const buttonVariants = cva(
  cn(
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap',
    'transition-colors outline-none select-none',
    'disabled:pointer-events-none disabled:opacity-55',
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3.5",
  ),
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary hover:bg-primary-pressed',
        secondary: 'border border-hairline bg-surface text-ink hover:bg-surface2',
        ghost: 'text-muted hover:bg-surface2 hover:text-ink',
        danger: 'bg-critical text-on-primary hover:brightness-95',
        link: 'text-primary-on-soft underline-offset-2 hover:underline',
      },
      size: {
        sm: 'h-7 px-2.5 text-[12px]',
        md: 'h-8 px-3 text-[13px]',
        icon: 'size-7 p-0',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'sm' },
  },
)

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Render the child element with the button's styling — for `Link`. */
  asChild?: boolean
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button'
  return (
    <Component
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
