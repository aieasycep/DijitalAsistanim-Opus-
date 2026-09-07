import { siteConfig } from '@/lib/site-config'

export type NavLink = {
  readonly href: string
  readonly label: string
}

export const navLinks: readonly NavLink[] = [
  { href: '/#nasil-calisir', label: 'Nasıl çalışır' },
  { href: '/#ozellikler', label: 'Özellikler' },
  { href: '/#guvenlik', label: 'Güvenlik' },
  { href: '/pricing', label: 'Fiyatlar' },
  { href: '/#sss', label: 'SSS' },
]

export type Integration = {
  readonly name: string
  readonly family: 'Google' | 'Microsoft' | 'Apple'
  readonly detail: string
}

export const integrations: readonly Integration[] = [
  { name: 'Gmail', family: 'Google', detail: 'Gelen kutusu ve konu akışları' },
  { name: 'Google Takvim', family: 'Google', detail: 'Etkinlikler ve katılımcılar' },
  { name: 'Google Görevler', family: 'Google', detail: 'Açık işler ve son tarihler' },
  { name: 'Outlook', family: 'Microsoft', detail: 'İş ve kişisel posta kutuları' },
  { name: 'Microsoft Takvim', family: 'Microsoft', detail: 'Toplantı davetleri' },
  { name: 'Microsoft To Do', family: 'Microsoft', detail: 'Görev listeleri' },
  { name: 'Apple Takvim', family: 'Apple', detail: 'Cihazındaki kişisel takvim' },
]

export type HowItWorksStep = {
  readonly index: string
  readonly title: string
  readonly body: string
  readonly detail: string
}

export const howItWorks: readonly HowItWorksStep[] = [
  {
    index: '01',
    title: 'Hesabını bağla',
    body: 'Google veya Microsoft hesabını bağlarsın. Şifreni hiçbir zaman görmeyiz; bağlantıyı sağlayıcının kendi onay ekranından verirsin.',
    detail: 'Yaklaşık 40 saniye',
  },
  {
    index: '02',
    title: 'İlk analiz',
    body: 'Son haftaların maili ve takvimi bir kez taranır. Kimin senden ne beklediği, hangi tarihin yaklaştığı, neyin cevapsız kaldığı çıkarılır.',
    detail: 'Arka planda 2-3 dakika',
  },
  {
    index: '03',
    title: 'Her sabah brifingin hazır',
    body: 'Uyandığında günün beş başlığı seni bekler. Gün içinde bir şey değişirse haberin olur; değişmezse sessiz kalırız.',
    detail: 'Her sabah, senin saatinde',
  },
]

export type FeatureCopy = {
  readonly id: string
  readonly eyebrow: string
  readonly title: string
  readonly body: string
  readonly bullets: readonly string[]
}

