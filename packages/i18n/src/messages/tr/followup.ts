import type { MessageTree } from '../../engine.ts'

export const followup = {
  title: 'Takipler',
  subtitle: 'Cevapsız kalanlar gözden kaçmasın.',
  noReplyYet: 'Henüz dönüş gelmedi.',

  section: {
    waitingOnOthers: 'Senin beklediklerin',
    waitingOnYou: 'Senden beklenenler',
    overdue: 'Gecikenler',
    upcoming: 'Yaklaşanlar',
  },

  card: {
    sentTo: '{name} kişisine gönderildi',
    sentOn: '{date} tarihinde gönderildi',
    waitingFor: { one: '1 gündür bekliyor', other: '{count} gündür bekliyor' },
    expectedBy: '{date} tarihine kadar bekleniyordu',
    lastNudge: 'Son hatırlatma {time}',
    neverNudged: 'Henüz hatırlatmadın.',
  },

  reason: {
    questionAsked: 'Mailde bir soru sordun.',
    approvalRequested: 'Onay istedin.',
    deadlineMentioned: 'Bir tarih verildi.',
    commitmentMade: 'Karşı taraf söz verdi.',
    meetingProposed: 'Toplantı önerdin.',
  },

  action: {
    nudge: 'Nazikçe hatırlat',
    nudgeDraft: 'Hatırlatma yanıtı hazırla',
    markResolved: 'Çözüldü',
    stopFollowing: 'Takibi bırak',
    snooze: 'Ertele',
    openThread: 'Yazışmayı aç',
    remindMe: 'Bana hatırlat',
  },

  nudge: {
    title: 'Hatırlatma taslağı',
    body: 'Kısa ve baskısız bir hatırlatma hazırladık.',
    preview: 'Merhaba {name}, aşağıdaki konuda bir dönüşün olur mu?',
    tooSoon: 'Henüz erken. En az {days} gün beklemeni öneririz.',
  },

  resolved: 'Takip kapatıldı.',
  stopped: 'Bu konuyu artık takip etmiyoruz.',
  reopened: 'Takip yeniden açıldı.',
  autoDetected: 'Bu takibi mailden otomatik çıkardık.',
  count: { zero: 'Bekleyen takip yok.', one: '1 takip bekliyor', other: '{count} takip bekliyor' },
  overdueCount: { one: '1 takip gecikti', other: '{count} takip gecikti' },
} satisfies MessageTree
