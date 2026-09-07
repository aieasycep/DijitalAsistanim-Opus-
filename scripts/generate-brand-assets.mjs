#!/usr/bin/env node
/**
 * Generate the raster brand assets for both apps from the design tokens.
 *
 * The mark is a sunrise: a disc breaking a horizon line, which is the same
 * idea the morning briefing is built on. Drawing it here rather than checking
 * in a binary from a design tool means the icon can never drift from the brand
 * colours — the values below mirror `@da/design-tokens` — and the shapes stay
 * reviewable as code.
 *
 * Usage: node scripts/generate-brand-assets.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const mobileAssets = path.join(root, 'apps', 'mobile', 'assets')
const webApp = path.join(root, 'apps', 'web', 'src', 'app')

/** Brand values, mirrored from packages/design-tokens/src/palette.ts. */
const INDIGO = [0x5b, 0x5c, 0xe2]
const DAWN_TOP = [0x1e, 0x1e, 0x4c]
const DAWN_MID = [0x3b, 0x3c, 0xa8]
const DAWN_BOTTOM = [0x70, 0x71, 0xea]
const WHITE = [0xff, 0xff, 0xff]

// ── PNG encoding ────────────────────────────────────────────────────────────

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** Encode RGBA pixel data (Buffer, 4 bytes per pixel) as a PNG. */
function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // colour type: RGBA
  header[10] = 0
  header[11] = 0
  header[12] = 0

  // One filter byte (0 = None) per scanline.
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ── Drawing ─────────────────────────────────────────────────────────────────

/** 4× supersampling: the shapes are curves, and aliasing on an app icon shows. */
const SS = 4

function lerp(a, b, t) {
  return a + (b - a) * t
}

function mixColor(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

/** The dawn gradient sampled at `t` (0 = top, 1 = bottom). */
function dawnAt(t) {
  return t < 0.58
    ? mixColor(DAWN_TOP, DAWN_MID, t / 0.58)
    : mixColor(DAWN_MID, DAWN_BOTTOM, (t - 0.58) / 0.42)
}

/**
 * Render the mark on a `width` × `height` canvas.
 *
 * `background` is either a solid colour, 'dawn', or null for transparent;
 * `foreground` is the colour of the disc and horizon. `scale` shrinks the mark
 * relative to the shorter canvas edge, which is how the Android adaptive
 * icon's safe zone and the splash logo come from the same geometry. `offsetX`
 * shifts the mark sideways, in units of the shorter edge, for wide canvases.
 */
function render({
  width,
  height = width,
  background,
  foreground,
  scale = 1,
  radius = 0,
  offsetX = 0,
}) {
  const rgba = Buffer.alloc(width * height * 4)
  const short = Math.min(width, height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS
          const py = y + (sy + 0.5) / SS

          // Background, with an optional rounded-rect mask.
          let bg = null
          if (background === 'dawn') bg = dawnAt(py / height)
          else if (Array.isArray(background)) bg = background

          let inBackground = bg !== null
          if (inBackground && radius > 0) {
            const rx = Math.max(radius - px, px - (width - radius), 0)
            const ry = Math.max(radius - py, py - (height - radius), 0)
            if (Math.hypot(rx, ry) > radius) inBackground = false
          }

          let sr = 0
          let sg = 0
          let sb = 0
          let sa = 0
          if (inBackground && bg) {
            sr = bg[0]
            sg = bg[1]
            sb = bg[2]
            sa = 255
          }

          // The mark, in a normalised square centred on the canvas.
          const half = (short * scale) / 2
          const nx = (px - width / 2 - offsetX * short) / half
          // The mark's own centre of mass sits below its geometric origin, so
          // it is shifted up to sit optically centred in the canvas.
          const ny = (py - height / 2) / half + 0.4

          const horizonY = 0.42
          const discRadius = 0.52
          const discCenterY = 0.42

          // Disc, clipped to above the horizon (a sun rising).
          const inDisc = Math.hypot(nx, ny - discCenterY) <= discRadius && ny <= horizonY - 0.06
          // Horizon bar with rounded ends.
          const barHalfWidth = 0.78
          const barHalfHeight = 0.075
          const barY = horizonY + 0.12
          const bx = Math.max(Math.abs(nx) - (barHalfWidth - barHalfHeight), 0)
          const inBar = Math.hypot(bx, ny - barY) <= barHalfHeight
          // A second, shorter bar below: the "rest of the day, handled".
          const shortHalfWidth = 0.42
          const shortY = barY + 0.3
          const sx2 = Math.max(Math.abs(nx) - (shortHalfWidth - barHalfHeight), 0)
          const inShort = Math.hypot(sx2, ny - shortY) <= barHalfHeight

          if (inDisc || inBar || inShort) {
            sr = foreground[0]
            sg = foreground[1]
            sb = foreground[2]
            sa = 255
          }

          r += sr
          g += sg
          b += sb
          a += sa
        }
      }

      const samples = SS * SS
      const index = (y * width + x) * 4
      const alpha = a / samples
      // Un-premultiply so partially covered edge pixels keep their colour.
      rgba[index] = alpha === 0 ? 0 : Math.round(r / samples / (alpha / 255))
      rgba[index + 1] = alpha === 0 ? 0 : Math.round(g / samples / (alpha / 255))
      rgba[index + 2] = alpha === 0 ? 0 : Math.round(b / samples / (alpha / 255))
      rgba[index + 3] = Math.round(alpha)
    }
  }

  return encodePng(width, height, rgba)
}

const outputs = [
  // ── Mobile ───────────────────────────────────────────────────────────────
  // Store icon: full bleed, no rounding (the platforms mask it themselves).
  [mobileAssets, 'icon.png', { width: 1024, background: 'dawn', foreground: WHITE, scale: 0.62 }],
  // Android adaptive foreground: the mark inside the 66% safe zone.
  [
    mobileAssets,
    'adaptive-icon.png',
    { width: 1024, background: null, foreground: WHITE, scale: 0.42 },
  ],
  // Android monochrome (themed icons): single colour, transparent ground.
  [
    mobileAssets,
    'monochrome-icon.png',
    { width: 1024, background: null, foreground: WHITE, scale: 0.42 },
  ],
  // Splash: the mark alone; the plugin paints the background colour.
  [
    mobileAssets,
    'splash-icon.png',
    { width: 512, background: null, foreground: INDIGO, scale: 0.8 },
  ],
  // Notification icon: Android renders it as a silhouette, so it must be
  // white-on-transparent with no background at all.
  [
    mobileAssets,
    'notification-icon.png',
    { width: 96, background: null, foreground: WHITE, scale: 0.86 },
  ],

  // ── Marketing site ───────────────────────────────────────────────────────
  // Next.js file conventions: these are picked up automatically from app/.
  [
    webApp,
    'icon.png',
    { width: 256, background: 'dawn', foreground: WHITE, scale: 0.62, radius: 48 },
  ],
  // Apple touch icon: iOS masks it itself, so it is square and full bleed.
  [webApp, 'apple-icon.png', { width: 180, background: 'dawn', foreground: WHITE, scale: 0.62 }],
]

for (const [dir, name, options] of outputs) {
  mkdirSync(dir, { recursive: true })
  const buffer = render(options)
  writeFileSync(path.join(dir, name), buffer)
  console.log(`wrote ${path.relative(root, path.join(dir, name))} (${buffer.length} bytes)`)
}
