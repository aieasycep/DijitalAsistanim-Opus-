import type { MessageTree } from '../../engine.ts'

export const meeting = {
  title: 'Toplantı Hazırlığı',
  twoMinuteSummary: '2 Dakikalık Özet',
  subtitle: 'Toplantıya girmeden önce bilmen gerekenler.',
  readyIn: 'Toplantıya {minutes} dakika kaldı.',
  startsNow: 'Toplantı başlıyor.',

  prep: {
    agenda: 'Gündem',
    agendaFromInvite: 'Davetten çıkarıldı',
    noAgenda: 'Davette gündem yok.',
    context: 'Arka plan',
    lastMeeting: 'Son görüşmeniz {date} tarihindeydi.',
    lastEmails: 'Son yazışmalar',
    openItems: 'Açık maddeler',
    noOpenItems: 'Bu kişilerle açık kalmış bir konu yok.',
    yourCommitments: 'Senin verdiğin sözler',
    theirCommitments: 'Onların verdiği sözler',
    documents: 'İlgili belgeler',
    questions: 'Sorabileceğin sorular',
    risks: 'Dikkat edilecekler',
  },

  attendees: {
    title: 'Kimler katılıyor',
    role: '{role}',
    lastContact: 'Son iletişim: {time}',
    firstMeeting: 'Bu kişiyle ilk toplantın.',
    frequentContact: 'Sık yazıştığın biri.',
    external: 'Kuruluş dışı',
    unknown: 'Hakkında bilgimiz yok.',
  },

  action: {
    generatePrep: 'Hazırlık özeti çıkar',
    regenerate: 'Yeniden hazırla',
    join: 'Toplantıya katıl',
    openInvite: 'Daveti aç',
    addNote: 'Not ekle',
    shareSummary: 'Özeti paylaş',
  },

  post: {
    title: 'Toplantı sonrası',
    subtitle: 'Konuşulanlardan geriye ne kaldı?',
    howDidItGo: 'Nasıl geçti?',
    notesLabel: 'Notların',
    notesPlaceholder: 'Konuşulanları buraya yazabilirsin.',
    extractActions: 'Aksiyonları çıkar',
    extracted: 'Konuşmadan {count} aksiyon çıkardık.',
    yourActions: 'Sende kalanlar',
    theirActions: 'Onlarda kalanlar',
    nextStep: 'Sonraki adım',
    scheduleFollowUp: 'Devam toplantısı öner',
    sendSummary: 'Özeti mail olarak gönder',
    summaryDraft: 'Özet taslağı hazırlandı, göndermeden önce göz at.',
    noActions: 'Aksiyon çıkmadı.',
    saved: 'Notların kaydedildi.',
  },

  quality: {
    tooManyMeetings: 'Bu hafta {count} toplantın var.',
    couldBeEmail: 'Bu toplantı bir mail ile de çözülebilir gibi görünüyor.',
    noAgendaWarning: 'Gündemsiz toplantı genelde uzuyor.',
  },

  unavailable: 'Bu toplantı için yeterli bilgi bulamadık.',
  notInPlan: 'Toplantı hazırlığı Pro planında.',
} satisfies MessageTree
