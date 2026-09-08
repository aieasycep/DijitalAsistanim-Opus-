import type { ErrorCode } from '@da/domain'
import type {
  AnnouncementAudienceValue,
  AnnouncementLocaleValue,
  AnnouncementPlatformValue,
} from '@/components/announcements/contract'

/**
 * Every Turkish string the announcements area renders.
 *
 * ---------------------------------------------------------------------------
 * WHY THE COPY IS SO INSISTENT ABOUT "TASLAK"
 * ---------------------------------------------------------------------------
 *
 * `announcements.published_at` is the whole safety property of this table: a row
 * with a null there is never served, whatever its window says, and a row with a
 * value in it is on somebody's phone. Those two states look identical in a form
 * — same title, same body, same audience — so the words have to carry the
 * difference. Every screen in this area names the state before it names
 * anything else, and the publish confirmation says how many accounts the
 * targeting resolves to before it offers a button.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS NOT HERE
 * ---------------------------------------------------------------------------
 *
 * The announcement's own title and body. Those are company-authored text stored
 * in `announcements` and rendered from the row — never a string in this file,
 * and never an example that could be mistaken for one on a screenshot.
 */

// ===========================================================================
// The state vocabulary
//
// Five states, derived from two nullable timestamps and the clock. The list
// filter and the row badge read the same names from here, so a row can never
// be badged as something the filter above it does not offer.
// ===========================================================================

export const ANNOUNCEMENT_STATES = ['draft', 'scheduled', 'live', 'open_ended', 'ended'] as const
export type AnnouncementState = (typeof ANNOUNCEMENT_STATES)[number]

export const STATE_LABELS_TR: Readonly<Record<AnnouncementState, string>> = Object.freeze({
  draft: 'Taslak',
  scheduled: 'Planlandı',
  live: 'Yayında',
  open_ended: 'Süresiz yayında',
  ended: 'Süresi doldu',
})

/** What each state means for the people using the app, in one sentence. */
export const STATE_HINTS_TR: Readonly<Record<AnnouncementState, string>> = Object.freeze({
  draft:
    'Bu duyuru hiç kimseye gösterilmiyor. Yayınlanmamış bir kayıt, tarih aralığı ne derse desin uygulamada görünmez.',
  scheduled:
    'Yayınlandı ama başlangıç tarihi henüz gelmedi. Başlangıç anında, ek bir işlem gerekmeden görünmeye başlayacak.',
  live: 'Şu anda hedeflenen kullanıcıların uygulamasında görünüyor. Bitiş tarihinde kendiliğinden kalkacak.',
  open_ended:
    'Şu anda görünüyor ve bitiş tarihi yok. Yayından kaldırılana kadar ekranda kalır — kapatılamaz bir duyuruysa bu bir karanlık desendir.',
  ended: 'Bitiş tarihi geçti. Kayıt yayında görünüyor ama kimseye gösterilmiyor.',
})

// ===========================================================================
// Targeting vocabulary
// ===========================================================================

export const AUDIENCE_LABELS_TR: Readonly<Record<AnnouncementAudienceValue, string>> =
  Object.freeze({
    all: 'Herkes',
    free: 'Ücretsiz kullanıcılar',
    pro: 'Pro kullanıcılar',
    ios: 'iOS kullanıcıları',
    android: 'Android kullanıcıları',
  })

export const PLATFORM_LABELS_TR: Readonly<Record<AnnouncementPlatformValue, string>> =
  Object.freeze({
    ios: 'iOS',
    android: 'Android',
    web: 'Web',
  })

/** `announcements.locale` is `app_locale`: the product ships in two languages. */
export const LOCALE_LABELS_TR: Readonly<Record<AnnouncementLocaleValue, string>> = Object.freeze({
  tr: 'Türkçe',
  en: 'İngilizce',
})

