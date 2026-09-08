import type { ErrorCode } from '@da/domain'
import type { FlagOutcome, FlagPlan, FlagPlatform, FlagState } from '@/components/flags/contract'

/**
 * Every Turkish string the feature-flag area renders.
 *
 * ---------------------------------------------------------------------------
 * WHY THE WORDING IS SO LITERAL
 * ---------------------------------------------------------------------------
 *
 * A feature flag is read by the mobile app, not by this console. What an
 * operator sees here is a record of an instruction that is already in force on
 * somebody's phone — so a screen that rounds "enabled at 25% for iOS on Pro"
 * down to a green dot is not simplifying, it is misreporting. Every label below
 * names a condition rather than a mood: the state pill says which of the four
 * states the evaluator is in, and the sentence beside it spells out the
 * audience in full, including the parts that are unrestricted.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS NOT HERE
 * ---------------------------------------------------------------------------
 *
 * No evaluation logic and no tone mapping. Precedence lives in
 * `feature_flag_is_enabled()` in migration 0019 and nowhere else; the tones
 * live in `@/components/flags/presentation`, beside the components that render
 * them. This file is a string table, and the label maps are typed against the
 * contract's unions so an enum member added to the database — and therefore to
 * the contract — fails to compile until it has a Turkish name.
 */

// ===========================================================================
// The vocabulary
// ===========================================================================

export const flagStateLabels: Readonly<Record<FlagState, string>> = Object.freeze({
  killed: 'Kill switch',
  off: 'Kapalı',
  partial: 'Kısmi',
  on: 'Açık',
})

/** What each state means for the phone in a user's hand, in one sentence. */
export const flagStateHints: Readonly<Record<FlagState, string>> = Object.freeze({
  killed:
    'Kill switch çekili. Bayrak, açık olsa da, hedefleme uysa da, kullanıcıya özel tanım olsa da herkes için kapalı döner.',
  off: 'Ana anahtar kapalı. Hedefleme ve yüzde ne olursa olsun kimse bu özelliği görmüyor; yalnızca kullanıcıya özel "açık" tanımlar bu durumu deler.',
  partial:
    'Açık, ama herkese değil. Aşağıdaki hedefleme ve yüzde koşullarını sağlayan kullanıcılar görüyor.',
  on: 'Açık ve yüzde %100. Aşağıdaki hedefleme koşullarını sağlayan herkes görüyor.',
})

export const flagPlatformLabels: Readonly<Record<FlagPlatform, string>> = Object.freeze({
  ios: 'iOS',
  android: 'Android',
  web: 'Web',
})

export const flagPlanLabels: Readonly<Record<FlagPlan, string>> = Object.freeze({
  free: 'Ücretsiz',
  pro: 'Pro',
})

// ===========================================================================
// Failures
//
// A screen never quotes a database message. These are the sentences that stand
// in for one, chosen by the typed `ErrorCode` the action came back with.
// ===========================================================================

export const GENERIC_FLAG_FAILURE_TR = 'İşlem tamamlanamadı. Sayfayı yenileyip tekrar deneyin.'

const FAILURE_MESSAGES_TR: Readonly<Partial<Record<ErrorCode, string>>> = Object.freeze({
  not_found: 'Bu bayrak bulunamadı. Başka bir yönetici silmiş ya da bağlantı hatalı olabilir.',
  forbidden: 'Bu işlem için gereken yetkiye sahip değilsiniz.',
  unauthorized: 'Oturumunuzun süresi dolmuş görünüyor. Tekrar giriş yapın.',
  validation_failed: 'Girilen değerler veritabanının kabul ettiği biçimde değil.',
  sync_conflict: 'Kayıt siz bu ekranı açtıktan sonra değişti. Yenileyip tekrar bakın.',
  rate_limited: 'Çok fazla deneme yapıldı. Bir süre bekleyip tekrar deneyin.',
  server_unavailable: 'Veritabanına ulaşılamadı. Kısa süre sonra tekrar deneyin.',
})

export function flagFailureMessage(code: ErrorCode): string {
  return FAILURE_MESSAGES_TR[code] ?? GENERIC_FLAG_FAILURE_TR
}

