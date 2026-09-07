/**
 * Type scale. Geist for UI, Lora for editorial narrative (morning briefing
 * prose, weekly review, quoted commitments) — nothing else uses the serif.
 */

export const fontFamily = {
  /** UI sans. Falls back to the platform system font before any web font. */
  sans: 'Geist',
  sansMedium: 'Geist-Medium',
  sansSemibold: 'Geist-SemiBold',
  /** Editorial serif — briefing narrative only. */
  serif: 'Lora',
  serifMedium: 'Lora-Medium',
  /** Tabular figures for clock times and amounts. */
  mono: 'ui-monospace',
} as const

export type FontFamilyKey = keyof typeof fontFamily

export interface TypeStyle {
  fontSize: number
  lineHeight: number
  fontWeight: '400' | '500' | '600' | '700'
  letterSpacing: number
  family: 'sans' | 'serif'
  textTransform?: 'uppercase' | 'none'
}

/**
 * Letter spacing is stored in points (React Native's unit). The design canvas
 * expresses it in em, so a −2% tracking on 28px becomes −0.56.
 */
export const typography = {
  /** "Bugün bilmen gereken 5 şey var." */
  display: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '600',
    letterSpacing: -0.85,
    family: 'sans',
  },
  /** "Günaydın, Yunus" */
  h1: { fontSize: 28, lineHeight: 34, fontWeight: '600', letterSpacing: -0.56, family: 'sans' },
  /** Section / screen headings. */
  h2: { fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: -0.44, family: 'sans' },
  /** Card titles. */
  h3: { fontSize: 17, lineHeight: 23, fontWeight: '600', letterSpacing: -0.17, family: 'sans' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400', letterSpacing: 0, family: 'sans' },
  bodyStrong: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: 0,
    family: 'sans',
  },
  secondary: { fontSize: 14, lineHeight: 20, fontWeight: '400', letterSpacing: 0, family: 'sans' },
  /** Section kickers: "ÖNCELİKLERİN · 5 EYLÜL" */
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.96,
    family: 'sans',
    textTransform: 'uppercase',
  },
  /** Badge text: "ACİL · 08:42" */
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.55, family: 'sans' },
  /** Briefing narrative. */
  editorial: { fontSize: 18, lineHeight: 29, fontWeight: '400', letterSpacing: 0, family: 'serif' },
  /** Weekly review hero: "Haftan nasıl geçti?" */
  editorialDisplay: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '500',
    letterSpacing: -0.68,
    family: 'serif',
  },
  /** Button label. */
  button: { fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: -0.1, family: 'sans' },
} as const satisfies Record<string, TypeStyle>

export type TypeToken = keyof typeof typography
