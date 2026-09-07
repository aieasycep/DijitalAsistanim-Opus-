import type { Metadata } from 'next'
import Link from 'next/link'
import { Faq } from '@/components/Faq'
import { siteConfig } from '@/lib/site-config'

const description =
  'Dijital Asistan destek merkezi: hesap bağlama, bildirimler, abonelik ve veri silme konularında yardım ve iletişim adresleri.'

export const metadata: Metadata = {
  title: 'Destek',
  description,
  alternates: { canonical: '/support' },
  openGraph: {
    title: `Destek — ${siteConfig.name}`,
    description,
    url: `${siteConfig.url}/support`,
  },
}

const channels = [
  {
    title: 'Genel destek',
    body: 'Kurulum, hesap bağlama, bildirimler ve uygulama içi her konu. Hafta içi ilk yanıt genellikle 1 iş günü içinde verilir.',
    email: siteConfig.email.support,
    action: 'Destek ekibine yaz',
  },
  {
    title: 'Gizlilik ve veri talepleri',
    body: 'Verilerine erişim, düzeltme, taşıma ve silme talepleri. KVKK ve GDPR kapsamındaki başvurular bu adrese iletilir.',
    email: siteConfig.email.privacy,
    action: 'Gizlilik ekibine yaz',
  },
  {
    title: 'Hesap ve veri silme',
    body: 'Uygulamaya erişemiyorsan hesabını ve tüm içeriğini e-posta ile de sildirebilirsin.',
    email: siteConfig.email.deletion,
    action: 'Silme talebi gönder',
  },
] as const

const troubleshooting = [
  {
    title: 'Brifingim gelmedi',
    body: 'Profil > Bildirimler ekranından brifing saatini ve bildirim iznini kontrol et. Sessiz saatlerin brifing saatiyle çakışıyorsa bildirim ertelenir. Hesap bağlantın süresi dolduysa uygulama üst kısımda uyarı gösterir; bağlantıyı yenilemen yeterlidir.',
  },
  {
    title: 'Bir hesabı bağlayamıyorum',
    body: 'Kurumsal Google Workspace veya Microsoft 365 hesaplarında yöneticinin üçüncü taraf uygulamalara izin vermesi gerekebilir. Onay ekranında hata alıyorsan hata metnini destek adresine iletmen çözümü hızlandırır.',
  },
  {
    title: 'Bir mail yanlış önceliklendirildi',
    body: 'Mailin altındaki geri bildirim düğmelerini kullan: “Bu önemli değil” dersen benzerleri geri plana alınır, “VIP yap” dersen o gönderen hep öne çıkar. Tercihlerin bir sonraki analizde uygulanır.',
  },
  {
    title: 'Aboneliğim görünmüyor',
    body: 'Satın alma mağaza tarafında tamamlanmış ancak uygulamaya yansımamışsa Profil > Abonelik ekranından satın alımları geri yükle. Sorun sürerse mağaza makbuz numarasıyla bize yaz.',
  },
] as const

export default function SupportPage() {
  return (
    <>
      <section className="border-b border-hairline">
        <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
          <h1 className="text-[34px] leading-tight font-semibold tracking-tight text-ink sm:text-[42px]">
            Destek
          </h1>
          <p className="mt-4 max-w-2xl text-[17px] leading-8 text-muted">
            Takıldığın yerde seni bekletmeyiz. Aşağıdaki adımlar çoğu sorunu çözer; çözmezse
            doğrudan bize yaz.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {channels.map((channel) => (
              <div key={channel.email} className="da-card flex flex-col p-6">
                <h2 className="text-[17px] font-semibold tracking-tight text-ink">
                  {channel.title}
                </h2>
                <p className="mt-2 flex-1 text-[14px] leading-7 text-muted">{channel.body}</p>
                <a
                  href={`mailto:${channel.email}`}
                  className="mt-5 inline-flex h-11 items-center justify-center rounded-full border border-hairline bg-bg px-4 text-[14px] font-medium text-ink transition-colors hover:bg-surface2"
                >
                  {channel.action}
                </a>
                <p className="mt-2 text-center text-[12px] text-faint">{channel.email}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="cozumler-baslik" className="border-b border-hairline bg-surface">
        <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
          <h2
            id="cozumler-baslik"
            className="text-[28px] leading-tight font-semibold tracking-tight text-ink sm:text-[34px]"
          >
            Sık karşılaşılan durumlar
          </h2>

          <div className="mt-8 divide-y divide-hairline border-t border-hairline">
            {troubleshooting.map((item) => (
              <details key={item.title} className="group py-1">
                <summary className="flex cursor-pointer list-none items-start gap-4 rounded-xs py-4 text-[16px] leading-7 font-medium text-ink">
                  <span className="flex-1">{item.title}</span>
                  <svg
                    aria-hidden="true"
                    className="mt-1.5 shrink-0 text-faint transition-transform group-open:rotate-180"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </summary>
                <p className="pb-5 pr-8 text-[15px] leading-7 text-muted">{item.body}</p>
              </details>
            ))}
          </div>

          <div className="mt-10 rounded-xl border border-hairline bg-bg p-6">
            <h3 className="text-[16px] font-semibold text-ink">Kurumsal bilgiler</h3>
            <p className="mt-2 text-[14px] leading-7 text-muted">
              {siteConfig.company}
              <br />
              {siteConfig.address}
            </p>
            <p className="mt-3 text-[14px] leading-7 text-muted">
              Gizlilik metinleri için{' '}
              <Link href="/privacy" className="text-primary underline underline-offset-2">
                Gizlilik Politikası
              </Link>{' '}
              ve{' '}
              <Link href="/terms" className="text-primary underline underline-offset-2">
                Kullanım Koşulları
              </Link>{' '}
              sayfalarına bakabilirsin.
            </p>
          </div>
        </div>
      </section>

      <Faq title="Diğer sorular" />
    </>
  )
}
