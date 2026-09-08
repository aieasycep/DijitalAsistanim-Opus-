import type { ErrorCode } from '@da/domain'
import type {
  DiffBaselineKind,
  PromptOutcome,
  PromptStatusValue,
} from '@/components/prompts/contract'

/**
 * Every Turkish string the prompt-version area renders.
 *
 * ---------------------------------------------------------------------------
 * WHY THE WORDING IS SO CAUTIOUS
 * ---------------------------------------------------------------------------
 *
 * A prompt version is not a document. It is the instruction a model is given
 * for a whole feature, for every user, from the moment it is activated — so the
 * copy on these screens never says "kaydet" where it means "yayına al", and
 * never lets an activation read like a save. The three verbs are kept apart
 * everywhere: taslak yaz, etkinleştir, arşivle.
 *
 * The other rule is about numbers. The only usage this platform can attribute
 * to a single prompt version is the call count and the cost that
 * `bo_prompt_versions` derives from `ai_usage_events.prompt_version_id`. Token
 * totals and thumbs up/down are not attributable — the reasons are spelled out
 * below and rendered on the page rather than left in a comment — so the strings
 * here say what is measured and, where nothing is, say that instead of
 * borrowing a number from somewhere it does not belong.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS NOT HERE
 * ---------------------------------------------------------------------------
 *
 * No tone mapping and no lifecycle logic. The single-active-version rule lives
 * in `prompt_versions_one_active_per_feature`, a partial unique index in
 * migration 0019, and nowhere else; the tones live in
 * `@/components/prompts/presentation`. This file is a string table, and the
 * label maps are typed against the contract's unions, so an enum member added
 * to the database — and therefore to the contract — fails to compile until it
 * has a Turkish name.
 */

// ===========================================================================
// The vocabulary
// ===========================================================================

export const promptStatusLabels: Readonly<Record<PromptStatusValue, string>> = Object.freeze({
  draft: 'Taslak',
  active: 'Etkin',
  archived: 'Arşiv',
})

/** What each status means for the model calls happening right now. */
export const promptStatusHints: Readonly<Record<PromptStatusValue, string>> = Object.freeze({
  draft:
    'Yazılmış ama yayında değil. Hiçbir model çağrısı bu metni kullanmıyor; etkinleştirilene kadar da kullanmayacak.',
  active:
    'Şu anda yayında. Bu özelliğin her model çağrısı bu metinle yapılıyor. Bir özellikte aynı anda yalnızca bir etkin sürüm olabilir; bunu veritabanı kısmi tekil indeksi zorunlu kılıyor.',
  archived:
    'Yayından kaldırılmış. Kayıt duruyor, çünkü geçmiş çağrıların maliyeti ve sonucu bu sürüme bağlı; ama yeni çağrı almıyor.',
})

export const diffBaselineLabels: Readonly<Record<DiffBaselineKind, string>> = Object.freeze({
  active: 'Yayındaki sürüm',
  previous: 'Bir önceki sürüm',
  none: 'Karşılaştırma yok',
})

// ===========================================================================
// Failures
//
// A screen never quotes a database message. These are the sentences that stand
// in for one, chosen by the typed `ErrorCode` the action came back with.
// ===========================================================================

export const GENERIC_PROMPT_FAILURE_TR = 'İşlem tamamlanamadı. Sayfayı yenileyip tekrar deneyin.'

const FAILURE_MESSAGES_TR: Readonly<Partial<Record<ErrorCode, string>>> = Object.freeze({
  not_found: 'Bu prompt sürümü bulunamadı. Bağlantı eski ya da hatalı olabilir.',
  forbidden: 'Bu işlem için gereken yetkiye sahip değilsiniz.',
  unauthorized: 'Oturumunuzun süresi dolmuş görünüyor. Tekrar giriş yapın.',
  validation_failed: 'Girilen değerler kabul edilmedi. Alanları kontrol edip tekrar deneyin.',
  sync_conflict: 'Kayıt siz formu açtıktan sonra değişmiş. Sayfayı yenileyip güncel durumu görün.',
  rate_limited: 'Çok fazla işlem denediniz. Kısa bir süre bekleyip tekrar deneyin.',
  network_timeout: 'Veritabanı zamanında yanıt vermedi. Tekrar deneyin.',
  server_unavailable: 'Sunucu şu anda yanıt vermiyor. Birazdan tekrar deneyin.',
})

