import type { ErrorCode } from '@da/domain'
import type {
  EntitlementSource,
  GrantEffect,
  GrantKind,
  GrantOutcome,
  GrantStatus,
} from '@/components/grants/contract'

/**
 * Every Turkish string the temporary-Pro area renders.
 *
 * ---------------------------------------------------------------------------
 * WHY THE WORDING INSISTS ON THE DIFFERENCE
 * ---------------------------------------------------------------------------
 *
 * Three different things can make an account Pro, and only one of them is
 * revenue. A store subscription is money. A referral bonus is a rule the
 * product applies to itself. An operator grant is a decision somebody made,
 * with a name and a cost attached — and the moment a screen calls all three
 * "Pro" they stop being distinguishable, which is exactly how a goodwill budget
 * disappears.
 *
 * So nothing below says "Pro" on its own. It says "geçici Pro (yönetici
 * tanımı)", "mağaza aboneliği" or "davet bonusu", and the panel that reports
 * which one is in force names the function that decided —
 * `resolveEntitlements()` in @da/domain — rather than implying the console
 * worked it out.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS NOT HERE
 * ---------------------------------------------------------------------------
 *
 * No bound on the length of a grant. `admin_entitlement_grants_days_range` is
 * the authority; the strings below report a refusal without restating the rule
 * that produced it, so finance can widen or narrow it in a migration without
 * this file becoming a lie.
 */

// ===========================================================================
// The vocabulary
// ===========================================================================

export const grantKindLabels: Readonly<Record<GrantKind, string>> = Object.freeze({
  trial_extension: 'Deneme uzatma',
  goodwill: 'İyi niyet',
  compensation: 'Telafi',
  beta_access: 'Beta erişimi',
})

/** What each kind is for, so two operators pick the same one for the same case. */
export const grantKindHints: Readonly<Record<GrantKind, string>> = Object.freeze({
  trial_extension:
    'Deneme süresi teknik bir nedenle boşa gitmiş kullanıcıya verilen ek süre. Satın alma kararı henüz verilmemiştir.',
  goodwill:
    'Ticari bir jest: şikâyet, gecikme ya da elde tutma amacıyla verilen süre. Bütçesi olan tek tür budur.',
  compensation:
    'Bizim hatamızın telafisi — kesinti, veri kaybı, yanlış tahsilat. Talep numarası ile birlikte verilmelidir.',
  beta_access: 'Erken erişim programındaki hesaplara açılan süre. Ücretli dönüşüm beklenmez.',
})

export const grantStatusLabels: Readonly<Record<GrantStatus, string>> = Object.freeze({
  live: 'Yürürlükte',
  expired: 'Süresi doldu',
  revoked: 'Geri alındı',
})

/**
 * How `resolveEntitlements()` names the reason an account is Pro right now.
 * `admin_grant` is absent because the function has no such answer.
 */
export const entitlementSourceLabels: Readonly<Record<EntitlementSource, string>> = Object.freeze({
  subscription: 'Mağaza aboneliği',
  trial: 'Mağaza denemesi',
  referral_bonus: 'Davet bonusu',
  none: 'Kayıtlı kaynak yok',
})

export const grantEffectLabels: Readonly<Record<GrantEffect, string>> = Object.freeze({
  overlaps_store: 'Mağaza ile çakışıyor',
  behind_referral: 'Davet bonusu önde',
  only_record: 'Tek kayıt',
  not_live: 'Yürürlükte değil',
})

export const grantEffectHints: Readonly<Record<GrantEffect, string>> = Object.freeze({
  overlaps_store:
    'Hesapta zaten geçerli bir mağaza aboneliği var. Ürün Pro’yu o abonelikten veriyor; bu tanım ödeme yapan bir hesaba harcanmış durumda.',
  behind_referral:
    'Hesapta süresi dolmamış bir davet bonusu var. resolveEntitlements() bonusu bu tanımın önünde sayar; ürünün bildirdiği kaynak bonustur.',
  only_record:
    'Bu hesap için başka bir hak kaydı yok: Pro’nun gerekçesi yalnızca bu tanım. Ürünün hak çözümleyicisi yönetici tanımlarını okumadığı için bu, kullanıcının uygulamada Pro gördüğünün kanıtı değildir; ayrıntı aşağıdaki notta.',
  not_live: 'Geri alınmış ya da süresi dolmuş bir tanım hiçbir hak iddia etmez.',
})

