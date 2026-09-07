/**
 * WCAG contrast maths. Used by the token test suite to prove every
 * text-on-surface pairing the design system ships clears 4.5:1, in both
 * themes — rule 3 of the design system.
 */

function parseColor(input: string): { r: number; g: number; b: number; a: number } | null {
  const value = input.trim()

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value)
  if (hex) {
    let body = hex[1] as string
    if (body.length === 3) {
      body = body
        .split('')
        .map((c) => c + c)
        .join('')
    }
    const r = parseInt(body.slice(0, 2), 16)
    const g = parseInt(body.slice(2, 4), 16)
    const b = parseInt(body.slice(4, 6), 16)
    const a = body.length === 8 ? parseInt(body.slice(6, 8), 16) / 255 : 1
    return { r, g, b, a }
  }

  const rgba = /^rgba?\(([^)]+)\)$/i.exec(value)
  if (rgba) {
    const parts = (rgba[1] as string).split(',').map((p) => Number(p.trim()))
    const [r, g, b, a] = parts
    if (r === undefined || g === undefined || b === undefined) return null
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null
    return { r, g, b, a: a === undefined || !Number.isFinite(a) ? 1 : a }
  }

  return null
}

function channelLuminance(channel8Bit: number): number {
  const c = channel8Bit / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/**
 * Flatten a possibly-translucent colour over an opaque backdrop, then return
 * its relative luminance. Translucent tokens (the dark theme's soft fills)
 * only have a meaningful contrast once composited.
 */
export function relativeLuminance(color: string, backdrop = '#FFFFFF'): number {
  const fg = parseColor(color)
  if (!fg) throw new Error(`Unsupported colour format: ${color}`)

  let { r, g, b } = fg
  if (fg.a < 1) {
    const bg = parseColor(backdrop)
    if (!bg) throw new Error(`Unsupported backdrop colour format: ${backdrop}`)
    r = fg.r * fg.a + bg.r * (1 - fg.a)
    g = fg.g * fg.a + bg.g * (1 - fg.a)
    b = fg.b * fg.a + bg.b * (1 - fg.a)
  }

  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
}

/** WCAG 2.1 contrast ratio, 1..21. Both colours are composited over `base`. */
export function contrastRatio(foreground: string, background: string, base = '#FFFFFF'): number {
  const bgOpaque = parseColor(background)
  const flattenedBackground =
    bgOpaque && bgOpaque.a < 1
      ? `rgb(${[
          bgOpaque.r * bgOpaque.a + (parseColor(base)?.r ?? 255) * (1 - bgOpaque.a),
          bgOpaque.g * bgOpaque.a + (parseColor(base)?.g ?? 255) * (1 - bgOpaque.a),
          bgOpaque.b * bgOpaque.a + (parseColor(base)?.b ?? 255) * (1 - bgOpaque.a),
        ]
          .map(Math.round)
          .join(',')})`
      : background

  const l1 = relativeLuminance(foreground, flattenedBackground)
  const l2 = relativeLuminance(flattenedBackground, base)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

export const WCAG_AA_NORMAL = 4.5
export const WCAG_AA_LARGE = 3

export function meetsAA(foreground: string, background: string, large = false): boolean {
  return contrastRatio(foreground, background) >= (large ? WCAG_AA_LARGE : WCAG_AA_NORMAL)
}
