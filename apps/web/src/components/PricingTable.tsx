import Link from 'next/link'
import { pricingPlans } from '@/lib/content'
import { siteConfig } from '@/lib/site-config'

type PricingTableProps = {
  readonly headingLevel?: 'h1' | 'h2'
  readonly withSectionChrome?: boolean
}

export function PricingTable({
  headingLevel = 'h2',
  withSectionChrome = true,
}: PricingTableProps) {
  const Heading = headingLevel

  return (
    <section
      id="fiyatlar"
      aria-labelledby="fiyatlar-baslik"
      className={withSectionChrome ? 'border-b border-hairline' : undefined}
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-[13px] font-semibold tracking-wide text-primary uppercase">Fiyatlar</p>
          <Heading
            id="fiyatlar-baslik"
            className="mt-3 text-[30px] leading-tight font-semibold tracking-tight text-ink sm:text-[38px]"
          >
            Önce dene, sonra karar ver.
          </Heading>
          <p className="mt-4 text-[16px] leading-8 text-muted sm:text-[17px]">
            Ücretsiz plan tek hesapla süresiz çalışır. Pro’yu {siteConfig.pricing.trialDays} gün
            ücretsiz denersin; beğenmezsen deneme bitmeden bırakırsın, ücret alınmaz.
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          {pricingPlans.map((plan) => (
            <article
              key={plan.id}
              className={
                plan.featured
                  ? 'relative flex flex-col rounded-xl border-2 border-primary bg-surface p-7 shadow-lift'
                  : 'flex flex-col rounded-xl border border-hairline bg-surface p-7'
              }
            >
              {plan.featured ? (
                <span className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-1 text-[12px] font-medium text-on-primary">
                  En çok seçilen
                </span>
              ) : null}

              <h3 className="text-[15px] font-semibold tracking-wide text-faint uppercase">
                {plan.name}
              </h3>
              <p className="mt-3 text-[32px] leading-none font-semibold tracking-tight text-ink">
                {plan.price}
              </p>
              <p className="mt-2 text-[14px] text-muted">{plan.priceNote}</p>
              <p className="mt-4 text-[15px] leading-7 text-muted">{plan.summary}</p>

              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-3 text-[15px] leading-6 text-ink">
                    <svg
                      aria-hidden="true"
                      className={plan.featured ? 'mt-1 shrink-0 text-primary' : 'mt-1 shrink-0 text-success'}
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
                    </svg>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={siteConfig.store.ios.href}
                className={
                  plan.featured
                    ? 'mt-7 inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 text-[15px] font-medium text-on-primary transition-colors hover:bg-primary-pressed'
                    : 'mt-7 inline-flex h-12 items-center justify-center rounded-full border border-hairline bg-bg px-6 text-[15px] font-medium text-ink transition-colors hover:bg-surface2'
                }
              >
                {plan.cta}
              </Link>
            </article>
          ))}
        </div>

        <p className="mt-6 max-w-3xl text-[13px] leading-6 text-faint">
          Abonelik App Store veya Google Play üzerinden yönetilir ve dönem bitmeden iptal
          edilmezse otomatik yenilenir. Fiyatlara KDV dahildir. Arkadaşını davet edersen ikinize de
          ek Pro günü verilir.
        </p>
      </div>
    </section>
  )
}
