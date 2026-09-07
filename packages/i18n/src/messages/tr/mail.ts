import type { MessageTree } from '../../engine.ts'

export const mail = {
  title: 'Mail Zekâsı',
  subtitle: 'Gelen kutun okundu, sıraya kondu.',

  /** The six review buckets shown as tabs. */
  categories: {
    important: 'Önemli',
    awaitingYou: 'Senden cevap bekleyen',
    awaitingOther: 'Senin cevap beklediğin',
    deadline: 'Son tarih içeren',
    info: 'Bilgilendirme',
    low: 'Düşük öncelik',
  },
  categoryHint: {
    important: 'Bugün mutlaka görmen gerekenler',
    awaitingYou: 'Karşı taraf senden dönüş bekliyor',
    awaitingOther: 'Sen dönüş bekliyorsun',
    deadline: 'İçinde bir tarih geçen konular',
    info: 'Bilmen yeterli, işlem gerekmiyor',
    low: 'Sessize alındı, istersen bakabilirsin',
  },

  /** Labels for the `EmailCategory` enum, keyed by its exact values. */
  category: {
    action_required: 'İşlem gerekiyor',
    waiting_for_user: 'Senden bekleniyor',
    waiting_for_other: 'Karşı taraftan bekleniyor',
    deadline: 'Son tarih',
    meeting: 'Toplantı',
    travel: 'Seyahat',
    shipment: 'Kargo',
    payment: 'Ödeme',
    subscription: 'Abonelik',
    security: 'Güvenlik',
    information: 'Bilgilendirme',
    promotion: 'Tanıtım',
  },

  summary: {
    scanned: { one: 'Bugün 1 mail okundu', other: 'Bugün {count} mail okundu' },
    surfaced: {
      zero: 'Öne çıkan yok',
      one: '1 tanesi öne çıktı',
      other: '{count} tanesi öne çıktı',
    },
    silenced: {
      zero: 'Sessize alınan yok',
      one: '1 tanesi sessize alındı',
      other: '{count} tanesi sessize alındı',
    },
    unread: { zero: 'Okunmamış yok', one: '1 okunmamış', other: '{count} okunmamış' },
    line: '{scanned} mail tarandı, {surfaced} tanesi senin için önemliydi.',
  },

  thread: {
    messages: { one: '1 mesaj', other: '{count} mesaj' },
    participants: { one: '1 kişi', other: '{count} kişi' },
    lastMessage: 'Son mesaj {time}',
    from: '{name} tarafından',
    to: '{name} kişisine',
    hasAttachment: 'Ek var',
    attachments: { one: '1 ek', other: '{count} ek' },
    unreadDot: 'Okunmadı',
    muted: 'Sessize alındı',
  },

  sort: {
    title: 'Sıralama',
    priority: 'Önem sırası',
    newest: 'En yeni',
    oldest: 'En eski',
    sender: 'Gönderene göre',
  },

  bulk: {
    markSeen: 'Görüldü işaretle',
    mute: 'Sessize al',
    lowPriority: 'Düşük önceliğe taşı',
    selected: { one: '1 seçildi', other: '{count} seçildi' },
  },

  digest: {
    title: 'Sessize alınanlar',
    body: 'Bunları görmene gerek yok diye düşündük. Yanıldıysak söyle.',
    action: 'Yine de göster',
  },

  triage: {
    why: 'Neden bu kategoride?',
    changeCategory: 'Kategoriyi değiştir',
    changed: 'Kategori güncellendi. Bunu öğrendik.',
    confidenceLow: 'Bu sınıflandırmadan tam emin değiliz.',
  },

  provider: {
    openInGmail: 'Gmail’de aç',
    openInOutlook: 'Outlook’ta aç',
    openInMail: 'Mail uygulamasında aç',
  },
} satisfies MessageTree
