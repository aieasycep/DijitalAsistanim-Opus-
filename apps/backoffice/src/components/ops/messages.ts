/**
 * Turkish strings for the operations area.
 *
 * The backoffice keeps its copy out of `@da/i18n` on purpose — that catalogue
 * ships to devices and is owned by the app team. `@/lib/messages` holds the
 * strings shared by every backoffice screen; this module holds the ones only
 * the ops area uses, so a vocabulary specific to sync plumbing does not leak
 * into the shared file that support and admin screens also read.
 *
 * It sits under `components/ops` rather than `lib` because both the routes and
 * the components in this feature import it, and the feature owns it end to end.
 */

export const opsMessages = {
  dashboard: {
    title: 'Operasyon panosu',
    description:
      'Senkronizasyon sağlığı, hata oranları ve iş hacmi. Her sayı bir toplulaştırmadır: bu ekran hiçbir mesaj, konu başlığı veya kişi adı okuyamaz.',
    kicker: 'Operasyon',
    generatedAt: 'Sunucu zamanı',
    overviewUnavailable: 'Platform özeti getirilemedi.',
  },

  pulse: {
    section: 'Senkronizasyon nabzı',
    ranLastHour: 'Son 1 saatte çalışan kaynak',
    ranLast24h: 'Son 24 saatte çalışan kaynak',
    dueNow: 'Sırası gelmiş kaynak',
    dueNowHint: 'Planlanan zamanı geçmiş, henüz çalışmamış',
    backfilling: 'Geçmişi doldurulan kaynak',
    errored: 'Hatalı kaynak',
    stalled: 'Takılmış kaynak',
    stalledHint: 'Hata vermiyor ama bir saatten uzun süredir gecikmiş',
    accountsAtRisk: 'Riskli bağlantı',
    accountsAtRiskHint: 'Hata, süresi dolmuş veya iptal edilmiş',
    aiCost24h: 'Model maliyeti (24s)',
  },

  providers: {
    section: 'Sağlayıcı bazında senkronizasyon sağlığı',
    description:
      'Her sağlayıcının bağlantı durumları ve en geride kalan kaynağı. Sayılar bo_accounts ve bo_sync_health üzerinde sayılır.',
    empty: 'Hiçbir sağlayıcıya bağlı hesap yok.',
    provider: 'Sağlayıcı',
    accountTotal: 'Hesap',
    connected: 'Bağlı',
    expired: 'Süresi doldu',
    revoked: 'İptal',
    errored: 'Hata',
    disconnected: 'Kesik',
    syncErrored: 'Hatalı kaynak',
    syncStalled: 'Takılmış',
    backfilling: 'Geçmiş dolduruluyor',
    oldestRun: 'En eski çalışma',
    oldestRunNever: 'Hiç çalışmadı',
    oldestCursor: 'En eski geçmiş imleci',
    oldestCursorNone: 'Geçmiş doldurma bitti',
    oldestRunTitle: 'Bu sağlayıcıdaki en geride kalan kaynağın son çalışma zamanı',
    oldestCursorTitle:
      'Geçmişi doldurulan kaynaklar arasında en geriye işaret eden imlecin tarihi. İmlecin kendisi bir zaman damgasıdır; içerik değildir.',
  },

  failing: {
    section: 'En uzun süredir hata veren hesaplar',
    description:
      'Ardışık hata sayısına göre sıralanır. Hata yalnızca kod olarak görünür — sağlayıcının hata metni bu araca hiç ulaşmaz.',
    fullQueue: 'Tüm kuyruğu aç',
    empty: 'Hata veren senkronizasyon kaynağı yok.',
    emptyFiltered: 'Bu filtrelerle eşleşen hata veren kaynak yok.',
    account: 'Hesap',
    failures: 'Ardışık hata',
    failuresTitle: 'Bu kaynağın üst üste kaç kez başarısız olduğu',
    lastRun: 'Son deneme',
    nextRun: 'Sıradaki deneme',
    accountStatus: 'Bağlantı',
    action: 'İşlem',
  },

  queue: {
    title: 'Senkronizasyon kuyruğu',
    description:
      'Hata veren tüm senkronizasyon kaynakları. Filtreler sunucuda yeniden sorgulanır; liste tarayıcıda süzülmez.',
    filterProvider: 'Sağlayıcı',
    filterResource: 'Kaynak',
    filterCode: 'Hata kodu',
    codeUnknown: 'Kodsuz',
    pagePrevious: 'Önceki',
    pageNext: 'Sonraki',
    pageStatus: (page: number, pageCount: number): string => `Sayfa ${page} / ${pageCount}`,
    backToDashboard: 'Operasyon panosuna dön',
  },

  resync: {
    open: 'Yeniden başlat',
    close: 'Vazgeç',
    title: 'Senkronizasyonu yeniden başlat',
    explain:
      'sync-start fonksiyonu yalnızca bu bağlı hesap için çağrılır. İşlem denetim kaydına gerekçenle birlikte yazılır.',
    reasonLabel: 'Gerekçe',
    reasonPlaceholder: 'Örn: kullanıcı destek talebi açtı, jeton yenilendi',
    submit: 'Çalıştır',
    submitting: 'Çalıştırılıyor…',
    resourceLabel: 'Kaynak',
  },

  resyncResult: {
    heading: 'Yeniden başlatma sonucu',
    account: 'Hesap',
    dismiss: 'Kapat',
    success: 'Senkronizasyon çalıştı.',
    partial: 'Senkronizasyon çalıştı, bazı kaynaklar hata verdi.',
    noop: 'Çalıştırılacak kaynak bulunamadı; bu hesapta senkronize edilebilir bir bağlantı yok.',
    failed: 'sync-start çağrısı başarısız oldu.',
    rejected: 'sync-start çağrıyı reddetti.',
    unreachable: 'sync-start fonksiyonuna ulaşılamadı.',
    invalid: 'İstek geçersizdi, hiçbir şey çalıştırılmadı.',
    forbidden: 'Bu işlem için yetkin yok.',
    reasonRequired: 'Gerekçe en az 3, en fazla 280 karakter olmalı.',
    codeLabel: 'Kod',
  },

  errorRates: {
    section: 'Fonksiyon hata oranı',
    description:
      'Her satır bir boru hattı yüzeyi. Payda o pencerede gerçekten dokunulmuş kayıt sayısıdır, pay ise başarısız olanlar.',
    empty: 'Seçilen pencerelerde ölçülecek çalışma yok.',
    fn: 'Fonksiyon',
    measure: 'Ölçüm',
    failed24h: 'Hata (24s)',
    total24h: 'Toplam (24s)',
    rate24h: 'Oran (24s)',
    failed7d: 'Hata (7g)',
    total7d: 'Toplam (7g)',
    rate7d: 'Oran (7g)',
    functions: {
      sync: 'sync-start',
      approval: 'approval-decide',
      export: 'data-export-request',
      connection: 'oauth-complete',
    } as Record<string, string>,
    measures: {
      sync: 'Pencerede çalışan senkron kaynakları / durumu hata olanlar',
      approval: 'Pencerede güncellenen onaylar / durumu başarısız olanlar',
      export: 'Pencerede güncellenen gizlilik talepleri / durumu başarısız olanlar',
      connection: 'Pencerede güncellenen bağlantılar / pencerede hata alanlar',
    } as Record<string, string>,
  },

  errorCodes: {
    section: 'Hata kodu dağılımı',
    description:
      'Son 7 günün hata kodları. Kodlar veritabanında bo_error_code süzgecinden geçer: sağlayıcının cümlesi değil, yalnızca simge biçimindeki etiket saklanır.',
    empty: 'Son 7 günde kaydedilmiş hata kodu yok.',
    source: 'Kaynak',
    code: 'Kod',
    count24h: '24s',
    count7d: '7g',
    unstructured: 'Yapısız etiket',
    truncated: (sampled: number, total: number): string =>
      `${total} hata kaydından en yeni ${sampled} tanesi tarandı; daha eski kayıtlar bu dağılımda yok.`,
    inspect: 'Kuyrukta gör',
    sources: {
      sync: 'Senkronizasyon',
      connection: 'Bağlantı',
      approval: 'Onay',
      export: 'Gizlilik talebi',
    } as Record<string, string>,
  },

  throughput: {
    section: 'Günlük iş hacmi',
    description:
      'Son yedi Istanbul günü. Posta ve takvim kayıtlarının sayısı bu araca hiç açılmaz; ölçülebilen boru hattı adımları budur.',
    empty: 'Son yedi günde işlenmiş iş yok.',
    day: 'Gün',
    aiEvents: 'Model çağrısı',
    aiCost: 'Maliyet',
    briefing: 'Brifing',
    notification: 'Bildirim',
    capture: 'Yakalama',
    signups: 'Yeni kayıt',
    failedSuffix: 'başarısız',
    totalLabel: 'toplam',
  },

  refresh: {
    now: 'Yenile',
    running: 'Yenileniyor…',
    autoLabel: 'Otomatik yenileme',
    autoOff: 'Kapalı',
    auto1m: '1 dk',
    auto5m: '5 dk',
  },

  privacy: {
    note: 'Bu sayfadaki her sütun bir sayım, durum, zaman damgası ya da hata kodudur.',
  },
} as const

export type OpsMessages = typeof opsMessages
