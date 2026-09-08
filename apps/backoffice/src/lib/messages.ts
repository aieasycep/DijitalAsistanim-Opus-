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

  nav: {
    overview: 'Genel bakış',
    users: 'Kullanıcılar',
    accounts: 'Bağlantılar',
    sync: 'Senkronizasyon',
    approvals: 'Onaylar',
    spend: 'Model maliyeti',
    privacy: 'Gizlilik talepleri',
    referrals: 'Davetler',
    audit: 'Denetim kaydı',
    staff: 'Ekip',
    signOut: 'Çıkış yap',
    signedInAs: 'Oturum',
    skipToContent: 'İçeriğe geç',
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

  table: {
    loading: 'Yükleniyor…',
    empty: 'Kayıt yok.',
    errorTitle: 'Veri getirilemedi',
    retry: 'Tekrar dene',
    rowCount: (shown: number, total: number): string =>
      total > shown ? `${total} kayıttan ${shown} tanesi` : `${shown} kayıt`,
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
