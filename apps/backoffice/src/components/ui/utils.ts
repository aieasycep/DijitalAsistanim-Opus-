import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * The class-name joiner every primitive in this directory uses.
 *
 * `clsx` flattens conditionals; `twMerge` resolves Tailwind conflicts so a
 * caller's `className` genuinely overrides the component's default rather than
 * losing to whichever rule the stylesheet happened to emit last. That is what
 * makes `<Button className="h-7" />` mean what it says.
 *
 * shadcn/ui puts this in `lib/utils`; here it lives beside the components that
 * use it, and `components.json` points the `utils` alias at this path so
 * `npx shadcn@latest add …` writes imports that resolve.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
