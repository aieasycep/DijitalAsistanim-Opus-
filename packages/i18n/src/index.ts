import type { Locale } from '@da/domain'
import type { MessageTree } from './engine.ts'
import { en } from './messages/en/index.ts'
import { tr } from './messages/tr/index.ts'

export * from './engine.ts'
export * from './format.ts'
export { tr, en }

export const catalogues: Record<Locale, MessageTree> = { tr, en }

/** Turkish first: the product is written in Turkish and translated outward. */
export const defaultLocale: Locale = 'tr'

/**
 * Map a platform locale tag onto a catalogue. Anything we do not ship falls
 * back to English rather than to Turkish, so a Spanish or German speaker gets
 * a language they are more likely to read; an absent tag keeps the default.
 */
export function resolveLocale(systemTag: string | null | undefined): Locale {
  if (systemTag === null || systemTag === undefined) return defaultLocale
  const trimmed = systemTag.trim()
  if (trimmed.length === 0) return defaultLocale
  const base = (trimmed.toLowerCase().split(/[-_]/)[0] ?? '').trim()
  return base === 'tr' ? 'tr' : 'en'
}