// ===========================================================================
// What an action reports back
// ===========================================================================

export interface FlagOutcomeMessage {
  readonly title: string
  readonly body: string
}

export const flagOutcomeMessages: Readonly<Record<FlagOutcome, FlagOutcomeMessage>> = Object.freeze(
  {
    created: {
      title: 'Bayrak oluşturuldu',
      body: 'Kayıt açıldı ve denetim kaydına kimliğiniz ve gerekçenizle birlikte yazıldı. Mobil uygulama bu kaydı bir sonraki değerlendirmesinde okur.',
    },
    updated: {
      title: 'Hedefleme güncellendi',
      body: 'Yeni hedefleme kaydedildi. Değişiklik, eski ve yeni değerleriyle birlikte denetim kaydına düştü.',
    },
    enabled: {
      title: 'Bayrak açıldı',
      body: 'Ana anahtar açıldı. Kimin göreceğini yayılım yüzdesi ve hedefleme belirler.',
    },
    disabled: {
      title: 'Bayrak kapatıldı',
      body: 'Ana anahtar kapatıldı. Kullanıcıya özel "açık" tanımlar bu durumdan etkilenmez; kesin durdurmak için kill switch kullanın.',
    },
    killed: {
      title: 'Kill switch çekildi',
      body: 'Bayrak artık herkes için kapalı dönüyor: hedefleme, yüzde ve kullanıcıya özel tanımlar dikkate alınmıyor.',
    },
    unkilled: {
      title: 'Kill switch bırakıldı',
      body: 'Bayrak yeniden ana anahtarına, hedeflemesine ve yüzdesine göre değerlendiriliyor.',
    },
    overrideSet: {
      title: 'Kullanıcıya özel tanım kaydedildi',
      body: 'Bu kullanıcı için bayrak, süresi dolana kadar sabitlendi. Kill switch bu tanımı da geçersiz kılar.',
    },
    overrideRemoved: {
      title: 'Kullanıcıya özel tanım kaldırıldı',
      body: 'Kullanıcı yeniden bayrağın genel kurallarına göre değerlendiriliyor.',
    },
    noop: {
      title: 'Değişen bir şey yok',
      body: 'Gönderilen değerler kayıttakiyle aynı. Denetim kaydına gereksiz bir satır yazılmadı.',
    },
    duplicate: {
      title: 'Bu anahtar zaten var',
      body: 'Aynı anahtara sahip başka bir bayrak kayıtlı. Var olan bayrağı düzenleyin ya da başka bir anahtar seçin.',
    },
    conflict: {
      title: 'Kayıt bu arada değişti',
      body: 'Bayrak, siz bu ekranı açtıktan sonra başka bir yönetici tarafından değiştirilmiş. Hiçbir şey yazılmadı; sayfayı yenileyip güncel duruma bakın.',
    },
    invalid: {
      title: 'Gönderilen değerler geçerli değil',
      body: 'Alanları kontrol edip tekrar deneyin. Gerekçe alanı da zorunludur.',
    },
    forbidden: {
      title: 'Yetkiniz yok',
      body: 'Bu işlem için `flags.write` yetkisi gerekiyor. Reddedilen deneme denetim kaydına yazıldı.',
    },
    notfound: {
      title: 'Kayıt bulunamadı',
      body: 'Bayrak ya da kullanıcıya özel tanım artık yok. Listeyi yenileyip tekrar bakın.',
    },
    ratelimited: {
      title: 'Çok fazla deneme',
      body: 'Kısa sürede çok fazla bayrak değişikliği yapıldı. Bir süre bekleyip tekrar deneyin.',
    },
    failed: {
      title: 'İşlem tamamlanamadı',
      body: GENERIC_FLAG_FAILURE_TR,
    },
    auditMissing: {
      title: 'Değişiklik yapıldı, denetim kaydı yazılamadı',
      body: 'Değişiklik uygulandı ama iz kaydı düşmedi. Bunu altyapı ekibine bildirin: kayıtsız bir yetkili değişiklik geride kaldı.',
    },
  },
)

