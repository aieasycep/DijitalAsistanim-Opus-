/*
  <!--
    LEGAL REVIEW REQUIRED: Bu kullanım koşulları taslağı ürün ekibi tarafından yazılmıştır ve
    yayına çıkmadan önce hukuk müşaviri tarafından tüketici mevzuatı, mesafeli satış ve mağaza
    (App Store / Google Play) yönergeleri açısından incelenmelidir.
  -->
*/
import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage } from '@/components/LegalPage'
import { siteConfig } from '@/lib/site-config'

const description =
  'Dijital Asistan Kullanım Koşulları: hizmetin kapsamı, abonelik ve iptal, sorumluluk sınırları ve hesabın sona ermesi.'

export const metadata: Metadata = {
  title: 'Kullanım Koşulları',
  description,
  alternates: { canonical: '/terms' },
  openGraph: {
    title: `Kullanım Koşulları — ${siteConfig.name}`,
    description,
    url: `${siteConfig.url}/terms`,
  },
}

export default function TermsPage() {
  return (
    <LegalPage
      title="Kullanım Koşulları"
      lede="Bu koşullar, Dijital Asistan uygulamasını ve bu web sitesini kullanırken geçerli olan kuralları açıklar. Uygulamayı kullanarak bu koşulları kabul etmiş olursun."
      updatedAt={siteConfig.updatedAt}
    >
      {/* LEGAL REVIEW REQUIRED — yayın öncesi hukuk müşaviri onayı alınmalıdır. */}
      <h2 id="taraflar">1. Taraflar ve kapsam</h2>
      <p>
        Hizmet, {siteConfig.company} ({siteConfig.address}) tarafından sunulur. Bu koşullar; mobil
        uygulama, bu web sitesi ve bağlı tüm hizmetler için geçerlidir. Koşulları kabul etmiyorsan
        hizmeti kullanamazsın.
      </p>

      <h2 id="hizmet">2. Hizmetin tanımı</h2>
      <p>
        {siteConfig.name}; bağladığın e-posta, takvim ve görev hesaplarını okuyarak günün
        önceliklerini çıkaran, brifing hazırlayan ve hatırlatma yapan kişisel bir asistandır. Hizmet
        bir e-posta istemcisi ya da takvim uygulamasının yerine geçmez; mevcut hesaplarının üzerine
        bir okuma ve önceliklendirme katmanı ekler.
      </p>

      <h2 id="hesap">3. Hesap ve bağlantılar</h2>
      <ul>
        <li>Hesabın yalnızca sana aittir; giriş bilgilerini paylaşmamalısın.</li>
        <li>
          Bağladığın posta ve takvim hesapları üzerinde yetkili olduğunu beyan edersin. İşveren
          hesaplarında kurumsal politikalara uymak senin sorumluluğundadır.
        </li>
        <li>
          Bağlantıyı istediğin an uygulamadan ya da sağlayıcının hesap ayarlarından geri
          alabilirsin.
        </li>
        <li>Hizmeti kullanmak için en az 18 yaşında olman gerekir.</li>
      </ul>

      <h2 id="onay">4. Yapay zekâ çıktıları ve onay kuralı</h2>
      <p>
        Asistanın ürettiği özet, öneri ve taslaklar yardımcı niteliktedir; hukuki, finansal veya
        tıbbi tavsiye değildir. Kararların sorumluluğu sana aittir.
      </p>
      <p>
        Onayın olmadan hiçbir mail gönderilmez, hiçbir etkinlik veya görev oluşturulmaz. Onaya
        sunulan her öneri arayüzde açıkça işaretlenir ve belirli bir süre içinde onaylanmazsa düşer.
        Kaynakta doğrulanamayan tarih, tutar veya isim asla üretilmez.
      </p>

      <h2 id="kullanim">5. Kabul edilebilir kullanım</h2>
      <ul>
        <li>
          Hizmeti hukuka aykırı bir amaçla ya da başkalarının haklarını ihlal ederek kullanamazsın.
        </li>
        <li>Toplu istenmeyen mesaj göndermek için kullanamazsın.</li>
        <li>
          Sistemi tersine mühendislikle çözmeye, güvenlik önlemlerini aşmaya veya altyapıya aşırı
          yük bindirmeye çalışamazsın.
        </li>
        <li>Yetkin olmayan bir kişinin hesabını bağlayamazsın.</li>
      </ul>

      <h2 id="abonelik">6. Abonelik, deneme ve iptal</h2>
      <p>
        Ücretsiz plan süresiz kullanılabilir. Pro abonelik {siteConfig.pricing.monthly} / ay veya{' '}
        {siteConfig.pricing.annual} / yıl olarak sunulur ve {siteConfig.pricing.trialDays} günlük
        ücretsiz deneme içerir. Satın alma ve yenileme App Store veya Google Play üzerinden yürür;
        ödeme bilgilerini biz görmeyiz.
      </p>
      <ul>
        <li>
          Abonelik, dönem bitiminden en az 24 saat önce iptal edilmezse otomatik olarak yenilenir.
        </li>
        <li>
          İptali mağazanın abonelikler bölümünden yaparsın. Dönem sonuna kadar Pro özellikleri açık
          kalır, sonrasında hesabın Ücretsiz plana döner.
        </li>
        <li>
          Ücret iadeleri ilgili mağazanın kendi politikasına tabidir; talebi mağaza üzerinden
          iletmen gerekir.
        </li>
        <li>
          Fiyat değişikliklerini yürürlüğe girmeden önce uygulama içinden ve e-posta ile bildiririz.
        </li>
        <li>
          Davet programıyla kazanılan ek Pro günleri nakde çevrilemez ve kötüye kullanım hâlinde
          geri alınabilir.
        </li>
      </ul>

      <h2 id="mulkiyet">7. Fikri mülkiyet</h2>
      <p>
        Uygulama, tasarım, marka ve içerik {siteConfig.company} şirketine aittir. Hesabınla işlenen
        mail, takvim ve belge içerikleri ise sana aittir; bu içerikleri yalnızca hizmeti sağlamak
        için işleriz.
      </p>

      <h2 id="kullanilabilirlik">8. Hizmetin kullanılabilirliği</h2>
      <p>
        Hizmeti kesintisiz sunmak için çalışırız; ancak bakım, sağlayıcı arızası veya bağlı
        olduğumuz üçüncü taraf servislerdeki kesintiler nedeniyle geçici duraksamalar olabilir.
        Özellikleri geliştirmek, değiştirmek veya makul bildirimle sonlandırmak hakkımız saklıdır.
      </p>

      <h2 id="sorumluluk">9. Sorumluluğun sınırı</h2>
      <p>
        Hizmet “olduğu gibi” sunulur. Yürürlükteki mevzuatın izin verdiği ölçüde; dolaylı zararlar,
        kâr kaybı ve veri kaybı bakımından sorumluluğumuz sınırlıdır. Toplam sorumluluğumuz, talebin
        doğduğu tarihten önceki 12 ayda ödediğin abonelik bedelini aşmaz. Tüketici mevzuatından
        doğan haklarına bu madde hâlel getirmez.
      </p>

      <h2 id="fesih">10. Sona erme</h2>
      <p>
        Hesabını istediğin an silebilirsin; adımlar <Link href="/data-deletion">Veri Silme</Link>{' '}
        sayfasında yer alır. Bu koşulların ağır ihlali hâlinde hesabını askıya alabilir veya
        kapatabiliriz; bu durumda kullanılmamış dönem için orantılı iade değerlendirilir.
      </p>

      <h2 id="uygulanacak-hukuk">11. Uygulanacak hukuk ve uyuşmazlık</h2>
      <p>
        Bu koşullara Türkiye Cumhuriyeti hukuku uygulanır. Uyuşmazlıklarda İstanbul Merkez
        (Çağlayan) Mahkemeleri ve İcra Daireleri yetkilidir. Tüketici sıfatını taşıyorsan Tüketici
        Hakem Heyetleri ve Tüketici Mahkemeleri’ne başvurma hakkın saklıdır.
      </p>

      <h2 id="iletisim">12. İletişim</h2>
      <p>
        Sorular için <a href={`mailto:${siteConfig.email.legal}`}>{siteConfig.email.legal}</a>{' '}
        adresine yazabilir, gizlilikle ilgili konularda{' '}
        <Link href="/privacy">Gizlilik Politikası</Link> sayfasına bakabilirsin.
      </p>
    </LegalPage>
  )
}
