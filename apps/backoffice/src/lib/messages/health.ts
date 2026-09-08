import type { ErrorCode } from '@da/domain'
import type { SystemHealthStatus } from '@/lib/db'
import type {
  CheckOutcome,
  HealthTarget,
  JobEvidenceKind,
  ProbeKind,
  SecretGroup,
} from '@/components/health/contract'

/**
 * Every Turkish string the system-health area renders.
 *
 * ---------------------------------------------------------------------------
 * WHY THE WORDING IS SO CAREFUL ABOUT WHAT WAS MEASURED
 * ---------------------------------------------------------------------------
 *
 * This is the page somebody opens at 02:00 with a customer on the phone. The
 * single most expensive thing it could say is a green tick nobody observed —
 * so the vocabulary here deliberately keeps four separate ideas apart:
 *
 *   "sağlıklı"      a probe ran, answered, and answered inside its threshold
 *   "yavaş"         a probe ran and answered, later than its threshold
 *   "erişilemiyor"  a probe ran and did not get an answer
 *   "bilinmiyor"    nobody measured this, or the last measurement is too old
 *                   to believe
 *
 * The fourth is not a softer version of the first. `bo_system_health.is_stale`
 * exists precisely so a probe that stopped running reads as unobserved rather
 * than as its last green answer, and every sentence below respects that.
 *
 * ---------------------------------------------------------------------------
 * AND ABOUT WHAT A PROBE ACTUALLY PROVES
 * ---------------------------------------------------------------------------
 *
 * The console reaches a provider over its own network path with no
 * credentials. That measures DNS, TLS and the provider's front door — a real
 * signal, and the one that moves during an outage — but it is not the same
 * claim as "mailbox sync is working", which runs from an edge function with an
 * access token. `probeDescriptions` says so on the row, so nobody reads more
 * into a green dot than the measurement supports.
 */

// ===========================================================================
// Status vocabulary
// ===========================================================================

export const healthStatusLabels: Readonly<Record<SystemHealthStatus, string>> = Object.freeze({
  operational: 'Sağlıklı',
  degraded: 'Yavaş',
  down: 'Erişilemiyor',
  unknown: 'Bilinmiyor',
})

/** What the console renders when a target has no usable reading at all. */
export const UNMEASURED_LABEL = 'Bilinmiyor'

export const healthStatusHints: Readonly<Record<SystemHealthStatus, string>> = Object.freeze({
  operational: 'Son ölçüm yanıt aldı ve eşiğin altında kaldı.',
  degraded: 'Son ölçüm yanıt aldı, ancak bu bağımlılık için tanımlı eşiğin üstünde.',
  down: 'Son ölçüm yanıt alamadı. Hata kodu satırda yazıyor.',
  unknown: 'Ölçüm yok ya da ölçüm sonucu bir yargı taşımıyor.',
})

// ===========================================================================
// The roster
// ===========================================================================

export const healthTargetLabels: Readonly<Record<HealthTarget, string>> = Object.freeze({
  database: 'Veritabanı',
  edge_functions: 'Kenar fonksiyonlar',
  google: 'Google',
  microsoft: 'Microsoft',
  model_provider: 'Model sağlayıcı',
  revenuecat: 'RevenueCat',
  push: 'Bildirim gönderimi',
})

/**
 * What each probe actually does, in one line, rendered under the target's name.
 * A row is only as trustworthy as the sentence beside it.
 */
export const probeDescriptions: Readonly<Record<HealthTarget, string>> = Object.freeze({
  database:
    'bo_system_health üzerinde gerçek bir sayım sorgusu. Gecikme, PostgREST turunun tamamıdır.',
  edge_functions:
    'Supabase fonksiyon ağ geçidine kimliksiz istek. Ağ geçidinin yanıt verdiğini ölçer; hiçbir fonksiyonu çalıştırmaz.',
  google:
    'accounts.google.com OAuth keşif belgesine kimliksiz istek. Konsol sunucusundan erişilebilirliği ölçer.',
  microsoft:
    'login.microsoftonline.com OAuth keşif belgesine kimliksiz istek. Konsol sunucusundan erişilebilirliği ölçer.',
  model_provider:
    'AI_PROVIDER ile seçilen sağlayıcının model uç noktasına kimliksiz istek. Anahtar gönderilmez, jeton harcanmaz.',
  revenuecat: 'RevenueCat API uç noktasına kimliksiz istek. Anahtar gönderilmez.',
  push: 'Expo bildirim uç noktasına kimliksiz istek. Hiçbir bildirim gönderilmez.',
})

