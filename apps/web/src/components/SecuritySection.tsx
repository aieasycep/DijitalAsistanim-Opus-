import Link from 'next/link'
import { securityPoints } from '@/lib/content'

export function SecuritySection() {
  return (
    <section id="guvenlik" aria-labelledby="guvenlik-baslik" className="border-b border-hairline bg-surface">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-[13px] font-semibold tracking-wide text-primary uppercase">Güven</p>
          <h2
            id="guvenlik-baslik"
            className="mt-3 text-[30px] leading-tight font-semibold tracking-tight text-ink sm:text-[38px]"
          >
            Mailin senin. Kararlar da senin.
          </h2>
          <p className="mt-4 text-[16px] leading-8 text-muted sm:text-[17px]">
            Bir asistanın gelen kutuna erişmesi güven ister. Bu yüzden sınırları baştan çizdik ve
            ürünün her yerinde aynı kuralları uyguluyoruz.
          </p>
        </div>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {securityPoints.map((point) => (
            <li key={point.title} className="rounded-xl border border-hairline bg-bg p-6">
              <h3 className="text-[17px] font-semibold tracking-tight text-ink">{point.title}</h3>
              <p className="mt-2 text-[14px] leading-7 text-muted">{point.body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/privacy"
            className="inline-flex h-11 items-center rounded-full border border-hairline bg-surface px-5 text-[14px] font-medium text-ink transition-colors hover:bg-surface2"
          >
            Gizlilik Politikası
          </Link>
          <Link
            href="/data-deletion"
            className="inline-flex h-11 items-center rounded-full border border-hairline bg-surface px-5 text-[14px] font-medium text-ink transition-colors hover:bg-surface2"
          >
            Verimi nasıl silerim?
          </Link>
          <Link
            href="/oauth"
            className="inline-flex h-11 items-center rounded-full border border-hairline bg-surface px-5 text-[14px] font-medium text-ink transition-colors hover:bg-surface2"
          >
            İstenen izinler
          </Link>
        </div>
      </div>
    </section>
  )
}