/** A locale the database allows but the console has no label for, spelled out. */
export function localeLabel(value: string): string {
  return LOCALE_LABELS_TR[value as AnnouncementLocaleValue] ?? value
}

// ===========================================================================
// Failure
// ===========================================================================

const GENERIC_FAILURE_TR = 'İşlem tamamlanamadı. Kısa süre sonra tekrar deneyin.'

const FAILURE_MESSAGES_TR: Partial<Record<ErrorCode, string>> = Object.freeze({
  forbidden: 'Bu işlem için yetkiniz yok.',
  not_found: 'Duyuru bulunamadı. Siz bu ekranı açtıktan sonra silinmiş olabilir.',
  validation_failed: 'Girilen değerler veritabanının kurallarına uymuyor.',
  sync_conflict: 'Kayıt siz bu ekranı açtıktan sonra değişti. Yenileyip tekrar bakın.',
  rate_limited: 'Çok fazla deneme yapıldı. Bir süre bekleyip tekrar deneyin.',
  server_unavailable: 'Veritabanına ulaşılamadı. Kısa süre sonra tekrar deneyin.',
})

export function announcementFailureMessage(code: ErrorCode): string {
  return FAILURE_MESSAGES_TR[code] ?? GENERIC_FAILURE_TR
}

// ===========================================================================
// The outcome banner
// ===========================================================================

export const ANNOUNCEMENT_OUTCOMES = [
  'published',
  'unpublished',
  'saved',
  'created',
  'forbidden',
  'invalid',
  'notfound',
  'conflict',
  'ratelimited',
  'auditMissing',
  'failed',
] as const
export type AnnouncementOutcome = (typeof ANNOUNCEMENT_OUTCOMES)[number]

export function isAnnouncementOutcome(value: string): value is AnnouncementOutcome {
  return (ANNOUNCEMENT_OUTCOMES as readonly string[]).includes(value)
}

export interface OutcomeCopy {
  tone: 'success' | 'warning' | 'critical'
  title: string
  body: string
}

export const OUTCOME_COPY_TR: Readonly<Record<AnnouncementOutcome, OutcomeCopy>> = Object.freeze({
  published: {
    tone: 'success',
    title: 'Duyuru yayınlandı',
    body: 'Hedeflenen kullanıcılar duyuruyu tarih aralığı içinde görecek. İşlem gerekçenizle birlikte denetim kaydına yazıldı.',
  },
  unpublished: {
    tone: 'success',
    title: 'Duyuru yayından kaldırıldı',
    body: 'Kayıt tekrar taslak durumuna döndü ve hiç kimseye gösterilmiyor. İşlem gerekçenizle birlikte denetim kaydına yazıldı.',
  },
  saved: {
    tone: 'success',
    title: 'Taslak güncellendi',
    body: 'Değişiklikler kaydedildi. Taslak yayınlanana kadar hiç kimseye gösterilmez.',
  },
  created: {
    tone: 'success',
    title: 'Taslak oluşturuldu',
    body: 'Duyuru taslak olarak kaydedildi. Yayınlamadan önce önizlemeyi ve hedeflemeyi kontrol edin.',
  },
  forbidden: {
    tone: 'critical',
    title: 'Yetki yok',
    body: 'Bu işlem için gereken yetkiye sahip değilsiniz. Deneme, denetim kaydına yazıldı.',
  },
  invalid: {
    tone: 'warning',
    title: 'Eksik ya da geçersiz bilgi',
    body: 'Alanları kontrol edip tekrar deneyin. Gerekçe alanı zorunludur.',
  },
  notfound: {
    tone: 'warning',
    title: 'Duyuru bulunamadı',
    body: 'Kayıt siz bu ekranı açtıktan sonra kaldırılmış olabilir.',
  },
  conflict: {
    tone: 'warning',
    title: 'Kayıt bu arada değişti',
    body: 'Duyurunun durumu siz bu ekranı açtıktan sonra değişti. Sayfayı yenileyip tekrar bakın.',
  },
  ratelimited: {
    tone: 'warning',
    title: 'Çok fazla deneme',
    body: 'Kısa sürede çok fazla işlem yapıldı. Bir süre bekleyip tekrar deneyin.',
  },
  auditMissing: {
    tone: 'critical',
    title: 'İşlem yapıldı, denetim kaydı yazılamadı',
    body: 'Değişiklik uygulandı ama denetim kaydı yazılamadı. Bunu altyapı ekibine bildirin: kayıtsız bir yayın kararı geriye dönük açıklanamaz.',
  },
  failed: {
    tone: 'critical',
    title: 'İşlem tamamlanamadı',
    body: 'Değişiklik uygulanmadı. Kısa süre sonra tekrar deneyin.',
  },
})

