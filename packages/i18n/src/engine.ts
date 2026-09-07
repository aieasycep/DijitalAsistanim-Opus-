import type { Locale } from '@da/domain'

/**
 * A very small i18n runtime.
 *
 * Deliberately not a library: the app needs exactly three things — key lookup
 * with a fallback locale, `{placeholder}` interpolation, and Turkish/English
 * plural selection — and a hand-rolled 60-line implementation keeps the
 * message catalogue type-checked end to end. Missing keys are a type error at
 * build time, not a `??` at runtime.
 */

export type MessageValues = Record<string, string | number>

/** A leaf message: either a plain string or a plural family. */
export type Message = string | PluralMessage

export interface PluralMessage {
  /** Turkish has no separate plural agreement after a numeral, but the
   *  *sentence* still differs ("1 şey var" / "5 şey var" vs "hiçbir şey yok"),
   *  so a zero form earns its place alongside one/other. */
  zero?: string
  one: string
  other: string
}

export interface MessageTree {
  [key: string]: Message | MessageTree
}

function isPlural(value: unknown): value is PluralMessage {
  return typeof value === 'object' && value !== null && 'other' in value
}

function lookup(tree: MessageTree, path: readonly string[]): Message | undefined {
  let node: Message | MessageTree | undefined = tree
  for (const segment of path) {
    if (typeof node !== 'object' || node === null || isPlural(node)) return undefined
    node = (node as MessageTree)[segment]
    if (node === undefined) return undefined
  }
  return typeof node === 'string' || isPlural(node) ? node : undefined
}

/**
 * Substitute `{name}` placeholders. An unmatched placeholder is left intact
 * rather than blanked, so a missing value shows up in review instead of
 * producing a sentence with a hole in it.
 */
export function interpolate(template: string, values?: MessageValues): string {
  if (!values) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key]
    return value === undefined ? match : String(value)
  })
}

function selectPlural(message: PluralMessage, count: number): string {
  if (count === 0 && message.zero !== undefined) return message.zero
  return count === 1 ? message.one : message.other
}

export interface Translator {
  locale: Locale
  /** Look up `key`; falls back to the fallback locale, then to the key itself. */
  t(key: string, values?: MessageValues): string
  /** Plural-aware lookup. `count` is also available as `{count}`. */
  plural(key: string, count: number, values?: MessageValues): string
  /** True when the key resolves in either locale — used by the key-coverage test. */
  has(key: string): boolean
}

export interface TranslatorOptions {
  locale: Locale
  catalogues: Record<Locale, MessageTree>
  fallbackLocale?: Locale
  /**
   * Called when a key resolves in neither locale. In development this throws
   * so a typo cannot ship; in production it reports and returns the key.
   */
  onMissing?: (key: string, locale: Locale) => void
}

export function createTranslator(options: TranslatorOptions): Translator {
  const fallback = options.fallbackLocale ?? 'tr'
  const primary = options.catalogues[options.locale]
  const secondary = options.catalogues[fallback]

  const resolve = (key: string): Message | undefined => {
    const path = key.split('.')
    return lookup(primary, path) ?? lookup(secondary, path)
  }

  return {
    locale: options.locale,

    t(key, values) {
      const message = resolve(key)
      if (message === undefined) {
        options.onMissing?.(key, options.locale)
        return key
      }
      if (isPlural(message)) {
        // A plural family reached through `t` has no count; `other` is the
        // sensible generic reading ("3 yeni öğe" style copy).
        return interpolate(message.other, values)
      }
      return interpolate(message, values)
    },

    plural(key, count, values) {
      const message = resolve(key)
      if (message === undefined) {
        options.onMissing?.(key, options.locale)
        return key
      }
      const template = isPlural(message) ? selectPlural(message, count) : message
      return interpolate(template, { count, ...values })
    },

    has(key) {
      return resolve(key) !== undefined
    },
  }
}

/**
 * Flatten a catalogue to dotted keys. The parity test uses this to prove the
 * Turkish and English trees expose exactly the same key set.
 */
export function flattenKeys(tree: MessageTree, prefix = ''): string[] {
  const keys: string[] = []
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string' || isPlural(value)) keys.push(path)
    else keys.push(...flattenKeys(value, path))
  }
  return keys.sort()
}
