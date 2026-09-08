import type { ReviewOutcome } from './contract'

/**
 * Every string the approvals area renders, in Turkish.
 *
 * It sits beside the area rather than in `@/lib/messages` for the same reason
 * the backoffice does not use `@da/i18n`: this vocabulary is operational, it is
 * read by three people, and none of it should ever leak into a user-facing
 * bundle. Shared words — statuses, table chrome, error copy — still come from
 * `@/lib/messages`, so two pages cannot disagree about what `expired` is called.
 */

export const approvalMessages = {
  overview: {
    kicker: 'Güvenlik',
    title: 'Onay gözetimi',
    description:
      'Asistanın önerdiği her aksiyonun akıbeti. Ekranda yalnızca durum, sayı, süre ve hata kodu vardır; onayın içeriği — alıcı, konu, metin — bu araca hiçbir sorguyla gelmez.',
    metaLabel: 'Ölçüm penceresi',
    windowFilter: 'Zaman aralığı',
    typeFilter: 'Aksiyon türü',
    sourceFilter: 'Kaynak',
    window7d: 'Son 7 gün',
    window30d: 'Son 30 gün',
    window90d: 'Son 90 gün',
    /** Says exactly what population every number on the page is counted over. */
    cohortNote: (days: number): string =>
      `Tüm sayımlar, son ${days} gün içinde önerilmiş onaylar üzerinden hesaplanır.`,
    privacyNote:
      'Bu sayfadaki hiçbir sorgu onay içeriğine dokunmaz: bo_approvals görünümü payload, what ve why sütunlarına referans bile vermez, bu yüzden "kullanıcı taslağı değiştirdi mi" sorusu bu araçta yanıtlanamaz.',
  },

  funnel: {
    section: 'Huni',
    proposed: 'Önerilen',
    proposedHint: 'Asistanın kullanıcıya sorduğu aksiyon',
    pending: 'Bekleyen',
    pendingHint: 'Kullanıcı henüz karar vermedi',
    overdue: 'Süresi geçmiş',
    overdueHint: 'Bekliyor ama süresi dolmuş',
    approved: 'Onaylandı',
    approvedHint: 'Onaylandı, yürütme bekliyor',
    rejected: 'Reddedildi',
    executed: 'Yürütüldü',
    failed: 'Başarısız',
    expired: 'Süresi doldu',
    expiredHint: 'Kullanıcı hiç karar vermedi',
    rejectionRate: 'Red oranı',
    rejectionRateHint: 'Reddedilen / karara bağlanan',
    decidedOver: (count: string): string => `${count} karar üzerinden`,
    overdueCount: (count: string): string => `${count} tanesinin süresi geçmiş`,
    decisionTime: 'Onay süresi (medyan)',
    decisionTimeHint: 'Öneriden onaya',
    noDecisions: 'Karara bağlanan onay yok',
  },

  types: {
    section: 'Aksiyon türüne göre',
    description:
      'Red oranı bu ürünün en doğrudan kalite sinyalidir: bir türde yükseliyorsa asistanın o türdeki önerileri kötüleşmiştir.',
    empty: 'Seçilen aralıkta hiçbir türde onay önerilmemiş.',
    columnType: 'Tür',
    columnProposed: 'Önerilen',
    columnPending: 'Bekleyen',
    columnApproved: 'Onaylandı',
    columnRejected: 'Reddedildi',
    columnExpired: 'Süresi doldu',
    columnExecuted: 'Yürütüldü',
    columnFailed: 'Başarısız',
    columnRate: 'Red oranı',
    columnTrend: 'Önceki döneme göre',
    columnReview: 'İnceleme',
    rateTitle: 'Reddedilen / karara bağlanan',
    trendTitle: 'Bu dönemin red oranı ile bir önceki eşit uzunluktaki dönemin farkı',
    trendNoBaseline: 'Önceki dönemde karar yok',
    trendFlat: 'Değişim yok',
    trendUp: (points: string): string => `${points} puan arttı`,
    trendDown: (points: string): string => `${points} puan azaldı`,
    noDecisions: 'Karar yok',
    /** What the review form records for a type row. */
    measureCaption: (rate: string, decided: string): string => `${rate} red · ${decided} karar`,
  },

  trend: {
    section: 'Zaman içinde',
    description:
      'Pencere eşit dilimlere bölünür; her dilimin sayıları Postgres tarafından ayrı ayrı sayılır.',
    empty: 'Bu aralıkta önerilmiş onay yok.',
    columnPeriod: 'Dilim',
    columnProposed: 'Önerilen',
    columnRejected: 'Reddedilen',
    columnShare: 'Red payı',
    shareTitle: 'Reddedilen / önerilen. Son dilimde hâlâ karar bekleyenler olabilir.',
    open: 'sürüyor',
  },

  timing: {
    section: 'Karar ve yürütme süresi',
    description: 'Medyan ve p90, satır sayısı ve sıralama Postgres tarafında yapılarak bulunur.',
    decision: 'Öneriden onaya',
    rejection: 'Öneriden redde',
    execution: 'Onaydan yürütmeye',
    median: 'Medyan',
    p90: 'p90',
    sampleSize: 'Ölçülen',
    exact: 'tam sayım',
    sampled: (shown: number, total: number): string => `${total} kayıttan ${shown} tanesi`,
    sampledNote:
      'Red süresi örneklemden hesaplanır: bo_approvals red gecikmesini sütun olarak vermez, bu yüzden sıralama Postgres tarafında yapılamaz.',
    empty: 'Bu aralıkta ölçülebilir süre yok.',
  },

  failures: {
    section: 'Başarısızlıklar',
    description:
      'Yürütmesi başarısız olan onaylar, hata koduna göre. Kod, veritabanında bo_error_code() süzgecinden geçmiş bir belirteçtir; sağlayıcı mesajı değildir.',
    empty: 'Bu aralıkta başarısız onay yok.',
    emptyFiltered: 'Bu süzgeçlerle eşleşen başarısız onay yok.',
    columnCode: 'Hata kodu',
    columnCount: 'Adet',
    columnExhausted: 'Deneme hakkı bitti',
    columnMaxAttempts: 'En yüksek deneme',
    columnLastSeen: 'Son görülme',
    columnTopType: 'En sık tür',
    columnTriage: 'Triyaj',
    exhaustedTitle: (max: number): string => `${max} denemenin tamamı harcanmış`,
    truncated: (shown: number, total: number): string =>
      `${total} başarısız kayıttan ${shown} tanesi örneklendi; adet ve deneme sayıları ayrıca tam sayımla doğrulandı.`,
    complete: 'Bu aralıktaki tüm başarısız kayıtlar okundu; sayılar tamdır.',
    queueLink: 'Tüm başarısız onaylar',
    /** What the triage form records for a code row. */
    measureCaption: (count: string, exhausted: string): string =>
      `${count} kayıt · ${exhausted} hakkı bitti`,
  },

  failureQueue: {
    title: 'Başarısız onaylar',
    description:
      'Yürütmesi başarısız olan onaylar, en çok denenen en üstte. Satırlar kimlik, durum ve hata kodudur; hiçbiri onayın ne yapacağını söylemez.',
    backToOverview: 'Onay gözetimine dön',
    columnApproval: 'Onay',
    columnUser: 'Kullanıcı',
    columnType: 'Tür',
    columnSource: 'Kaynak',
    columnCode: 'Hata kodu',
    columnAttempts: 'Deneme',
    columnNextAttempt: 'Sıradaki deneme',
    columnUpdated: 'Son değişiklik',
    codeFilter: 'Hata kodu',
    pagePrevious: 'Önceki',
    pageNext: 'Sonraki',
    pageStatus: (page: number, total: number): string => `Sayfa ${page} / ${total}`,
    attemptsOf: (used: number, max: number): string => `${used} / ${max}`,
    exhausted: 'Hak bitti',
    noRetry: 'Planlanmadı',
  },

  queue: {
    section: 'Karar bekleyenler',
    description:
      'Kullanıcının henüz yanıtlamadığı öneriler, süresi geçmiş olanlar en üstte. Süresi dolan bir öneri sessiz bir "hayır"dır.',
    empty: 'Karar bekleyen öneri yok.',
    columnApproval: 'Onay',
    columnUser: 'Kullanıcı',
    columnType: 'Tür',
    columnSource: 'Kaynak',
    columnStatus: 'Durum',
    columnCreated: 'Önerildi',
    columnExpires: 'Süre sonu',
    overdue: 'Süresi geçti',
    statusFilter: 'Durum',
    openUser: 'Kullanıcıyı aç',
  },

  review: {
    openType: 'İncelendi işaretle',
    openCode: 'Triyaj kaydet',
    close: 'Kapat',
    explainType:
      'Bu tür için ölçülen red oranını incelediğini kayda geçirir. Onaya dokunmaz; denetim kaydına bir satır yazar.',
    explainCode:
      'Bu hata kodunu triyaj ettiğini kayda geçirir. Onaya dokunmaz; denetim kaydına bir satır yazar.',
    measureLabel: 'Kaydedilecek ölçüm',
    reasonLabel: 'Gerekçe',
    reasonPlaceholderType: 'Örn. taslak kalitesi düştü, model sürümü inceleniyor',
    reasonPlaceholderCode: 'Örn. sağlayıcı kota hatası, üst limit yükseltildi',
    submit: 'Kaydet',
    submitting: 'Kaydediliyor…',
  },

  result: {
    heading: 'Sonuç',
    subject: 'Konu',
    dismiss: 'Kapat',
    recorded: 'İnceleme denetim kaydına yazıldı.',
    invalid: 'Kayıt yazılmadı: gerekçe ya da konu geçersiz.',
    forbidden: 'Kayıt yazılmadı: bu işlem için yetkin yok.',
    failed: 'Kayıt yazılamadı. Denetim kaydı yazılamadığı için işlem başarılı sayılmadı.',
  },

  refresh: {
    label: 'Yenile',
    pending: 'Yenileniyor…',
  },
} as const

