import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import { cookies } from 'next/headers'
import type { ReactNode } from 'react'
import { THEME_COOKIE, parseTheme, themeAttribute } from '@/components/shell'
import { messages } from '@/lib/messages'
import './globals.css'

/**
 * The root layout: the typeface, the document language, and the theme.
 *
 * It is deliberately thin. The signed-in chrome lives in `app/(dash)/layout.tsx`,
 * which resolves the session first — so the sign-in and forbidden pages, which
 * have no operator, are not wrapped in navigation they could not use.
 *
 * ---------------------------------------------------------------------------
 * WHY THE THEME IS STAMPED HERE, AND FROM A COOKIE
 * ---------------------------------------------------------------------------
 *
 * `data-theme` is on the `<html>` element of the first response. That is what
 * makes a dark-mode operator's page arrive dark instead of arriving light and
 * correcting itself a frame later — the flash every "read localStorage in an
 * effect" implementation has. Reading it from a cookie is what lets the server
 * know the answer at all.
 *
 * `system` stamps nothing, on purpose: the absence of the attribute is what
 * lets the `prefers-color-scheme` block in `globals.css` apply, and what lets
 * an explicit choice beat the OS in both directions.
 *
 * Reading a cookie makes every route dynamic. That is correct here rather than
 * a cost: this console has no page that may be served from a static cache, and
 * `proxy.ts` already refuses an unauthenticated request before it reaches one.
 */

const geist = Geist({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-geist',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: `${messages.app.suffix} — ${messages.app.name}`,
    template: `%s — ${messages.app.suffix}`,
  },
  description: messages.app.tagline,
  applicationName: `${messages.app.name} ${messages.app.suffix}`,
  // An internal tool has no business in an index, and the header set in
  // next.config.mjs says the same thing to crawlers that ignore this.
  robots: { index: false, follow: false, nocache: true },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f4f0' },
    { media: '(prefers-color-scheme: dark)', color: '#141311' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const store = await cookies()
  const theme = parseTheme(store.get(THEME_COOKIE)?.value)
  const attribute = themeAttribute(theme)

  return (
    <html
      lang="tr"
      className={geist.variable}
      {...(attribute === undefined ? {} : { 'data-theme': attribute })}
    >
      <body className="min-h-dvh bg-bg text-ink antialiased">{children}</body>
    </html>
  )
}
