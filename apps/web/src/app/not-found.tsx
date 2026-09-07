import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Sayfa bulunamadı',
  description: 'Aradığın sayfa taşınmış ya da hiç var olmamış olabilir.',
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-start px-4 py-24 sm:px-6 sm:py-32">
      <p className="text-[13px] font-semibold tracking-wide text-primary uppercase">404</p>
      <h1 className="mt-3 text-[34px] leading-tight font-semibold tracking-tight text-ink sm:text-[42px]">
        Bu sayfa burada değil.
      </h1>
      <p className="mt-4 max-w-xl text-[17px] leading-8 text-muted">
        Bağlantı eskimiş ya da adres yanlış yazılmış olabilir. Aşağıdan devam edebilirsin.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex h-12 items-center rounded-full bg-primary px-6 text-[15px] font-medium text-on-primary transition-colors hover:bg-primary-pressed"
        >
          Ana sayfaya dön
        </Link>
        <Link
          href="/support"
          className="inline-flex h-12 items-center rounded-full border border-hairline bg-surface px-6 text-[15px] font-medium text-ink transition-colors hover:bg-surface2"
        >
          Destek al
        </Link>
      </div>
    </div>
  )
}
