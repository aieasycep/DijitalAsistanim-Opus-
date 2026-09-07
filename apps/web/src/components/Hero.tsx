import Link from 'next/link'
import { BriefingShowcase } from '@/components/BriefingShowcase'
import { DeviceFrame } from '@/components/DeviceFrame'
import { siteConfig } from '@/lib/site-config'

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-hairline">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[820px] max-w-[140vw] -translate-x-1/2 rounded-full bg-primary-soft blur-3xl"
      />
      <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="da-rise">
          <p className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface px-3 py-1.5 text-[13px] text-muted">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
            iOS ve Android · Türkçe
          </p>

          <h1 className="mt-5 text-[38px] leading-[1.05] font-semibold tracking-tight text-ink sm:text-[52px] lg:text-[60px]">
            Bugün bilmen gereken 5 şey var.
          </h1>

          <p className="mt-5 max-w-xl text-[17px] leading-8 text-muted sm:text-[19px]">
            Mailini, takvimini ve yapman gerekenleri tek yerde anlar. Gürültüyü değil, önemli olanı
            gösterir.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href={siteConfig.store.ios.href}
              className="inline-flex h-12 items-center rounded-full bg-primary px-6 text-[15px] font-medium text-on-primary transition-colors hover:bg-primary-pressed"
            >
              {siteConfig.store.ios.available ? 'App Store’dan indir' : 'iPhone için başla'}
            </Link>
            <Link
              href={siteConfig.store.android.href}
              className="inline-flex h-12 items-center rounded-full border border-hairline bg-surface px-6 text-[15px] font-medium text-ink transition-colors hover:bg-surface2"
            >
              {siteConfig.store.android.available ? 'Google Play’den indir' : 'Android için başla'}
            </Link>
          </div>

          <p className="mt-4 text-[13px] text-faint">
            Ücretsiz planla başla. Pro’yu {siteConfig.pricing.trialDays} gün ücretsiz denersin,
            istediğin an bırakırsın.
          </p>

          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-hairline pt-6">
            <div>
              <dt className="text-[12px] text-faint">Sabah brifingi</dt>
              <dd className="mt-1 text-[15px] font-medium text-ink">90 saniyede gün</dd>
            </div>
            <div>
              <dt className="text-[12px] text-faint">Onay şartı</dt>
              <dd className="mt-1 text-[15px] font-medium text-ink">Sensiz gönderim yok</dd>
            </div>
            <div>
              <dt className="text-[12px] text-faint">Kaynak</dt>
              <dd className="mt-1 text-[15px] font-medium text-ink">Her satırda kaynak</dd>
            </div>
          </dl>
        </div>

        <div className="da-rise">
          <DeviceFrame caption="Uygulamadaki sabah brifingi ekranının örneği" tone="dawn">
            <BriefingShowcase compact />
          </DeviceFrame>
        </div>
      </div>
    </section>
  )
}
