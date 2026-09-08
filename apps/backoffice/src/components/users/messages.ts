/**
 * Turkish strings for the users area.
 *
 * They live beside the screens that render them rather than in
 * `@/lib/messages`, which is the backoffice's shared vocabulary, and nowhere
 * near `@da/i18n`, which is the product catalogue shipped to devices. Nothing
 * an operator reads should ever be reachable from a user-facing bundle.
 *
 * Every enum dictionary here maps a database value to a word, once, so two
 * panels on the same page cannot describe `grace_period` differently.
 */

export const userMessages = {
  list: {
    title: 'Kullanıcılar',
    description:
      'Destek aramalarını yanıtlamak için kimlik, plan ve bağlantı sağlığı. İçerik yoktur: konu, gönderen, ad ve tam adres bu araçta hiçbir sorguda geçmez.',
    searchLabel: 'Ara',
    searchPlaceholder: 'Kullanıcı kimliği, a•••@ornek.com veya @ornek.com',
    searchSubmit: 'Ara',
    searchClear: 'Temizle',
    searchHint: 'Tam kullanıcı kimliği, maskeli adres ya da alan adı.',
    maskedNotice:
      'Tam adres yazıldı ve arama yapılmadan önce maskelendi. Adres ne adres çubuğuna ne de sunucu kaydına girdi.',
    rejectedFragment:
      'Kısaltılmış kimlikle arama yapılamaz. Listeden bir satır aç ve tam kullanıcı kimliğini oradan al.',
    rejectedUnparsed:
      'Arama; tam kullanıcı kimliği, maskeli adres (a•••@ornek.com) veya alan adı (@ornek.com) olabilir.',
    empty: 'Bu filtrelerle eşleşen kullanıcı yok.',
    emptySearch: 'Bu aramayla eşleşen kullanıcı yok.',
    planLabel: 'Plan',
    healthLabel: 'Bağlantı sağlığı',
    onboardingLabel: 'Kurulum',
    deletedLabel: 'Silinmiş hesaplar',
    sortLabel: 'Sıralama',
    openUser: 'Kullanıcıyı aç',
    caption: 'Kullanıcı listesi',
    syncErrorCount: 'senkronizasyon hatası',
    accountErrorCount: 'hatalı bağlantı',
  },

  common: {
    yes: 'Evet',
  },

  health: {
    saglikli: 'Sağlıklı',
    baglanti_yok: 'Bağlantı yok',
    hatali_baglanti: 'Hatalı bağlantı',
    senk_hatasi: 'Senkronizasyon hatası',
  } as Record<string, string>,

  onboardingFilter: {
    tamam: 'Tamamlandı',
    eksik: 'Yarım kaldı',
  } as Record<string, string>,

  deletedFilter: {
    haric: 'Hariç',
    dahil: 'Dahil',
    sadece: 'Yalnızca silinmiş',
  } as Record<string, string>,

  sort: {
    yeni: 'En yeni',
    etkinlik: 'Son etkinlik',
    bayat: 'En bayat senkronizasyon',
  } as Record<string, string>,

  pagination: {
    label: 'Sayfalama',
    previous: 'Önceki',
    next: 'Sonraki',
    /** Takes already-formatted figures so grouping stays `tr-TR`. */
    range: (from: string, to: string, total: string): string =>
      `${total} kayıttan ${from}–${to} arası`,
    page: (page: number, pageCount: number): string => `Sayfa ${page} / ${pageCount}`,
  },

  detail: {
    kicker: 'Kullanıcı',
    description:
      'Bu kullanıcı hakkında bu aracın bilebileceği her şey: sayımlar, durumlar ve zaman damgaları. Bir posta, bir konu ya da bir kişi adı hiçbir sorguda yer almaz.',
    backToList: 'Listeye dön',
    notFoundTitle: 'Böyle bir kullanıcı yok',
    notFoundBody:
      'Bu kimlikle bir kayıt bulunamadı. Kimlik yanlış yazılmış olabilir ya da hesap tamamen silinmiş olabilir.',
    notFoundAction: 'Kullanıcı aramaya dön',

    sectionIdentity: 'Kimlik',
    sectionPlan: 'Plan ve hak kaynağı',
    sectionOnboarding: 'Kurulum',
    sectionAccounts: 'Bağlı hesaplar',
    sectionSync: 'Senkronizasyon tazeliği',
    sectionCounts: 'Sayımlar',
    sectionApprovals: 'Onaylar',
    sectionBriefings: 'Brifing üretimi',
    sectionNotifications: 'Bildirim teslimi',
    sectionRetention: 'Saklama',
    sectionPrivacyRequests: 'Gizlilik talepleri',
    sectionAudit: 'Denetim kaydı',
    sectionBoundary: 'Bu ekranın göremedikleri',

    userId: 'Kullanıcı kimliği',
    emailRedacted: 'Maskeli adres',
    emailDomain: 'Alan adı',
    locale: 'Arayüz dili',
    timeZone: 'Saat dilimi',
    localDate: 'Kullanıcının bugünü',
    createdAt: 'Kayıt tarihi',
    updatedAt: 'Son güncelleme',
    deletedAt: 'Silinme tarihi',
    deletedBadge: 'Silinmiş hesap',
    activeBadge: 'Etkin hesap',

    plan: 'Plan',
    planFree: 'Ücretsiz',
    planPro: 'Pro',
    entitlementSource: 'Hak kaynağı',
    subscriptionStatus: 'Abonelik durumu',
    subscriptionStore: 'Mağaza',
    periodEnd: 'Dönem sonu',
    trialEnds: 'Deneme bitişi',
    referralCode: 'Davet kodu',
    referralRedemptions: 'Kullanım',
    referralCredits: 'Bu kodla verilen bonus',
    referralRevoked: (count: string): string => `${count} iptal edilmiş`,
    referralNone: 'Bu kullanıcının davet kodu yok.',
    entitlementCaveat:
      'Plan, aboneliğin mağaza kaydından türetilir. Davet bonusu bu görünümde yer almaz: bonus kayıtları kodu paylaşan kişiye bağlıdır, bonusu alan kişiye değil.',

    onboarded: 'Kurulum tamamlandı',
    onboardingCompletedAt: 'Tamamlanma',
    onboardingDuration: 'Kayıttan tamamlanmaya',
    onboardingIncomplete: 'Kurulum yarım kaldı',
    onboardingIncompleteHint:
      'Kurulumu bitmemiş bir hesapta brifing üretilmez; kullanıcının önce hesap bağlaması gerekir.',

    accountsEmpty: 'Bağlı hesap yok.',
    accountsEmptyHint:
      'Bağlı hesap olmadan okunacak posta ya da takvim yoktur; brifing bu yüzden üretilmez.',
    accountsCaption: 'Bağlı sağlayıcı hesapları',
    accountPrimary: 'Birincil',
    accountKinds: 'Kapsam',
    accountScopes: 'İzin sayısı',
    accountMissingScopes: 'Eksik izin',
    accountMissingScopesHint:
      'Sağlayıcı izni verilmemiş: bu kaynak hiç okunmaz ve kullanıcıya hata görünmez.',
    accountCredentials: 'Kimlik bilgisi',
    accountCredentialsStored: 'Kayıtlı',
    accountCredentialsMissing: 'Yok',
    accountTokenExpiry: 'Erişim jetonu bitişi',
    accountRotated: 'Son yenileme',
    accountKeyVersion: 'Anahtar sürümü',

    syncEmpty: 'Senkronizasyon kaydı yok.',
    syncEmptyHint: 'Hiç senkronizasyon başlatılmamış. Bağlantı yeni açılmış olabilir.',
    syncCaption: 'Kaynak bazında senkronizasyon durumu',
    syncResource: 'Kaynak',
    syncSince: 'Son çalışmadan bu yana',
    syncNextRun: 'Sıradaki çalışma',
    syncFailures: 'Ardışık hata',
    syncStalled: 'Takıldı',
    syncBackfilling: 'Geçmiş dolduruluyor',
    syncFresh: 'Güncel',

    countAccounts: 'Bağlı hesap',
    countAccountsHint: (connected: number, total: number): string =>
      `${connected} / ${total} bağlı`,
    countApprovalsPending: 'Bekleyen onay',
    countApprovalsFailed: 'Başarısız onay',
    countBriefingsReady: 'Hazır brifing (30g)',
    countBriefingsFailed: 'Başarısız brifing (30g)',
    countCaptures: 'Yakalama',
    countCapturesFailed: 'Başarısız yakalama',
    countDevices: 'Bildirim alan cihaz',
    countDevicesHint: 'Etkin push kaydı',
    countExports: 'Açık gizlilik talebi',
    countAiEvents: 'Model çağrısı (30g)',
    countAiCost: 'Model maliyeti (30g)',
    countAiLast: 'Son model çağrısı',

    approvalsBreakdown: 'Duruma göre onay sayısı',
    approvalsBreakdownEmpty: 'Bu kullanıcı için onay kaydı yok.',
    approvalsRecent: 'Son onaylar',
    approvalsRecentEmpty: 'Onay kaydı yok.',
    approvalsCaption: 'Onay kuyruğu durumları',
    approvalType: 'Tür',
    approvalDecision: 'Karar süresi',
    approvalExecution: 'Yürütme süresi',
    approvalOverdue: 'Süresi geçti',
    approvalAttempts: 'Deneme',

    briefingUserWindow: 'Bu kullanıcı (son 30 gün)',
    briefingUserNote:
      'Kullanıcı bazında brifing sayımı yalnızca 30 günlük pencerede vardır; günlük dağılım içerik tablosuna dokunmadan üretilemediği için platform tarafında tutulur.',
    briefingPlatform: 'Platform brifing hattı (son 7 gün)',
    briefingPlatformEmpty: 'Son yedi günde hiç brifing üretilmemiş.',
    briefingPlatformHint:
      'Kullanıcının brifingi gelmediyse önce buraya bak: hattın tamamı mı durdu, yoksa yalnızca bu hesap mı?',
    briefingCaption: 'Gün ve tür bazında brifing üretimi',
    briefingDate: 'Tarih',
    briefingKind: 'Tür',
    briefingReady: 'Hazır',
    briefingFailed: 'Başarısız',
    briefingQueued: 'Kuyrukta',
    briefingSkipped: 'Atlandı',
    briefingOpened: 'Açıldı',
    briefingUsers: 'Kullanıcı',
    briefingAvgSeconds: 'Ort. üretim',

    notificationDevices: 'Bu kullanıcının etkin cihaz sayısı',
    notificationNoDevice:
      'Etkin push kaydı yok. Brifing üretilmiş olsa bile bu hesaba bildirim gönderilemez.',
    notificationPlatform: 'Platform bildirim teslimi (son 7 gün)',
    notificationPlatformEmpty: 'Son yedi günde brifing bildirimi gönderilmemiş.',
    notificationCaption: 'Gün ve kategori bazında bildirim teslimi',
    notificationPerUserNote:
      'Kullanıcı bazında teslim sonucu bu araçta yoktur: bir teslim kaydı gönderilen başlığı ve metni taşır, bu yüzden yalnızca gün ve kategori toplamları görünür. Tek kullanıcı için cevaplanabilecek soru "cihazı var mı" sorusudur ve yukarıdadır.',
    notificationDate: 'Tarih',
    notificationCategory: 'Kategori',
    notificationSent: 'Gönderildi',
    notificationDelivered: 'Ulaştı',
    notificationFailed: 'Başarısız',
    notificationAttempts: 'Ort. deneme',

    retentionTitle: 'Platform saklama politikası',
    retentionNote:
      'Bu tablo, temizlik işinin uyguladığı politikadır ve @da/domain’den okunur. Kullanıcının kendi seçtiği pencere bir tercih kaydıdır ve içerik körü görünümlerde yer almadığı için burada gösterilmez.',
    retentionDefault: 'Varsayılan pencere',
    retentionWindow: 'Pencere',
    retentionCutoff: 'Bugünkü kesim tarihi',
    retentionForever: 'Silinmez',
    retentionFixedTitle: 'Sabit pencereler',
    retentionFixedNote:
      'Bu kayıtlar kullanıcının tercihinden bağımsız, sabit sürelerle silinir ya da kimliksizleştirilir.',
    retentionTable: 'Kayıt',
    retentionDays: 'Süre',
    retentionUserChoice: 'Kullanıcı tercihi',
    retentionAnonymize: 'Kimliksizleştirilir',

    privacyRequestsEmpty: 'Gizlilik talebi yok.',
    privacyRequestsCaption: 'Veri dışa aktarma ve silme talepleri',
    privacyRequested: 'Talep',
    privacyReady: 'Hazır',
    privacyExpires: 'Geçerlilik',
    privacySize: 'Boyut',
    privacyFulfilment: 'Karşılama süresi',

    auditEmpty: 'Bu kullanıcı için denetim kaydı yok.',
    auditCaption: 'Bu kullanıcıya ilişkin denetim kayıtları',

    boundaryIntro:
      'Aşağıdakiler bu araçta yoktur ve sonradan eklenemez: backoffice yalnızca içerik sütunu barındırmayan bo_* görünümlerini okur, bu görünümler yalnızca service_role’a açıktır ve her yayında sütun bağımlılıkları doğrulanır.',
    boundaryItems: [
      'Posta konusu, gövdesi, özeti ya da alıntısı',
      'Gönderen, alıcı, katılımcı adı veya tam e-posta adresi',
      'Takvim başlığı, açıklaması, konumu ya da katılımcıları',
      'Asistan konuşmaları ve hafıza kayıtları',
      'Yakalanan fotoğraf, dosya ya da çıkarılan metin',
      'Brifing metni, başlığı ve ses dosyası',
      'Onay bekleyen taslak e-postanın içeriği',
      'Kişi listesi, VIP tanımları ve öncelik kuralı eşleşmeleri',
    ] as readonly string[],
    boundaryClosing:
      'Bir destek sorusu bunlardan biri olmadan yanıtlanamıyorsa yanıtlanamaz. Doğru cevap, kullanıcıdan ekran görüntüsü istemek ya da mühendislikle içerik görmeyen bir sayım eklemektir; bu ekrana bir içerik alanı eklemek değildir.',
  },

  regenerate: {
    title: 'Bugünün brifingini yeniden üret',
    description:
      'Kullanıcının kendi saat dilimindeki bugün için bir yeniden üretim talebi kaydeder.',
    kindLabel: 'Brifing türü',
    reasonLabel: 'Gerekçe',
    reasonPlaceholder: 'Örn. kullanıcı sabah brifinginin gelmediğini bildirdi',
    reasonHint: 'En az 3, en çok 280 karakter. Denetim kaydında aynen görünür.',
    submit: 'Yeniden üretim talebi oluştur',
    submitting: 'Kaydediliyor…',
    successTitle: 'Talep kaydedildi',
    success: (forDate: string, kind: string): string =>
      `${forDate} tarihli ${kind} brifingi için yeniden üretim talebi denetim kaydına yazıldı.`,
    /** Said plainly, because the alternative would be a lie by omission. */
    contentNotice:
      'Talep; kullanıcı kimliğini, brifing türünü, kullanıcının yerel tarihini ve gerekçeni taşır. Brifing metni bu araca dönmez: ekip üyesine kullanıcı oturumu verilmediği için bu yapısal olarak imkânsızdır.',
    historyTitle: 'Yeniden üretim talepleri',
    historyEmpty: 'Bu kullanıcı için yeniden üretim talebi yok.',
    historyCaption: 'Bu kullanıcı için oluşturulan yeniden üretim talepleri',
    historyWhen: 'Zaman',
    historyStaff: 'Ekip üyesi',
    historyTarget: 'Hedef',
    historyReason: 'Gerekçe',

    errorReason: 'Gerekçe en az 3, en çok 280 karakter olmalı.',
    errorUser: 'Kullanıcı kimliği geçersiz.',
    errorKind: 'Brifing türü geçersiz.',
    errorNotFound: 'Kullanıcı bulunamadı.',
    errorDeleted: 'Hesap silinmiş; brifing üretilemez.',
    errorNoAccount: 'Bağlı hesap yok; okunacak posta ya da takvim olmadan brifing üretilemez.',
    errorNotEntitled: 'Bu brifing türü kullanıcının planında yok.',
    errorForbidden: 'Bu işlem için yetkin yok.',
    errorUnavailable: 'Talep kaydedilemedi. Tekrar dene; sorun sürerse altyapıyı kontrol et.',
  },
} as const

