#!/usr/bin/env node
/**
 * Generate the app's raster assets from the design tokens.
 *
 * The mark is a sunrise: a disc breaking a horizon line, which is the same
 * idea the morning briefing is built on. Drawing it here rather than checking
 * in a binary from a design tool means the icon can never drift from the brand
 * colours — it is regenerated from `@da/design-tokens` — and the shapes are
 * reviewable as code.
 *
 * Usage: node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const assets = path.join(here, '..', 'assets')

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

/** Encode RGBA pixel data (Uint8Array, 4 bytes per pixel) as a PNG. */
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
  return t < 0.58 ? mixColor(DAWN_TOP, DAWN_MID, t / 0.58) : mixColor(DAWN_MID, DAWN_BOTTOM, (t - 0.58) / 0.42)
}

/**
 * Render the mark.
 *
 * `background` is either a solid colour, 'dawn', or null for transparent;
 * `foreground` is the colour of the disc and horizon. `scale` shrinks the mark
 * inside the canvas, which is how the Android adaptive icon's safe zone and
 * the splash logo are produced from the same geometry.
 */
function render({ size, background, foreground, scale = 1, radius = 0 }) {
  const rgba = Buffer.alloc(size * size * 4)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
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
          if (background === 'dawn') bg = dawnAt(py / size)
          else if (Array.isArray(background)) bg = background

          let inBackground = bg !== null
          if (inBackground && radius > 0) {
            const rx = Math.max(radius - px, px - (size - radius), 0)
            const ry = Math.max(radius - py, py - (size - radius), 0)
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
          const half = (size * scale) / 2
          const nx = (px - size / 2) / half
          // The mark's own centre of mass sits below its geometric origin, so
          // it is shifted up to sit optically centred in the canvas.
          const ny = (py - size / 2) / half + 0.4

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
      const index = (y * size + x) * 4
      const alpha = a / samples
      // Un-premultiply so partially covered edge pixels keep their colour.
      rgba[index] = alpha === 0 ? 0 : Math.round(r / samples / (alpha / 255))
      rgba[index + 1] = alpha === 0 ? 0 : Math.round(g / samples / (alpha / 255))
      rgba[index + 2] = alpha === 0 ? 0 : Math.round(b / samples / (alpha / 255))
      rgba[index + 3] = Math.round(alpha)
    }
  }

  return encodePng(size, size, rgba)
}

mkdirSync(assets, { recursive: true })

const outputs = [
  // Store icon: full bleed, no rounding (the platforms mask it themselves).
  ['icon.png', render({ size: 1024, background: 'dawn', foreground: WHITE, scale: 0.62 })],
  // Android adaptive foreground: the mark inside the 66% safe zone.
  ['adaptive-icon.png', render({ size: 1024, background: null, foreground: WHITE, scale: 0.42 })],
  // Android monochrome (themed icons): single colour, transparent ground.
  ['monochrome-icon.png', render({ size: 1024, background: null, foreground: WHITE, scale: 0.42 })],
  // Splash: the mark alone; the plugin paints the background colour.
  ['splash-icon.png', render({ size: 512, background: null, foreground: INDIGO, scale: 0.8 })],
  // Notification icon: Android renders it as a silhouette, so it must be
  // white-on-transparent with no background at all.
  ['notification-icon.png', render({ size: 96, background: null, foreground: WHITE, scale: 0.86 })],
  // Web favicon, used by the marketing site's app links.
  ['favicon.png', render({ size: 64, background: 'dawn', foreground: WHITE, scale: 0.62, radius: 12 })],
]

for (const [name, buffer] of outputs) {
  writeFileSync(path.join(assets, name), buffer)
  console.log(`wrote assets/${name} (${buffer.length} bytes)`)
}