export const probeKindLabels: Readonly<Record<ProbeKind, string>> = Object.freeze({
  query: 'Gerçek sorgu',
  reachability: 'Erişilebilirlik',
})

/** A target the table found in the database but the console does not probe. */
export const EXTERNAL_TARGET_NOTE = 'Bu hedefi konsol ölçmez; kaydı başka bir gözlemci yazmış.'

// ===========================================================================
// The page
// ===========================================================================

export const healthMessages = {
  dashboard: {
    title: 'Sistem sağlığı',
    description:
      'Her bağımlılığın gerçek durumu. Buradaki her satır system_health_checks tablosundaki bir ölçümden gelir; hiç ölçülmemiş bir hedef yeşil değil, "bilinmiyor" görünür.',
    kicker: 'Sistem',
    measuredFrom:
      'Ölçüm konsol sunucusundan yapılır. Kenar fonksiyonların ağ yolu farklı olabilir; bu sayfa onların yolunu değil, buradan görünen durumu ölçer.',
    lastMeasurement: 'Son ölçüm',
    noMeasurement: 'Hiç ölçüm yok',
    configLink: 'Yapılandırma ve gizli anahtarlar',
  },

  summary: {
    section: 'Özet',
    tracked: 'İzlenen bağımlılık',
    trackedHint: 'Konsol listesi + tabloda bulunan diğer hedefler',
    operational: 'Sağlıklı',
    degraded: 'Yavaş',
    down: 'Erişilemiyor',
    unmeasured: 'Ölçüm yok',
    unmeasuredHint: 'Hiç ölçülmemiş ya da son ölçümü 15 dakikadan eski',
  },

  table: {
    section: 'Bağımlılıklar',
    description:
      'Her hedefin son ölçümü ve son 24 saatteki dağılımı. Durum sütunu ölçümün kendisidir; ölçüm yoksa sütun boş kalmaz, "bilinmiyor" yazar.',
    caption: 'Bağımlılık sağlık durumu',
    columnTarget: 'Bağımlılık',
    columnStatus: 'Durum',
    columnLatency: 'Gecikme',
    columnChecked: 'Son ölçüm',
    columnObserver: 'Ölçen',
    columnError: 'Hata kodu',
    columnWindow: 'Son 24 saat',
    columnAction: 'İşlem',
    empty: 'Hiçbir bağımlılık için ölçüm kaydı yok.',
    emptyHint:
      'Zamanlanmış bir yoklama hiç çalışmamış olabilir. "Şimdi ölç" ile ilk ölçümü kendiniz alabilirsiniz.',
    neverChecked: 'Hiç ölçülmedi',
    staleNote: (minutes: number): string => `Son ölçüm ${minutes} dakika önce — çok eski.`,
    thresholdNote: (ms: number): string => `Eşik: ${ms} ms`,
    latencyUnit: 'ms',
  },

  window: {
    label: 'Son 24 saat',
    samples: (n: number): string => `${n} ölçüm`,
    noSamples: 'Son 24 saatte ölçüm yok',
    breakdown: (healthy: number, degraded: number, down: number): string =>
      `${healthy} sağlıklı · ${degraded} yavaş · ${down} erişilemedi`,
    flapping: 'Bu pencerede durum değişmiş: yalnızca son satıra bakmayın.',
    averageLatency: (ms: number): string => `Ortalama ${ms} ms`,
    maxLatency: (ms: number): string => `En yüksek ${ms} ms`,
  },

  observers: {
    cron: 'Zamanlanmış',
    manual: 'Elle',
    webhook: 'Webhook',
    probe: 'Yoklama',
  } as Readonly<Record<string, string>>,

  check: {
    all: 'Tümünü şimdi ölç',
    allPending: 'Ölçülüyor…',
    one: 'Şimdi ölç',
    onePending: 'Ölçülüyor…',
    refresh: 'Yenile',
    refreshPending: 'Yenileniyor…',
    forbidden:
      'Ölçüm başlatmak için sistem sağlığı okuma ve entegrasyon yeniden senkronizasyon yetkisi gerekir.',
    note: 'Ölçüm dışarıya kimliksiz istek gönderir ve sonucu system_health_checks tablosuna yazar. Kullanıcı verisine dokunmaz.',
    dismiss: 'Kapat',
  },

  jobs: {
    section: 'Zamanlanmış işler',
    description:
      '0014 numaralı migration bu altı işi tanımlar. Konsol pg_cron tablolarını okuyamaz; aşağıdaki "son iz" sütunu işin bıraktığı gerçek kaydı gösterir, işin çalıştığı anı değil.',
    caption: 'Zamanlanmış işler ve bıraktıkları izler',
    columnJob: 'İş',
    columnSchedule: 'Program (UTC)',
    columnRuns: 'Ne çalıştırır',
    columnEvidence: 'Son iz',
    columnSignal: 'Uyarı',
    empty: 'Zamanlanmış iş tanımı yok.',
    cronUnreadable:
      'pg_cron çizelgesi (cron.job, cron.job_run_details) hiçbir bo_* görünümünde açık değildir; bu tablo migration dosyasındaki tanımı gösterir.',
    sqlFallback: (sql: string): string => `pg_net yoksa: ${sql}`,
    noFallback: 'pg_net gerekir; yoksa iş hiç kurulmaz.',
    pureSql: 'Yalnızca SQL — kenar fonksiyon çağırmaz.',
    notMeasurable: 'Ölçülemiyor',
    notMeasurableHint: 'Bu işin çıktısını kaydeden içerik-kör bir görünüm yok.',
  },

  evidence: {
    sync: 'En son senkronizasyon çalıştırması',
    briefing: 'En son brifing/bildirim günü',
    approval: 'En son süresi dolan onay',
    export: 'En son süresi dolan dışa aktarım',
    none: 'İz kaydı yok',
  } as Readonly<Record<JobEvidenceKind, string>>,

  signals: {
    stalledSync: (n: number): string => `${n} senkronizasyon kaydı takılmış`,
    overdueApprovals: (n: number): string => `${n} onay süresi geçmiş ama hâlâ beklemede`,
    staleExports: (n: number): string => `${n} dışa aktarım süresi dolmuş ama hâlâ "hazır"`,
    briefingsToday: (ready: number, failed: number): string =>
      `${ready} brifing hazır, ${failed} başarısız`,
    notificationsToday: (sent: number, failed: number): string =>
      `${sent} bildirim gönderildi, ${failed} başarısız`,
    clear: 'Bekleyen bir uyarı yok',
  },

  config: {
    title: 'Yapılandırma',
    description:
      'Hangi gizli anahtarın tanımlı olduğu. Değer, ön ek, uzunluk ya da parmak izi hiçbir koşulda gösterilmez — bu sayfa yalnızca "var" ya da "yok" bilir.',
    kicker: 'Sistem',
    backToHealth: 'Sistem sağlığına dön',
    scopeNote:
      'Burada okunan tek şey bu konsol sunucusunun ortam değişkenleridir. Kenar fonksiyonların gizli anahtarları Supabase tarafında ayrı tutulur; orada tanımlı bir değer burada "yapılandırılmadı" görünebilir.',
    neverShown:
      'Bu sayfa hiçbir anahtarın değerini okumaz. Sunucuda yalnızca değişkenin tanımlı olup olmadığı karşılaştırılır; değerin kendisi hiçbir yere taşınmaz.',
    configured: 'Yapılandırıldı ✅',
    missing: 'Yapılandırılmadı ❌',
    columnVariable: 'Değişken',
    columnState: 'Durum',
    columnRequired: 'Zorunlu',
    columnNote: 'Not',
    required: 'Zorunlu',
    optional: 'İsteğe bağlı',
    consoleSection: 'Konsolun kendi yapılandırması',
    consoleDescription:
      'Bu uygulamanın çalışması için okuduğu değişkenler. Eksik bir zorunlu değişken, konsolun hiçbir veri okuyamaması demektir.',
    platformSection: 'Platform bütünleşmeleri',
    platformDescription:
      '.env.example dosyasındaki sunucu tarafı değişkenler. Eksik olan bir bütünleşme çalışmaz ya da yedek katmana düşer.',
    environmentSection: 'Ortam',
    environmentDescription: 'Bu konsolun hangi dağıtıma baktığı.',
    environmentLabel: 'Ortam',
    projectRef: 'Supabase projesi',
    release: 'Sürüm',
    releaseUnknown: 'Bildirilmemiş',
    missingTile: 'Eksik zorunlu değişken',
    missingRequired: (n: number): string => `${n} zorunlu değişken eksik`,
    allRequiredPresent: 'Zorunlu değişkenlerin tamamı tanımlı',
    emptyGroup: 'Bu grupta tanımlı değişken yok.',
  },

  groups: {
    console: 'Konsol',
    credentials: 'Sağlayıcı kimlik şifrelemesi',
    google: 'Google',
    microsoft: 'Microsoft',
    ai: 'Yapay zeka',
    billing: 'Abonelik',
    push: 'Bildirim',
    observability: 'İzlenebilirlik',
  } as Readonly<Record<SecretGroup, string>>,
} as const