export const features: readonly FeatureCopy[] = [
  {
    id: 'sabah-brifingi',
    eyebrow: 'Sabah brifingi',
    title: 'Günü okumakla değil, bilerek başla.',
    body: 'Sabah brifingi gecede biriken her şeyi tek bir sayfaya indirir: seni bekleyen işler, günün programı, yaklaşan son tarihler ve başkalarından beklediklerin. Gürültü değil, karar.',
    bullets: [
      'Öncelikler, program, senden beklenenler ve beklediklerin ayrı bölümlerde',
      'Her satırın altında geldiği mail ya da etkinlik; kaynağa bir dokunuşla dönersin',
      'Öğle ve akşam brifingi ile gün ortasında ne değiştiğini görürsün',
      'Sesli brifing ile yolda dinlersin',
    ],
  },
  {
    id: 'mail-zekasi',
    eyebrow: 'Mail zekâsı',
    title: 'Bin mail değil, seni ilgilendiren yedi mail.',
    body: 'Her mail; aciliyet, gönderenin sana yakınlığı, geçmiş davranışın ve içindeki tarihe göre değerlendirilir. Önemli olan öne çıkar, kampanyalar arkada kalır.',
    bullets: [
      'Kategoriler: yanıt bekleyen, son tarih, toplantı, ödeme, güvenlik, kargo, bilgi',
      '“Bu önemli değil” dediğinde bir daha öne çıkmaz — tercihin öğrenilir',
      'VIP kişiler her zaman en üstte; sustur dediğin gönderen bir daha rahatsız etmez',
      'Özet, mailin kendi cümlelerine dayanır; kaynakta olmayan hiçbir şey yazılmaz',
    ],
  },
  {
    id: 'toplanti-hazirligi',
    eyebrow: 'Toplantı hazırlığı',
    title: 'Toplantıya hazırlıksız girme.',
    body: 'Toplantıdan önce kiminle görüşeceğini, o kişiyle son yazışmanı, açık kalan konuları ve verdiğin sözleri toparlar. Odaya girerken bağlam sende olur.',
    bullets: [
      'Katılımcılar, geçmiş yazışmalar ve paylaşılan dosyalar tek kartta',
      'Bir önceki toplantıda söz verdiğin maddeler hatırlatılır',
      'Konum ve yol süresi takvimden okunur; çakışma varsa önceden söylenir',
      'Toplantı bitince takip edilecekler açık iş olarak önerilir',
    ],
  },
  {
    id: 'akilli-planlama',
    eyebrow: 'Akıllı planlama',
    title: 'Günün boşluklarını senin yerine görür.',
    body: 'Takvimindeki gerçek boşlukları, yoğunluğunu ve sessiz saatlerini bilir. Bir işi ne zaman yapabileceğini tahmin etmez, takviminden okur.',
    bullets: [
      'Çakışan toplantılar ve arka arkaya biten günler önceden işaretlenir',
      'Odak bloğu önerisi: günün en uygun sessiz aralığı',
      'Hatırlatmalar “akşam”, “yarın sabah” gibi insanca zamanlarla kurulur',
      'Sessiz saatlerinde kritik olmayan hiçbir bildirim gelmez',
    ],
  },
  {
    id: 'ai-hafiza',
    eyebrow: 'AI hafıza',
    title: '“Ayşe’ye ne söz vermiştim?” diye sor, cevabını al.',
    body: 'Asistan; mailini, takvimini, notlarını ve yakaladığın belgeleri hatırlar. Kendi cümlelerinle sorarsın, kaynağıyla birlikte cevap gelir.',
    bullets: [
      'Doğal dille soru: “Geçen ay imzaladığımız sözleşmenin bitiş tarihi neydi?”',
      'Her cevabın altında kaynağı; kaynakta kesinleşmeyen bilgi yazılmaz',
      'Fotoğraf, PDF ve ekran görüntüsü yakala; tarih, tutar ve isim çıkarılsın',
      'Kişi hafızası: kiminle ne konuştuğun, kimin sana ne borçlu olduğu',
    ],
  },
]

export type SecurityPoint = {
  readonly title: string
  readonly body: string
}

export const securityPoints: readonly SecurityPoint[] = [
  {
    title: 'Onaysız hiçbir şey gönderilmez',
    body: 'Asistan bir mail taslağı, takvim etkinliği veya görev önerdiğinde bu bir tekliftir. Sen onaylamadan hiçbir mail gönderilmez, hiçbir etkinlik oluşturulmaz. Önerileri kesik çizgili çerçevesinden tanırsın.',
  },
  {
    title: 'Uydurma bilgi yok',
    body: 'Tarih, tutar, katılımcı ve fiyat yalnızca kaynakta geçiyorsa yazılır. Kaynak net değilse asistan bunu saklamaz, açıkça “Kaynakta kesinleşmiyor.” der.',
  },
  {
    title: 'Verilerin şifrelenir',
    body: 'Veriler aktarım sırasında ve saklanırken şifrelenir. Sağlayıcı erişim anahtarların sunucu tarafında şifreli tutulur ve hiçbir zaman cihazına ya da üçüncü taraflara gönderilmez.',
  },
  {
    title: 'Reklam modeli yok',
    body: 'Verilerin reklamverenlere satılmaz. Gelirimiz yalnızca abonelikten gelir; mail içeriğin, isimler ve adresler hiçbir analiz aracına gönderilmez.',
  },
  {
    title: 'Erişim yalnızca sana ait',
    body: 'Her kayıt, veritabanı seviyesinde yalnızca sahibi olan kullanıcıya açıktır. Başka bir kullanıcının satırını görmek teknik olarak mümkün değildir.',
  },
  {
    title: 'Ne kadar kalacağına sen karar verirsin',
    body: 'Saklama süresini 30 gün, 90 gün, 1 yıl ya da sen silene kadar olarak seçersin. Varsayılan 90 gündür; süre dolan içerik otomatik silinir.',
  },
]

export type PricingPlan = {
  readonly id: 'free' | 'pro'
  readonly name: string
  readonly price: string
  readonly priceNote: string
  readonly summary: string
  readonly cta: string
  readonly featured: boolean
  readonly features: readonly string[]
}

