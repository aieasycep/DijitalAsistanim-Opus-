import type { MessageTree } from '../../engine.ts'

export const email = {
  title: 'Mail',
  actions: {
    draftReply: 'Yanıt Hazırla',
    createTask: 'Görev Oluştur',
    addToCalendar: 'Takvime Ekle',
    remind: 'Hatırlat',
    openOriginal: 'Orijinal Maili Aç',
  },
  summary: {
    title: 'Özet',
    hint: 'Uzun yazışmayı üç cümleye indirdik.',
    regenerate: 'Yeniden özetle',
    good: 'İyi özet',
    bad: 'Kötü özet',
    thanks: 'Teşekkürler, not ettik.',
  },
  keyPoints: 'Öne çıkanlar',
  askedOfYou: 'Senden istenen',
  nothingAskedOfYou: 'Senden bir şey istenmiyor.',
  deadlineFound: 'Son tarih: {date}',
  amountFound: 'Tutar: {amount}',
  peopleMentioned: 'Geçen kişiler',
  linksFound: 'Bağlantılar',
  attachments: 'Ekler',
  attachmentSize: '{size}',

  header: {
    from: 'Kimden',
    to: 'Kime',
    cc: 'Bilgi',
    date: 'Tarih',
    subject: 'Konu',
    showDetails: 'Ayrıntıları göster',
    hideDetails: 'Ayrıntıları gizle',
  },

  thread: {
    expand: 'Tüm yazışmayı göster',
    collapse: 'Yazışmayı gizle',
    olderMessages: { one: '1 eski mesaj', other: '{count} eski mesaj' },
    quotedText: 'Alıntılanan metin',
  },

  body: {
    showOriginal: 'Orijinal metni göster',
    showSummary: 'Özete dön',
    externalImagesBlocked: 'Uzak görseller güvenlik için engellendi.',
    loadImages: 'Görselleri yükle',
    truncated: 'Mail kısaltıldı.',
  },

  importance: {
    label: 'Önem',
    critical: 'Kritik',
    high: 'Yüksek',
    normal: 'Normal',
    low: 'Düşük',
    change: 'Önemi değiştir',
  },

  feedback: {
    notImportant: 'Bu önemli değil',
    moreLikeThis: 'Bunun gibileri göster',
    markVip: 'Bu kişiyi VIP yap',
    muteSender: 'Bu göndereni sessize al',
    stopFollowing: 'Bu konuyu takip etme',
    saved: 'Tercihin kaydedildi.',
  },

  taskCreated: 'Görev oluşturuldu',
  reminderCreated: 'Hatırlatma kuruldu',
  eventProposed: 'Etkinlik önerisi hazırlandı',
  markedDone: 'Kapatıldı',
  snoozed: '{time} tarihine ertelendi',

  unsubscribe: {
    title: 'Bu listeden çıkmak ister misin?',
    body: 'Gönderen bir çıkış bağlantısı sunuyor.',
    action: 'Çıkış bağlantısını aç',
  },

  security: {
    warning: 'Bu mail bir güvenlik uyarısı içeriyor.',
    phishingHint: 'Bağlantılara tıklamadan gönderenin adresini kontrol et.',
    externalSender: 'Bu gönderen kuruluşunun dışından.',
  },
} satisfies MessageTree
