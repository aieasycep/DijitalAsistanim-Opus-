import type { MessageTree } from '../../engine.ts'

export const person = {
  title: 'Kişi',
  contacts: 'Kişiler',
  searchPlaceholder: 'Kişi ara',

  header: {
    lastContact: 'Son iletişim: {time}',
    neverContacted: 'Henüz yazışmadınız.',
    relationship: 'İlişki',
    company: 'Kurum',
    role: 'Görev',
    email: 'E-posta',
    phone: 'Telefon',
    vip: 'VIP',
    external: 'Kuruluş dışı',
  },

  stats: {
    title: 'Yazışma özeti',
    threads: { zero: 'Yazışma yok', one: '1 yazışma', other: '{count} yazışma' },
    sent: { one: '1 mail gönderdin', other: '{count} mail gönderdin' },
    received: { one: '1 mail aldın', other: '{count} mail aldın' },
    meetings: { zero: 'Toplantı yok', one: '1 toplantı', other: '{count} toplantı' },
    avgResponse: 'Ortalama dönüş süren: {time}',
    theirAvgResponse: 'Onun ortalama dönüş süresi: {time}',
    busiestTopic: 'En çok konuştuğunuz konu: {topic}',
  },

  section: {
    openItems: 'Açık konular',
    commitments: 'Karşılıklı sözler',
    recentThreads: 'Son yazışmalar',
    upcomingMeetings: 'Yaklaşan toplantılar',
    pastMeetings: 'Geçmiş toplantılar',
    notes: 'Notların',
    files: 'Paylaşılan dosyalar',
  },

  summary: {
    title: 'Kısa özet',
    lastTopic: 'En son {topic} konusunu konuştunuz.',
    pendingFromYou: 'Ona {count} konuda dönüş yapman gerekiyor.',
    pendingFromThem: 'Ondan {count} konuda dönüş bekliyorsun.',
    healthy: 'Aranızda açık kalmış bir konu yok.',
    generate: 'Özet çıkar',
  },

  note: {
    add: 'Not ekle',
    placeholder: 'Bu kişi hakkında hatırlamak istediklerin',
    saved: 'Not kaydedildi.',
    delete: 'Notu sil',
  },

  action: {
    draftEmail: 'Mail hazırla',
    scheduleMeeting: 'Toplantı öner',
    markVip: 'VIP yap',
    unmarkVip: 'VIP’ten çıkar',
    mute: 'Sessize al',
    unmute: 'Sesini aç',
    openThreads: 'Tüm yazışmaları gör',
  },

  vipAdded: '{name} VIP listene eklendi.',
  vipRemoved: '{name} VIP listenden çıkarıldı.',
  muted: '{name} sessize alındı.',
  unmuted: '{name} artık sessiz değil.',
  privacyNote: 'Kişi bilgileri yalnızca senin cihazın ve hesabın için kullanılır.',
} satisfies MessageTree