// ===========================================================================
// Failures
//
// A screen never quotes a database message. These are the sentences that stand
// in for one, chosen by the typed `ErrorCode` the action came back with.
// ===========================================================================

export const GENERIC_GRANT_FAILURE_TR = 'İşlem tamamlanamadı. Sayfayı yenileyip tekrar deneyin.'

const FAILURE_MESSAGES_TR: Readonly<Partial<Record<ErrorCode, string>>> = Object.freeze({
  not_found: 'Bu tanım bulunamadı. Başka bir yönetici işlemiş ya da bağlantı hatalı olabilir.',
  forbidden: 'Bu işlem için gereken yetkiye sahip değilsiniz.',
  unauthorized: 'Oturumunuzun süresi dolmuş görünüyor. Tekrar giriş yapın.',
  validation_failed:
    'Veritabanı bu değerleri kabul etmedi ve hiçbir şey yazılmadı. Süre ve tarih alanlarını kontrol edin.',
  sync_conflict: 'Bu kayıt siz bakarken değişti. Sayfayı yenileyip tekrar deneyin.',
  rate_limited: 'Çok fazla işlem denendi. Birkaç dakika bekleyip tekrar deneyin.',
  server_unavailable: 'Veritabanına ulaşılamadı. Bağlantı düzeldiğinde tekrar deneyin.',
  network_timeout: 'İstek zaman aşımına uğradı. Tekrar deneyin.',
})

export function grantFailureMessage(code: ErrorCode): string {
  return FAILURE_MESSAGES_TR[code] ?? GENERIC_GRANT_FAILURE_TR
}

// ===========================================================================
// What an action reports back
// ===========================================================================

export const grantOutcomeMessages: Readonly<Record<GrantOutcome, { title: string; body: string }>> =
  Object.freeze({
    granted: {
      title: 'Geçici Pro tanımlandı',
      body: 'Tanım yazıldı ve denetim kaydına aktörü, hesabı ve gerekçesiyle birlikte düştü.',
    },
    revoked: {
      title: 'Tanım geri alındı',
      body: 'Tanım bu andan itibaren yürürlükte değil. Satır silinmedi: geri alma da kaydın bir parçası.',
    },
    alreadyRevoked: {
      title: 'Tanım zaten geri alınmış',
      body: 'Bu tanımı başka bir yönetici sizden önce geri almış. Hiçbir şey değişmedi.',
    },
    overlap: {
      title: 'Çakışan tanım var',
      body: 'Bu hesabın aynı aralığı kapsayan, geri alınmamış bir tanımı zaten var. Veritabanı üst üste binen iki tanımı kabul etmiyor; önce mevcut tanımı geri alın.',
    },
    rejected: {
      title: 'Veritabanı tanımı reddetti',
      body: 'Girilen süre veritabanının izin verdiği aralığın dışında ya da tanım penceresi geçersiz. Hiçbir şey yazılmadı.',
    },
    invalid: {
      title: 'Form eksik',
      body: 'Alanlardan biri geçerli değil. Hatalı alanın altındaki açıklamaya bakın.',
    },
    forbidden: {
      title: 'Yetki yok',
      body: 'Bu işlem için gereken yetkiye sahip değilsiniz. Deneme, denetim kaydına yazıldı.',
    },
    notfound: {
      title: 'Tanım bulunamadı',
      body: 'Bağlantının işaret ettiği tanım artık yok.',
    },
    ratelimited: {
      title: 'Çok fazla işlem',
      body: 'Kısa sürede çok sayıda ayrıcalıklı yazma denendi. Birkaç dakika sonra tekrar deneyin.',
    },
    failed: {
      title: 'İşlem tamamlanamadı',
      body: GENERIC_GRANT_FAILURE_TR,
    },
    auditMissing: {
      title: 'Denetim kaydı yazılamadı',
      body: 'Değişiklik uygulandı ancak denetim satırı yazılamadı. Bu satırı denetim ekibine bildirin: kayıt eksik.',
    },
  })

