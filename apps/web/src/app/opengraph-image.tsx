import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ImageResponse } from 'next/og'
import { siteConfig } from '@/lib/site-config'

export const alt = `${siteConfig.name} — ${siteConfig.tagline}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * The card people see when the site is shared.
 *
 * The fonts are read from the repository rather than fetched, so the build
 * does not depend on a font CDN being reachable, and the mark is the same
 * sunrise geometry as the app icon — drawn here in CSS because the shapes are
 * simple enough that a second rasteriser would be the wrong trade.
 */
export default async function OpengraphImage() {
  const fontsDir = path.join(process.cwd(), 'src', 'assets', 'fonts')
  const [regular, semibold] = await Promise.all([
    readFile(path.join(fontsDir, 'Geist-Regular.ttf')),
    readFile(path.join(fontsDir, 'Geist-SemiBold.ttf')),
  ])

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 88,
        backgroundImage: 'linear-gradient(160deg, #1e1e4c 0%, #3b3ca8 58%, #7071ea 100%)',
        fontFamily: 'Geist',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div
          style={{
            width: 76,
            height: 76,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
          }}
        >
          <div
            style={{
              width: 52,
              height: 26,
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              background: '#ffffff',
            }}
          />
          <div style={{ width: 72, height: 8, borderRadius: 4, background: '#ffffff' }} />
          <div style={{ width: 38, height: 8, borderRadius: 4, background: '#ffffff' }} />
        </div>
        <div style={{ fontSize: 34, fontWeight: 600, color: '#ffffff', letterSpacing: -0.5 }}>
          {siteConfig.name}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
        <div
          style={{
            fontSize: 82,
            fontWeight: 600,
            color: '#ffffff',
            letterSpacing: -2.5,
            lineHeight: 1.06,
            maxWidth: 900,
          }}
        >
          {siteConfig.tagline}
        </div>
        <div style={{ fontSize: 34, color: 'rgba(255,255,255,0.76)', maxWidth: 820 }}>
          Mailin, takvimin ve yapman gerekenler tek yerde. Gerisi sessizde.
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Geist', data: regular, weight: 400, style: 'normal' },
        { name: 'Geist', data: semibold, weight: 600, style: 'normal' },
      ],
    },
  )
}
