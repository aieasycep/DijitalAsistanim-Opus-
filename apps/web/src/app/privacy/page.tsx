/*
  <!--
    LEGAL REVIEW REQUIRED: Bu gizlilik metni ürün ekibi tarafından yazılmıştır ve yayına
    çıkmadan önce hukuk müşaviri tarafından KVKK, GDPR, Google API Services User Data Policy
    ve Apple App Store yönergeleri açısından incelenmelidir.
  -->
*/
import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, LegalTable } from '@/components/LegalPage'
import { googleScopes } from '@/lib/content'
import { siteConfig } from '@/lib/site-config'

const description =
  'Dijital Asistan hangi verileri neden işler, hangi Google ve Microsoft izinlerini ister, verileri ne kadar saklar ve nasıl silersin.'

export const metadata: Metadata = {
  title: 'Gizlilik Politikası',
  description,
  alternates: { canonical: '/privacy' },
  openGraph: {
    title: `Gizlilik Politikası — ${siteConfig.name}`,
    description,
    url: `${siteConfig.url}/privacy`,
  },
}

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Gizlilik Politikası"
      lede="Bir asistanın gelen kutuna erişmesi güven ister. Bu metin; hangi veriyi neden işlediğimizi, kiminle paylaştığımızı, ne kadar sakladığımızı ve nasıl sildiğini sade bir dille anlatır."
      updatedAt={siteConfig.updatedAt}
    >
      {/* LEGAL REVIEW REQUIRED — yayın öncesi hukuk müşaviri onayı alınmalıdır. */}
      <h2 id="veri-sorumlusu">1. Veri sorumlusu</h2>
      <p>
        Bu politikanın veri sorumlusu {siteConfig.company} ({siteConfig.address}) şirketidir.
        Gizlilikle ilgili tüm talepler için{' '}
        <a href={`mailto:${siteConfig.email.privacy}`}>{siteConfig.email.privacy}</a> adresine
        yazabilirsin.
      </p>

      <h2 id="toplanan-veriler">2. Hangi verileri topluyoruz?</h2>
      <p>
        Yalnızca uygulamanın çalışması için gereken veriyi topluyoruz. Toplanan her veri kategorisi
        ve işleme amacı aşağıdadır.
      </p>
      <LegalTable
        caption="Toplanan veri kategorileri, kaynakları ve işleme amaçları"
        head={['Veri', 'Kaynak', 'Neden işlenir?']}
        rows={[
          [
            'Hesap bilgileri (ad, e-posta adresi, profil görseli)',
            'Google / Microsoft / Apple girişi',
            'Hesabını oluşturmak, oturumunu sürdürmek ve seni tanımak için.',
          ],
          [
            'E-posta içeriği (gönderen, konu, gövde, ekler listesi, tarihler)',
            'Bağladığın posta hesapları',
            'Önem sırası çıkarmak, özet üretmek, son tarih ve taahhütleri bulmak için.',
          ],
          [
            'Takvim etkinlikleri (başlık, saat, konum, katılımcılar)',
            'Bağladığın takvimler',
            'Günlük programı, çakışmaları ve boş aralıkları göstermek, toplantı hazırlığı için.',
          ],
          [
            'Görevler ve hatırlatmalar',
            'Google Görevler / Microsoft To Do / uygulama içi',
            'Açık işlerini gün akışına eklemek ve zamanında hatırlatmak için.',
          ],
          [
            'Yakaladığın içerikler (fotoğraf, PDF, belge, bağlantı, not)',
            'Senin yüklediklerin',
            'Tarih, tutar ve kişi gibi bilgileri çıkarıp gün akışına eklemek için.',
          ],
          [
            'Bildirim metinleri (yalnızca Android’de ve yalnızca izin verirsen)',
            'Cihazındaki diğer uygulamalar',
            'Kargo, banka ve rezervasyon bildirimlerinden tarih ve tutar çıkarmak için.',
          ],
          [
            'Cihaz ve bildirim bilgileri (push jetonu, işletim sistemi, uygulama sürümü)',
            'Uygulama',
            'Bildirim gönderebilmek ve hataları giderebilmek için.',
          ],
          [
            'Kullanım olayları (ekran açıldı, brifing okundu gibi)',
            'Uygulama',
            'Ürünü iyileştirmek için. Bu olaylar mail içeriği, isim veya adres taşımaz.',
          ],
          [
            'Abonelik durumu ve makbuz kimliği',
            'App Store / Google Play',
            'Pro özelliklerini açmak ve fatura sorunlarını çözmek için.',
          ],
        ]}
      />
      <p>
        Konum verisini sürekli olarak toplamayız. Sağlık, biyometrik veya finansal kart verisi
        işlemeyiz; ödeme tamamen mağazalar üzerinden yürür ve kart bilgilerini hiç görmeyiz.
      </p>

      <h2 id="hukuki-dayanak">3. Hukuki dayanak</h2>
      <p>
        Hesabını bağlaman ve hizmeti kullanman için gerekli işlemler sözleşmenin ifası; bildirim
        okuma, sesli brifing ve isteğe bağlı entegrasyonlar açık rızan; güvenlik, dolandırıcılık
        önleme ve hata ayıklama ise meşru menfaat kapsamında yürütülür. Rızaya dayanan işlemleri
        uygulama içinden istediğin an geri alabilirsin.
      </p>

      <h2 id="google-izinleri">4. Google izinleri ve Sınırlı Kullanım</h2>
      <p>
        Google hesabını bağladığında aşağıdaki kapsamları isteriz. Her kapsam yalnızca ilgili
        özellik için kullanılır; vermediğin bir kapsam yalnızca o özelliği kapatır.
      </p>
      <LegalTable
        caption="İstenen Google OAuth kapsamları ve gerekçeleri"
        head={['Kapsam', 'Neden gerekli?']}
        rows={googleScopes.map((scope) => [scope.label, scope.why])}
      />
      <p>
        <strong>Sınırlı Kullanım taahhüdü:</strong> Google API’lerinden alınan bilgilerin kullanımı
        ve başka uygulamalara aktarımı, Sınırlı Kullanım gereklilikleri dâhil olmak üzere Google API
        Hizmetleri Kullanıcı Verileri Politikası’na uygundur. Buna göre Google kullanıcı verileri
        yalnızca kullanıcıya görünür özellikleri sağlamak için kullanılır; reklam amacıyla
        kullanılmaz, satılmaz, veri simsarlarına verilmez ve genel amaçlı yapay zekâ modellerinin
        eğitiminde kullanılmaz. İnsan erişimi yalnızca senin açık izninle, yasal zorunlulukla,
        güvenlik amacıyla veya tamamen kimliksizleştirilmiş toplu veriler üzerinde gerçekleşir.
      </p>
      <p>
        Microsoft hesabında Mail.Read, Mail.Send, Calendars.ReadWrite, Tasks.ReadWrite ve
        offline_access kapsamları aynı gerekçelerle istenir. Ayrıntı için{' '}
        <Link href="/oauth">Bağlantı ve izinler</Link> sayfasına bakabilirsin.
      </p>

      <h2 id="yapay-zeka">5. Yapay zekâ nasıl kullanılır?</h2>
      <p>
        Özet, öncelik ve öneri üretmek için içerik, sözleşmeli model sağlayıcılarına şifreli
        bağlantı üzerinden gönderilir. Sağlayıcılarla yapılan sözleşmeler bu verilerin model
        eğitiminde kullanılmasını yasaklar ve verinin işlemeden sonra saklanmamasını şart koşar.
      </p>
      <p>
        Yapay zekâ tarih, tutar, katılımcı, fiyat veya rezervasyon bilgisi uydurmaz. Bir bilgi
        kaynakta doğrulanamıyorsa yazılmaz; arayüz bunun yerine “Kaynakta kesinleşmiyor.” der. Her
        özetin altında kaynağı gösterilir. Asistanın önerdiği hiçbir mail, etkinlik veya görev sen
        onaylamadan gerçekleşmez.
      </p>

      <h2 id="paylasim">6. Kimlerle paylaşıyoruz?</h2>
      <p>
        Verilerini satmıyoruz. Yalnızca hizmetin çalışması için gereken işleyicilerle paylaşıyoruz:
      </p>
      <ul>
        <li>Bulut altyapısı ve veritabanı sağlayıcısı (barındırma, yedekleme)</li>
        <li>Yapay zekâ model sağlayıcıları (özet ve öneri üretimi)</li>
        <li>Push bildirim servisleri (Apple ve Google)</li>
        <li>Abonelik altyapısı (App Store, Google Play ve abonelik doğrulama sağlayıcısı)</li>
        <li>Hata izleme ve ürün analitiği (içerik taşımayan teknik olaylar)</li>
      </ul>
      <p>
        Analitik olaylarında mail içeriği, konu başlığı, kişi adı ve e-posta adresi hiçbir zaman yer
        almaz. Yasal bir yükümlülük doğduğunda talebi inceler, kapsamıyla sınırlı yanıt veririz.
      </p>

      <h2 id="aktarim">7. Yurt dışına aktarım</h2>
      <p>
        Altyapı sağlayıcılarımızın bir kısmı Avrupa Birliği ve Amerika Birleşik Devletleri’nde
        bulunur. Bu aktarımlar standart sözleşme hükümleri ve eşdeğer güvenlik önlemleriyle yapılır.
      </p>

      <h2 id="guvenlik">8. Güvenlik</h2>
      <p>
        Veriler aktarım sırasında ve saklanırken şifrelenir. Sağlayıcı erişim ve yenileme
        anahtarları sunucu tarafında ayrıca şifrelenir; uygulamaya, tarayıcıya veya üçüncü taraflara
        hiçbir zaman gönderilmez. Her kayıt veritabanı seviyesinde yalnızca sahibi olan kullanıcıya
        açıktır; başka bir kullanıcının satırına erişim teknik olarak mümkün değildir. Ekip erişimi
        rol bazlıdır, kayıt altına alınır ve yalnızca destek talebinde bulunduğunda ya da güvenlik
        incelemesi gerektiğinde kullanılır.
      </p>

      <h2 id="saklama">9. Ne kadar saklıyoruz?</h2>
      <p>
        Saklama süresini uygulamadan sen seçersin: 30 gün, 90 gün, 1 yıl veya sen silene kadar.
        Varsayılan süre 90 gündür. Süresi dolan mail, etkinlik, bildirim ve yakalama kayıtları
        otomatik olarak silinir. Hesabını sildiğinde tüm içerik en geç 30 gün içinde kalıcı olarak
        kaldırılır; yasal saklama yükümlülüğü bulunan fatura kayıtları mevzuatın öngördüğü süre
        boyunca ayrı tutulur.
      </p>

      <h2 id="haklarin">10. Hakların</h2>
      <ul>
        <li>Verilerine erişme ve kopyasını isteme</li>
        <li>Yanlış veya eksik bilgilerin düzeltilmesini isteme</li>
        <li>Silinmesini isteme</li>
        <li>İşlemenin sınırlandırılmasına veya işlemeye itiraz etme</li>
        <li>Verilerini taşınabilir bir formatta dışa aktarma</li>
        <li>Verdiğin rızayı geri alma</li>
      </ul>
      <p>
        Bu hakları uygulama içinden Profil {'>'} Gizlilik ve Güvenlik ekranından ya da{' '}
        <a href={`mailto:${siteConfig.email.privacy}`}>{siteConfig.email.privacy}</a> adresine
        yazarak kullanabilirsin. Başvurular en geç 30 gün içinde yanıtlanır.
      </p>

      <h2 id="silme">11. Verilerini silme</h2>
      <p>
        Hesabını ve tüm içeriğini uygulamadan Profil {'>'} Gizlilik ve Güvenlik {'>'} Hesabı Sil
        adımını izleyerek kaldırabilirsin. Uygulamaya erişemiyorsan aynı talebi e-posta ile de
        iletebilirsin. Adımların tamamı için <Link href="/data-deletion">Veri Silme</Link> sayfasına
        bak.
      </p>

      <h2 id="cocuklar">12. Çocuklar</h2>
      <p>
        Hizmet 18 yaşından küçükler için tasarlanmamıştır ve bilerek çocuklardan veri toplamayız.
        Böyle bir kaydın varlığını öğrenirsek gecikmeden sileriz.
      </p>

      <h2 id="cerezler">13. Bu web sitesi</h2>
      <p>
        Bu tanıtım sitesi reklam veya takip çerezi kullanmaz. Yalnızca seçtiğin tema tercihini
        tarayıcının kendi depolamasında saklar; bu bilgi sunucuya gönderilmez.
      </p>

      <h2 id="degisiklikler">14. Değişiklikler</h2>
      <p>
        Bu politikayı güncellersek sayfanın üstündeki tarih değişir. Önemli değişikliklerde uygulama
        içinden ve e-posta ile ayrıca bilgilendiririz.
      </p>

      <h2 id="iletisim">15. İletişim</h2>
      <p>
        {siteConfig.company} · {siteConfig.address} ·{' '}
        <a href={`mailto:${siteConfig.email.privacy}`}>{siteConfig.email.privacy}</a>
      </p>
    </LegalPage>
  )
}
