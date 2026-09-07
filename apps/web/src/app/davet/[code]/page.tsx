import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { siteConfig } from '@/lib/site-config'
import { REFERRAL_BONUS_DAYS } from '@/lib/referral'

type PageProps = {
  readonly params: Promise<{ readonly code: string }>
}

/** The same alphabet the backend mints codes from: no O/0, I/1, L or U. */
const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTVWXYZ23456789]{8}$/

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params
  const normalized = code.toUpperCase()
  const title = 'Davet'
  const description = `${normalized} davet koduyla Dijital Asistan'ı ${REFERRAL_BONUS_DAYS} gün Pro olarak dene.`

  return {
    title,
    description,
    alternates: { canonical: `/davet/${normalized}` },
    openGraph: {
      title: `${title} — ${siteConfig.name}`,
      description,
      url: `${siteConfig.url}/davet/${normalized}`,
    },
    // An invite link is personal; it should not accumulate in search results.
    robots: { index: false, follow: true },
  }
}

const steps = [
  'Uygulamayı indir ve hesabını oluştur.',
  'Ayarlar > Abonelik > Davet ekranında kodu gir.',
  `İkiniz de ${REFERRAL_BONUS_DAYS} gün Pro kullanırsınız.`,
] as const

export default async function InvitePage({ params }: PageProps) {
  const { code } = await params
  const normalized = code.toUpperCase()

  // A malformed code is a 404 rather than a page that promises a bonus the
  // backend will refuse.
  if (!CODE_PATTERN.test(normalized)) notFound()

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
      <p className="text-[13px] font-medium tracking-wide text-primary uppercase">
        {siteConfig.name}
      </p>
      <h1 className="mt-3 text-[34px] leading-tight font-semibold tracking-tight text-ink sm:text-[42px]">
        Bir arkadaşın seni davet etti.
      </h1>
      <p className="mt-4 text-[17px] leading-8 text-muted">
        Bu kodla Dijital Asistan Pro’yu {REFERRAL_BONUS_DAYS} gün boyunca ücretsiz kullanırsın.
        Davet eden kişi de aynı süreyi kazanır.
      </p>

      <div className="mt-8 rounded-2xl border border-hairline bg-surface p-6">
        <p className="text-[13px] text-faint">Davet kodun</p>
        <p className="mt-2 font-mono text-[32px] tracking-[0.2em] text-ink">{normalized}</p>
      </div>

      <ol className="mt-8 space-y-3 text-[16px] leading-7 text-muted">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[13px] font-semibold text-primary">
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <div className="mt-10 flex flex-wrap gap-3">
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

      <p className="mt-8 text-[13px] leading-6 text-faint">
        Kod yalnızca yeni hesaplarda ve hesap açıldıktan sonraki ilk hafta içinde kullanılabilir.
        Kendi kodunu kullanamazsın.{' '}
        <Link href="/terms" className="text-primary underline underline-offset-2">
          Kullanım Koşulları
        </Link>
      </p>
    </div>
  )
}