// ===========================================================================
// The screens
// ===========================================================================

export const grantMessages = {
  area: {
    breadcrumbBilling: 'Faturalandırma',
    breadcrumbGrants: 'Geçici Pro',
  },

  list: {
    title: 'Geçici Pro tanımları',
    description:
      'Bir operatörün elle verdiği Pro süreleri. Mağaza aboneliği değildir, davet bonusu değildir: birinin karar verdiği, gerekçesi yazılı ve maliyeti olan bir süredir.',
    meta: 'Kaynak: bo_entitlement_grants. Adresler veritabanında maskelenir; bu ekran hiçbir posta içeriğine erişmez.',
    tableCaption: 'Geçici Pro tanımları',
    empty: 'Henüz hiç geçici Pro tanımlanmamış.',
    emptyFiltered: 'Bu filtrelerle eşleşen tanım yok.',
    newGrant: 'Yeni tanım',
    detailLink: 'Ayrıntı',
    noGrantPermission:
      'Yeni tanım yazmak için `billing.grant` yetkisi gerekiyor. Mevcut tanımları okuyabilirsiniz.',
    noRevokePermission: 'Tanım geri almak için `billing.revoke` yetkisi gerekiyor.',
  },

  filters: {
    status: 'Durum',
    kind: 'Tür',
    admin: 'Tanımlayan',
    adminAll: 'Tüm yöneticiler',
  },

  columns: {
    user: 'Hesap',
    kind: 'Tür',
    days: 'Süre',
    remaining: 'Kalan',
    status: 'Durum',
    effect: 'Ürün ne diyor?',
    reason: 'Gerekçe',
    grantedBy: 'Tanımlayan',
    grantedAt: 'Tanım',
    expires: 'Bitiş',
    revoked: 'Geri alma',
    detail: 'Ayrıntı',
    daysUnit: (days: number): string => `${days} gün`,
    remainingUnit: (days: number): string => (days === 0 ? 'Bitti' : `${days} gün`),
    userHidden: 'Hesap kimliği, toplu görünüm yetkisinde gizlenir.',
    revokedReasonMissing: 'Gerekçe okunamadı.',
  },

  tiles: {
    live: 'Yürürlükteki tanım',
    liveHint: 'Şu an geçerli olan tanımlar — tüm zamanlar, filtreden bağımsız.',
    outstanding: 'Bekleyen Pro günü',
    outstandingHint: 'Yürürlükteki tanımların kalan günlerinin toplamı: ödenmemiş taahhüt.',
    outstandingSampled: (sample: number, total: number): string =>
      `En uzun ${sample} tanım üzerinden; yürürlükte ${total} tanım var, gerçek toplam daha yüksek.`,
    issued: 'Dönemde tanımlanan',
    issuedDays: 'Dönemde verilen gün',
    periodHint: (from: string, to: string): string => `${from} – ${to}`,
    periodSampled: (sample: number, total: number): string =>
      `Dönemin ${total} tanımından en yenisi ${sample} tanesi üzerinden hesaplandı.`,
  },

  period: {
    section: 'Dönem bütçesi',
    rangeLabel: 'Dönem aralığı',
    tableTitle: 'Yönetici başına dağılım',
    description:
      'Aşağıdaki aralıkta hangi yönetici kaç tanım yazdı ve kaç gün dağıttı. Görünmeyen bir iyi niyet bütçesi, kimsenin denetlemediği bir bütçedir.',
    rangeNote:
      'Bu aralık yalnızca “Dönemde tanımlanan”, “Dönemde verilen gün” ve aşağıdaki yönetici tablosunu kapsar. Yürürlükteki tanım sayısı ve alttaki liste tüm zamanları kapsar.',
    tableCaption: 'Dönemde yönetici başına tanım dağılımı',
    empty: 'Bu aralıkta hiç tanım yazılmamış.',
    columnAdmin: 'Yönetici',
    columnCount: 'Tanım',
    columnDays: 'Toplam gün',
    columnAverage: 'Ortalama',
    columnShare: 'Pay',
    averageUnit: (days: number): string => `${days} gün`,
    sampledNote: (sample: number, total: number): string =>
      `Bu tablo dönemin ${total} tanımından en yenisi ${sample} tanesi üzerinden hesaplandı; daha dar bir aralık seçerseniz sayılar tam olur.`,
    exactNote: 'Bu tablo dönemin tüm tanımlarını kapsıyor.',
    unknownAdmin: 'Bilinmiyor',
  },

  truth: {
    section: 'Hakkı şu an ne veriyor?',
    description:
      'Ürün Pro’yu resolveEntitlements() ile çözümler: önce mağaza aboneliği, sonra süresi dolmamış davet bonusu. Bu tanım listede ayrı durur çünkü ayrı bir şeydir.',
    resolverNote:
      'Önemli: hak çözümlemesinin tek tanımı @da/domain içindeki resolveEntitlements()’tır ve iki girdi alır — mağaza aboneliği ile davet bonusu. Yönetici tanımı için bir parametresi yoktur; sunucu tarafındaki zorunlu kontrol de (limits.ts) yalnızca subscriptions ve referral_credits satırlarını okur. Yani bu tablo kararı, maliyeti ve gerekçeyi kaydeder; kullanıcının uygulamada Pro görmesini tek başına sağlamaz. “Tek kayıt” durumundaki bir tanımı kullanıcıya “artık Pro’sunuz” diye bildirmeden önce mağaza ya da bonus kaydını doğrulayın.',
    currentLabel: 'Ürünün bildirdiği kaynak',
    planLabel: 'Ürünün bildirdiği plan',
    planPro: 'Pro',
    planFree: 'Ücretsiz',
    expiresLabel: 'Kaynağın bitişi',
    sourcesTitle: 'Hesaptaki tüm hak kayıtları',
    sourcesDescription:
      'bo_entitlement_sources: mağaza satın alması, davet bonusu ve yönetici tanımı, tek bir şekilde ve kaynak ayrımıyla.',
    sourcesCaption: 'Hesabın hak kaynakları',
    sourcesEmpty: 'Bu hesap için kayıtlı hiçbir hak kaydı yok.',
    columnSource: 'Kaynak',
    columnStatus: 'Durum',
    columnEnds: 'Bitiş',
    columnDetail: 'Ayrıntı',
    sourceStore: 'Mağaza',
    sourceReferral: 'Davet',
    sourceAdminGrant: 'Yönetici tanımı',
    thisGrant: 'Bu tanım',
    unavailable: 'Hak kayıtları okunamadı; bu satır için kaynak karşılaştırması yapılamıyor.',
  },

  detail: {
    titlePrefix: 'Geçici Pro',
    backToList: 'Tanım listesine dön',
    notFoundTitle: 'Tanım bulunamadı',
    notFoundBody: 'Bu kimlikte bir geçici Pro tanımı yok. Bağlantı eski olabilir.',
    factsSection: 'Tanım',
    factKind: 'Tür',
    factDays: 'Süre',
    factGrantedAt: 'Tanımlandı',
    factExpires: 'Bitiş',
    factRemaining: 'Kalan',
    factGrantedBy: 'Tanımlayan',
    factRevokedAt: 'Geri alındı',
    factRevokedBy: 'Geri alan',
    factRevokedReason: 'Geri alma gerekçesi',
    factTicket: 'Destek talebi',
    factUser: 'Hesap',
    factUpdated: 'Son güncelleme',
    reasonSection: 'Gerekçe',
    reasonDescription:
      'Tanımı yazan kişinin kendi cümlesi. Boş olamaz: veritabanı gerekçesiz bir tanımı kabul etmez.',
    userLink: 'Kullanıcı kaydını aç',
    noUserLink: 'Hesap kimliği, toplu görünüm yetkisinde gizlenir.',
  },

  trail: {
    section: 'Denetim kaydı',
    description:
      'Bu tanım hakkında denetim kaydına düşmüş satırlar: kim, ne zaman, hangi gerekçeyle. Reddedilen denemeler de burada.',
    tableCaption: 'Tanımın denetim kaydı',
    empty: 'Bu tanım için henüz denetim satırı yok.',
    columnWhen: 'Zaman',
    columnWho: 'Yönetici',
    columnAction: 'İşlem',
    columnOutcome: 'Sonuç',
    columnReason: 'Gerekçe',
    outcomeSuccess: 'Başarılı',
    outcomeFailure: 'Reddedildi',
    actionLabels: {
      'entitlement.granted': 'Geçici Pro tanımlandı',
      'entitlement.revoked': 'Geçici Pro geri alındı',
    } as Readonly<Record<string, string>>,
  },

  form: {
    title: 'Yeni geçici Pro tanımı',
    description:
      'Bir hesaba elle Pro süresi yazar. Ücretsiz ay gerçek bir maliyettir: her tanım bir isim, bir tür ve yazılı bir gerekçe taşır ve denetim kaydına düşer.',
    submit: 'Tanımı yaz',
    submitting: 'Yazılıyor…',
    cancel: 'Vazgeç',
    userLabel: 'Hesap kimliği (UUID)',
    userDescription:
      'Kullanıcı kaydındaki kimlik. E-posta adresi kabul edilmez: bu konsol adresten hesap aramaz.',
    userPlaceholder: '00000000-0000-0000-0000-000000000000',
    userInvalid: 'Geçerli bir hesap kimliği (UUID) değil.',
    userUnknown: 'Bu kimlikte bir hesap bulunamadı.',
    kindLabel: 'Tür',
    kindDescription: 'Türü sonradan değiştirilemez; bütçe raporu bu ayrımdan okunur.',
    daysLabel: 'Süre (gün)',
    daysDescription:
      'Sürenin alt ve üst sınırını veritabanı belirler (admin_entitlement_grants_days_range). Kabul edilmeyen bir değer girerseniz hiçbir şey yazılmaz ve reddedildiği burada yazar.',
    daysInvalid: 'Süre tam sayı olmalıdır.',
    daysListLabel: 'Sık kullanılan süreler',
    ticketLabel: 'Destek talebi kimliği (isteğe bağlı)',
    ticketDescription:
      'Varsa tanımın dayandığı destek talebinin kimliği. Telafi türü için doldurulması beklenir.',
    ticketPlaceholder: 'Destek talebinin kimliği (UUID)',
    ticketInvalid: 'Geçerli bir talep kimliği (UUID) değil.',
    reasonLabel: 'Gerekçe',
    reasonDescription: (min: number): string =>
      `En az ${min} karakter. Altı ay sonra bu satırı okuyan kişi kararı buradan anlayacak.`,
    reasonPlaceholder:
      'Örn. "DA-001042: iki günlük senkronizasyon kesintisi nedeniyle telafi süresi."',
    overlapNote:
      'Bir hesap aynı anda üst üste binen iki tanım tutamaz. Veritabanı çakışan pencereyi reddeder.',
    previewTitle: 'Yazılacak kayıt',
    previewNote:
      'Bitiş anı, tanım anına sunucunun saati üzerinden gün eklenerek hesaplanır; tarayıcınızın saat dilimi kullanılmaz.',
  },

  revoke: {
    action: 'Geri al',
    title: 'Geçici Pro geri alınacak',
    body: 'Tanım bu andan itibaren yürürlükten kalkar. Satır silinmez: geri alma, tarihi ve gerekçesiyle birlikte kaydın parçası olur.',
    confirm: 'Geri al',
    reasonLabel: 'Geri alma gerekçesi',
    reasonPlaceholder: 'Örn. "Yanlış hesaba yazıldı; doğru hesaba yeniden tanımlandı."',
    onlyLive: 'Yalnızca yürürlükteki bir tanım geri alınabilir.',
    summaryDays: (days: number): string => `${days} günlük tanım`,
    summaryRemaining: (days: number): string => `${days} gün kalmıştı`,
  },

  banner: {
    dismiss: 'Kapat',
  },
} as const