export const pricingPlans: readonly PricingPlan[] = [
  {
    id: 'free',
    name: 'Ücretsiz',
    price: '0 TL',
    priceNote: 'Süresiz',
    summary: 'Tek hesapla günün nasıl göründüğünü gör. Kredi kartı istemiyoruz.',
    cta: 'Ücretsiz başla',
    featured: false,
    features: [
      '1 e-posta hesabı',
      '1 takvim',
      'Sabah brifingi',
      'Temel önemli mail ayıklama',
      'Günlük 5 asistan sorusu',
      'Manuel hatırlatmalar',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: `${siteConfig.pricing.monthly} / ay`,
    priceNote: `veya ${siteConfig.pricing.annual} / yıl — ${siteConfig.pricing.trialDays} gün ücretsiz deneme`,
    summary: 'Bütün hesapların, bütün gün. Asistanın tam kapasitede çalışır.',
    cta: `${siteConfig.pricing.trialDays} gün ücretsiz dene`,
    featured: true,
    features: [
      'Çoklu hesap (Gmail, Outlook, birden fazla takvim)',
      'Sınırsız asistan',
      'Öğle ve akşam brifingi',
      'Toplantı hazırlığı',
      'Akıllı takip',
      'Sesli brifing',
      'AI hafıza',
      'VIP kişiler',
      'Gelişmiş planlama',
      'Android bildirim zekâsı',
      'Gelişmiş yakalama (fotoğraf, PDF, belge)',
      'Haftalık içgörüler',
    ],
  },
]

export type FaqItem = {
  readonly question: string
  readonly answer: string
}

export const faqItems: readonly FaqItem[] = [
  {
    question: 'Verilerim güvende mi?',
    answer:
      'Veriler aktarım sırasında ve saklanırken şifrelenir. Verilerin reklamverenlere satılmaz. Sağlayıcı erişim anahtarların sunucu tarafında şifreli saklanır, uygulamaya hiçbir zaman gönderilmez ve her kayıt yalnızca sahibi olan hesaba açıktır.',
  },
  {
    question: 'Hangi izinler isteniyor?',
    answer:
      'Google tarafında gmail.readonly (mailleri okuyup önceliklendirmek için), gmail.send (yalnızca sen onayladığında yanıt göndermek için), calendar.readonly ve calendar.events (programını okumak ve onayladığın etkinliği oluşturmak için) ve tasks (açık işlerini görmek için). Microsoft tarafında Mail.Read, Mail.Send, Calendars.ReadWrite ve Tasks.ReadWrite karşılıkları istenir. İzinleri ilk açılışta değil, ilgili özelliği kullandığın anda isteriz.',
  },
  {
    question: 'Mailimi gerçekten okuyor mu?',
    answer:
      'Öncelik ve özet çıkarabilmek için mailin içeriği işlenir. İşleme sonucu yalnızca senin hesabına bağlı olarak saklanır, insanlar tarafından okunmaz, reklam için kullanılmaz ve model eğitimine verilmez. Ne kadar süre saklanacağını Profil > Gizlilik ve Güvenlik ekranından sen seçersin.',
  },
  {
    question: 'AI ne zaman mail gönderir?',
    answer:
      'Sen onaylamadan asla. Asistan bir yanıt önerdiğinde bu bir taslaktır; kesik çizgili çerçevesinden “henüz gerçek değil” olduğunu anlarsın. Metni düzenleyebilir, gönderebilir ya da reddedebilirsin. Onaylanmayan taslak bir süre sonra kendiliğinden düşer.',
  },
  {
    question: 'Aboneliğimi nasıl iptal ederim?',
    answer:
      'Abonelik App Store veya Google Play üzerinden yönetilir. Mağazanın abonelikler bölümünden tek dokunuşla iptal edersin; dönem sonuna kadar Pro özellikleri açık kalır, sonra hesabın Ücretsiz plana döner. Verilerin silinmez, yalnızca Pro özellikleri kapanır.',
  },
  {
    question: 'Hangi platformlarda çalışıyor?',
    answer:
      'iOS ve Android için ayrı ayrı tasarlanmış tek bir uygulama. iOS tarafında kilit ekranı widget’ları ve canlı etkinlikler, Android tarafında bildirim zekâsı ve widget desteği bulunur. Ayrı bir masaüstü uygulaması yoktur; brifinglerini istersen sesli dinlersin.',
  },
  {
    question: 'Android bildirimleri ne işe yarıyor?',
    answer:
      'Android’de, izin verirsen, diğer uygulamaların bildirimleri de okunabilir. Kargo, banka ve rezervasyon bildirimlerinden tarih ve tutar çıkarılıp günün akışına eklenir. Bu izin tamamen isteğe bağlıdır, istediğin an kapatılır ve bildirim metinleri saklama süren dolduğunda silinir.',
  },
  {
    question: 'Verimi nasıl silerim?',
    answer:
      'Uygulamada Profil > Gizlilik ve Güvenlik > Hesabı Sil adımını izlersin; hesabın ve tüm içeriğin en geç 30 gün içinde kalıcı olarak silinir. Dilersen yalnızca geçmişi silip hesabını tutabilirsin. Uygulamaya erişemiyorsan aynı talebi e-posta ile de iletebilirsin.',
  },
  {
    question: 'Bağlantıyı kesersem ne olur?',
    answer:
      'Bir hesabı çıkardığında o hesaptan gelen senkronizasyon anında durur ve erişim anahtarı silinir. O hesaptan türeyen mail, etkinlik ve görev kayıtları da temizlenir. İzni ayrıca Google Hesap ayarlarından ya da Microsoft hesap sayfandan da geri alabilirsin.',
  },
  {
    question: 'Asistan yanlış bir şey söylerse?',
    answer:
      'Her özetin altında kaynağı vardır; tek dokunuşla orijinal maile ya da etkinliğe dönersin. Kaynakta doğrulanmayan tarih, tutar ve isimler hiç yazılmaz — asistan bunun yerine “Kaynakta kesinleşmiyor.” der. Yanlış bulduğun her satırı işaretleyebilirsin, bir sonraki sefere öğrenilir.',
  },
]

export type BriefingSectionCopy = {
  readonly label: string
  readonly items: readonly {
    readonly title: string
    readonly meta: string
    readonly tone: 'critical' | 'warning' | 'primary' | 'success' | 'info'
  }[]
}

export const briefingDemo = {
  greeting: 'Günaydın Deniz.',
  date: 'Pazartesi, 7 Eylül',
  lede: 'Bugün üç toplantın var ve ikisi arka arkaya. Sabahın ilk saati boş; teklifi orada bitirebilirsin.',
  stats: [
    { value: '5', label: 'öne çıkan' },
    { value: '3', label: 'toplantı' },
    { value: '1', label: 'son tarih' },
  ],
  sections: [
    {
      label: 'Öncelikler',
      items: [
        {
          title: 'Ayşe Demir teklifi bekliyor',
          meta: 'Cuma 16:42 · yanıtlanmadı',
          tone: 'critical',
        },
        {
          title: 'Kira sözleşmesi imzası bugün son gün',
          meta: 'Emlak ofisi · son tarih',
          tone: 'warning',
        },
      ],
    },
    {
      label: 'Program',
      items: [
        { title: '11:00 Ürün toplantısı', meta: '3 katılımcı · gündem hazır', tone: 'primary' },
        { title: '14:30 Tedarikçi görüşmesi', meta: 'Çevrim içi · 45 dk', tone: 'primary' },
      ],
    },
    {
      label: 'Başkalarından beklediklerin',
      items: [
        { title: 'Mert’ten bütçe tablosu', meta: '4 gündür bekliyor', tone: 'info' },
        { title: 'Kargo teslimde', meta: 'Bugün 18:00’e kadar', tone: 'success' },
      ],
    },
  ],
} as const

export type GoogleScopeCopy = {
  readonly scope: string
  readonly label: string
  readonly why: string
}

export const googleScopes: readonly GoogleScopeCopy[] = [
  {
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    label: 'gmail.readonly',
    why: 'Maillerini okuyup önceliklendirebilmek, özet çıkarmak ve içindeki son tarihleri bulabilmek için gerekir. Bu izin olmadan sabah brifingi üretilemez.',
  },
  {
    scope: 'https://www.googleapis.com/auth/gmail.send',
    label: 'gmail.send',
    why: 'Yalnızca sen bir taslağı onayladığında yanıtı senin adına göndermek için kullanılır. Otomatik gönderim yoktur; bu izin yalnızca onay verdiğin anda çalışır.',
  },
  {
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    label: 'calendar.readonly',
    why: 'Günlük programını, çakışmalarını ve boş aralıklarını okuyabilmek için gerekir. Toplantı hazırlığı ve akıllı planlama bu veriye dayanır.',
  },
  {
    scope: 'https://www.googleapis.com/auth/calendar.events',
    label: 'calendar.events',
    why: 'Sen onayladığında etkinlik oluşturmak veya güncellemek için kullanılır. Onay vermediğin hiçbir etkinlik takvimine yazılmaz.',
  },
  {
    scope: 'https://www.googleapis.com/auth/tasks',
    label: 'tasks',
    why: 'Google Görevler’deki açık işlerini gün akışına ekleyebilmek ve onayladığın görevi oluşturabilmek için gerekir.',
  },
]
