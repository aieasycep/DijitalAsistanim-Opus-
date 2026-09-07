import type { MessageTree } from '../../engine.ts'

export const approval = {
  title: 'Onay Merkezi',
  subtitle: 'Senin adına yapılacak her işlem önce buraya düşer.',
  pendingTab: 'Bekleyenler',
  historyTab: 'Geçmiş',

  status: {
    pending: 'Onay bekliyor',
    approved: 'Onaylandı',
    rejected: 'Reddedildi',
    executing: 'Gerçekleştiriliyor',
    executed: 'Tamamlandı',
    failed: 'Başarısız',
    expired: 'Süresi doldu',
  },
  statusHint: {
    pending: 'Sen onaylamadan hiçbir şey gönderilmez.',
    approved: 'Onayladın, sıraya alındı.',
    rejected: 'Reddettin, hiçbir işlem yapılmadı.',
    executing: 'Şu anda gerçekleştiriliyor.',
    executed: '{time} tarihinde tamamlandı.',
    failed: 'Tamamlanamadı. Dışarıya bir şey gitmedi.',
    expired: 'Zamanında onaylanmadığı için iptal oldu.',
  },

  actionType: {
    email_send: 'Mail gönder',
    calendar_create: 'Etkinlik oluştur',
    calendar_update: 'Etkinliği güncelle',
    task_create: 'Görev oluştur',
    reminder_create: 'Hatırlatma kur',
    commitment_create: 'Söz olarak takip et',
  },
  actionTypeDescription: {
    email_send: 'Bu mail senin hesabından gönderilecek.',
    calendar_create: 'Bu etkinlik takvimine eklenecek.',
    calendar_update: 'Bu etkinlik güncellenecek, katılımcılar bilgilendirilecek.',
    task_create: 'Bu görev listene eklenecek.',
    reminder_create: 'Bu hatırlatma senin için kurulacak.',
    commitment_create: 'Bu söz takip edilmeye başlanacak.',
  },
  externalEffect: 'Bu işlem senin dışında birini de etkiler.',
  internalOnly: 'Bu işlem yalnızca uygulama içinde kalır.',

  decide: {
    approve: 'Onayla',
    edit: 'Düzenle',
    reject: 'Reddet',
    approveAndSend: 'Onayla ve gönder',
    rejectReason: 'Neden reddettin? (isteğe bağlı)',
    rejectPlaceholder: 'Örneğin: tarihi yanlış',
    confirmTitle: 'Emin misin?',
    confirmBody: 'Onaylarsan bu işlem hemen gerçekleşir.',
  },

  edit: {
    title: 'İşlemi düzenle',
    hint: 'Yalnızca işaretli alanlar değiştirilebilir.',
    lockedField: 'Bu alan güvenlik nedeniyle kilitli.',
    changes: { one: '1 alan değişti', other: '{count} alan değişti' },
    noChanges: 'Bir şey değiştirmedin.',
    invalid: 'Bu değişiklik kabul edilemez.',
    save: 'Değişiklikleri kaydet',
  },

  preview: {
    title: 'Ne olacak?',
    to: 'Kime',
    cc: 'Bilgi',
    subject: 'Konu',
    body: 'İçerik',
    when: 'Ne zaman',
    until: 'Bitiş',
    where: 'Nerede',
    person: 'Kişi',
    attendees: 'Katılımcılar',
    dueDate: 'Son tarih',
    notes: 'Notlar',
  },

  expiry: {
    expiresIn: '{time} içinde süresi dolacak',
    expiresSoon: 'Az sonra süresi dolacak',
    expired: 'Süresi doldu',
    recreate: 'Yeniden hazırla',
  },

  retry: {
    attempt: '{current}. deneme',
    willRetry: '{seconds} saniye sonra tekrar denenecek',
    retryNow: 'Şimdi tekrar dene',
    givenUp: 'Denemeler tükendi. Elle tekrar hazırlayabilirsin.',
  },

  approved: 'Onaylandı.',
  rejected: 'Reddedildi. Hiçbir işlem yapılmadı.',
  executed: 'İşlem tamamlandı.',
  failed: 'İşlem tamamlanamadı.',
  count: { zero: 'Bekleyen işlem yok', one: '1 işlem bekliyor', other: '{count} işlem bekliyor' },
  promise: 'Onayın olmadan hiçbir mail gönderilmez, hiçbir etkinlik oluşturulmaz.',
  source: 'Bu işlem şu kaynaktan doğdu',
} satisfies MessageTree