// ===========================================================================
// The strings
// ===========================================================================

export const announcementMessages = {
  list: {
    title: 'Duyurular',
    description:
      'Uygulama içi duyurular. Yayınlanmamış bir kayıt taslaktır ve hiç kimseye gösterilmez; yayınlandıktan sonra tarih aralığı ne zaman görüneceğine karar verir.',
    caption: 'Duyuru listesi',
    newAnnouncement: 'Yeni duyuru',
    empty: 'Henüz hiç duyuru oluşturulmamış.',
    emptyFiltered: 'Bu filtrelerle eşleşen duyuru yok.',
    emptyHint: 'Durum ya da hedef kitle filtresini gevşetmeyi deneyin.',
    errorHint: 'Duyuru tablosuna ulaşılamadı. Bağlantı yeniden denenebilir.',
    reset: 'Filtreleri temizle',
    defaultOrder: 'Başlangıç tarihine göre, en yenisi üstte.',
    detailLink: 'Aç',
    stateFilter: 'Durum',
    audienceFilter: 'Hedef kitle',
    localeFilter: 'Dil',
    dismissibleFilter: 'Kapatılabilirlik',
    searchFilter: 'Başlık',
    searchPlaceholder: 'Başlık başlangıcı',
    noWritePermission:
      'Duyuru yazma yetkiniz yok. Bu sayfayı yalnızca görüntüleme amacıyla açabilirsiniz.',
    privacyNote:
      'Bu sayfadaki her metin şirketin kendi yazdığı duyurudur. Duyuru tablosu hiçbir kullanıcı içeriğine bağlı değildir.',
  },

  tiles: {
    draft: 'Taslak',
    draftHint: 'Yayınlanmamış, kimseye görünmüyor',
    scheduled: 'Planlandı',
    scheduledHint: 'Yayınlandı, başlangıcı bekliyor',
    live: 'Şu anda yayında',
    liveHint: 'Bitiş tarihi olan, görünen duyurular',
    openEnded: 'Süresiz yayında',
    openEndedHint: 'Bitiş tarihi yok — elle kaldırılana kadar kalır',
    ended: 'Süresi doldu',
    endedHint: 'Yayında ama tarih aralığı geçmiş',
  },

  columns: {
    title: 'Başlık',
    state: 'Durum',
    audience: 'Hedef kitle',
    platforms: 'Platform',
    locale: 'Dil',
    minVersion: 'En düşük sürüm',
    window: 'Tarih aralığı',
    starts: 'Başlangıç',
    ends: 'Bitiş',
    dismissible: 'Kapatılabilir',
    published: 'Yayınlanma',
    updated: 'Güncelleme',
  },

  values: {
    allPlatforms: 'Tümü',
    noEnd: 'Bitiş yok',
    noMinVersion: 'Sürüm sınırı yok',
    dismissibleYes: 'Kapatılabilir',
    dismissibleNo: 'Kapatılamaz',
    neverPublished: 'Yayınlanmadı',
    unknownAdmin: 'Bilinmeyen yönetici',
  },

  form: {
    newTitle: 'Yeni duyuru',
    newDescription:
      'Duyuru taslak olarak kaydedilir. Taslak hiç kimseye gösterilmez; yayınlama ayrı bir karardır ve gerekçe ister.',
    editTitle: 'Taslağı düzenle',
    editDescription:
      'Yalnızca taslaklar düzenlenebilir. Yayındaki bir duyuruyu değiştirmek için önce yayından kaldırın — böylece kullanıcıların gördüğü metin, hakkında gerekçe yazılmış metin olur.',
    lockedTitle: 'Yayındaki duyuru düzenlenemez',
    lockedBody:
      'Bu kayıt yayında. Metnini ya da hedeflemesini değiştirmek için önce yayından kaldırın; kaldırma işlemi gerekçesiyle birlikte denetim kaydına yazılır.',

    titleLabel: 'Başlık',
    titleDescription: 'Uygulamada duyurunun ilk satırı. Kısa ve bir cümlelik olmalı.',
    titlePlaceholder: 'Duyuru başlığı',

    bodyLabel: 'Metin',
    bodyDescription: 'Duyurunun gövdesi. Düz metin; biçimlendirme uygulanmaz.',
    bodyPlaceholder: 'Duyuru metni',

    audienceLabel: 'Hedef kitle',
    audienceDescription:
      'iOS ve Android seçenekleri platforma göre hedefler; bu ikisi seçildiğinde ayrıca platform kutusu işaretlenemez.',

    platformsLabel: 'Platformlar',
    platformsDescription:
      'Boş bırakılırsa platform ayrımı yapılmaz. Hedef kitle iOS ya da Android seçildiğinde bu alan boş kalmalıdır: veritabanı iki platform filtresini birlikte kabul etmez.',

    localeLabel: 'Dil',
    localeDescription: 'Duyuru yalnızca bu dili kullanan hesaplara gösterilir.',

    minVersionLabel: 'En düşük uygulama sürümü',
    minVersionDescription:
      'Örnek: 2.4.0. Boş bırakılırsa sürüm sınırı uygulanmaz. Sürüm sınırı erişim tahminine yansımaz.',
    minVersionPlaceholder: '2.4.0',

    startsLabel: 'Başlangıç',
    startsDescription:
      'Yayınlandıktan sonra duyurunun görünmeye başlayacağı an. Saatler Europe/Istanbul.',

    endsLabel: 'Bitiş',
    endsDescription:
      'Boş bırakılırsa duyuru elle kaldırılana kadar kalır. Bitiş, başlangıçtan sonra olmalıdır.',

    dismissibleLabel: 'Kullanıcı kapatabilsin',
    dismissibleDescription:
      'Kapatılamaz duyurular yalnızca kesinti ve zorunlu güncelleme içindir. Kapatılamaz bir pazarlama duyurusu karanlık desendir.',

    submitCreate: 'Taslağı kaydet',
    submitCreating: 'Kaydediliyor…',
    submitSave: 'Değişiklikleri kaydet',
    submitSaving: 'Kaydediliyor…',
    cancel: 'Vazgeç',

    titleRequired: 'Başlık boş olamaz.',
    titleTooLong: (max: number): string => `Başlık en fazla ${max} karakter olabilir.`,
    bodyRequired: 'Metin boş olamaz.',
    bodyTooLong: (max: number): string => `Metin en fazla ${max} karakter olabilir.`,
    minVersionShape: 'Sürüm 2.4.0 biçiminde olmalıdır.',
    startsInvalid: 'Geçerli bir başlangıç tarihi girin.',
    endsInvalid: 'Geçerli bir bitiş tarihi girin.',
    endsBeforeStart: 'Bitiş, başlangıçtan sonra olmalıdır.',
    platformConflict:
      'Hedef kitle iOS ya da Android olduğunda ayrıca platform seçilemez: iki platform filtresi birlikte hiç kimseye ulaşmaz.',
    unknownAudience: 'Tanınmayan bir hedef kitle gönderildi.',
    unknownPlatform: 'Tanınmayan bir platform gönderildi.',
    unknownLocale: 'Tanınmayan bir dil gönderildi.',
  },

  preview: {
    title: 'Uygulamada nasıl görünecek',
    description:
      'Uygulamanın kendi tasarım jetonlarıyla — @da/design-tokens — çizildi. Renkler, yazı tipi ölçeği ve köşe yarıçapı kullanıcının gördüğüyle aynı değerlerden geliyor.',
    lightLabel: 'Açık tema',
    darkLabel: 'Koyu tema',
    dismissLabel: 'Kapat',
    pinnedLabel: 'Kapatılamaz',
    emptyTitle: 'Başlık',
    emptyBody: 'Duyuru metni burada görünecek.',
    draftWatermark: 'TASLAK — yayınlanmadı',
  },

  targeting: {
    title: 'Hedefleme',
    description: 'Duyurunun kime, hangi platformda ve hangi sürümden itibaren gösterileceği.',
  },

  reach: {
    title: 'Tahmini erişim',
    description:
      'Hedeflemenin karşılık geldiği hesap sayısı. Her rakam veritabanında sayılır; tarayıcıya tablo indirilmez.',
    targeted: 'Hedeflenen hesap',
    targetedHint: 'Silinmemiş, dili ve planı hedeflemeye uyan hesaplar',
    withDevice: 'Hedef platformda kayıtlı cihazı olan',
    withDeviceHint: 'Bildirim kaydı bulunan cihazlara göre',
    liveUsers: 'Toplam etkin hesap',
    liveUsersHint: 'Silinmemiş bütün hesaplar',
    share: (percent: string): string => `Etkin hesapların %${percent} kadarı`,
    unmeasuredTitle: 'Bu tahmine girmeyenler',
    unmeasuredVersion:
      'En düşük uygulama sürümü: hiçbir toplulaştırılmış görünüm kullanıcı başına uygulama sürümünü taşımıyor, bu yüzden sürüm sınırı sayıma katılmadı. Gerçek erişim bu rakamdan düşük olacaktır.',
    unmeasuredWeb:
      'Web platformu: cihaz kaydı yalnızca iOS ve Android için tutuluyor, bu yüzden web hedefi sayılamıyor.',
    unmeasuredPlan:
      'Plan ayrımı abonelik durumundan türetildi; mağaza dışı (davet ya da referans) Pro erişimleri bu sayıma girmez.',
    error: 'Erişim tahmini hesaplanamadı.',
    errorHint:
      'Yayınlama kararı bu rakama dayanıyorsa önce tahminin yeniden yüklenmesini bekleyin.',
  },

  detail: {
    kicker: 'Duyuru',
    backToList: 'Duyuru listesine dön',
    notFoundTitle: 'Duyuru bulunamadı',
    notFoundBody:
      'Bu kimlikle bir duyuru yok. Bağlantı eksik kopyalanmış ya da kayıt kaldırılmış olabilir.',
    notFoundAction: 'Duyuru listesine dön',
    factsTitle: 'Kayıt',
    factsDescription: 'Kimin oluşturduğu, kimin yayınladığı ve ne zaman değiştiği.',
    createdBy: 'Oluşturan',
    createdAt: 'Oluşturulma',
    publishedBy: 'Yayınlayan',
    publishedAt: 'Yayınlanma',
    updatedAt: 'Son güncelleme',
    identifier: 'Kimlik',
    trailTitle: 'Denetim kaydı',
    trailDescription: 'Bu duyuru hakkında yapılmış her işlem: kim, ne zaman, hangi gerekçeyle.',
    trailEmpty: 'Bu duyuru için henüz denetim kaydı yok.',
    trailError: 'Denetim kaydı getirilemedi.',
    trailActor: 'Yönetici',
    trailAction: 'İşlem',
    trailReason: 'Gerekçe',
    trailWhen: 'Zaman',
    trailOutcome: 'Sonuç',
    trailOutcomeSuccess: 'Başarılı',
    trailOutcomeFailure: 'Başarısız',
    trailNoReason: 'Gerekçe yok',
  },

  publish: {
    sectionTitle: 'Yayın durumu',
    sectionDescription:
      'Yayınlama, duyurunun kullanıcılara ulaştığı andır. Yayından kaldırma da aynı ağırlıkta bir karardır: ikisi de gerekçe ister ve ikisi de denetim kaydına yazılır.',

    publishTrigger: 'Yayınla',
    publishTitle: 'Duyuruyu yayınla',
    publishDescription:
      'Yayınlandığı anda bu duyuru, tarih aralığı içindeki hedef kitleye gösterilmeye başlar. Aşağıdaki rakam, hedeflemenin şu anda karşılık geldiği hesap sayısıdır.',
    publishConfirm: 'Yayınla',
    publishReasonLabel: 'Yayınlama gerekçesi',
    publishReasonPlaceholder: 'Bu duyuru neden şimdi yayınlanıyor?',
    publishReasonDescription:
      'Gerekçe denetim kaydına yazılır ve adınızla birlikte saklanır. Altı ay sonra bu kararı inceleyecek biri yalnızca bu cümleyi okuyacak.',

    publishNote:
      'Bu işlem geri alınabilir ama görülmüş olması geri alınamaz: yayından kaldırsanız bile, o ana kadar duyuruyu görmüş kullanıcılar onu görmüş olur.',
    unpublishNote:
      'Duyuru anında görünmez olur. Metin ve hedefleme silinmez; kayıt taslağa döner ve yeniden yayınlanabilir.',

    unpublishTrigger: 'Yayından kaldır',
    unpublishTitle: 'Duyuruyu yayından kaldır',
    unpublishDescription:
      'Kayıt taslağa döner ve anında hiç kimseye gösterilmez. Metin ve hedefleme korunur; tekrar yayınlamak yeni bir karar ve yeni bir gerekçe ister.',
    unpublishConfirm: 'Yayından kaldır',
    unpublishReasonLabel: 'Kaldırma gerekçesi',
    unpublishReasonPlaceholder: 'Duyuru neden kaldırılıyor?',

    alreadyPublished: 'Bu duyuru zaten yayında.',
    alreadyDraft: 'Bu duyuru zaten taslak.',
    noPermission: 'Yayınlama ve yayından kaldırma için `announcement.write` yetkisi gerekir.',
    draftNotice:
      'TASLAK — bu duyuru hiç kimseye gösterilmiyor. Yayınlanmamış bir kayıt, tarih aralığı ne derse desin uygulamada görünmez.',
    liveNotice: 'YAYINDA — bu duyuru şu anda hedeflenen kullanıcıların uygulamasında görünüyor.',
    scheduledNotice:
      'YAYINDA, HENÜZ BAŞLAMADI — kayıt yayınlandı; başlangıç tarihi geldiğinde ek bir işlem gerekmeden görünmeye başlayacak.',
    endedNotice:
      'SÜRESİ DOLDU — kayıt yayında görünüyor ama tarih aralığı geçtiği için kimseye gösterilmiyor.',
  },

  banner: {
    dismiss: 'Kapat',
  },
} as const

/** The audit action names this module writes, with their Turkish labels. */
export const ANNOUNCEMENT_ACTION_LABELS_TR: Readonly<Record<string, string>> = Object.freeze({
  'announcement.created': 'Duyuru taslağı oluşturuldu',
  'announcement.updated': 'Duyuru taslağı güncellendi',
  'announcement.published': 'Duyuru yayınlandı',
  'admin.announcement_unpublished': 'Duyuru yayından kaldırıldı',
})
