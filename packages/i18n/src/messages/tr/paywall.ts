import type { MessageTree } from '../../engine.ts'

export const paywall = {
  title: 'Dijital Asistan Pro',
  subtitle: 'Asistanın tam kapasite çalışsın.',
  headline: 'Gününü baştan sona senin yerine takip etsin.',

  price: {
    monthly: '199 TL / ay',
    annual: '1.490 TL / yıl',
    annualPerMonth: 'Ayda {amount}',
    annualSaving: 'Yıllıkta {percent} tasarruf',
    trial: '{days} gün ücretsiz dene',
    trialThenMonthly: '{days} gün ücretsiz, sonra {price}',
    renewalNote: 'İptal etmediğin sürece otomatik yenilenir.',
    storeNote: 'Ödeme mağaza hesabından alınır.',
  },

  plan: {
    free: 'Ücretsiz',
    pro: 'Pro',
    current: 'Mevcut planın',
    recommended: 'Önerilen',
    monthly: 'Aylık',
    annual: 'Yıllık',
  },

  freeFeatures: {
    title: 'Ücretsiz planda',
    briefing: 'Günde bir sabah brifingi',
    accounts: 'Tek mail hesabı',
    mail: 'Temel mail önceliklendirme',
    calendar: 'Takvim görünümü',
    assistant: 'Günde {count} asistan sorusu',
    capture: 'Ayda {count} yakalama',
    rules: '{count} öncelik kuralı',
    vip: '{count} VIP kişi',
  },

  proFeatures: {
    title: 'Pro planda',
    briefings: 'Dört brifing: sabah, öğle, akşam ve haftalık',
    audio: 'Sesli brifing anlatımı',
    accounts: 'Sınırsız mail ve takvim hesabı',
    assistant: 'Sınırsız asistan sorusu',
    meetingPrep: 'Toplantı hazırlığı ve sonrası özetler',
    replies: 'Sınırsız yanıt taslağı',
    capture: 'Sınırsız yakalama',
    rules: 'Sınırsız öncelik kuralı ve VIP',
    followUps: 'Otomatik takip ve söz izleme',
    search: 'Anlam tabanlı arama',
    widgets: 'Tüm ana ekran widget’ları',
    priority: 'Öncelikli destek',
  },

  proof: {
    timeSaved: 'Kullanıcılar haftada ortalama {hours} saat kazanıyor.',
    scanned: 'Şimdiye kadar senin için {count} mail tarandı.',
    yourSaving: 'Sen bu hafta {minutes} dakika kazandın.',
  },

  cta: {
    startTrial: 'Ücretsiz denemeyi başlat',
    subscribe: 'Pro’ya geç',
    continueFree: 'Ücretsiz devam et',
    restore: 'Satın alımları geri yükle',
    manage: 'Aboneliği yönet',
  },

  lock: {
    title: 'Bu özellik Pro’da',
    body: '{feature} için Pro plana geçmen gerekiyor.',
    action: 'Pro’yu incele',
  },
  limit: {
    title: 'Sınıra ulaştın',
    body: 'Bu planda {limit} sınırı var. Pro ile sınır kalkıyor.',
    action: 'Sınırı kaldır',
  },

  purchase: {
    processing: 'Satın alma tamamlanıyor',
    success: 'Hoş geldin. Pro özellikler açıldı.',
    cancelled: 'Satın alma tamamlanmadı.',
    failed: 'Satın alma tamamlanamadı. Mağaza hesabını kontrol et.',
    alreadySubscribed: 'Zaten Pro kullanıyorsun.',
  },

  legal: 'Abonelik dönem sonunda otomatik yenilenir. Mağaza hesabından istediğin an iptal edebilirsin.',
  terms: 'Kullanım Koşulları',
  privacy: 'Gizlilik Politikası',
} satisfies MessageTree
