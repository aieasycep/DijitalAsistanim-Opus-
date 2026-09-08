/**
 * Every string the backoffice renders, in Turkish.
 *
 * This lives here rather than in @da/i18n on purpose. @da/i18n is the product's
 * catalogue — it is shipped to devices, checked by `verify:i18n`, and owned by
 * the app team. The backoffice is an internal tool with a different audience
 * (operators, not users) and a different vocabulary, and nothing here should
 * ever leak into a user-facing bundle. One locale only: staff work in Turkish.
 */

export const messages = {
  app: {
    name: 'Dijital Asistan',
    suffix: 'Backoffice',
    tagline: 'Operasyon konsolu',
    /** The promise the whole tool is built around; shown in the footer. */
    privacyBanner:
      'Bu araç kullanıcı içeriğini okuyamaz. Tüm veriler sayım, durum ve zaman damgasıdır.',
  },

  /**
   * Sidebar vocabulary. `groups` are the eight sections of the console's
   * information architecture; `items` are the destinations inside them.
   * `lib/nav.ts` owns which item belongs where — this only holds the words.
   */
  nav: {
    label: 'Ana gezinme',
    groups: {
      overview: 'Genel Bakış',
      users: 'Kullanıcılar',
      operations: 'Operasyon',
      ai: 'Yapay Zekâ',
      business: 'İş',
      product: 'Ürün',
      privacy: 'Gizlilik',
      system: 'Sistem',
    },
    overview: 'Genel bakış',
    users: 'Kullanıcılar',
    operations: 'Operasyon panosu',
    sync: 'Senkronizasyon',
    approvals: 'Onaylar',
    spend: 'Model maliyeti',
    subscriptions: 'Abonelikler',
    privacy: 'Gizlilik talepleri',
    audit: 'Denetim kaydı',
    signOut: 'Çıkış yap',
    signedInAs: 'Oturum',
    skipToContent: 'İçeriğe geç',
    collapse: 'Kenar çubuğunu daralt',
    expand: 'Kenar çubuğunu genişlet',
  },

  /**
   * The top toolbar.
   *
   * The health chip and the environment chip both make claims about reality, so
   * their wording is here rather than inline: a badge that says "sağlıklı" when
   * the probe last ran three hours ago is exactly the fake green status the
   * specification forbids, and `bo_system_health.is_stale` is what stops it.
   */
  topbar: {
    label: 'Konsol araç çubuğu',
    searchPlaceholder: 'Ara veya git…',
    healthLabel: 'Sistem durumu',
    healthOperational: 'Tüm sistemler çalışıyor',
    healthDegraded: (n: number): string => `${n} serviste yavaşlama`,
    healthDown: (n: number): string => `${n} servis kesintide`,
    healthUnknown: 'Ölçüm yok',
    healthStale: (n: number): string => `${n} servisin ölçümü bayat`,
    healthUnavailable: 'Sağlık verisi okunamadı',
    healthDetail: 'Operasyon panosunu aç',
    environmentLabel: 'Ortam',
    accountLabel: 'Yönetici menüsü',
    theme: 'Görünüm',
    themeLight: 'Açık',
    themeDark: 'Koyu',
    themeSystem: 'Sistem',
    permissions: (n: number): string => `${n} yetki`,
  },

  /** The Ctrl/Cmd+K palette. */
  command: {
    title: 'Komut paleti',
    description:
      'Sayfalar arasında geçiş yap, kullanıcı kimliğiyle veya senkronizasyon kaydıyla ara. Buradan hiçbir kalıcı işlem yapılamaz.',
    placeholder: 'Sayfa adı, kullanıcı kimliği, e-posta alan adı…',
    groupPages: 'Sayfalar',
    groupUsers: 'Kullanıcılar',
    groupJobs: 'Senkronizasyon kayıtları',
    empty: 'Eşleşen sonuç yok.',
    idle: 'Aramak için yazmaya başla. Sayfalar hemen, kayıtlar sunucudan gelir.',
    tooShort: 'En az 2 karakter yaz.',
    searching: 'Aranıyor…',
    failed: 'Arama tamamlanamadı.',
    readOnlyNote: 'Palet yalnızca gezinir. Hiçbir yıkıcı işlem buradan başlatılamaz.',
    userResult: (domain: string | null): string =>
      domain === null ? 'Kullanıcı kaydı' : `Kullanıcı · ${domain}`,
    jobResult: (provider: string, resource: string): string => `${provider} · ${resource}`,
  },

  auth: {
    signInTitle: 'Backoffice girişi',
    signInSubtitle: 'Yalnızca yetkili ekip üyeleri içindir.',
    email: 'E-posta',
    password: 'Parola',
    submit: 'Giriş yap',
    submitting: 'Giriş yapılıyor…',
    invalidCredentials: 'E-posta veya parola hatalı.',
    missingFields: 'E-posta ve parola zorunludur.',
    notStaff: 'Bu hesabın backoffice yetkisi yok.',
    disabled: 'Bu hesabın backoffice yetkisi askıya alınmış.',
    sessionExpired: 'Oturumun süresi doldu, tekrar giriş yap.',
    signOutFailed: 'Çıkış tamamlanamadı, tekrar dene.',
    rateLimited: 'Çok fazla deneme yapıldı. Bir süre sonra tekrar dene.',
    unavailable: 'Kimlik servisi şu anda yanıt vermiyor.',
    unauthorizedTitle: 'Yetkin yok',
    unauthorizedBody:
      'Hesabın geçerli ama backoffice erişimi tanımlı değil. Erişim gerekiyorsa bir yöneticiden staff_members kaydı açmasını iste.',
    unauthorizedRoleBody:
      'Bu sayfa daha yüksek bir yetki seviyesi istiyor. Mevcut seviyen bu işlem için yeterli değil.',
    backToOverview: 'Genel bakışa dön',
  },

  roles: {
    support: 'Destek',
    ops: 'Operasyon',
    admin: 'Yönetici',
  },

  overview: {
    title: 'Genel bakış',
    description: 'Platformun anlık durumu. Tüm sayılar toplulaştırılmıştır.',
    sectionPeople: 'Kişiler',
    sectionPipeline: 'Boru hattı',
    sectionRisk: 'Dikkat isteyenler',
    sectionCost: 'Maliyet',
    userTotal: 'Aktif kullanıcı',
    userNew24h: 'Son 24 saatte katılan',
    userNew7d: 'Son 7 günde katılan',
    userActive7d: 'Son 7 günde senkronize olan',
    userDeleted: 'Silinmiş hesap',
    subscriptionActive: 'Ücretli abonelik',
    subscriptionBillingIssue: 'Ödeme sorunu',
    accountTotal: 'Bağlı hesap',
    accountError: 'Hatalı bağlantı',
    syncError: 'Hatalı senkronizasyon',
    syncStalled: 'Takılmış senkronizasyon',
    approvalPending: 'Bekleyen onay',
    approvalOverdue: 'Süresi geçmiş onay',
    approvalFailed24h: 'Başarısız onay (24s)',
    exportOpen: 'Açık gizlilik talebi',
    exportFailed7d: 'Başarısız dışa aktarım (7g)',
    briefingFailed24h: 'Başarısız brifing (24s)',
    notificationFailed24h: 'Ulaşmayan bildirim (24s)',
    aiCost24h: 'Model maliyeti (24s)',
    aiCost30d: 'Model maliyeti (30g)',
    staffActive: 'Aktif ekip üyesi',
    recentAudit: 'Son denetim kayıtları',
    recentAuditEmpty: 'Seçilen aralıkta denetim kaydı yok.',
    accountsAtRisk: 'Müdahale bekleyen bağlantılar',
    accountsAtRiskEmpty: 'Hatalı ya da süresi dolmuş bağlantı yok.',
    generatedAt: 'Sunucu zamanı',
    windowLabel: 'Zaman aralığı',
    window24h: 'Son 24 saat',
    window7d: 'Son 7 gün',
    window30d: 'Son 30 gün',
  },

  pageHeader: {
    breadcrumbLabel: 'Konum',
  },

  /** The four states every panel renders. Shared so two pages cannot disagree. */
  states: {
    loading: 'Yükleniyor…',
    errorTitle: 'Veri getirilemedi',
    empty: 'Kayıt yok.',
    emptyFiltered: 'Bu filtrelerle eşleşen kayıt yok.',
    emptyFilteredHint: 'Filtreleri gevşetmeyi ya da tarih aralığını genişletmeyi dene.',
  },

  table: {
    loading: 'Yükleniyor…',
    empty: 'Kayıt yok.',
    errorTitle: 'Veri getirilemedi',
    retry: 'Tekrar dene',
    rowCount: (shown: number, total: number): string =>
      total > shown ? `${total} kayıttan ${shown} tanesi` : `${shown} kayıt`,
    /** Sorting. Every sort is a re-query on the server, never a client sort. */
    sortAscending: 'Artan sırala',
    sortDescending: 'Azalan sırala',
    sortNone: 'Sıralamayı kaldır',
    columns: 'Sütunlar',
    columnsLabel: 'Görünür sütunlar',
    columnsReset: 'Varsayılana dön',
    /** Pagination. Server-side: the browser never holds the whole table. */
    pagination: 'Sayfalama',
    previous: 'Önceki',
    next: 'Sonraki',
    page: (current: number, last: number): string => `Sayfa ${current} / ${last}`,
    range: (from: number, to: number, total: number): string =>
      `${total} kayıttan ${from}–${to} arası`,
    pageSize: 'Sayfa boyutu',
    perPage: (n: number): string => `${n} satır`,
  },

  /**
   * The date-range control. It always states its timezone, because "son 24
   * saat" is a different set of rows in Istanbul than it is in UTC and an
   * operator comparing two screens has to know which one they are reading.
   */
  range: {
    label: 'Tarih aralığı',
    presetLabel: 'Aralık',
    last24h: 'Son 24 saat',
    last7d: 'Son 7 gün',
    last30d: 'Son 30 gün',
    last90d: 'Son 90 gün',
    from: 'Başlangıç',
    to: 'Bitiş',
    apply: 'Uygula',
    summary: (from: string, to: string): string => `${from} – ${to}`,
    timeZoneNote: (zone: string): string => `Tüm saatler ${zone} saat diliminde.`,
    invalid: 'Başlangıç bitişten sonra olamaz.',
    future: 'Gelecek bir tarih seçilemez.',
  },

  /**
   * The confirmation dialog every destructive action goes through.
   *
   * The reason is not decoration: `admin_write_audit()` refuses a sensitive
   * action without one, and the same floor (3 characters, 280 ceiling) is
   * enforced in Postgres. The dialog states where the sentence ends up, because
   * an operator writing "test" needs to know a reviewer will read it.
   */
  confirm: {
    cancel: 'Vazgeç',
    working: 'İşleniyor…',
    reasonLabel: 'Gerekçe',
    reasonDescription: 'Bu cümle denetim kaydına yazılır ve silinemez.',
    reasonPlaceholder: 'Bu işlemi neden yapıyorsun?',
    reasonTooShort: (min: number): string => `Gerekçe en az ${min} karakter olmalı.`,
    reasonTooLong: (max: number): string => `Gerekçe en fazla ${max} karakter olabilir.`,
    reasonRemaining: (n: number): string => `${n} karakter kaldı`,
    phraseLabel: (phrase: string): string => `Onaylamak için “${phrase}” yaz`,
    phraseMismatch: 'Yazılan metin eşleşmiyor.',
    irreversible: 'Bu işlem geri alınamaz.',
    auditNote: 'İşlem, kimliğin ve gerekçenle birlikte denetim kaydına düşer.',
  },

  /**
   * Chart chrome. A chart in this console is evidence, not ornament: it says
   * what it counts, over what window, and it always has a table an operator can
   * read the numbers off.
   */
  chart: {
    loading: 'Grafik yükleniyor…',
    empty: 'Bu aralıkta veri yok.',
    showTable: 'Tablo olarak göster',
    tableCaption: (title: string): string => `${title} — sayısal değerler`,
    seriesLabel: 'Seri',
    totalLabel: 'Toplam',
    otherSeries: 'Diğer',
    shareOfTotal: (percent: string): string => `toplamın ${percent}'i`,
  },

  filters: {
    label: 'Filtreler',
    all: 'Tümü',
    apply: 'Uygula',
    reset: 'Sıfırla',
    search: 'Ara',
  },

  fields: {
    userId: 'Kullanıcı',
    email: 'E-posta (maskeli)',
    domain: 'Alan adı',
    status: 'Durum',
    provider: 'Sağlayıcı',
    resource: 'Kaynak',
    role: 'Yetki',
    action: 'İşlem',
    entity: 'Nesne',
    actor: 'Aktör',
    reason: 'Gerekçe',
    createdAt: 'Oluşturma',
    updatedAt: 'Güncelleme',
    lastRunAt: 'Son çalışma',
    lastErrorCode: 'Hata kodu',
    failureCount: 'Ardışık hata',
    accounts: 'Hesaplar',
    plan: 'Plan',
    cost: 'Maliyet',
    tokens: 'Jeton',
    count: 'Adet',
    never: 'Hiç',
    unknown: 'Bilinmiyor',
  },

  errors: {
    /** Shown when a bo_* view query fails. Never contains provider detail. */
    queryFailed: 'Sorgu tamamlanamadı.',
    queryFailedHint: 'Bağlantı yeniden denenebilir. Sorun sürerse altyapıyı kontrol et.',
    forbidden: 'Bu veriye erişim yetkin yok.',
    notFound: 'Kayıt bulunamadı.',
    configMissing: 'Sunucu yapılandırması eksik: Supabase bağlantı bilgileri tanımlı değil.',
    unexpectedTitle: 'Beklenmeyen bir hata oluştu',
    unexpectedBody:
      'İşlem tamamlanamadı. Sayfayı yenilemeyi dene; sorun sürerse denetim kaydına bakılabilir.',
    notFoundTitle: 'Sayfa bulunamadı',
    notFoundBody: 'Aradığın sayfa taşınmış ya da hiç var olmamış olabilir.',
  },

  audit: {
    /** Action labels. An action the tool does not know is shown verbatim. */
    actions: {
      'staff.signed_in': 'Ekip üyesi giriş yaptı',
      'staff.signed_out': 'Ekip üyesi çıkış yaptı',
      'staff.sign_in_denied': 'Giriş reddedildi',
    } as Record<string, string>,
    actorStaff: 'Ekip',
    actorSystem: 'Sistem',
    actorUser: 'Kullanıcı',
  },

  units: {
    /** Cost is stored in micros of the billing currency. */
    currency: '$',
    seconds: 'sn',
    minutes: 'dk',
    hours: 'sa',
    days: 'gün',
  },

  relative: {
    now: 'az önce',
    minutesAgo: (n: number): string => `${n} dk önce`,
    hoursAgo: (n: number): string => `${n} sa önce`,
    daysAgo: (n: number): string => `${n} gün önce`,
    inMinutes: (n: number): string => `${n} dk sonra`,
    inHours: (n: number): string => `${n} sa sonra`,
    inDays: (n: number): string => `${n} gün sonra`,
  },
} as const