/** What each outcome says in the banner. */
export const REVIEW_OUTCOME_MESSAGE: Readonly<Record<ReviewOutcome, string>> = {
  recorded: approvalMessages.result.recorded,
  invalid: approvalMessages.result.invalid,
  forbidden: approvalMessages.result.forbidden,
  failed: approvalMessages.result.failed,
}

/**
 * `approval_action_type` in Turkish. The verb is the user's, not the system's:
 * an operator reading "E-posta gönder" should hear the thing the user was asked
 * to allow.
 */
export const actionTypeLabels: Record<string, string> = {
  email_send: 'E-posta gönder',
  calendar_create: 'Takvim kaydı oluştur',
  calendar_update: 'Takvim kaydını güncelle',
  task_create: 'Görev oluştur',
  reminder_create: 'Hatırlatma kur',
  commitment_create: 'Taahhüt oluştur',
}

/** `source_type`: what the assistant was looking at when it proposed. */
export const sourceTypeLabels: Record<string, string> = {
  email: 'E-posta',
  calendar_event: 'Takvim etkinliği',
  task: 'Görev',
  capture: 'Yakalama',
  commitment: 'Taahhüt',
  notification: 'Bildirim',
  contact: 'Kişi',
  user_input: 'Kullanıcı girdisi',
}
