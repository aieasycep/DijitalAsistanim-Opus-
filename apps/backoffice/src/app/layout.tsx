import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import type { ReactNode } from 'react'
import { messages } from '@/lib/messages'
import './globals.css'

/**
 * The root layout is deliberately thin: it sets the typeface, the theme colour
 * and the document language, and nothing else. The signed-in chrome lives in
 * `NavShell`, which each protected page renders after `requireStaff()` has
 * returned an operator — so the sign-in and unauthorised pages, which have no
 * operator, are not wrapped in navigation they cannot use.
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr" className={geist.variable}>
      <body className="min-h-dvh bg-bg text-ink antialiased">{children}</body>
    </html>
  )
}
