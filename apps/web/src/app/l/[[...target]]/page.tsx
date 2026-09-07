import type { Metadata } from 'next'
import Link from 'next/link'
import { siteConfig } from '@/lib/site-config'
import { DeepLinkRedirect } from '@/components/DeepLinkRedirect'

type PageProps = {
  readonly params: Promise<{ readonly target?: readonly string[] }>
}

export const metadata: Metadata = {
  title: 'Uygulamayı aç',
  description: 'Bu bağlantı Dijital Asistan uygulamasında açılır.',
  robots: { index: false, follow: false },
}

/** Path segments a link may address. Anything else falls back to Today. */
const ALLOWED_ROOTS = new Set([
  'today',
  'briefing',
  'thread',
  'event',
  'meeting',
  'person',
  'commitment',
  'approval',
  'approvals',
  'followups',
  'capture',
  'search',
  'settings',
])

/**
 * The universal-link landing page.
 *
 * On a phone with the app installed, iOS and Android open the app directly and
 * this page is never rendered. It exists for the other cases: a desktop
 * browser, a phone without the app, or a link opened from an in-app browser
 * that ignores app links. Rather than a dead end it tries the custom scheme
 * once and then offers the stores.
 */
export default async function DeepLinkPage({ params }: PageProps) {
  const { target } = await params
  const segments = (target ?? []).filter((segment) => segment.length > 0)
  const root = segments[0] ?? 'today'
  const path = ALLOWED_ROOTS.has(root) ? segments.join('/') : 'today'

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-20 text-center sm:px-6">
      <DeepLinkRedirect path={path} />

      <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-ink sm:text-[34px]">
        Uygulamada açılıyor…
      </h1>
      <p className="mt-4 text-[16px] leading-7 text-muted">
        Bir şey olmadıysa uygulama bu cihazda kurulu olmayabilir.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href={siteConfig.store.ios.href}
          className="rounded-xl bg-primary px-5 py-3 text-[15px] font-medium text-white"
        >
          {siteConfig.store.ios.available ? siteConfig.store.ios.label : 'iOS için indir'}
        </Link>
        <Link
          href={siteConfig.store.android.href}
          className="rounded-xl border border-hairline px-5 py-3 text-[15px] font-medium text-ink"
        >
          {siteConfig.store.android.available ? siteConfig.store.android.label : 'Android için indir'}
        </Link>
      </div>

      <p className="mt-10 text-[13px] text-faint">
        <Link href="/" className="text-primary underline underline-offset-2">
          Ana sayfaya dön
        </Link>
      </p>
    </div>
  )
}
