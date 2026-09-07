import {
  type ColorSchemePreference,
  type Theme,
  type ThemeName,
  resolveTheme,
} from '@da/design-tokens'
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import { AccessibilityInfo, Appearance, useColorScheme } from 'react-native'

/**
 * Theme context.
 *
 * Dark mode is a full role swap, not a background flip: every component reads
 * `theme.colors.<role>` and therefore changes correctly with no per-screen
 * work. `reduceMotion` lives here too because the same components that read
 * colours are the ones that decide whether to animate.
 */

export interface ThemeContextValue {
  theme: Theme
  /** What the user chose, which may be `system`. */
  preference: ColorSchemePreference
  setPreference: (preference: ColorSchemePreference) => void
  /** OS accessibility setting, OR-ed with the user's in-app preference. */
  reduceMotion: boolean
  setReduceMotionPreference: (value: boolean) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export interface ThemeProviderProps {
  children: ReactNode
  initialPreference?: ColorSchemePreference
  initialReduceMotion?: boolean
  /** Called when the user changes the preference, so it can be persisted. */
  onPreferenceChange?: (preference: ColorSchemePreference) => void
  onReduceMotionChange?: (value: boolean) => void
}

export function ThemeProvider({
  children,
  initialPreference = 'system',
  initialReduceMotion = false,
  onPreferenceChange,
  onReduceMotionChange,
}: ThemeProviderProps) {
  const systemScheme = useColorScheme()
  const [preference, setPreferenceState] = useState<ColorSchemePreference>(initialPreference)
  const [userReduceMotion, setUserReduceMotion] = useState(initialReduceMotion)
  const [osReduceMotion, setOsReduceMotion] = useState(false)

  useEffect(() => {
    let cancelled = false
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setOsReduceMotion(enabled)
    })
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setOsReduceMotion,
    )
    return () => {
      cancelled = true
      subscription.remove()
    }
  }, [])

  // Keep the native root view in step so the gap during a screen transition
  // does not flash the opposite theme. React Native spells "follow the OS" as
  // 'unspecified' rather than null.
  useEffect(() => {
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference)
  }, [preference])

  const value = useMemo<ThemeContextValue>(() => {
    const theme = resolveTheme(preference, (systemScheme as ThemeName | null) ?? null)
    return {
      theme,
      preference,
      setPreference: (next) => {
        setPreferenceState(next)
        onPreferenceChange?.(next)
      },
      reduceMotion: osReduceMotion || userReduceMotion,
      setReduceMotionPreference: (next) => {
        setUserReduceMotion(next)
        onReduceMotionChange?.(next)
      },
    }
  }, [
    preference,
    systemScheme,
    osReduceMotion,
    userReduceMotion,
    onPreferenceChange,
    onReduceMotionChange,
  ])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useThemeContext must be used inside <ThemeProvider>')
  return ctx
}

/** The common case: just the resolved theme. */
export function useTheme(): Theme {
  return useThemeContext().theme
}

export function useReduceMotion(): boolean {
  return useThemeContext().reduceMotion
}