export type HealthMessages = typeof healthMessages

// ===========================================================================
// What an action reports back
// ===========================================================================

export interface HealthOutcomeMessage {
  readonly title: string
  readonly body: string
  readonly tone: 'success' | 'warning' | 'critical'
}

export const healthOutcomeMessages: Readonly<Record<CheckOutcome, HealthOutcomeMessage>> =
  Object.freeze({
    recorded: {
      title: 'Ölçüm tamamlandı',
      body: 'Her hedef için gerçek bir ölçüm yapıldı ve sonucu system_health_checks tablosuna yazıldı. Aşağıdaki satırlar bu ölçümü gösteriyor.',
      tone: 'success',
    },
    partial: {
      title: 'Ölçüm yapıldı, kayıt eksik',
      body: 'Yoklamalar çalıştı ancak en az bir sonuç veritabanına yazılamadı. Yazılamayan hedefler eski değerlerini gösteriyor olabilir; tekrar deneyin.',
      tone: 'warning',
    },
    forbidden: {
      title: 'Yetki yok',
      body: 'Ölçüm başlatma yetkiniz yok. Denemeniz denetim kaydına yazıldı.',
      tone: 'critical',
    },
    ratelimited: {
      title: 'Çok fazla ölçüm',
      body: 'Kısa sürede çok fazla ölçüm istendi. Bir süre bekleyip tekrar deneyin; mevcut satırlar son geçerli ölçümü göstermeye devam ediyor.',
      tone: 'warning',
    },
    invalid: {
      title: 'Geçersiz istek',
      body: 'Ölçülmek istenen hedef konsolun listesinde değil. Sayfayı yenileyip tekrar deneyin.',
      tone: 'warning',
    },
    failed: {
      title: 'Ölçüm kaydedilemedi',
      body: 'Ölçüm sonucu veritabanına yazılamadı. Veritabanı satırı bu sayfada "erişilemiyor" görünüyorsa önce onu inceleyin.',
      tone: 'critical',
    },
    auditMissing: {
      title: 'Ölçüm yazıldı, denetim kaydı yazılamadı',
      body: 'Ölçüm sonuçları kaydedildi ancak denetim kaydı düşmedi. İşlemin izi eksik; altyapıyı kontrol edin.',
      tone: 'critical',
    },
  })

