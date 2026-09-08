/**
 * Every string the AI area renders, in Turkish.
 *
 * It sits beside the area's components rather than in `@/lib/messages` for the
 * same reason the ops and billing areas keep their own: the shared module is
 * the console's vocabulary, and a page that needs forty sentences about token
 * accounting should not push them into it. `@da/i18n` is untouched — that
 * catalogue ships to devices and belongs to the app team.
 *
 * The wording is deliberately precise about provenance. Half of what this area
 * shows is an exact `count(*)` and half is a ratio derived from two of them, and
 * an operator who cannot tell which is which will eventually escalate on a
 * number that never meant what they read into it.
 */

export const aiMessages = {
  area: {
    tabs: {
      label: 'Model bölümleri',
      spend: 'Maliyet',
      quality: 'Kalite',
      ceiling: 'Kota tavanı',
    },
    /** Rendered under every page heading in this area. */
    provenance:
      'Tüm sayılar ai_usage_events, onay, brifing ve yakalama toplamlarından gelir. Metin, konu başlığı ya da adres içeren hiçbir sütun okunmaz.',
  },

  refresh: {
    now: 'Yenile',
    running: 'Yenileniyor…',
  },

  spend: {
    title: 'Model maliyeti',
    description:
      'Modele giden her çağrının jeton ve maliyet toplamı. Gün kovaları Europe/Istanbul takvimine göre ayrılır.',
    windowLabel: 'Aralık',
    window7d: 'Son 7 gün',
    window30d: 'Son 30 gün',

    sectionTotals: 'Dönem toplamı',
    costTotal: 'Toplam maliyet',
    eventTotal: 'Model çağrısı',
    tokensIn: 'Giren jeton',
    tokensOut: 'Çıkan jeton',
    tokensTotal: 'Jeton toplamı',
    tokensSplit: 'giren / çıkan',
    costPerEvent: 'Çağrı başına maliyet',
    topOperation: 'En pahalı işlev',
    spenders24h: 'Son 24 saatte maliyeti olan kullanıcı',
    spenders7d: 'Son 7 günde maliyeti olan kullanıcı',
    spenders30d: 'Son 30 günde maliyeti olan kullanıcı',
    deltaPrevious: (value: string): string => `önceki dönem ${value}`,
    deltaUp: (value: string): string => `önceki döneme göre +${value}`,
    deltaDown: (value: string): string => `önceki döneme göre −${value}`,
    deltaFlat: 'önceki dönemle aynı',
    deltaNoBase: 'önceki dönemde kayıt yok',

    dailySection: 'Günlük harcama',
    dailyDescription: 'Her satır bir Istanbul günü. Maliyet, o gün açılan tüm çağrıların toplamı.',
    dailyEmpty: 'Seçilen aralıkta model çağrısı yok.',

    modelSection: 'Modele göre',
    modelDescription:
      'Aynı işlem farklı modellerle çalışabilir; maliyet farkı burada görünür. Model adı veritabanında yazıldığı gibidir.',
    modelEmpty: 'Seçilen aralıkta model kaydı yok.',

    operationSection: 'İşleve göre',
    operationDescription:
      'ai_usage_events.operation alanı: kaba bir etiket, hiçbir zaman istem parçası değil.',
    operationEmpty: 'Seçilen aralıkta işlev kaydı yok.',

    topSection: 'En çok harcayan kullanıcılar',
    topDescription:
      'Seçilen pencerede maliyete göre sıralı. Kimlik olarak kullanıcı kimliği ve maskeli adres gösterilir.',
    topEmpty: 'Seçilen pencerede maliyeti olan kullanıcı yok.',
    topAction: 'Kota tavanı sayfası',

    truncated: (shown: string, total: string): string =>
      `${total} toplam satırdan ${shown} tanesi okundu; toplamlar bu örneklemi yansıtır.`,
  },

  triage: {
    section: 'Triyaj hunisi',
    description:
      'Triyaj, postanın çoğunu modele hiç göndermeden kural ve VIP sinyalleriyle karara bağlar; gönderilmeyen posta hiç olay yazmaz.',
    /** The honest statement of what this tool cannot measure, and why. */
    denominatorNote:
      'Toplam posta sayısı hiçbir bo_* görünümünde yoktur: bir kullanıcının kaç e-posta aldığı da o kişiye ait bir bilgidir. Bu yüzden huni, paydayı değil modele fiilen ulaşan çağrıyı ölçer.',
    emailEvents: 'Modele giden posta analizi',
    totalEventsHint: (total: string): string => `${total} toplam çağrı`,
    emailShare: 'Toplam çağrı içindeki payı',
    emailCost: 'Posta analizi maliyeti',
    perAccount: 'Bağlı posta hesabı başına günlük analiz',
    perAccountHint: (accounts: string): string => `${accounts} bağlı ve çalışan posta hesabı`,
    mailAccountsEmpty: 'Bağlı posta hesabı yok.',
    dailyEmail: 'Günlük posta analizi',
    otherEvents: 'Diğer işlevler',
  },

  quality: {
    title: 'Kalite sinyalleri',
    description:
      'Modelin ürettiği taslak, brifing ve yakalama sonuçlarının kullanıcı tarafından ne kadar kabul gördüğü.',
    /** Why this page is not built on ai_feedback. */
    feedbackNote:
      'Beğeni/beğenmeme kayıtları (ai_feedback) için içerik-kör bir toplam görünümü tanımlı değil; bu sayfa kullanıcının davranışsal kararını ölçer: reddedilen taslak, açılmayan brifing, sınıflandırılamayan yakalama.',

    sectionSummary: 'Dönem özeti',
    rejectionRate: 'Taslak red oranı',
    rejectionHint: 'reddedilen / karara bağlanan',
    ignoreRate: 'Dokunulmadan süresi dolan',
    ignoreHint: 'süresi dolan / oluşturulan',
    briefingOpenRate: 'Brifing açılma oranı',
    briefingOpenHint: 'açılan / hazırlanan',
    captureClassifiedRate: 'Sınıflandırılan yakalama',
    captureClassifiedHint: 'niyeti bulunan / hazır',

    draftSection: 'Yüzeye göre taslak kararları',
    draftDescription:
      'Onay kuyruğundaki her kayıt bir model taslağıdır. Satırlar, pencerede oluşturulan taslakları izler; kararı sonra verilmiş olsa da aynı kohortta kalır.',
    draftEmpty: 'Seçilen aralıkta taslak oluşturulmamış.',

    trendSection: 'Günlük red oranı',
    trendDescription:
      'O gün oluşturulan taslaklardan kaçının reddedildiği. Kalite gerilemesi önce burada görünür.',
    trendEmpty: 'Seçilen günlerde taslak oluşturulmamış.',
    trendWindow: (days: number): string => `Son ${days} gün`,

    briefingTrendSection: 'Günlük brifing açılması',
    briefingTrendDescription:
      'Hazırlanan ve açılan brifing sayısı. Açılma oranındaki düşüş içerik kalitesinin ilk göstergesidir.',

    briefingSection: 'Brifing sonuçları',
    briefingDescription:
      'Türüne göre üretim ve açılma. Açılmayan brifing, kullanıcının o gün işine yaramadığını söyler.',
    briefingEmpty: 'Seçilen aralıkta brifing üretilmemiş.',

    captureSection: 'Yakalama sonuçları',
    captureDescription:
      'Modelin bir niyet çıkarabildiği yakalamaların payı. Sınıflandırılamayan yakalama kullanıcıya boş ekran demektir.',
    captureEmpty: 'Seçilen aralıkta yakalama yok.',
  },

  ceiling: {
    title: 'Kota tavanı',
    description:
      'Plan tavanına yaklaşan hesaplar. Tavan, 24 saatlik yuvarlanan pencerede model çağrısı sayısıyla uygulanır.',
    capNote: (free: string, pro: string): string =>
      `Uygulanan tavan: Ücretsiz ${free}, Pro ${pro} çağrı / 24 saat. Kullanıcı bazında 24 saatlik çağrı sayısı içerik-kör görünümlerde yok; ortalama sütunu 30 günlük çağrı sayısından türetilir, maliyet sütunları gerçek pencere toplamlarıdır.`,
    referralNote:
      'Davet bonusu abonelik durumuna yansımaz: ücretsiz görünen bir hesap Pro tavanında olabilir.',

    windowLabel: 'Pencere',
    window24h: 'Son 24 saat',
    window7d: 'Son 7 gün',
    window30d: 'Son 30 gün',
    minCostLabel: 'Alt eşik',
    minCostAll: 'Eşik yok',
    sortLabel: 'Sıralama',
    sortByCost: 'Maliyet',
    sortByEvents: 'Çağrı sayısı',
    minCostHint: (cost: string): string => `${cost} ve üzeri`,

    sectionSummary: 'Dağılımın tepesi',
    spendersInWindow: 'Pencerede maliyeti olan kullanıcı',
    topUserCost: 'En yüksek tekil kullanıcı',
    platformCost24h: 'Platform maliyeti (24s)',
    platformCost30d: 'Platform maliyeti (30g)',
    nearCap: 'Tavana yakın hesap',
    nearCapHint: 'bu sayfadaki satırlardan',

    tableSection: 'Hesaplar',
    tableDescription:
      'Seçilen pencerede maliyete ya da çağrı sayısına göre sıralı. Sıralama, eşik ve sayfalama Postgres tarafında yapılır.',
    tableEmpty: 'Seçilen pencerede eşiği aşan hesap yok.',

    reviewSection: 'Kota incelemesi',
    reviewOpen: 'İncele',
    reviewClose: 'Kapat',
    reviewExplain:
      'İnceleme, hesabı değiştirmez: gerekçenle birlikte denetim kaydına yazılır ve bu tabloda geri görünür.',
    reviewDecisionLabel: 'Karar',
    reviewReasonLabel: 'Gerekçe',
    reviewReasonPlaceholder: 'Örn. toplu içe aktarım sonrası beklenen artış',
    reviewSubmit: 'Kaydet',
    reviewSubmitting: 'Kaydediliyor…',
    reviewNever: 'İnceleme yok',

    decisions: {
      watch: 'İzlemede',
      contact_user: 'Kullanıcıya ulaşıldı',
      throttle_requested: 'Kısıtlama istendi',
    } as Record<string, string>,
  },

  pagination: {
    label: 'Sayfalama',
    range: (from: string, to: string, total: string): string =>
      `${total} kayıttan ${from}–${to} arası`,
    page: (page: number, count: number): string => `Sayfa ${page} / ${count}`,
    previous: 'Önceki',
    next: 'Sonraki',
  },

  reviewResult: {
    heading: 'Kota incelemesi',
    recorded: 'İnceleme denetim kaydına yazıldı.',
    invalid: 'Kayıt yapılmadı: kullanıcı, karar ya da gerekçe geçersiz.',
    forbidden: 'Bu işlem için operasyon yetkisi gerekiyor.',
    failed: 'Denetim kaydı yazılamadı; inceleme kaydedilmedi.',
    user: 'Kullanıcı',
    decisionLabel: 'Karar',
    dismiss: 'Kapat',
  },

  fields: {
    day: 'Gün',
    model: 'Model',
    operation: 'İşlev',
    events: 'Çağrı',
    tokensIn: 'Giren',
    tokensOut: 'Çıkan',
    cost: 'Maliyet',
    share: 'Pay',
    costPerEvent: 'Çağrı başına',
    activeDays: 'Gün',
    user: 'Kullanıcı',
    plan: 'Plan',
    cost24h: '24 saat',
    cost7d: '7 gün',
    cost30d: '30 gün',
    events30d: 'Çağrı (30g)',
    dailyAverage: 'Günlük ort.',
    dailyAverageTitle:
      'Son 30 gündeki çağrı sayısının, kullanıcının ilk çağrısından bu yana geçen güne bölümü.',
    capShare: 'Tavan payı',
    capShareTitle: 'Günlük ortalamanın, planın 24 saatlik çağrı tavanına oranı.',
    modelCount: 'Model',
    lastEvent: 'Son çağrı',
    lastReview: 'Son inceleme',
    review: 'İnceleme',
    type: 'Taslak türü',
    total: 'Toplam',
    rejected: 'Reddedilen',
    executed: 'Yürütülen',
    failed: 'Başarısız',
    expiredApproval: 'Süresi dolan',
    open: 'Açık',
    rejectionRate: 'Red oranı',
    kind: 'Tür',
    ready: 'Hazır',
    opened: 'Açılan',
    openRate: 'Açılma',
    skipped: 'Atlanan',
    generationSeconds: 'Ort. üretim',
    generationSecondsTitle: 'Hazır brifing sayısına göre ağırlıklı ortalama.',
    classified: 'Sınıflandırılan',
    classifyRate: 'Sınıflandırma',
    analysisSeconds: 'Ort. analiz',
    created: 'Oluşturulan',
    mailAccounts: 'Posta hesabı',
  },

  /**
   * The `operation` labels the pipeline actually writes. An operation this map
   * does not know is rendered verbatim, so a new function shows up as itself
   * rather than disappearing behind "bilinmiyor".
   */
  operations: {
    email_analysis: 'Posta analizi',
    assistant_ask: 'Asistan sorusu',
    reply_draft: 'Yanıt taslağı',
    capture_analyze: 'Yakalama analizi',
    meeting_prep: 'Toplantı hazırlığı',
    followup_nudge: 'Takip hatırlatması',
    briefing_morning: 'Sabah brifingi',
    briefing_midday: 'Gün ortası brifingi',
    briefing_evening: 'Akşam brifingi',
    briefing_weekly: 'Haftalık brifing',
  } as Record<string, string>,

  approvalTypes: {
    email_send: 'E-posta gönderimi',
    calendar_create: 'Takvim kaydı',
    calendar_update: 'Takvim güncellemesi',
    task_create: 'Görev',
    reminder_create: 'Hatırlatma',
    commitment_create: 'Taahhüt',
  } as Record<string, string>,

  briefingKinds: {
    morning: 'Sabah',
    midday: 'Gün ortası',
    evening: 'Akşam',
    weekly: 'Haftalık',
  } as Record<string, string>,

  captureKinds: {
    camera: 'Kamera',
    photo: 'Fotoğraf',
    pdf: 'PDF',
    file: 'Dosya',
    link: 'Bağlantı',
    text: 'Metin',
  } as Record<string, string>,

  plans: {
    free: 'Ücretsiz',
    pro: 'Pro',
  } as Record<string, string>,
} as const

export type AiMessages = typeof aiMessages

/** The operation label, falling back to the raw token. */
export function operationLabel(operation: string): string {
  return aiMessages.operations[operation] ?? operation
}