export function promptFailureMessage(code: ErrorCode): string {
  return FAILURE_MESSAGES_TR[code] ?? GENERIC_PROMPT_FAILURE_TR
}

// ===========================================================================
// Outcomes
// ===========================================================================

export interface PromptOutcomeMessage {
  readonly title: string
  readonly body: string
}

export const promptOutcomeMessages: Readonly<Record<PromptOutcome, PromptOutcomeMessage>> =
  Object.freeze({
    created: {
      title: 'Taslak oluşturuldu',
      body: 'Sürüm yazıldı ama yayında değil. Hiçbir model çağrısı henüz bu metni kullanmıyor.',
    },
    saved: {
      title: 'Taslak kaydedildi',
      body: 'Değişiklikler taslağa işlendi. Yayına almak için ayrıca etkinleştirmeniz gerekiyor.',
    },
    activated: {
      title: 'Sürüm etkinleştirildi',
      body: 'Bu özelliğin yeni model çağrıları artık bu metinle yapılıyor. Önceki etkin sürüm arşive alındı.',
    },
    archived: {
      title: 'Sürüm arşivlendi',
      body: 'Sürüm yeni çağrı almıyor. Kayıt ve ona bağlı kullanım geçmişi duruyor.',
    },
    locked: {
      title: 'Sürüm düzenlenemez',
      body: 'Yalnızca taslaklar düzenlenebilir. Etkin ya da arşivlenmiş bir sürümün metni, ona bağlı kullanım kayıtlarını yalan hâle getireceği için değiştirilemez; yeni bir taslak açın.',
    },
    duplicate: {
      title: 'Sürüm numarası çakıştı',
      body: 'Aynı özellik için aynı numarayı başka bir yönetici aynı anda aldı. Sayfayı yenileyip tekrar deneyin; numara otomatik olarak ilerleyecek.',
    },
    conflict: {
      title: 'Kayıt bu arada değişti',
      body: 'Bu özellikte etkin sürüm siz bakarken değişmiş olabilir. Sayfayı yenileyip güncel durumu görün.',
    },
    invalid: {
      title: 'İşlem kabul edilmedi',
      body: 'Alanlardan biri ya da gerekçe geçerli değil. Formu kontrol edip tekrar deneyin.',
    },
    forbidden: {
      title: 'Yetki yok',
      body: 'Bu işlem için gereken yetkiye sahip değilsiniz. Deneme, denetim kaydına düştü.',
    },
    notfound: {
      title: 'Sürüm bulunamadı',
      body: 'Aradığınız prompt sürümü yok. Bağlantı eski olabilir.',
    },
    ratelimited: {
      title: 'İşlem sınırı aşıldı',
      body: 'Kısa sürede çok fazla yazma denemesi yapıldı. Biraz bekleyip tekrar deneyin.',
    },
    failed: {
      title: 'İşlem tamamlanamadı',
      body: 'Değişiklik uygulanmadı. Sorun sürerse altyapı kayıtlarına bakılabilir.',
    },
    auditMissing: {
      title: 'İşlem yapıldı, denetim kaydı yazılamadı',
      body: 'Değişiklik uygulandı ama denetim satırı düşmedi. Bunu bir yöneticiye bildirin: kaydı olmayan bir değişiklik sonradan açıklanamaz.',
    },
  })

// ===========================================================================
// The screens
// ===========================================================================