/** Enum dictionaries this area needs beyond the ones in `@/lib/messages`. */
export const userEnumLabels = {
  locale: {
    tr: 'Türkçe',
    en: 'İngilizce',
  } as Record<string, string>,

  subscriptionStore: {
    app_store: 'App Store',
    play_store: 'Play Store',
    promotional: 'Promosyon',
  } as Record<string, string>,

  entitlementSource: {
    subscription: 'Ücretli abonelik',
    trial: 'Deneme süresi',
    referral_bonus: 'Davet bonusu',
    none: 'Yok (ücretsiz plan)',
  } as Record<string, string>,

  briefingKind: {
    morning: 'Sabah brifingi',
    midday: 'Gün ortası nabzı',
    evening: 'Akşam kapanışı',
    weekly: 'Haftalık değerlendirme',
  } as Record<string, string>,

  notificationCategory: {
    morning_briefing: 'Sabah brifingi',
    midday_pulse: 'Gün ortası nabzı',
    evening_close: 'Akşam kapanışı',
    weekly_review: 'Haftalık değerlendirme',
    critical_email: 'Kritik e-posta',
    meeting: 'Toplantı',
    deadline: 'Son tarih',
    follow_up: 'Takip',
    life_event: 'Yaşam olayı',
    approval: 'Onay',
  } as Record<string, string>,

  approvalType: {
    email_send: 'E-posta gönderimi',
    calendar_create: 'Takvim kaydı',
    calendar_update: 'Takvim güncelleme',
    task_create: 'Görev oluşturma',
    reminder_create: 'Hatırlatma',
    commitment_create: 'Taahhüt',
  } as Record<string, string>,

  sourceType: {
    email: 'E-posta',
    calendar_event: 'Takvim',
    task: 'Görev',
    capture: 'Yakalama',
    commitment: 'Taahhüt',
    notification: 'Bildirim',
    contact: 'Kişi',
    user_input: 'Kullanıcı girdisi',
  } as Record<string, string>,

  retentionWindow: {
    '30d': '30 gün',
    '90d': '90 gün',
    '1y': '1 yıl',
    forever: 'Süresiz',
  } as Record<string, string>,

  /** Tables the retention sweep touches, named for an operator. */
  retentionTable: {
    email_messages: 'E-posta mesajları',
    email_threads: 'E-posta konuları',
    memory_chunks: 'Hafıza kayıtları',
    insights: 'Çıkarımlar',
    life_events: 'Yaşam olayları',
    briefings: 'Brifingler',
    captures: 'Yakalamalar',
    assistant_messages: 'Asistan mesajları',
    device_notifications: 'Cihaz bildirimleri',
    approval_actions: 'Onay kayıtları',
    audit_logs: 'Denetim kayıtları',
    data_export_requests: 'Dışa aktarma talepleri',
  } as Record<string, string>,

  /** Audit actions this area renders. Unknown actions fall back to the token. */
  auditAction: {
    'briefing.regenerate_requested': 'Brifing yeniden üretimi istendi',
    'briefing.skipped': 'Brifing atlandı',
    'sync.started': 'Senkronizasyon başladı',
    'sync.completed': 'Senkronizasyon tamamlandı',
    'sync.failed': 'Senkronizasyon başarısız',
    'staff.signed_in': 'Ekip üyesi giriş yaptı',
    'staff.signed_out': 'Ekip üyesi çıkış yaptı',
    'staff.sign_in_denied': 'Giriş reddedildi',
  } as Record<string, string>,
} as const
