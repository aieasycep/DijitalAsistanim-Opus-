/**
 * Raw colour ramp — the single place hex literals are allowed to live.
 *
 * Values are transcribed verbatim from the primary visual source of truth,
 * `01 Tasarım Sistemi` in the Claude Design canvas (see
 * `docs/DESIGN_SOURCE_MAPPING.md`). Nothing else in the codebase may hard-code
 * a colour: consume `lightTheme` / `darkTheme` from `./theme` instead.
 */
export const palette = {
  // Brand — indigo. Reserved for AI marks, primary actions, selected tabs and
  // links. Never decorative.
  indigo500: '#5B5CE2',
  indigo600: '#4B4CCB',
  indigo50: '#EDEDFC',
  indigo700: '#4547C9',
  indigo300: '#A9AAF5',
  indigo400: '#8586F2',

  // Semantic — coral (critical / security), amber (deadline / waiting),
  // green (done / approved), blue (transport / calendar).
  coral500: '#E0553F',
  coral50: '#FCEDE9',
  coral700: '#C7432F',
  coral300: '#F08B78',

  amber500: '#E09A1C',
  amber50: '#FDF2DC',
  amber700: '#9A6300',
  amber300: '#F0B85A',

  green500: '#2FA062',
  green50: '#E4F5EA',
  green700: '#1E7A47',
  green300: '#6FCF97',

  blue500: '#3B82E6',
  blue50: '#E7F0FD',
  blue700: '#2262BE',

  // Warm neutrals — the app never uses a pure-grey surface ramp.
  warmBg: '#F5F4F0',
  white: '#FFFFFF',
  warmSurface2: '#F0EFEB',
  warmHairline: '#E9E7E1',
  paper: '#FBFAF7',

  ink: '#1A1917',
  inkSecondary: '#6B6860',
  inkTertiary: '#9B978E',
  inkDisabled: '#B8B4AA',

  // Dark theme neutrals.
  darkBg: '#141311',
  darkSurface: '#1F1E1B',
  darkSurface2: 'rgba(255,255,255,0.08)',
  darkHairline: 'rgba(255,255,255,0.10)',
  darkText: '#F2F0EB',
  darkSecondary: '#A39F96',
  darkTertiary: '#7A776F',
  darkDisabled: '#5C5A54',
  darkOnPrimary: '#0F0F2A',
  darkPaper: '#1A1917',

  transparent: 'transparent',
} as const

export type PaletteKey = keyof typeof palette

/**
 * Brand gradients. Each is expressed as an ordered colour stop list plus an
 * angle so both CSS (`linear-gradient`) and `expo-linear-gradient` can render
 * the identical ramp without duplicating the definition.
 */
export const gradients = {
  /** Morning briefing, brand moments. */
  dawn: {
    angle: 160,
    colors: ['#1E1E4C', '#3B3CA8', '#7071EA'] as const,
    locations: [0, 0.58, 1] as const,
  },
  /** Voice, audio briefing, initial analysis. */
  night: {
    angle: 180,
    colors: ['#15153A', '#25266A', '#3B3CA8'] as const,
    locations: [0, 0.6, 1] as const,
  },
  /** Evening close. */
  dusk: {
    angle: 160,
    colors: ['#2A1E3F', '#4A3A8A', '#8C6BD6'] as const,
    locations: [0, 0.55, 1] as const,
  },
} as const

export type GradientName = keyof typeof gradients

/** Serialise a gradient token to a CSS `linear-gradient(...)` string. */
export function gradientToCss(name: GradientName): string {
  const g = gradients[name]
  const stops = g.colors.map((c, i) => `${c} ${Math.round((g.locations[i] ?? 0) * 100)}%`)
  return `linear-gradient(${g.angle}deg, ${stops.join(', ')})`
}

/**
 * Convert a gradient's CSS angle to the `start`/`end` unit-square points that
 * `expo-linear-gradient` expects. CSS angles run clockwise from "to top";
 * the unit square runs from top-left (0,0) to bottom-right (1,1).
 */
export function gradientToNativePoints(name: GradientName): {
  start: { x: number; y: number }
  end: { x: number; y: number }
} {
  const rad = ((gradients[name].angle - 90) * Math.PI) / 180
  const dx = Math.cos(rad)
  const dy = Math.sin(rad)
  return {
    start: { x: 0.5 - dx / 2, y: 0.5 - dy / 2 },
    end: { x: 0.5 + dx / 2, y: 0.5 + dy / 2 },
  }
}