export const promptMessages = {
  area: {
    breadcrumb: 'Yapay zekâ',
  },

  list: {
    title: 'Prompt sürümleri',
    description:
      'Her özelliğin model talimatı, sürüm sürüm. Hangi metnin yayında olduğu, kimin yazdığı, kimin etkinleştirdiği ve etkinleştirmeden sonra ne kadar çağrı ile ne kadar maliyet oluştuğu buradan okunur.',
    meta: 'Sayılar son 30 günün model çağrılarından; saatler Europe/Istanbul.',
    newDraft: 'Yeni taslak',
    empty: 'Henüz hiç prompt sürümü yok.',
    emptyFiltered: 'Bu filtrelerle eşleşen sürüm yok.',
    searchInvalid:
      'Arama kutusuna özellik adı yazın: küçük harf, rakam, alt çizgi ve nokta. Diğer karakterler aranmadı.',
    noWritePermission:
      'Yalnızca okuma yetkiniz var. Taslak yazma ve etkinleştirme denetimleri gösterilmiyor.',
  },

  filters: {
    feature: 'Özellik',
    status: 'Durum',
    search: 'Özellik ara',
    searchPlaceholder: 'briefing.compose',
    featureAll: 'Tüm özellikler',
  },

  tiles: {
    features: 'Özellik',
    featuresHint: 'Etkin sürümü ya da bekleyen taslağı olan özellik sayısı.',
    active: 'Etkin sürüm',
    activeHint: 'Şu anda model çağrılarında kullanılan sürüm sayısı. Özellik başına en fazla bir.',
    drafts: 'Taslak',
    draftsHint: 'Yazılmış ama henüz yayına alınmamış sürüm.',
    missing: 'Etkin sürümü yok',
    missingHint:
      'Taslağı olan ama yayında sürümü olmayan özellik. Bu özellikler versiyonsuz çalışıyor.',
    idle: 'Çağrı almayan etkin sürüm',
    idleHint:
      'Etkin ama son 30 günde tek bir model çağrısı kaydedilmemiş sürüm. Özellik kullanılmıyor ya da çağrılar sürüme etiketlenmiyor.',
    versions: 'Toplam sürüm',
    versionsHint: 'Taslak, etkin ve arşiv birlikte.',
  },

  roster: {
    section: 'Özellikler ve yayındaki sürümler',
    description:
      'Her özellik için şu anda hangi metnin çalıştığı ve kaç taslağın beklediği. Yalnızca etkin sürümü ya da taslağı olan özellikler listelenir; tamamı arşivlenmiş bir özellik yayında değildir ve aşağıdaki sürüm tablosundan izlenir.',
    feature: 'Özellik',
    activeVersion: 'Yayındaki sürüm',
    model: 'Model',
    drafts: 'Bekleyen taslak',
    calls: 'Çağrı (30g)',
    cost: 'Maliyet (30g)',
    lastUsed: 'Son çağrı',
    noActive: 'Yayında sürüm yok',
    noActiveHint:
      'Bu özellikte etkin sürüm yok; taslağı etkinleştirmeden model talimatı sürümlenmiyor.',
    empty: 'Etkin sürümü ya da taslağı olan özellik yok.',
    truncated: (limit: number): string =>
      `Liste ${limit} satırda kesildi; ekranda görünen özellikler eksik olabilir. Sürüm tablosundan filtreleyerek devam edin.`,
  },

  table: {
    caption: 'Prompt sürümleri',
    feature: 'Özellik',
    version: 'Sürüm',
    status: 'Durum',
    model: 'Model',
    length: 'Uzunluk',
    lengthTitle: 'Prompt gövdesinin karakter sayısı',
    fingerprint: 'Parmak izi',
    fingerprintTitle: 'Gövdenin md5 özeti — iki sürümün aynı metin olup olmadığı buradan görülür',
    createdBy: 'Yazan',
    activatedBy: 'Etkinleştiren',
    createdAt: 'Oluşturma',
    activatedAt: 'Etkinleşme',
    calls: 'Çağrı (30g)',
    cost: 'Maliyet (30g)',
    lastUsed: 'Son çağrı',
    unknownAdmin: 'Bilinmiyor',
    notActivated: 'Etkinleşmedi',
    characters: (count: number): string => `${count} karakter`,
  },

  detail: {
    breadcrumb: 'Prompt sürümleri',
    notFound: 'Prompt sürümü bulunamadı',
    notFoundHint:
      'Bağlantı eski olabilir ya da sürüm kaldırılmış olabilir. Denetim kayıtları sürümün kimliğiyle durmaya devam eder.',
    backToList: 'Sürüm listesine dön',
    facts: 'Künye',
    factFeature: 'Özellik',
    factVersion: 'Sürüm',
    factStatus: 'Durum',
    factModel: 'Model',
    factModelEmpty: 'Belirtilmemiş',
    factModelHint:
      'Bu sürümün yazıldığı model. Boş bırakıldığında çağrıyı yapan servis kendi varsayılanını kullanır.',
    factLength: 'Gövde uzunluğu',
    factFingerprint: 'Parmak izi',
    factCreated: 'Yazan',
    factActivated: 'Etkinleştiren',
    factArchived: 'Arşivlenme',
    factUpdated: 'Son değişiklik',
    notesSection: 'Not',
    notesDescription:
      'Bu sürümün neden yazıldığı. Bir sonraki yöneticinin, altı ay sonra, değişikliği anlamak için okuyacağı yer.',
    notesEmpty: 'Bu sürüm için not yazılmamış.',
    bodySection: 'Gövde',
    bodyDescription:
      'Modele verilen talimatın tamamı. Bu metin şirketin kendi içeriğidir; kullanıcı verisi değildir ve denetim kaydına yazılmaz.',
    versionsSection: 'Bu özelliğin sürümleri',
    versionsDescription:
      'Aynı özelliğin bütün sürümleri, kullanımıyla birlikte. Bir sürümün çağrı başına maliyetini bir öncekiyle burada karşılaştırın.',
    versionsTruncated: (limit: number): string => `Yalnızca en yeni ${limit} sürüm listeleniyor.`,
    thisVersion: 'Bu sürüm',
    openVersion: 'Aç',
  },

  diff: {
    section: 'Fark',
    description:
      'Bu sürümün, karşılaştırıldığı sürüme göre değiştirdiği satırlar. Değişmeyen bölümler kısaltıldı.',
    baselineLabel: 'Karşılaştırılan',
    baselineActive:
      'Şu anda yayında olan sürümle karşılaştırılıyor. Etkinleştirmeden önce okunması gereken fark budur.',
    baselinePrevious:
      'Bu sürüm zaten yayında, dolayısıyla kendisiyle karşılaştırılamaz. Bir önceki sürümle, yani yayına alındığında neyin değiştiğiyle karşılaştırılıyor.',
    baselineNone:
      'Bu özelliğin başka sürümü yok, karşılaştıracak metin de yok. Gövdenin tamamı aşağıda.',
    identical:
      'İki sürümün gövdesi birebir aynı. Parmak izleri de eşleşiyor: bu sürümü etkinleştirmek model davranışını değiştirmez.',
    added: 'eklenen satır',
    removed: 'çıkarılan satır',
    unchanged: (count: number): string => `${count} satır aynı`,
    scale: (percent: string): string => `Gövdenin yaklaşık ${percent} kadarı değişti.`,
    substantial: 'Değişiklik büyük. Yalnızca farkı değil, gövdenin tamamını okuyun.',
    truncated:
      'Karşılaştırma penceresi hizalama sınırını aştı; değişen bölge tek blok olarak, satır satır eşleştirilmeden gösteriliyor.',
    legendAdded: 'Eklendi',
    legendRemoved: 'Çıkarıldı',
    columnBaseline: 'Karşılaştırılan',
    columnCurrent: 'Bu sürüm',
    lineNumber: 'Satır',
  },

  usage: {
    section: 'Bu sürüme yazılan kullanım',
    description:
      'Sayılar `ai_usage_events.prompt_version_id` üzerinden bu sürüme etiketlenmiş çağrılardan geliyor; pencere son 30 gün.',
    calls: 'Çağrı',
    callsHint: 'Son 30 günde bu sürümle yapılmış model çağrısı sayısı.',
    cost: 'Maliyet',
    costHint: 'Aynı çağrıların toplam maliyeti.',
    perCall: 'Çağrı başına',
    perCallHint: 'Maliyet bölü çağrı sayısı. Türetilmiş değerdir.',
    lastUsed: 'Son çağrı',
    lastUsedHint: 'Bu sürümle yapılan en son model çağrısı.',
    noEvents:
      'Bu sürüme yazılmış çağrı yok. Sürüm hiç yayına girmemiş, pencere dışında kalmış ya da çağrıyı yapan servis sürüm kimliğini yazmıyor olabilir.',
    unattributed: 'Ölçülemeyenler',
    tokensTitle: 'Token toplamı',
    tokensBody:
      'Token sayıları `ai_usage_events` tablosunda tutuluyor ama içeriğe kör görünümlerin hiçbiri bunları prompt sürümüne göre gruplamıyor — `bo_prompt_versions` yalnızca çağrı sayısını ve maliyeti türetir. Bu konsol taban tabloyu okuyamaz, dolayısıyla sürüm başına token burada gösterilemez. Model geneli için aşağıdaki panele bakın.',
    feedbackTitle: 'Beğeni oranı',
    feedbackBody:
      '`ai_feedback` tablosunda prompt sürümü alanı yok: geri bildirim, kullanıcının tepki verdiği nesneye bağlı, üretimi yapan sürüme değil. Tablonun içeriğe kör bir görünümü de yok ve bu uygulama böyle bir görünüm ekleyemez. Bu yüzden sürüm başına beğeni oranı ölçülemiyor; uydurmak yerine söylüyoruz.',
    modelSection: 'Model geneli (son 30 gün)',
    modelDescription:
      'Aşağıdaki toplamlar bu sürüme değil, bu sürümün yazıldığı modelin tamamına aittir — platformdaki bütün özellikler dâhil. Sürüme özel değildir; token büyüklüğü hakkında fikir vermek için burada.',
    modelNoModel: 'Bu sürümde model belirtilmediği için model geneli hesaplanamıyor.',
    modelEmpty: 'Bu modelle son 30 günde çağrı kaydedilmemiş.',
    modelTruncated:
      'Günlük kayıtlar sayfa sınırına takıldı; toplamlar eksik olabilir ve bu yüzden alt sınır olarak okunmalı.',
    modelEvents: 'Çağrı',
    modelTokensIn: 'Giren token',
    modelTokensOut: 'Çıkan token',
    modelCost: 'Maliyet',
    modelLink: 'Model maliyetlerinin tamamı',
  },

  actions: {
    section: 'İşlemler',
    description:
      'Taslak yazmak metni kaydeder; etkinleştirmek onu bütün kullanıcılar için yayına alır. İkisi ayrı kararlardır ve ayrı yetkiler ister.',
    noPermission: 'Bu bölümde işlem yapma yetkiniz yok.',
    noActivatePermission: 'Sürüm etkinleştirme yetkiniz yok. Taslak yazabilir, yayına alamazsınız.',
    reasonLabel: 'Gerekçe',
    reasonPlaceholder: 'Bu sürümü neden yayına alıyorsunuz?',

    edit: 'Taslağı düzenle',
    newVersion: 'Bu sürümden yeni taslak',
    newVersionHint:
      'Gövdesi bu sürümün kopyası olan yeni bir taslak açar. Yayındaki metin değişmez.',

    activate: 'Etkinleştir',
    activateTitle: 'Sürüm yayına alınsın mı?',
    activateBody:
      'Bu özelliğin bundan sonraki bütün model çağrıları bu metinle yapılır. Yayındaki sürüm aynı işlemde arşive alınır. İşlem, kimliğiniz ve gerekçenizle denetim kaydına düşer.',
    activateConfirm: 'Etkinleştir',
    activateReplaces: (feature: string, version: number): string =>
      `${feature} özelliğinde şu anda v${version} yayında. Etkinleştirme onu arşive alır.`,
    activateFirst: (feature: string): string =>
      `${feature} özelliğinde yayında sürüm yok. Bu, özelliğin ilk etkin promptu olacak.`,
    activateNeedsDraft: 'Yalnızca taslak durumundaki bir sürüm etkinleştirilebilir.',
    activateNoDiff:
      'Bu sürümün gövdesi yayındaki sürümle birebir aynı. Etkinleştirmek model davranışını değiştirmez.',

    archive: 'Arşivle',
    archiveTitle: 'Sürüm arşivlensin mi?',
    archiveDraftBody:
      'Taslak arşive alınır ve artık etkinleştirilemez. Kayıt silinmez; denetim izi çözülmeye devam eder.',
    archiveActiveBody:
      'Bu sürüm ŞU ANDA YAYINDA. Arşivlemek özelliği etkin promptsuz bırakır: yerine başka bir sürüm etkinleştirilene kadar bu özellik sürümlenmiş bir talimat almaz. Yerine geçecek sürüm hazırsa onu etkinleştirin; etkinleştirme bu sürümü zaten arşive alır.',
    archiveConfirm: 'Arşivle',
    archived: 'Bu sürüm arşivde. Yeniden yayına alınamaz; yeni bir taslak açın.',
  },

  form: {
    newTitle: 'Yeni prompt taslağı',
    newDescription:
      'Taslak yazmak yayına almak değildir. Kaydedilen metin hiçbir model çağrısına girmez; yayına almak ayrı bir karardır ve gerekçe ister.',
    editTitle: 'Taslağı düzenle',
    editDescription:
      'Yalnızca taslaklar düzenlenebilir. Etkin ya da arşivlenmiş bir sürümün gövdesi değiştirilemez, çünkü ona bağlı kullanım kayıtları başka bir metni ölçmüş olurdu.',
    cancel: 'Vazgeç',

    featureLabel: 'Özellik',
    featureDescription:
      'Bu promptun hangi özelliğe ait olduğu. Küçük harf, rakam ve alt çizgi; nokta ile bölümlenir — briefing.compose gibi. Kayıttan sonra değiştirilemez.',
    featurePlaceholder: 'briefing.compose',
    featureShape:
      'Özellik adı küçük harfle başlamalı; yalnızca harf, rakam, alt çizgi ve nokta içerebilir.',
    featureRequired: 'Özellik adı zorunlu.',
    featureLocked: 'Sürümün özelliği değiştirilemez.',

    versionLabel: 'Sürüm numarası',
    versionDescription:
      'Otomatik verilir: bu özelliğin en yüksek numarasının bir fazlası. Aynı anda iki taslak açılırsa numarayı veritabanının tekil kısıtı ayırt eder.',
    versionUnknown: 'Kayıt sırasında belirlenecek',

    modelLabel: 'Model',
    modelDescription:
      'Bu metnin yazıldığı model. Kayıt amaçlıdır: çağrıyı yapan servisin hangi modeli kullandığını bu alan belirlemez, ama bir gerilemenin model değişikliğinden mi prompt değişikliğinden mi geldiğini burası ayırt ettirir.',
    modelPlaceholder: 'claude-sonnet-4-5',
    modelShape: 'Model adı yalnızca harf, rakam, nokta, tire, alt çizgi ve iki nokta içerebilir.',

    notesLabel: 'Not',
    notesDescription:
      'Bu sürümde neyi neden değiştirdiğiniz. Fark ekranı ne değiştiğini gösterir; burası niçin değiştiğini söyler.',
    notesPlaceholder:
      'Örn. Özet uzunluğu 5 maddeye indirildi; kullanıcılar uzun brifingleri okumuyor.',

    bodyLabel: 'Prompt gövdesi',
    bodyDescription:
      'Modele verilen talimatın tamamı. Kullanıcı verisi yazmayın: bu metin şirket içeriğidir ve kullanıcı içeriğine uygulanan gizlilik kurallarının kapsamında değildir.',
    bodyPlaceholder: 'Sen Dijital Asistan’sın…',
    bodyRequired: 'Prompt gövdesi zorunlu.',
    bodyTooShort: (min: number): string =>
      `Prompt gövdesi en az ${min} karakter olmalı. Bu kadar kısa bir metin talimat değildir.`,
    bodyTooLong: (max: number): string => `Prompt gövdesi en fazla ${max} karakter olabilir.`,
    notesTooLong: (max: number): string => `Not en fazla ${max} karakter olabilir.`,

    copiedFrom: (feature: string, version: number): string =>
      `Gövde ${feature} · v${version} sürümünden kopyalandı. Kaydedene kadar hiçbir şey değişmez.`,
    copyMissing:
      'Kopyalanacak sürüm bulunamadı; form boş açıldı. Adres çubuğundaki bağlantı eski olabilir.',

    lengthMeta: (count: number, min: number): string => `${count} / en az ${min} karakter`,
    submitCreate: 'Taslağı kaydet',
    submitEdit: 'Değişiklikleri kaydet',
    submitting: 'Kaydediliyor…',
  },

  trail: {
    section: 'Denetim izi',
    description:
      'Bu sürüme yapılmış her işlem: kim, ne zaman, hangi gerekçeyle. Reddedilen denemeler de burada — yetkisi olmayan birinin etkinleştirmeye çalışması, kaydın var olma sebebidir.',
    action: 'İşlem',
    actor: 'Yönetici',
    reason: 'Gerekçe',
    at: 'Zaman',
    outcome: 'Sonuç',
    empty: 'Bu sürüm için denetim kaydı yok.',
    outcomeSuccess: 'Başarılı',
    outcomeFailure: 'Reddedildi',
    labels: {
      'prompt.draft_created': 'Taslak oluşturuldu',
      'prompt.draft_updated': 'Taslak düzenlendi',
      'prompt.activated': 'Sürüm etkinleştirildi',
      'admin.prompt_archived': 'Sürüm arşivlendi',
    } as Readonly<Record<string, string>>,
  },

  banner: {
    dismiss: 'Kapat',
  },
} as const
