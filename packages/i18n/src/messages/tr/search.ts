import type { MessageTree } from '../../engine.ts'

export const search = {
  title: 'Ara',
  placeholder: 'Mail, toplantı, kişi veya not ara',
  cancel: 'Vazgeç',
  clear: 'Temizle',

  scope: {
    all: 'Tümü',
    email: 'Mailler',
    calendar_event: 'Etkinlikler',
    task: 'Görevler',
    capture: 'Yakalananlar',
    commitment: 'Sözler',
    contact: 'Kişiler',
    notification: 'Bildirimler',
    user_input: 'Notlar',
  },

  results: {
    count: { zero: 'Sonuç yok', one: '1 sonuç', other: '{count} sonuç' },
    in: '{scope} içinde',
    took: '{ms} ms',
    showAll: 'Tüm sonuçları gör',
    loadMore: 'Daha fazla sonuç',
  },

  recent: {
    title: 'Son aramalar',
    clear: 'Geçmişi temizle',
    cleared: 'Arama geçmişi temizlendi.',
  },

  suggestion: {
    title: 'Hızlı aramalar',
    unanswered: 'Cevap bekleyen mailler',
    thisWeekMeetings: 'Bu haftaki toplantılar',
    deadlines: 'Yaklaşan son tarihler',
    fromVip: 'VIP kişilerden gelenler',
    withAttachments: 'Ek içerenler',
  },

  filter: {
    title: 'Filtreler',
    from: 'Gönderen',
    to: 'Alıcı',
    dateRange: 'Tarih aralığı',
    hasAttachment: 'Ek içerenler',
    importance: 'Önem',
    unreadOnly: 'Yalnızca okunmamışlar',
    apply: 'Uygula',
    reset: 'Sıfırla',
    active: { one: '1 filtre etkin', other: '{count} filtre etkin' },
  },

  semantic: {
    hint: 'Doğal dille de sorabilirsin: "geçen ay konuştuğumuz teklif".',
    matchedOn: 'Anlam olarak eşleşti',
  },

  noResults: 'Sonuç bulunamadı.',
  noResultsHint: 'Farklı bir kelime deneyebilir ya da filtreleri temizleyebilirsin.',
  offline: 'Çevrimdışıyken yalnızca indirilmiş içerikte arayabiliriz.',
  error: 'Arama tamamlanamadı.',
} satisfies MessageTree