// ===========================================================================
// The strings
// ===========================================================================

export const flagMessages = {
  /** For the sidebar entry, which is wired centrally. */
  nav: {
    label: 'Özellik bayrakları',
    description: 'Yayılım yüzdesi, platform ve plan hedeflemesi, kill switch.',
  },

  list: {
    title: 'Özellik bayrakları',
    description:
      'Mobil uygulamanın okuduğu kayıtlar. Her satır bayrağın gerçek durumunu yazar: ana anahtar, yayılım yüzdesi, platform ve plan hedeflemesi, sürüm aralığı ve kill switch.',
    meta: 'Bu ekran kaydı düzenler, değerlendirmez. Bir kullanıcının bayrağı görüp görmediğine veritabanındaki tek değerlendirici — feature_flag_is_enabled() — karar verir.',
    newFlag: 'Yeni bayrak',
    tableCaption: 'Özellik bayrakları',
    empty: 'Henüz hiç özellik bayrağı tanımlanmamış.',
    emptyFiltered: 'Bu filtrelerle eşleşen bayrak yok.',
    detailLink: 'Ayrıntı',
    searchInvalid:
      'Arama kutusuna yalnızca bayrak anahtarının başlangıcı yazılabilir: küçük harf, rakam, alt çizgi ve nokta.',
    noWritePermission:
      'Bayrak değiştirme yetkiniz yok. Bu sayfayı yalnızca inceleme amacıyla görüyorsunuz.',
  },

  banner: {
    dismiss: 'Kapat',
  },

  filters: {
    state: 'Durum',
    platform: 'Hedeflenen platform',
    plan: 'Hedeflenen plan',
    search: 'Anahtar',
    searchPlaceholder: 'örn. assistant.',
    targetingNote:
      'Platform ve plan filtreleri yalnızca o platformu veya planı açıkça hedefleyen bayrakları getirir; hedeflemesi boş olan (yani herkese açık) bayraklar bu filtrelerin dışında kalır.',
  },

  tiles: {
    total: 'Toplam bayrak',
    totalHint: 'Kayıtlı bütün özellik bayrakları.',
    on: 'Tam açık',
    onHint: 'Ana anahtarı açık ve yayılımı %100. Hedefleme yine de daraltıyor olabilir.',
    partial: 'Kısmi',
    partialHint: 'Açık ama yayılımı %100 değil.',
    killed: 'Kill switch çekili',
    killedHint: 'Her koşulda kapalı dönen bayraklar.',
  },

  columns: {
    key: 'Anahtar',
    state: 'Gerçek durum',
    rollout: 'Yayılım',
    targeting: 'Hedefleme',
    overrides: 'Özel tanım',
    updated: 'Son değişiklik',
    detail: 'Ayrıntı',
    overridesTitle: 'Süresi dolmamış, kullanıcıya özel tanım sayısı (açık / kapalı).',
  },

  targeting: {
    allPlatforms: 'tüm platformlar',
    allPlans: 'tüm planlar',
    allVersions: 'tüm sürümler',
    everyone: 'herkes',
    rollout: (percent: number): string => `%${percent} yayılım`,
    fullRollout: 'tam yayılım',
    noRollout: 'yayılım %0',
    minVersion: (version: string): string => `${version} ve üstü`,
    maxVersion: (version: string): string => `${version} ve altı`,
    versionRange: (min: string, max: string): string => `${min} – ${max}`,
    narrowedNote: 'Bu bayrak herkese açık değil; yukarıdaki koşulları sağlayanlara açık.',
    everyoneNote: 'Hedefleme boş: koşul sağlayan herkes bu bayrağı görüyor.',
  },

  detail: {
    breadcrumb: 'Özellik bayrakları',
    backToList: 'Listeye dön',
    notFound: 'Bayrak bulunamadı',
    notFoundHint:
      'Bu kimlikte bir özellik bayrağı yok. Bağlantı eski olabilir ya da bayrak silinmiş olabilir.',
    stateSection: 'Şu anki durum',
    stateDescription:
      'Aşağıdaki cümle, veritabanındaki değerlendiricinin uyguladığı sırayla okunur: kill switch, kullanıcıya özel tanım, ana anahtar, platform / plan / sürüm hedeflemesi, sonra yüzde kovası.',
    precedence: 'Değerlendirme sırası',
    precedenceSteps: [
      'Kill switch çekiliyse: herkes için kapalı, başka hiçbir koşula bakılmaz.',
      'Kullanıcıya özel, süresi dolmamış bir tanım varsa: o tanım ne diyorsa o.',
      'Ana anahtar kapalıysa: kapalı.',
      'Platform, plan ve sürüm hedeflemesi tutmuyorsa: kapalı.',
      'Kalanlar için: anahtar ve kullanıcı kimliğinden türeyen sabit yüzde kovası.',
    ],
    facts: 'Kayıt',
    factKey: 'Anahtar',
    factDescription: 'Açıklama',
    factEnabled: 'Ana anahtar',
    factKillSwitch: 'Kill switch',
    factRollout: 'Yayılım yüzdesi',
    factPlatforms: 'Platform hedeflemesi',
    factPlans: 'Plan hedeflemesi',
    factVersions: 'Sürüm aralığı',
    factCreated: 'Oluşturuldu',
    factUpdated: 'Son değişiklik',
    factId: 'Kayıt kimliği',
    enabledYes: 'Açık',
    enabledNo: 'Kapalı',
    killSwitchPulled: 'Çekili',
    killSwitchReleased: 'Bırakılmış',
    changedBy: (who: string, when: string): string => `${who} · ${when}`,
    changedByUnknown: 'Bilinmiyor',
    auditCount: 'Kayıtlı değişiklik',
    auditCountHint: 'Bu bayrak hakkında denetim kaydına düşmüş satır sayısı.',
    overrideLive: 'Etkin özel tanım',
    overrideLiveHint: 'Süresi dolmamış, kullanıcıya özel tanımlar.',
    overrideExpired: 'Süresi dolmuş',
    overrideExpiredHint:
      'Artık değerlendirmeye girmiyor. Temizlik işi bunları yedi gün sonra siler.',
    rolloutTile: 'Yayılım',
    rolloutTileHint: 'Hedeflemeyi geçen kullanıcıların yüzde kaçına açık.',
  },

  actions: {
    section: 'İşlemler',
    description:
      'Her işlem yazılı bir gerekçe ister ve gerekçesiyle birlikte denetim kaydına düşer. Gerekçesiz bir işlem, veritabanı tarafından reddedilir.',
    enable: 'Bayrağı aç',
    enableTitle: 'Bayrağı açmak',
    enableBody:
      'Ana anahtar açılacak. Bayrağı kimlerin göreceğini bundan sonra yayılım yüzdesi ile platform, plan ve sürüm hedeflemesi belirler.',
    enableConfirm: 'Aç',
    disable: 'Bayrağı kapat',
    disableTitle: 'Bayrağı kapatmak',
    disableBody:
      'Ana anahtar kapatılacak; bayrak hedefleme ne olursa olsun kapalı dönecek. Dikkat: kullanıcıya özel "açık" tanımlar bu kapatmayı deler. Bir özelliği kesin olarak durdurmak için kill switch kullanın.',
    disableConfirm: 'Kapat',
    pullKill: 'Kill switch çek',
    pullKillTitle: 'Kill switch çekilecek',
    pullKillBody:
      'Bu bayrak bundan sonra herkes için kapalı dönecek: ana anahtar, yayılım yüzdesi, platform ve plan hedeflemesi ile kullanıcıya özel bütün tanımlar dikkate alınmayacak. Bir özelliği anında durdurmanın garantili yolu budur.',
    pullKillConfirm: 'Kill switch çek',
    releaseKill: 'Kill switch bırak',
    releaseKillTitle: 'Kill switch bırakılacak',
    releaseKillBody:
      'Bayrak yeniden kendi ana anahtarına, hedeflemesine ve yayılım yüzdesine göre değerlendirilecek. Bırakmadan önce aşağıdaki hedeflemenin hâlâ doğru olduğundan emin olun.',
    releaseKillConfirm: 'Kill switch bırak',
    killPulledNote:
      'Kill switch şu anda çekili. Aşağıdaki hedefleme kaydediliyor ama değerlendirmeye girmiyor.',
    reasonLabel: 'Gerekçe',
    reasonPlaceholder: 'Neden? Örn. "Ödeme akışında hata raporu geldi, özelliği durduruyorum."',
    noPermission: 'Bu bölümdeki işlemler için `flags.write` yetkisi gerekiyor.',
  },

  form: {
    createTitle: 'Yeni özellik bayrağı',
    createDescription:
      'Kayıt buradan açılır. Yeni bir bayrak, aksini seçmediğiniz sürece kapalı ve %0 yayılımla oluşturulur — yani oluşturmak tek başına kimseye bir şey açmaz.',
    editTitle: 'Hedefleme',
    editDescription:
      'Kaydı düzenler. Boş bırakılan platform ve plan listesi "kısıtlama yok" demektir, "hiç kimse" değil.',
    keyLabel: 'Anahtar',
    keyDescription:
      'Mobil uygulamanın bayrağı çağırdığı ad. Küçük harf, rakam ve alt çizgi; bölümler nokta ile ayrılır. Oluşturulduktan sonra değiştirilemez.',
    keyPlaceholder: 'assistant.new_composer',
    keyInvalid:
      'Anahtar küçük harfle başlamalı; yalnızca küçük harf, rakam, alt çizgi ve nokta içerebilir.',
    keyTaken: 'Bu anahtar başka bir bayrakta kullanılıyor.',
    descriptionLabel: 'Açıklama',
    descriptionDescription:
      'Bu bayrağın neyi açıp kapattığı. Altı ay sonra kaydı okuyan kişi buradan anlayacak.',
    descriptionPlaceholder: 'Yeni asistan yazım ekranını açar.',
    descriptionTooShort: (min: number): string => `Açıklama en az ${min} karakter olmalıdır.`,
    enabledLabel: 'Ana anahtar',
    enabledDescription:
      'Kapalıyken hedefleme ve yüzde hiç değerlendirilmez. Yeni bayraklarda kapalı bırakmanız önerilir.',
    enabledOn: 'Açık',
    enabledOff: 'Kapalı',
    rolloutLabel: 'Yayılım yüzdesi',
    rolloutDescription:
      'Hedeflemeyi geçen kullanıcıların yüzde kaçı. Kova, anahtar ile kullanıcı kimliğinden türer: aynı kullanıcı her değerlendirmede aynı tarafta kalır.',
    rolloutInvalid: 'Yayılım yüzdesi 0 ile 100 arasında bir tam sayı olmalıdır.',
    platformsLabel: 'Platform hedeflemesi',
    platformsDescription: 'Hiçbiri seçilmezse bütün platformlar hedeflenir.',
    plansLabel: 'Plan hedeflemesi',
    plansDescription: 'Hiçbiri seçilmezse bütün planlar hedeflenir.',
    minVersionLabel: 'En düşük uygulama sürümü',
    maxVersionLabel: 'En yüksek uygulama sürümü',
    versionDescription:
      'Boş bırakılabilir. Biçim: 1.4.0. Karşılaştırma sayısaldır: 1.10.0 > 1.9.0.',
    versionInvalid: 'Sürüm 1.4.0 biçiminde olmalıdır.',
    versionOrder: 'En düşük sürüm, en yüksek sürümden büyük olamaz.',
    versionNeedsAppVersion:
      'Sürüm aralığı verildiğinde, uygulama sürümünü bildirmeyen istemciler bu bayrağı alamaz.',
    reasonLabel: 'Gerekçe',
    reasonDescription: (min: number): string =>
      `Bu cümle denetim kaydına yazılır ve silinemez. En az ${min} karakter.`,
    reasonPlaceholder: 'Örn. "Beta kullanıcıları için yayılımı %10\'a çekiyorum."',
    submitCreate: 'Bayrağı oluştur',
    submitEdit: 'Hedeflemeyi kaydet',
    submitting: 'Kaydediliyor…',
    previewLabel: 'Kaydedilirse',
    unchanged: 'Değişiklik yok — kaydedilecek bir şey bulunamadı.',
    saved: 'Hedefleme kaydedildi.',
  },

  overrides: {
    section: 'Kullanıcıya özel tanımlar',
    description:
      'Tek bir hesap için bayrağı sabitler; hata ayıklarken kullanılır. Her tanım yazılı bir gerekçe taşır ve süresi dolduğunda değerlendirmeye girmez. Kill switch bu tanımları da geçersiz kılar.',
    tableCaption: 'Kullanıcıya özel bayrak tanımları',
    empty: 'Bu bayrak için kullanıcıya özel tanım yok.',
    columnUser: 'Kullanıcı',
    columnValue: 'Değer',
    columnReason: 'Gerekçe',
    columnExpiry: 'Bitiş',
    columnCreated: 'Tanımlandı',
    columnCreatedBy: 'Tanımlayan',
    columnAction: 'İşlem',
    valueOn: 'Açık',
    valueOff: 'Kapalı',
    expired: 'Süresi doldu',
    noExpiry: 'Süresiz',
    expiredNote:
      'Süresi dolmuş tanımlar değerlendirmeye girmez ama listede kalır: unutulmuş bir hata ayıklama tanımı ancak böyle fark edilir. Temizlik işi bunları yedi gün sonra siler.',
    addTitle: 'Yeni özel tanım',
    addDescription:
      'Kullanıcı kimliğini kullanıcı kaydından kopyalayın. Aynı kullanıcı için var olan tanım güncellenir.',
    userLabel: 'Kullanıcı kimliği (UUID)',
    userDescription: 'Kullanıcı kaydındaki kimlik. E-posta adresi kabul edilmez.',
    userPlaceholder: '00000000-0000-0000-0000-000000000000',
    userInvalid: 'Geçerli bir kullanıcı kimliği (UUID) değil.',
    userUnknown: 'Bu kimlikte bir kullanıcı bulunamadı.',
    valueLabel: 'Bu kullanıcı için',
    valueDescription: 'Bayrak bu kullanıcı için sabitlenecek değer.',
    durationLabel: 'Süre',
    durationDescription:
      'Süre dolduğunda tanım kendiliğinden değerlendirme dışı kalır. Süresiz tanımlar unutulur; mümkünse bir süre verin.',
    durationOption: (days: number): string => (days === 0 ? 'Süresiz' : `${days} gün`),
    reasonLabel: 'Gerekçe',
    reasonPlaceholder: 'Örn. "DA-001042 numaralı kayıtta hata tekrar üretimi için."',
    submit: 'Tanımı kaydet',
    submitting: 'Kaydediliyor…',
    removeLabel: 'Kaldır',
    removeTitle: 'Özel tanım kaldırılacak',
    removeBody:
      'Bu kullanıcı için sabitlenen değer silinecek ve kullanıcı yeniden bayrağın genel kurallarına göre değerlendirilecek.',
    removeConfirm: 'Kaldır',
    noPermission: 'Kullanıcıya özel tanım eklemek için `flags.write` yetkisi gerekiyor.',
  },

  trail: {
    section: 'Değişiklik kaydı',
    description:
      'Bu bayrak hakkında denetim kaydına düşmüş satırlar: kim, ne zaman, hangi gerekçeyle. Reddedilen denemeler de burada.',
    tableCaption: 'Bayrak değişiklik kaydı',
    empty: 'Bu bayrak için henüz kayıt yok.',
    columnWhen: 'Zaman',
    columnWho: 'Yönetici',
    columnAction: 'İşlem',
    columnOutcome: 'Sonuç',
    columnReason: 'Gerekçe',
    outcomeSuccess: 'Başarılı',
    outcomeFailure: 'Reddedildi',
    actionLabels: {
      'feature_flag.changed': 'Bayrak değiştirildi',
      'feature_flag.override_set': 'Kullanıcıya özel tanım',
      'feature_flag.override_removed': 'Özel tanım kaldırıldı',
    } as Readonly<Record<string, string>>,
  },
} as const
