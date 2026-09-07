/** 4pt spacing grid. */
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const

export type SpacingToken = keyof typeof spacing

export const radius = {
  /** Chip icon tile. */
  chip: 10,
  /** Inline button. */
  inline: 12,
  /** Button. */
  button: 14,
  /** Small card. */
  cardSm: 16,
  /** Card. */
  card: 20,
  /** Hero / page / sheet. */
  hero: 28,
  full: 9999,
} as const

export type RadiusToken = keyof typeof radius

/**
 * Elevation. Cards are shadowed and border-less; a dashed border is reserved
 * exclusively for "proposed, not yet real" states (pending approvals).
 */
export interface Elevation {
  shadowColor: string
  shadowOpacity: number
  shadowRadius: number
  shadowOffset: { width: number; height: number }
  /** Android. */
  elevation: number
}

export const elevation = {
  none: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  card: {
    shadowColor: '#1B1917',
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#1B1917',
    shadowOpacity: 0.09,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  sheet: {
    shadowColor: '#1B1917',
    shadowOpacity: 0.16,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
  },
} as const satisfies Record<string, Elevation>

export type ElevationToken = keyof typeof elevation

/** Minimum touch target (WCAG 2.5.5 / platform HIG). */
export const minTouchTarget = 44

export const layout = {
  screenPaddingHorizontal: spacing.lg,
  cardPadding: spacing.md,
  cardGap: spacing.sm,
  sectionGap: spacing.xl,
  tabBarHeight: 56,
  headerHeight: 52,
  maxContentWidth: 720,
} as const

/** Duration tokens in ms. All are halved-to-zero when reduce-motion is on. */
export const motion = {
  instant: 0,
  fast: 150,
  base: 240,
  slow: 360,
  reveal: 560,
} as const

export type MotionToken = keyof typeof motion

/**
 * Standard easing, expressed as a cubic-bezier control-point tuple so it can
 * be handed to Reanimated's `Easing.bezier` and to CSS alike.
 */
export const easing = {
  standard: [0.32, 0.72, 0, 1],
  decelerate: [0.05, 0.7, 0.1, 1],
  accelerate: [0.3, 0, 0.8, 0.15],
} as const satisfies Record<string, readonly [number, number, number, number]>
