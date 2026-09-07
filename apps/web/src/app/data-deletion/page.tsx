/*
  <!--
    LEGAL REVIEW REQUIRED: Bu veri silme metni ürün ekibi tarafından yazılmıştır ve yayına
    çıkmadan önce hukuk müşaviri tarafından KVKK, GDPR silme hakkı ve Google API Services
    User Data Policy açısından incelenmelidir.
  -->
*/
import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, LegalTable } from '@/components/LegalPage'
import { siteConfig } from '@/lib/site-config'

const description =
  'Dijital Asistan hesabını ve verilerini nasıl silersin: uygulama içi adımlar, e-posta ile silme talebi, hangi verinin ne zaman kalktığı.'

export const metadata: Metadata = {
  title: 'Veri Silme',
  description,
  alternates: { canonical: '/data-deletion' },
  openGraph: {
    title: `Veri Silme — ${siteConfig.name}`,
    description,
    url: `${siteConfig.url}/data-deletion`,
  },
}

export default function DataDeletionPage() {
  return (
    <LegalPage
      title="Veri Silme"
      lede="Verilerini silmek, bağlamak kadar kolay olmalı. Aşağıda uygulama içinden ve e-posta ile silmenin adımları, hangi verinin ne zaman kalktığı ve sonrasında ne olduğu yazıyor."
      updatedAt={siteConfig.updatedAt}
    >
      {/* LEGAL REVIEW REQUIRED — yayın öncesi hukuk müşaviri onayı alınmalıdır. */}
      <h2 id="uygulama-ici">1. Uygulamadan silme (önerilen yol)</h2>
      <p>Uygulamaya girebiliyorsan en hızlı yol budur ve silme anında başlar.</p>
      <ol>
        <li>Uygulamayı aç ve alt menüden <strong>Profil</strong> sekmesine geç.</li>
        <li>
          <strong>Gizlilik ve Güvenlik</strong> bölümünü aç.
        </li>
        <li>
          <strong>Hesabı Sil</strong> seçeneğine dokun.
        </li>
        <li>
          Onay ekranında ne silineceğini gözden geçir ve talebi doğrula. İşlem geri alınamaz.
        </li>
      </ol>
      <p>
        Yalnızca geçmişi temizlemek istiyorsan aynı ekrandaki{' '}
        <strong>Geçmişi Sil</strong> seçeneğini kullanabilirsin; hesabın açık kalır, işlenmiş mail,
        etkinlik ve yakalama kayıtların silinir.
      </p>

      <h2 id="eposta">2. E-posta ile silme</h2>
      <p>
        Uygulamaya erişemiyorsan (telefonunu değiştirdiysen, uygulamayı kaldırdıysan veya girişte
        sorun yaşıyorsan) silme talebini e-posta ile de iletebilirsin.
      </p>
      <ul>
        <li>
          Adres: <a href={`mailto:${siteConfig.email.deletion}`}>{siteConfig.email.deletion}</a>
        </li>
        <li>
          Konu: <code>Hesap silme talebi</code>
        </li>
        <li>Mesajda hesabına kayıtlı e-posta adresini belirt.</li>
        <li>
          Talebi, hesabına kayıtlı adresten göndermen kimlik doğrulamayı hızlandırır; farklı bir
          adresten yazarsan ek doğrulama isteyebiliriz.
        </li>
      </ul>
      <p>
        Talebi aldığımızı 72 saat içinde teyit eder, silmeyi en geç 30 gün içinde tamamlar ve
        tamamlandığında sana bildiririz.
      </p>

      <h2 id="ne-silinir">3. Ne siliniyor, ne zaman?</h2>
      <LegalTable
        caption="Silinen veri türleri ve silme süreleri"
        head={['Veri', 'Ne zaman silinir?']}
        rows={[
          ['Sağlayıcı erişim ve yenileme anahtarları', 'Anında; senkronizasyon aynı anda durur.'],
          ['İşlenmiş mail, konu akışı ve özetler', 'Anında; yedeklerden 30 gün içinde.'],
          ['Takvim etkinlikleri, görevler, taahhütler ve hatırlatmalar', 'Anında.'],
          ['Yakaladığın fotoğraf, PDF ve belgeler', 'Anında; dosya deposundan 30 gün içinde.'],
          ['Asistan sohbetleri ve AI hafıza kayıtları', 'Anında.'],
          ['Bildirim kayıtları ve push jetonları', 'Anında.'],
          ['Hesap bilgileri ve tercihler', 'Anında.'],
          [
            'Analitik olaylar (içerik taşımayan, kimliksizleştirilmiş)',
            'Kimlikle ilişkisi anında kesilir; toplu sayımlar kalır.',
          ],
          [
            'Fatura ve makbuz kayıtları',
            'Yasal saklama süresi boyunca ayrı tutulur, ardından silinir.',
          ],
        ]}
      />

      <h2 id="baglanti-kesme">4. Yalnızca bir hesabın bağlantısını kesmek</h2>
      <p>
        Hesabını tümüyle silmek istemiyorsan tek bir bağlantıyı kaldırabilirsin: Profil {'>'} Bağlı
        Hesaplar {'>'} ilgili hesap {'>'} <strong>Bağlantıyı Kes</strong>. Erişim anahtarı silinir,
        senkronizasyon durur ve o hesaptan türeyen kayıtlar temizlenir.
      </p>
      <p>
        İzni sağlayıcı tarafından da geri alabilirsin: Google için Google Hesabı {'>'} Güvenlik{' '}
        {'>'} Üçüncü taraf uygulama erişimi, Microsoft için Microsoft hesabı {'>'} Gizlilik {'>'}{' '}
        Uygulamalar ve hizmetler. İzni oradan kaldırsan bile uygulamadaki kayıtların silinmesi için
        yukarıdaki adımları izlemelisin.
      </p>

      <h2 id="saklama">5. Silmeden önce: saklama süreni değiştirme</h2>
      <p>
        Her şeyi silmek yerine ne kadar geriye gidileceğini de ayarlayabilirsin. Profil {'>'}{' '}
        Gizlilik ve Güvenlik {'>'} Saklama Süresi ekranından 30 gün, 90 gün, 1 yıl veya sen silene
        kadar seçeneklerinden birini seçersin. Varsayılan {siteConfig.retention.default}. Süreyi
        kısalttığında sınırın dışında kalan kayıtlar ilk temizlik turunda silinir.
      </p>

      <h2 id="disa-aktarim">6. Silmeden önce verilerini indir</h2>
      <p>
        Silme geri alınamaz. İstersen önce Profil {'>'} Gizlilik ve Güvenlik {'>'} Verilerimi Dışa
        Aktar adımından kopyanı isteyebilirsin; hazır olduğunda bildirim gelir ve indirme bağlantısı
        sınırlı süre geçerli olur.
      </p>

      <h2 id="sonrasi">7. Silmeden sonra ne olur?</h2>
      <ul>
        <li>Hesabınla giriş yapılamaz; brifing ve bildirimler durur.</li>
        <li>Aynı e-posta adresiyle yeniden kayıt olabilirsin, ancak eski verilerin geri gelmez.</li>
        <li>
          Aktif bir aboneliğin varsa mağaza tarafında ayrıca iptal etmen gerekir; hesap silmek
          aboneliği kendiliğinden iptal etmez.
        </li>
      </ul>

      <h2 id="iletisim">8. İletişim</h2>
      <p>
        Silme süreciyle ilgili her soru için{' '}
        <a href={`mailto:${siteConfig.email.privacy}`}>{siteConfig.email.privacy}</a> adresine
        yazabilirsin. Verilerin nasıl işlendiğini{' '}
        <Link href="/privacy">Gizlilik Politikası</Link> sayfasında bulabilirsin.
      </p>
    </LegalPage>
  )
}
