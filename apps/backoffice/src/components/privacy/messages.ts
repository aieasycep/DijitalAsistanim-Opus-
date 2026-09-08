import type { DeadlineBucket, RerunOutcome } from './contract'

/**
 * Every string the privacy area renders, in Turkish.
 *
 * It lives beside the area rather than in `@/lib/messages` for the same reason
 * `@/lib/messages` lives outside `@da/i18n`: this is operator vocabulary — legal
 * deadlines, sweep arrears, order tokens — and none of it should ever leak into
 * a user-facing bundle. The shared dictionary keeps the words two areas must
 * agree on (statuses, roles, units); this file keeps the words only this area
 * uses.
 */

export const privacyMessages = {
  overview: {
    kicker: 'KVKK m.13 · GDPR md.12(3)',
    title: 'Gizlilik talepleri',
    description:
      'Veri dışa aktarım talepleri ve hesap silmeleri, yasal 30 günlük süreye göre. Talebin içeriği değil; durumu, yaşı ve süresi izlenir.',
    metaLabel: 'Aralık',
    windowFilter: 'Zaman aralığı',
    window7d: 'Son 7 gün',
    window30d: 'Son 30 gün',
    window90d: 'Son 90 gün',
    refresh: 'Yenile',
    refreshing: 'Yenileniyor…',
    privacyNote:
      'Bu sayfadaki hiçbir sorgu arşivin içeriğine ya da depolama yoluna erişmez: bo_privacy_requests görünümü data_export_requests.storage_path sütununa hiç bakmaz, bu yüzden buradan bir indirme bağlantısı üretilemez.',
    statSection: 'Yasal takvim',
    stateSection: 'Talep durumu',
    deletionSection: 'Silme',
    retentionSection: 'Saklama süpürmesi',
  },

  stats: {
    open: 'Açık talep',
    openHint: 'Talep edildi veya işleniyor',
    overdue: 'Süre aşımı',
    overdueHint: (days: number): string => `${days} günü geçti`,
    dueSoon: 'Süresi yaklaşan',
    dueSoonHint: (days: number): string => `Son ${days} gün içinde`,
    stuck: 'Takılmış',
    stuckHint: (hours: number): string => `${hours} saatten uzun süredir açık`,
    failed: 'Başarısız',
    failedHint: (days: number): string => `Son ${days} günde`,
    fulfilment: 'Ortanca tamamlanma',
    fulfilmentHint: (count: number): string => `${count} tamamlanmış talep`,
    deletion: 'Hesap silme',
    deletionHint: (days: number): string => `Son ${days} günde`,
    lastSweep: 'Son süpürme',
    lastSweepHint: 'Denetim kaydına göre',
    noSweep: 'Kayıt yok',
  },

  deadline: {
    section: 'Süre tahtası',
    description:
      'Açık talepler, en eskisi başta. Kalan süre talebin oluşturulmasından 30 gün sonrasına göre hesaplanır.',
    empty: 'Açık gizlilik talebi yok.',
    columnRequest: 'Talep',
    columnUser: 'Kullanıcı',
    columnStatus: 'Durum',
    columnAge: 'Yaş',
    columnRemaining: 'Kalan süre',
    columnUpdated: 'Son güncelleme',
    columnOrder: 'Emir',
    columnAction: 'İşlem',
    openUser: 'Kullanıcı sayfasını aç',
    overdueBadge: 'Süre aştı',
    dueSoonBadge: 'Yaklaşıyor',
    stuckBadge: 'Takılmış',
    remainingDays: (days: number): string => `${days} gün`,
    remainingHours: (hours: number): string => `${hours} sa`,
    overdueBy: (days: number): string => `${days} gün geçti`,
    queueLink: 'Tüm talepler',
    deadlineWarning:
      'Uyarı: 30 gün aynı zamanda data_export_requests tablosunun sabit saklama penceresi. Süreyi aşan bir talep gecikmiş olmakla kalmaz, gece süpürmesinde silinir — bu yüzden müdahale penceresi son 7 gündür.',
    noOrder: 'Yok',
    orderedBy: 'Emri veren',
    orderedAt: 'Emir zamanı',
    closed: 'Kapandı',
    closedHint: 'Talep yanıtlandı; yasal süre işlemiyor.',
  },

  rerun: {
    open: 'Yeniden çalıştır',
    close: 'Kapat',
    explain:
      'Arşivi bu araç yeniden kuramaz: kurmak, kullanıcının tüm postasını bir dosyaya okumak demektir ve backoffice bu yetkiye bilerek sahip değildir. Buradaki işlem, kullanıcının kendi yetkisiyle çalışan dışa aktarım işine denetlenmiş bir yeniden çalıştırma emri bırakır.',
    reasonLabel: 'Gerekçe',
    reasonPlaceholder: 'Örn. destek kaydı #482, talep 9 gündür işleniyor',
    submit: 'Emri yaz',
    submitting: 'Yazılıyor…',
    requestLabel: 'Talep',
    statusLabel: 'Durum',
    ineligible: 'Bu talep için emir verilemez',
    ineligibleHint: 'Yalnızca talep edildi, işleniyor veya başarısız durumundaki talepler.',
  },

  rerunResult: {
    heading: 'Sonuç',
    request: 'Talep',
    dismiss: 'Kapat',
    ordered: 'Yeniden çalıştırma emri yazıldı.',
    duplicate: 'Bu talep için son bir saat içinde zaten emir verilmiş.',
    ineligible: 'Talebin durumu yeniden çalıştırmaya uygun değil.',
    notfound: 'Talep bulunamadı.',
    invalid: 'Form eksik ya da gerekçe çok kısa.',
    forbidden: 'Bu işlem için yetkin yok.',
    failed: 'Denetim kaydı yazılamadı, emir verilmedi.',
  },

  breakdown: {
    section: 'Durum dağılımı',
    description: 'Seçilen aralıkta oluşturulan taleplerin son durumu. Her sayı ayrı bir count(*).',
    empty: 'Seçilen aralıkta talep yok.',
    columnStatus: 'Durum',
    columnCount: 'Adet',
    columnShare: 'Pay',
    total: 'Toplam',
  },

  fulfilment: {
    section: 'Tamamlanma ve arşiv',
    description: 'Talepten hazır dosyaya geçen süre ve arşivlerin akıbeti.',
    median: 'Ortanca süre',
    p90: 'p90 süre',
    completed: 'Tamamlanan talep',
    staleReady: 'Süresi dolmuş ama hazır görünen',
    staleReadyHint: 'da_export_cleanup işi 03:45 UTC’de bunları expired yapmalı.',
    expiredTotal: 'Süresi dolmuş arşiv',
    expiredHint: 'İndirme bağlantısı artık verilmiyor.',
    noData: 'Bu aralıkta tamamlanmış talep yok.',
  },

  deletion: {
    section: 'Hesap ve geçmiş silme',
    description:
      'Silme sayıları denetim kaydından gelir. Silinen hesabın kimliği kayıtta tutulmaz: satır, anlattığı hesaptan uzun yaşasın diye kullanıcı kimliği boş yazılır.',
    staffNote:
      'Silme bir ekip işlemi değildir ve burada silme düğmesi yoktur. Hesap silme yalnızca kullanıcının kendi oturumundan, kendi e-posta adresini yazarak onayladığı delete-account çağrısıyla yapılır; çağrı sağlayıcı jetonlarını iptal eder, depolama nesnelerini siler ve auth kaydını kaldırır — geri alınamaz. Bir ekip üyesine bu düğmeyi vermek, ürünün “kimse kullanıcının verisine dokunamaz” sözünü tek başına geçersiz kılardı. Kullanıcı silmek istiyorsa uygulamadaki adıma yönlendirilir.',
    accountDeleted: 'Hesap silme',
    historyDeleted: 'Geçmiş silme',
    windowLabel: (days: number): string => `Son ${days} gün`,
    total: 'Tüm zamanlar',
    last24h: 'Son 24 saat',
    eventsSection: 'Son silme olayları',
    eventsEmpty: 'Denetim kaydında silme olayı yok.',
    columnAction: 'Olay',
    columnWhen: 'Zaman',
    columnEntity: 'Nesne',
    columnKeys: 'Kayıtlı alan',
    marksSection: 'Silme işareti taşıyan hesaplar',
    marksDescription:
      'profiles.deleted_at dolu ama satır hâlâ duruyor. delete-account akışı hesabı tamamen kaldırdığı için burada uzun süre bekleyen bir kayıt, tamamlanmamış bir silme demektir.',
    marksEmpty: 'Bekleyen silme işareti yok.',
    columnUser: 'Kullanıcı',
    columnMarkedAt: 'İşaretlenme',
    columnAge: 'Yaş',
    columnAccounts: 'Bağlantı',
    actionLabels: {
      'privacy.account_deleted': 'Hesap silindi',
      'privacy.history_deleted': 'Geçmiş silindi',
      'privacy.export_requested': 'Dışa aktarım istendi',
      'privacy.export_rerun_ordered': 'Yeniden çalıştırma emri',
    } as Record<string, string>,
  },

  queue: {
    kicker: 'Gizlilik talepleri',
    title: 'Talep kuyruğu',
    description:
      'Bütün dışa aktarım talepleri. Durum ve süreye göre filtrelenir; sıralama en eski talepten başlar.',
    empty: 'Bu filtrelerle talep yok.',
    emptyReset: 'Filtreleri sıfırla',
    statusFilter: 'Durum',
    deadlineFilter: 'Süre',
    backToOverview: 'Gizlilik özetine dön',
    pagePrevious: '← Önceki',
    pageNext: 'Sonraki →',
    pageStatus: (page: number, pageCount: number): string => `Sayfa ${page} / ${pageCount}`,
    columnSize: 'Boyut',
    columnFailure: 'Hata kodu',
    columnRequested: 'Talep',
    columnReady: 'Hazır',
    columnExpires: 'Geçerlilik',
    artifactYes: 'Var',
    artifactNo: 'Yok',
  },

  retention: {
    kicker: 'Gizlilik talepleri',
    title: 'Saklama süpürmesi',
    description:
      'Gece süpürmesi kullanıcı saklama tercihlerini ve sabit operasyonel pencereleri uygular. Bu sayfa süpürmenin çalışıp çalışmadığını ve arkada kalan kayıt olup olmadığını ölçer.',
    backToOverview: 'Gizlilik özetine dön',
    lastRun: 'Son süpürme',
    runsInWindow: 'Süpürme sayısı',
    runsExpected: (expected: number): string => `Beklenen ${expected}`,
    arrears: 'Ölçülen gecikme',
    arrearsHint: 'Penceresini aşmış kayıt',
    unobserved: 'Gözlenemeyen tablo',
    unobservedHint: 'İçerik tablosu, görünümü yok',
    runsSection: 'Süpürme geçmişi',
    runsDescription:
      'audit_logs içindeki retention.swept satırları. Aralık, bir önceki süpürmeden geçen süredir.',
    runsEmpty: 'Denetim kaydında süpürme satırı yok.',
    columnRunAt: 'Çalışma',
    columnGap: 'Aralık',
    columnKeys: 'Kayıtlı alan',
    gapLate: 'Gecikmeli',
    gapFirst: 'İlk kayıt',
    tablesSection: 'Süpürülen tablolar',
    tablesDescription:
      'Politika @da/domain içindeki RETENTION_SWEEP listesinden okunur; gecikme sütunu yalnızca backoffice görünümlerinden ölçülebilen tablolar için doldurulur.',
    columnTable: 'Tablo',
    columnWindow: 'Pencere',
    columnBasis: 'Yaş sütunu',
    columnObserver: 'Gözlem kaynağı',
    columnArrears: 'Ufuk ötesi',
    columnOldest: 'En eski kalan',
    columnState: 'Durum',
    horizonLabel: (days: number): string => `${days} günden eski`,
    windowFixed: (days: number): string => `Sabit ${days} gün`,
    windowUser: 'Kullanıcı tercihi',
    windowUserHint: '30g / 90g / 1y / süresiz',
    observerNone: 'Yok',
    stateClean: 'Temiz',
    stateArrears: 'Gecikme',
    stateBlind: 'Ölçülemez',
    stateInconclusive: 'Kesin değil',
    stateInconclusiveHint:
      'Bu tablo kullanıcı tercihine göre süpürülür; süresiz saklamayı seçen hesaplarda ufuk ötesi kayıt beklenen bir durumdur.',
    anonymisedTag: 'Anonimleştirilir',
    anonymisedHint:
      'Satır silinmez: 400 günden sonra entity_id ve metadata boşaltılır, denetim izinin şekli kalır.',
    unitRows: 'kayıt',
    unitDayGroups: 'gün×tür',
    blindNote:
      'Ölçülemez satırlar bir eksiklik değil, tasarımın kendisidir: email_messages, memory_chunks, assistant_messages gibi tablolar için hiçbir bo_* görünümü yoktur, bu yüzden backoffice kaç satır kaldığını bile soramaz. Süpürmenin bu tablolardaki etkisi ancak veritabanı tarafından, migration 0012’deki fonksiyonun döndürdüğü özetten doğrulanabilir.',
    auditNote:
      'Süpürme denetim satırını yalnızca retention-cleanup edge fonksiyonu yazar. pg_net kurulu değilse migration 0014 aynı işi doğrudan SQL ile çalıştırır ve geriye satır bırakmaz — bu yüzden “kayıt yok”, “süpürme çalışmadı” demek değildir. Asıl kanıt aşağıdaki gecikme sütunudur.',
    countsNote:
      'Süpürmenin sildiği satır sayısı cleanup_expired_retention() çıktısında döner ama denetim satırının metadata değerlerine yazılmaz; bo_audit yalnızca alan adlarını gösterdiği için bu sayfa silinen satır sayısını değil, geride kalan satır sayısını ölçer.',
  },

  errors: {
    boardFailed: 'Süre tahtası getirilemedi.',
    breakdownFailed: 'Durum dağılımı getirilemedi.',
    fulfilmentFailed: 'Tamamlanma süreleri getirilemedi.',
    deletionFailed: 'Silme sayıları getirilemedi.',
    retentionFailed: 'Saklama verisi getirilemedi.',
    statsFailed: 'Sayaçlar getirilemedi.',
  },
} as const

export const RERUN_OUTCOME_MESSAGE: Readonly<Record<RerunOutcome, string>> = {
  ordered: privacyMessages.rerunResult.ordered,
  duplicate: privacyMessages.rerunResult.duplicate,
  ineligible: privacyMessages.rerunResult.ineligible,
  notfound: privacyMessages.rerunResult.notfound,
  invalid: privacyMessages.rerunResult.invalid,
  forbidden: privacyMessages.rerunResult.forbidden,
  failed: privacyMessages.rerunResult.failed,
}

export const DEADLINE_BUCKET_LABEL: Readonly<Record<DeadlineBucket, string>> = {
  gecikmis: 'Süre aştı',
  yaklasan: 'Yaklaşıyor',
  normal: 'Süre içinde',
}
