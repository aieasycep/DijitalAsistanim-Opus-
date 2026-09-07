import type { Metadata } from 'next'
import Link from 'next/link'
import { googleScopes } from '@/lib/content'
import { siteConfig } from '@/lib/site-config'

const description =
  'Dijital Asistan’ın Google ve Microsoft hesaplarına bağlanırken istediği izinler, her iznin neden gerektiği ve verilerin nasıl kullanıldığı.'

export const metadata: Metadata = {
  title: 'Bağlantı ve izinler',
  description,
  alternates: { canonical: '/oauth' },
  openGraph: {
    title: `Bağlantı ve izinler — ${siteConfig.name}`,
    description,
    url: `${siteConfig.url}/oauth`,
  },
}

const microsoftScopes = [
  {
    label: 'Mail.Read',
    why: 'Outlook maillerini okuyup önceliklendirmek ve özet çıkarmak için.',
  },
  {
    label: 'Mail.Send',
    why: 'Yalnızca sen bir taslağı onayladığında yanıtı senin adına göndermek için.',
  },
  {
    label: 'Calendars.ReadWrite',
    why: 'Programını okumak, çakışmaları görmek ve onayladığın etkinliği oluşturmak için.',
  },
  {
    label: 'Tasks.ReadWrite',
    why: 'Microsoft To Do görevlerini gün akışına eklemek ve onayladığın görevi oluşturmak için.',
  },
  {
    label: 'offline_access',
    why: 'Sen uygulamayı açmadığında da sabah brifingini hazırlayabilmek için oturumun sürdürülmesi.',
  },
] as const

export default function OAuthPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
      <header>
        <p className="text-[13px] font-semibold tracking-wide text-primary uppercase">
          Bağlantı ve izinler
        </p>
        <h1 className="mt-3 text-[34px] leading-tight font-semibold tracking-tight text-ink sm:text-[42px]">
          {siteConfig.name} hesabına neden bağlanır?
        </h1>
        <p className="mt-4 text-[17px] leading-8 text-muted">
          {siteConfig.name}; iOS ve Android için geliştirilen kişisel bir asistan uygulamasıdır.
          Mailini, takvimini ve görevlerini tek yerde okuyarak günün önceliklerini çıkarır, sabah
          brifingi hazırlar, yaklaşan son tarihleri ve senden beklenen yanıtları hatırlatır.
        </p>
      </header>

      <section aria-labelledby="google-izinleri" className="mt-12">
        <h2
          id="google-izinleri"
          className="text-[22px] leading-tight font-semibold tracking-tight text-ink sm:text-[24px]"
        >
          Google izinleri ve gerekçeleri
        </h2>
        <p className="mt-3 text-[16px] leading-8 text-muted">
          Aşağıdaki kapsamlar yalnızca ilgili özelliği kullandığında istenir. Bir kapsamı
          vermezsen uygulama çalışmaya devam eder, sadece o özellik kapalı kalır.
        </p>

        <ul className="mt-6 space-y-3">
          {googleScopes.map((item) => (
            <li key={item.scope} className="rounded-lg border border-hairline bg-surface p-5">
              <p className="text-[15px] font-semibold text-ink">{item.label}</p>
              <p className="mt-0.5 font-mono text-[12px] break-all text-faint">{item.scope}</p>
              <p className="mt-2 text-[15px] leading-7 text-muted">{item.why}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="microsoft-izinleri" className="mt-12">
        <h2
          id="microsoft-izinleri"
          className="text-[22px] leading-tight font-semibold tracking-tight text-ink sm:text-[24px]"
        >
          Microsoft izinleri ve gerekçeleri
        </h2>
        <ul className="mt-6 space-y-3">
          {microsoftScopes.map((item) => (
            <li key={item.label} className="rounded-lg border border-hairline bg-surface p-5">
              <p className="text-[15px] font-semibold text-ink">{item.label}</p>
              <p className="mt-2 text-[15px] leading-7 text-muted">{item.why}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="veri-ne-olur" className="mt-12">
        <h2
          id="veri-ne-olur"
          className="text-[22px] leading-tight font-semibold tracking-tight text-ink sm:text-[24px]"
        >
          Verilere ne olur?
        </h2>
        <ul className="mt-4 space-y-3 pl-5 text-[16px] leading-8 text-muted list-disc">
          <li>
            Mail ve takvim içeriği yalnızca senin hesabına bağlı olarak işlenir; öncelik,
            kategori, özet ve hatırlatma üretmek için kullanılır.
          </li>
          <li>
            Veriler aktarım sırasında ve saklanırken şifrelenir. Verilerin reklamverenlere satılmaz.
          </li>
          <li>
            Google kullanıcı verileri, Google API Hizmetleri Kullanıcı Verileri Politikası’nın
            Sınırlı Kullanım (Limited Use) gerekliliklerine uygun olarak işlenir; reklam amacıyla
            kullanılmaz, satılmaz ve genel amaçlı yapay zekâ modellerinin eğitiminde kullanılmaz.
          </li>
          <li>
            Erişim ve yenileme anahtarları sunucu tarafında şifreli saklanır, cihazına ya da
            üçüncü taraflara hiçbir zaman gönderilmez.
          </li>
          <li>
            Saklama süresini sen seçersin: 30 gün, 90 gün, 1 yıl veya sen silene kadar. Varsayılan
            90 gündür.
          </li>
          <li>
            Bağlantıyı uygulamadan, Google Hesap ayarlarından ya da Microsoft hesap sayfandan
            istediğin an geri alabilirsin; erişim anında durur.
          </li>
        </ul>
      </section>

      <section aria-labelledby="onay-kurali" className="mt-12">
        <h2
          id="onay-kurali"
          className="text-[22px] leading-tight font-semibold tracking-tight text-ink sm:text-[24px]"
        >
          Yazma işlemleri her zaman onaya bağlıdır
        </h2>
        <p className="mt-3 text-[16px] leading-8 text-muted">
          gmail.send, calendar.events, tasks ve Microsoft’taki karşılıkları yalnızca sen bir öneriyi
          onayladığında çalışır. Uygulama kendi başına mail göndermez, etkinlik oluşturmaz, görev
          yazmaz. Onay bekleyen her öneri arayüzde kesik çizgili çerçeveyle gösterilir ve süresi
          dolduğunda kendiliğinden düşer.
        </p>
      </section>

      <div className="mt-12 flex flex-wrap gap-3 border-t border-hairline pt-8">
        <Link
          href="/privacy"
          className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-[14px] font-medium text-on-primary transition-colors hover:bg-primary-pressed"
        >
          Gizlilik Politikası
        </Link>
        <Link
          href="/terms"
          className="inline-flex h-11 items-center rounded-full border border-hairline bg-surface px-5 text-[14px] font-medium text-ink transition-colors hover:bg-surface2"
        >
          Kullanım Koşulları
        </Link>
        <Link
          href="/data-deletion"
          className="inline-flex h-11 items-center rounded-full border border-hairline bg-surface px-5 text-[14px] font-medium text-ink transition-colors hover:bg-surface2"
        >
          Veri Silme
        </Link>
        <a
          href={`mailto:${siteConfig.email.privacy}`}
          className="inline-flex h-11 items-center rounded-full border border-hairline bg-surface px-5 text-[14px] font-medium text-ink transition-colors hover:bg-surface2"
        >
          {siteConfig.email.privacy}
        </a>
      </div>
    </div>
  )
}