// ===========================================================================
// Failures
//
// A screen never quotes a database or a provider message. These are the
// sentences that stand in for one, chosen by the typed `ErrorCode`.
// ===========================================================================

export const GENERIC_HEALTH_FAILURE_TR = 'Sorgu tamamlanamadı. Sayfayı yenileyip tekrar deneyin.'

const FAILURE_MESSAGES_TR: Readonly<Partial<Record<ErrorCode, string>>> = Object.freeze({
  forbidden: 'Bu veriye erişim yetkiniz yok.',
  unauthorized: 'Oturumunuzun süresi dolmuş görünüyor. Tekrar giriş yapın.',
  not_found: 'Kayıt bulunamadı.',
  network_timeout: 'Sorgu zaman aşımına uğradı. Kısa süre sonra tekrar deneyin.',
  rate_limited: 'Çok fazla istek yapıldı. Bir süre bekleyip tekrar deneyin.',
  server_unavailable:
    'Veritabanına ulaşılamadı. Bu sayfanın kendisi de aynı bağlantıyı kullanıyor; veritabanı satırına bakın.',
  validation_failed: 'İstek veritabanının kabul ettiği biçimde değil.',
})

export function healthFailureMessage(code: ErrorCode): string {
  return FAILURE_MESSAGES_TR[code] ?? GENERIC_HEALTH_FAILURE_TR
}
