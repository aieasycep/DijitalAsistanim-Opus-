import type { ReactElement, ReactNode } from 'react'
import {
  act,
  fireEvent,
  render,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react-native'
import { I18nProvider, type LanguagePreference } from './i18n/I18nProvider'
import type { ColorSchemePreference } from '@da/design-tokens'
import { ThemeProvider } from './theme/ThemeProvider'

/**
 * Render a component inside the providers it actually runs under.
 *
 * The real theme and the real message catalogue are used rather than stubs: a
 * test that passes against a fake `t()` proves nothing about a screen whose
 * label key does not exist, and a test against a fake theme cannot notice a
 * dark-mode regression.
 *
 * `render` is asynchronous in Testing Library 14 — it awaits the initial
 * `act()` — so this is too, and every caller awaits it. Queries come off the
 * returned result rather than the library's `screen` global.
 */
interface WrapperOptions {
  locale?: LanguagePreference
  colorScheme?: ColorSchemePreference
  reduceMotion?: boolean
}

export async function renderWithProviders(
  ui: ReactElement,
  {
    locale = 'tr',
    colorScheme = 'light',
    reduceMotion = false,
    ...options
  }: WrapperOptions & Omit<RenderOptions, 'wrapper'> = {},
): Promise<RenderResult> {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <ThemeProvider initialPreference={colorScheme} initialReduceMotion={reduceMotion}>
      <I18nProvider initialPreference={locale}>{children}</I18nProvider>
    </ThemeProvider>
  )
  return render(ui, { wrapper: Wrapper, ...options })
}

/**
 * Fire an event and let React settle before the next assertion.
 *
 * Testing Library 14 is asynchronous throughout: a press that updates state
 * outside `act()` leaves an open act scope, and the *next* test in the file
 * then renders into a tree the queries cannot see. Going through here rather
 * than calling `fireEvent` directly keeps that from happening.
 */
export async function press(element: Parameters<typeof fireEvent.press>[0]): Promise<void> {
  await act(async () => {
    fireEvent.press(element)
  })
}

export async function fire(
  element: Parameters<typeof fireEvent>[0],
  eventName: string,
  ...data: unknown[]
): Promise<void> {
  await act(async () => {
    fireEvent(element, eventName, ...data)
  })
}

/** Flatten a React Native style prop, which may be an array of arrays. */
export const flattenStyle = (style: unknown): Record<string, unknown> =>
  Array.isArray(style)
    ? Object.assign({}, ...style.filter(Boolean).map(flattenStyle))
    : ((style ?? {}) as Record<string, unknown>)

export * from '@testing-library/react-native'
