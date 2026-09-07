import { fontFamily } from '@da/design-tokens'
import { Platform, type TextStyle } from 'react-native'

/**
 * Font resolution.
 *
 * The Geist and Lora faces are bundled with the binary, but font loading can
 * still fail (a corrupt asset, a device that rejects the file). Rather than
 * render invisible or default-serif text, resolution falls back to the
 * platform's own UI face — which is also what the design system asks for on
 * iOS body copy. `setFontsLoaded` is called once by the root layout after
 * `useFonts` settles.
 */

let fontsLoaded = false

export function setFontsLoaded(loaded: boolean): void {
  fontsLoaded = loaded
}

export function areFontsLoaded(): boolean {
  return fontsLoaded
}

export type FontRole = 'sans' | 'serif'
export type FontWeight = '400' | '500' | '600' | '700'

const SANS_BY_WEIGHT: Record<FontWeight, string> = {
  '400': `${fontFamily.sans}-Regular`,
  '500': `${fontFamily.sans}-Medium`,
  '600': `${fontFamily.sans}-SemiBold`,
  '700': `${fontFamily.sans}-SemiBold`,
}

const SERIF_BY_WEIGHT: Record<FontWeight, string> = {
  '400': `${fontFamily.serif}-Regular`,
  '500': `${fontFamily.serif}-Medium`,
  '600': `${fontFamily.serif}-Medium`,
  '700': `${fontFamily.serif}-Medium`,
}

const SYSTEM_SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' })

/**
 * The `fontFamily` + `fontWeight` pair for a role and weight.
 *
 * When the bundled faces are unavailable the family is omitted entirely so the
 * platform picks its own UI font and honours the weight, instead of naming a
 * font that does not exist (which iOS silently renders as Helvetica).
 */
export function resolveFont(
  role: FontRole,
  weight: FontWeight,
): Pick<TextStyle, 'fontFamily' | 'fontWeight'> {
  if (!fontsLoaded) {
    return role === 'serif'
      ? { fontFamily: SYSTEM_SERIF, fontWeight: weight }
      : { fontWeight: weight }
  }
  return {
    fontFamily: role === 'serif' ? SERIF_BY_WEIGHT[weight] : SANS_BY_WEIGHT[weight],
    fontWeight: weight,
  }
}

/** Asset map handed to `useFonts` in the root layout. */
export const FONT_ASSETS = {
  'Geist-Regular': require('../../assets/fonts/Geist-Regular.ttf'),
  'Geist-Medium': require('../../assets/fonts/Geist-Medium.ttf'),
  'Geist-SemiBold': require('../../assets/fonts/Geist-SemiBold.ttf'),
  'Lora-Regular': require('../../assets/fonts/Lora-Regular.ttf'),
  'Lora-Medium': require('../../assets/fonts/Lora-Medium.ttf'),
} as const
