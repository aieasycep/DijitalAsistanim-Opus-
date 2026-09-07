import type { MessageTree } from '../../engine.ts'

export const capture = {
  title: 'Yakala',
  subtitle: 'Gördüğün her şeyi at, biz anlamlandıralım.',

  kind: {
    camera: 'Fotoğraf çek',
    photo: 'Galeriden seç',
    pdf: 'PDF ekle',
    file: 'Dosya ekle',
    link: 'Bağlantı ekle',
    text: 'Not yaz',
  },
  kindHint: {
    camera: 'Davetiye, fatura, afiş, tabela',
    photo: 'Kayıtlı ekran görüntüsü ya da fotoğraf',
    pdf: 'Sözleşme, bilet, rapor',
    file: 'Belge veya metin dosyası',
    link: 'Etkinlik sayfası, ürün, makale',
    text: 'Aklına gelen bir şey',
  },

  status: {
    uploading: 'Yükleniyor',
    queued: 'Sıraya alındı',
    analyzing: 'İnceleniyor',
    ready: 'Hazır',
    failed: 'Okunamadı',
  },
  statusHint: {
    uploading: 'Dosyan gönderiliyor.',
    queued: 'Birazdan inceleyeceğiz.',
    analyzing: 'İçindekileri çıkarıyoruz.',
    ready: 'Çıkarılanları aşağıda görebilirsin.',
    failed: 'Bu içeriği okuyamadık. Farklı bir kaynak deneyebilirsin.',
  },

  intent: {
    event: 'Etkinlik',
    task: 'Görev',
    deadline: 'Son tarih',
    person: 'Kişi',
    note: 'Not',
    payment: 'Ödeme',
    reservation: 'Rezervasyon',
    travel: 'Seyahat',
    product_info: 'Ürün bilgisi',
  },
  intentQuestion: 'Bunu ne olarak kaydedelim?',

  extraction: {
    title: 'Çıkarılanlar',
    titleField: 'Başlık',
    dateField: 'Tarih',
    timeField: 'Saat',
    locationField: 'Konum',
    amountField: 'Tutar',
    personField: 'Kişi',
    codeField: 'Kod',
    noteField: 'Not',
    notFound: 'Bu alan kaynakta geçmiyor.',
    lowConfidence: 'Bundan tam emin değiliz, kontrol et.',
    edit: 'Düzelt',
    verified: 'Kaynakta doğrulandı',
  },

  action: {
    saveAsEvent: 'Etkinlik olarak kaydet',
    saveAsTask: 'Görev olarak kaydet',
    saveAsReminder: 'Hatırlatma kur',
    saveAsNote: 'Not olarak sakla',
    addToPerson: 'Kişiye ekle',
    discard: 'Sil',
    retryAnalysis: 'Yeniden incele',
    viewOriginal: 'Orijinali gör',
  },

  linkInput: {
    label: 'Bağlantı',
    placeholder: 'https://',
    invalid: 'Bu adres geçerli görünmüyor.',
    blocked: 'Bu adresi güvenlik nedeniyle açamıyoruz.',
    fetching: 'Sayfa okunuyor',
  },

  textInput: {
    label: 'Not',
    placeholder: 'Aklından geçeni yaz.',
  },

  fileLimit: 'En fazla {size} boyutunda dosya yükleyebilirsin.',
  supportedTypes: 'Fotoğraf, PDF ve metin dosyaları desteklenir.',
  savedAs: '{type} olarak kaydedildi.',
  discarded: 'Silindi.',
  history: 'Yakalananlar',
  monthlyLimit: 'Bu ay {used}/{limit} yakalama kullandın.',
  limitReached: 'Aylık yakalama sınırına ulaştın. Pro ile sınır kalkıyor.',
} satisfies MessageTree
