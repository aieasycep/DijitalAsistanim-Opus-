import type { MessageTree } from '../../engine.ts'

export const widgets = {
  title: 'Widget’lar',
  subtitle: 'Ana ekranından bir bakışta gör.',

  today: {
    name: 'Bugün',
    description: 'Bugün bilmen gereken şeyler.',
    count: {
      zero: 'Bugün acil bir şey yok',
      one: 'Bugün 1 önemli konu',
      other: 'Bugün {count} önemli konu',
    },
    empty: 'Her şey kontrol altında.',
  },
  nextUp: {
    name: 'Sıradaki',
    description: 'Bir sonraki toplantın ya da son tarihin.',
    startsAt: '{time}',
    inMinutes: '{count} dk sonra',
    now: 'Şimdi',
    none: 'Sırada bir şey yok',
  },
  briefing: {
    name: 'Brifing',
    description: 'Günün özeti, cebinde.',
    ready: 'Brifingin hazır',
    notReady: 'Brifing hazırlanıyor',
    tapToOpen: 'Açmak için dokun',
  },
  followUps: {
    name: 'Takipler',
    description: 'Cevap bekleyen konular.',
    count: { zero: 'Bekleyen yok', one: '1 takip bekliyor', other: '{count} takip bekliyor' },
  },
  approvals: {
    name: 'Onaylar',
    description: 'Onayını bekleyen işlemler.',
    count: { zero: 'Bekleyen işlem yok', one: '1 işlem bekliyor', other: '{count} işlem bekliyor' },
  },
  capture: {
    name: 'Hızlı yakala',
    description: 'Tek dokunuşla fotoğraf, not veya bağlantı ekle.',
    action: 'Yakala',
  },

  size: {
    small: 'Küçük',
    medium: 'Orta',
    large: 'Büyük',
    lockScreen: 'Kilit ekranı',
  },
  lastUpdated: '{time}',
  needsSignIn: 'Giriş yapman gerekiyor',
  offline: 'Çevrimdışı',
  placeholderHint: 'Widget verileri arka planda güncellenir.',
  addHint: 'Ana ekranına eklemek için basılı tut ve widget seç.',
} satisfies MessageTree
