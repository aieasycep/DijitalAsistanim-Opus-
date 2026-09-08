import type { FraudTier, ReconciliationRuleId } from './contract'

/**
 * Every string the billing area renders, in Turkish.
 *
 * It sits beside `@/lib/messages` rather than inside it for the same reason
 * that module sits outside `@da/i18n`: the vocabulary here is an operator's
 * (mutabakat, kohort, sayaç sapması), it is never shipped to a device, and the
 * users, ops and billing areas are written by different hands and should not
 * have to edit one file between them.
 *
 * Where a sentence explains a number, it explains where the number came from.
 * An operations tool whose figures are unexplained aggregates gets misread, and
 * a misread billing figure turns into a wrong answer to a paying customer.
 */

export const billingMessages = {
  area: {
    /** Sub-navigation, shown on all three pages. */
    tabs: {
      subscriptions: 'Abonelikler',
      reconciliation: 'Hak mutabakatı',
      referrals: 'Davetler',
      label: 'Faturalandırma bölümleri',
    },
    refresh: 'Yenile',
    refreshing: 'Yenileniyor…',
    /** The caveat that belongs on every panel in this area. */
    aggregateNote:
      'Tüm sayılar bo_* görünümleri üzerinden Postgres tarafından hesaplanır. Bu ekran hiçbir kullanıcı içeriğine erişemez.',
  },

  subscriptions: {
    title: 'Abonelikler',
    description:
      'Abonelik durumlarının dağılımı, deneme dönüşümü ve ödeme sorunları. Sayılar silinmemiş hesapları kapsar.',
    mixTitle: 'Durum dağılımı',
    mixDescription:
      'Her durum için ayrı bir count(*). Toplam, altı durumun toplamıdır: her hesabın tam olarak bir durumu vardır.',
    mixStatus: 'Durum',
    mixCount: 'Hesap',
    mixShare: 'Pay',
    mixEmpty: 'Hiç hesap yok.',

    tilePaying: 'Ücretli abonelik',
    tilePayingHint: 'Aktif ve ek süredeki abonelikler',
    tileTrialing: 'Deneme',
    tileGrace: 'Ek süre',
    tileBillingIssue: 'Ödeme sorunu',
    tileTotal: 'Silinmemiş hesap',
    tileFree: 'Ücretsiz',
    tileExpired: 'Süresi dolmuş',
    tilePayingShare: 'Ücretli oranı',

    trialTitle: 'Deneme dönüşümü',
    trialDescription:
      'Denemesi biten hesapların bugünkü durumu. Dönüşüm oranı, denemesi bitenler içinde ücretliye geçenlerin payıdır.',
    trialRunning: 'Süren deneme',
    trialEnded: 'Denemesi bitmiş',
    trialConverted: 'Ücretliye geçen',
    trialLapsed: 'Ücretsize düşen',
    trialBillingIssue: 'Ödeme sorunlu',
    trialStuck: 'Hâlâ "deneme" görünen',
    trialStuckHint: 'Deneme bitiş tarihi geçmiş ama durumu güncellenmemiş',
    trialConversionRate: 'Dönüşüm oranı',
    trialEmpty: 'Henüz biten deneme yok.',

    cohortTitle: 'Kohort dönüşümü',
    cohortDescription:
      'Hesap açılış dönemine göre bugünkü ücretli oranı. Her hücre ayrı bir count(*) sorgusudur.',
    cohortLabel: 'Kohort',
    cohortBucket: 'Dönem',
    cohortTotal: 'Hesap',
    cohortPaying: 'Ücretli',
    cohortRate: 'Oran',
    cohortEmpty: 'Bu aralıkta hesap açılışı yok.',
    cohortWeek: 'Haftalık',
    cohortMonth: 'Aylık',

    driftTitle: 'Hak mutabakatı özeti',
    driftDescription:
      'Abonelik satırının kendi tarihleriyle çelişen kayıtlar. Ayrıntı ve diğer kurallar mutabakat sayfasında.',
    driftPeriodLapsed: 'Dönemi geçmiş ama aktif',
    driftTrialLapsed: 'Denemesi geçmiş ama deneme',
    driftLink: 'Tüm mutabakat kurallarını aç',
  },

  reconciliation: {
    title: 'Hak mutabakatı',
    description:
      'Kayıtlı abonelik durumu ile @da/domain içindeki resolveEntitlements() sonucunun ayrıştığı hesaplar. Faturalandırma hataları buradan bulunur.',
    method:
      'Kayıtlı hak: yalnızca durum sütununun iddia ettiği plan. Hesaplanan hak: resolveEntitlements() aynı satırdan ne üretiyorsa o. İkisinin ayrılması, ya webhook’un satırı yarım yazdığını ya da durumun kendi tarihinin gerisinde kaldığını gösterir.',
    ruleSectionTitle: 'Kurallar',
    ruleSectionDescription:
      'Her kutucuk kendi kuralının kayıt sayısını gösterir; tıklayınca listeyi değiştirir.',
    listTitle: 'Ayrışan hesaplar',
    listEmpty: 'Bu kurala uyan hesap yok. Beklenen sonuç budur.',
    columnUser: 'Kullanıcı',
    columnStatus: 'Kayıtlı durum',
    columnStored: 'Kayıtlı hak',
    columnComputed: 'Hesaplanan hak',
    columnSource: 'Kaynak',
    columnStore: 'Mağaza',
    columnPeriodEnd: 'Dönem sonu',
    columnTrialEnd: 'Deneme sonu',
    columnOpen: 'Kullanıcı',
    open: 'Aç',
    planPro: 'Pro',
    planFree: 'Ücretsiz',
    agrees: 'Uyumlu',
    disagrees: 'Ayrışıyor',
    storeNone: 'Yok',
    /** The one caveat this page cannot resolve from the views it may read. */
    caveat:
      'Not: resolveEntitlements() davet bonusunu da hesaba katar, ancak bo_* görünümleri bir hesabın aldığı bonusun bitiş tarihini vermez; bu ekranda bonus null kabul edilir. Bu yüzden "hesaplanan hak: ücretsiz" olan bir satır, geçerli bir davet bonusuyla üründe Pro görünüyor olabilir.',
    sourceLabels: {
      subscription: 'Abonelik',
      trial: 'Deneme',
      referral_bonus: 'Davet bonusu',
      none: 'Yok',
    } as Record<string, string>,
  },

  rules: {
    'magaza-yok': {
      label: 'Mağaza kaydı yok',
      short: 'Mağazasız',
      description:
        'Durum Pro veriyor ama satırda mağaza yok. resolveEntitlements() bu hesabı ücretsiz hesaplar: kullanıcı ödediği hâlde ödeme duvarını görür.',
    },
    'donem-gecmis': {
      label: 'Dönem sonu geçmiş',
      short: 'Dönem geçmiş',
      description:
        'Durum aktif ya da ek süre ama ödenen dönem bitmiş. resolveEntitlements() dönem sonuna bakmaz, dolayısıyla bu hesap ücretsiz Pro kullanmaya devam eder.',
    },
    'deneme-gecmis': {
      label: 'Deneme süresi geçmiş',
      short: 'Deneme geçmiş',
      description:
        'Durum hâlâ "deneme" ama deneme bitiş tarihi geçmiş. Ne ücretliye geçirilmiş ne de sonlandırılmış.',
    },
    'hak-gecikmesi': {
      label: 'Dönemi süren ama hakkı yok',
      short: 'Hak gecikmesi',
      description:
        'Ödenen dönem hâlâ sürüyor ama durum Pro vermiyor. Kullanıcı ödemesine rağmen ücretsiz plandadır.',
    },
    'magaza-var': {
      label: 'Mağaza var, durum ücretsiz',
      short: 'Durum güncellenmemiş',
      description:
        'Satırda bir satın alma var ama durum hiç ilerletilmemiş. Genellikle yarım işlenmiş bir webhook.',
    },
    'donem-yok': {
      label: 'Aktif ama dönem sonu yok',
      short: 'Dönem sonu boş',
      description:
        'Durum Pro veriyor ama yenileme tarihi yazılmamış. Bu satır hiçbir zaman kendiliğinden sona ermez.',
    },
  } satisfies Record<ReconciliationRuleId, { label: string; short: string; description: string }>,

  referrals: {
    title: 'Davetler',
    description:
      'Davet kodlarının kullanımı ve kötüye kullanım işaretleri. Kod, kullanıcının kendi paylaştığı bir davet anahtarıdır; kimliği açığa çıkarmaz.',

    tileCodes: 'Davet kodu',
    tileRedeemed: 'Kabul almış kod',
    tileNearLimit: 'Limite yakın veya üstünde',
    tileOverLimit: 'Limiti aşmış',
    tileCounterDrift: 'Sayaç sapması',
    tileRevoked: 'İptalli kredisi olan kod',
    limitHint: (limit: number): string => `Üst sınır: ${limit} kabul`,
    nearHint: (near: number): string => `Eşik: ${near} kabul`,

    seriesTitle: 'Davet hareketi',
    seriesDescription:
      'Her dönem için iki ayrı count(*): o dönemde oluşturulan kod sayısı ve son kabulü o döneme düşen kod sayısı.',
    seriesCaveat:
      'bo_referrals kod başına yalnızca son kredi zamanını verir. Bu yüzden ikinci sütun "o dönemde kabul alan kod sayısı"dır; aynı kodun aynı dönemdeki birden fazla kabulü tek satır sayılır.',
    seriesBucket: 'Dönem',
    seriesCreated: 'Yeni kod',
    seriesActive: 'Kabul alan kod',
    seriesEmpty: 'Seçilen aralıkta davet hareketi yok.',
    seriesDay: 'Günlük',
    seriesWeek: 'Haftalık',
    seriesMonth: 'Aylık',

    fraudTitle: 'Limit riski',
    fraudDescription:
      'Kabul sayısı üst sınıra yaklaşan, sınırı aşan ya da sayacı kredi kayıtlarıyla uyuşmayan davet edenler.',
    fraudEmpty: 'Bu kademede davet eden yok.',
    tierLabel: 'Kademe',

    clusterTitle: 'Kısa sürede yığılma',
    clusterDescription:
      'Kısa süre önce oluşturulmuş ve daha o zamandan çok sayıda kabul toplamış kodlar. Bir kod var olmadan kabul edilemeyeceği için bu, penceredeki gerçek bir yığılmadır.',
    clusterEmpty: 'Seçilen pencerede yığılma yok.',
    clusterWindowLabel: 'Pencere',
    clusterMinLabel: 'En az kabul',
    clusterWindowOption: (days: number): string => `Son ${days} gün`,
    clusterMinOption: (count: number): string => `${count} kabul`,

    columnReferrer: 'Davet eden',
    columnCode: 'Kod',
    columnRedemptions: 'Sayaç',
    columnRedemptionsTitle:
      'referrals.redemption_count — üst sınırın karşılaştırıldığı sayaç budur.',
    columnCredits: 'Kredili kabul',
    columnCreditsTitle:
      'Bu koda ait kredi satırı sayısı. referral_credits üzerindeki (kabul eden, kod) tekilliği nedeniyle bir kodda kabul eden başına en fazla bir satır olabilir, dolayısıyla bu sayı kredisi duran kabul sayısıdır.',
    columnImplied: 'Fark',
    columnImpliedTitle:
      'Kredili kabul eksi sayaç. Sağlıklı bir kodda sıfırdır. Artı: sayaç geride kalmış, üst sınır bu kod için uygulanmıyor. Eksi: sayılan kabullerin kredisi ortada yok.',
    columnActive: 'Aktif kredi',
    columnRevoked: 'İptalli',
    columnCreated: 'Kod tarihi',
    columnLastCredit: 'Son kabul',
    columnRate: 'Hız',
    columnRateTitle: 'Kod oluşturulduğundan bu yana günde ortalama kaç kabul aldığı.',
    columnAction: 'İşlem',
    perDay: (value: string): string => `${value}/gün`,
    ageDays: (days: number): string => (days === 0 ? 'bugün açıldı' : `${days} günlük kod`),
    driftValue: (value: number): string => (value > 0 ? `+${value}` : String(value)),
    driftAhead: 'Sayaç geride',
    driftMissing: 'Kredi eksik',
    driftBalanced: 'Dengeli',

    ordersTitle: 'İptal talimatları',
    ordersDescription:
      'Bu ekrandan verilen kredi iptali talimatları, denetim kaydından okunur. Talimatın uygulandığı, ilgili kodun iptalli kredi sayısının artmasıyla doğrulanır.',
    ordersEmpty: 'Henüz iptal talimatı verilmemiş.',
    ordersWhen: 'Zaman',
    ordersStaff: 'Ekip üyesi',
    ordersReferrer: 'Davet eden',
    ordersReason: 'Gerekçe',
    ordersOutcome: 'Sonuç',
  },

  revoke: {
    open: 'Krediyi iptal et',
    close: 'Vazgeç',
    submit: 'Talimatı kaydet',
    submitting: 'Kaydediliyor…',
    reasonLabel: 'Gerekçe',
    reasonPlaceholder: 'Örn. aynı cihazdan toplu kabul',
    /**
     * The copy that keeps the button honest. It says exactly what pressing it
     * does — and does not claim an automatic effect the platform does not have.
     */
    explain:
      'Bu düğme, bu kodun aktif davet kredilerinin iptal edilmesi talimatını denetim kaydına yazar: kim, hangi kod, hangi gerekçe. Kredi satırını backoffice değiştiremez; iptalin uygulandığı, kodun "iptalli" sayısının artmasıyla bu sayfadan izlenir.',
    codeLabel: 'Kod',
    activeLabel: 'Aktif kredi',

    resultSuccess: (code: string): string =>
      `${code} kodunun aktif davet kredileri için iptal talimatı kaydedildi.`,
    resultSuccessPlain: 'İptal talimatı denetim kaydına yazıldı.',
    resultNoop: (code: string): string =>
      `${code} kodunda iptal edilecek aktif kredi yoktu. Talimat yine de denetim kaydına yazıldı.`,
    resultNoopPlain: 'İptal edilecek aktif kredi yoktu. Talimat yine de denetim kaydına yazıldı.',
    resultNotFound: 'Davet kaydı bulunamadı. Liste yenilenmiş olabilir.',
    resultInvalid: 'Talimat kaydedilemedi: kimlik, kod ya da gerekçe geçersiz.',
    resultForbidden: 'Bu işlem için operasyon yetkisi gerekiyor.',
    resultFailed: 'Denetim kaydı yazılamadı, bu yüzden talimat verilmiş sayılmaz. Tekrar dene.',
    dismiss: 'Kapat',
  },

  fraudTiers: {
    yaklasan: {
      label: 'Limite yakın',
      description: 'Sayacı eşiğin üstünde olan davet edenler; sınıra dayanmış ya da geçmiş.',
    },
    asim: {
      label: 'Limiti aşmış',
      description:
        'Sayacı üst sınırın üstünde. Kabul akışı bunu reddetmesi gerektiği için burada satır olması bir hatadır.',
    },
    sapma: {
      label: 'Sayaç sapması',
      description:
        'Kredi kayıtları üst sınır kadar farklı kabul eden olduğunu gösteriyor ama sayaç sınırın altında. Üst sınır sayaca bakılarak uygulandığı için bu davet eden sınırsız kabul alabilir.',
    },
  } satisfies Record<FraudTier, { label: string; description: string }>,

  auditActions: {
    'referral.credit_revoke_ordered': 'Davet kredisi iptal talimatı',
  } as Record<string, string>,

  outcomes: {
    success: 'Kaydedildi',
    noop: 'Aktif kredi yok',
    notfound: 'Bulunamadı',
    invalid: 'Geçersiz',
    forbidden: 'Yetkisiz',
    failed: 'Yazılamadı',
  } as Record<string, string>,

  pagination: {
    label: 'Sayfalama',
    previous: 'Önceki',
    next: 'Sonraki',
    page: (page: number, count: number): string => `Sayfa ${page} / ${count}`,
    range: (from: string, to: string, total: string): string =>
      `${total} kayıttan ${from}–${to} arası`,
  },
} as const
