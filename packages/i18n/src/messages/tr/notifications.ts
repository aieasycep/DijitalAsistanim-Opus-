import type { MessageTree } from '../../engine.ts'

export const notifications = {
  title: 'Bildirim Ayarları',
  subtitle: 'Ne zaman rahatsız edilmek istediğine sen karar ver.',

  master: {
    label: 'Bildirimler',
    hint: 'Kapatırsan hiçbir bildirim gelmez.',
    systemDisabled: 'Cihaz ayarlarında bildirimler kapalı.',
    openSystemSettings: 'Cihaz ayarlarını aç',
  },

  category: {
    morning_briefing: 'Sabah brifingi',
    midday_pulse: 'Öğle nabzı',
    evening_close: 'Gün kapanışı',
    weekly_review: 'Haftalık değerlendirme',
    critical_email: 'Kritik mailler',
    meeting: 'Toplantı hatırlatmaları',
    deadline: 'Son tarihler',
    follow_up: 'Takipler',
    life_event: 'Kargo, uçuş ve ödemeler',
    approval: 'Onay bekleyen işlemler',
  },
  categoryHint: {
    morning_briefing: 'Günün özeti, her sabah tek bildirim.',
    midday_pulse: 'Öğleden sonra değişenler.',
    evening_close: 'Günü kapatma ve yarına hazırlık.',
    weekly_review: 'Haftanın özeti.',
    critical_email: 'Kaçırılmaması gereken mailler.',
    meeting: 'Toplantıdan önce haber verelim.',
    deadline: 'Son tarih yaklaşınca.',
    follow_up: 'Cevap gelmeyen konular.',
    life_event: 'Kargon yola çıktığında, uçuşun değiştiğinde.',
    approval: 'Onayını bekleyen bir işlem olduğunda.',
  },

  timing: {
    title: 'Zamanlama',
    morningAt: 'Sabah brifingi saati',
    middayAt: 'Öğle nabzı saati',
    eveningAt: 'Gün kapanışı saati',
    weeklyOn: 'Haftalık değerlendirme günü',
    meetingLeadTime: 'Toplantıdan kaç dakika önce',
    deadlineLeadTime: 'Son tarihten kaç saat önce',
  },

  quietHours: {
    title: 'Sessiz saatler',
    hint: 'Bu aralıkta yalnızca VIP ve kritik bildirimler gelir.',
    enabled: 'Sessiz saatler açık',
    from: 'Başlangıç',
    to: 'Bitiş',
    allowVip: 'VIP kişiler sessiz saatleri delsin',
    allowCritical: 'Kritik bildirimler sessiz saatleri delsin',
    weekendsToo: 'Hafta sonları da uygula',
  },

  lockScreen: {
    title: 'Kilit ekranı gizliliği',
    full: 'Tam içerik',
    title_only: 'Yalnızca başlık',
    generic: 'Genel bildirim',
    fullHint: 'Kilit ekranında özet görünür.',
    title_onlyHint: 'Yalnızca konu başlığı görünür.',
    genericHint: '“Yeni bir bildirimin var” yazar.',
  },

  bundling: {
    title: 'Gruplama',
    hint: 'Peş peşe gelen bildirimleri tek bildirimde toplarız.',
    enabled: 'Bildirimleri grupla',
    maxPerDay: 'Günlük en fazla bildirim',
    maxPerDayHint: 'Bu sayıyı aşarsak kalanları brifinge bırakırız.',
  },

  sound: {
    title: 'Ses ve titreşim',
    sound: 'Ses',
    vibration: 'Titreşim',
    criticalSound: 'Kritik bildirimlerde farklı ses',
  },

  test: {
    action: 'Test bildirimi gönder',
    sent: 'Test bildirimi gönderildi.',
    body: 'Bildirimler böyle görünecek.',
  },

  history: {
    title: 'Bildirim geçmişi',
    empty: 'Henüz bildirim gönderilmedi.',
    sentAt: '{time} gönderildi',
    opened: 'Açıldı',
  },

  permissionDenied: 'Bildirim izni verilmedi. Cihaz ayarlarından açabilirsin.',
  saved: 'Bildirim ayarların kaydedildi.',
} satisfies MessageTree
