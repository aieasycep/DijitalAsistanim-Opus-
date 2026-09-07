import { type Locale } from '@da/domain'
import {
  type Translator,
  catalogues,
  createTranslator,
  defaultLocale,
  resolveLocale,
} from '@da/i18n'
import * as Localization from 'expo-localization'
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'

/**
 * Locale context.
 *
 * `system` follows the device language when it is one we ship; anything else
 * falls back to Turkish, the product's primary language. A missing key logs a
 * warning in development and renders the key itself in production, rather than
 * a blank space that would be invisible in review.
 */

export type LanguagePreference = Locale | 'system'

export interface I18nContextValue {
  t: Translator['t']
  plural: Translator['plural']
  locale: Locale
  preference: LanguagePreference
  setPreference: (preference: LanguagePreference) => void
}

const I18nContext = createContext<I18nContextValue | null>(null)

const missingKeys = new Set<string>()

function reportMissing(key: string, locale: Locale): void {
  if (missingKeys.has(key)) return
  missingKeys.add(key)
  if (__DEV__) {
    console.warn(`[i18n] missing key "${key}" for locale "${locale}"`)
  }
}

export interface I18nProviderProps {
  children: ReactNode
  initialPreference?: LanguagePreference
  onPreferenceChange?: (preference: LanguagePreference) => void
}

export function I18nProvider({
  children,
  initialPreference = 'system',
  onPreferenceChange,
}: I18nProviderProps) {
  const [preference, setPreferenceState] = useState<LanguagePreference>(initialPreference)

  const value = useMemo<I18nContextValue>(() => {
    const deviceTag = Localization.getLocales()[0]?.languageTag ?? null
    const locale: Locale = preference === 'system' ? resolveLocale(deviceTag) : preference
    const translator = createTranslator({
      locale,
      catalogues,
      fallbackLocale: defaultLocale,
      onMissing: reportMissing,
    })
    return {
      t: translator.t,
      plural: translator.plural,
      locale,
      preference,
      setPreference: (next) => {
        setPreferenceState(next)
        onPreferenceChange?.(next)
      },
    }
  }, [preference, onPreferenceChange])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}

/** The common case: `const t = useT()`. */
export function useT(): Translator['t'] {
  return useI18n().t
}