export type Messages = typeof messages

/** Enum labels shared across pages, so two tables never disagree on a word. */
export const enumLabels = {
  connectionStatus: {
    connected: 'Bağlı',
    expired: 'Süresi doldu',
    revoked: 'İptal edildi',
    error: 'Hata',
    disconnected: 'Bağlantı kesildi',
  } as Record<string, string>,
  syncStatus: {
    idle: 'Beklemede',
    syncing: 'Senkronize ediliyor',
    backfilling: 'Geçmiş dolduruluyor',
    error: 'Hata',
  } as Record<string, string>,
  subscriptionStatus: {
    free: 'Ücretsiz',
    trialing: 'Deneme',
    active: 'Aktif',
    grace_period: 'Ek süre',
    expired: 'Süresi doldu',
    billing_issue: 'Ödeme sorunu',
  } as Record<string, string>,
  approvalStatus: {
    pending: 'Bekliyor',
    approved: 'Onaylandı',
    rejected: 'Reddedildi',
    executing: 'Yürütülüyor',
    executed: 'Yürütüldü',
    failed: 'Başarısız',
    expired: 'Süresi doldu',
  } as Record<string, string>,
  exportStatus: {
    requested: 'Talep edildi',
    processing: 'İşleniyor',
    ready: 'Hazır',
    failed: 'Başarısız',
    expired: 'Süresi doldu',
  } as Record<string, string>,
  provider: {
    google: 'Google',
    microsoft: 'Microsoft',
    apple: 'Apple',
    device: 'Cihaz',
    demo: 'Demo',
  } as Record<string, string>,
  accountKind: {
    mail: 'Posta',
    calendar: 'Takvim',
    tasks: 'Görevler',
    contacts: 'Kişiler',
  } as Record<string, string>,
} as const

/** Falls back to the raw value so an unmapped enum member is still legible. */
export function labelFor(dictionary: Record<string, string>, value: string | null): string {
  if (value === null) return messages.fields.unknown
  return dictionary[value] ?? value
}
