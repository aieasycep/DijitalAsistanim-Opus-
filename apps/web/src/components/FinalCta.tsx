import Link from 'next/link'
import { siteConfig } from '@/lib/site-config'

export function FinalCta() {
  return (
    <section id="indir" aria-labelledby="indir-baslik">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="da-dusk overflow-hidden rounded-2xl px-6 py-14 text-center sm:px-12">
          <h2
            id="indir-baslik"
            className="mx-auto max-w-2xl text-[30px] leading-tight font-semibold tracking-tight text-white sm:text-[40px]"
          >
            Yarın sabah, gün sana hazır gelsin.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[16px] leading-8 text-white/80">
            Hesabını bağla, ilk analizi bekle, sabah brifinginle uyan. Onayın olmadan tek bir mail
            bile gitmez.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href={siteConfig.store.ios.href}
              className="inline-flex h-12 items-center rounded-full bg-white px-6 text-[15px] font-medium text-[#2a1e3f] transition-opacity hover:opacity-90"
            >
              {siteConfig.store.ios.available ? 'App Store’dan indir' : 'iPhone için başla'}
            </Link>
            <Link
              href={siteConfig.store.android.href}
              className="inline-flex h-12 items-center rounded-full border border-white/40 px-6 text-[15px] font-medium text-white transition-colors hover:bg-white/10"
            >
              {siteConfig.store.android.available ? 'Google Play’den indir' : 'Android için başla'}
            </Link>
          </div>

          <p className="mt-6 text-[13px] text-white/70">
            Ücretsiz plan süresiz. Pro {siteConfig.pricing.monthly} / ay veya{' '}
            {siteConfig.pricing.annual} / yıl, {siteConfig.pricing.trialDays} gün ücretsiz deneme.
          </p>
        </div>
      </div>
    </section>
  )
}
