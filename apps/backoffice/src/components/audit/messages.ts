import { messages } from '@/lib/messages'
import {
  type AccessOutcome,
  type ActorBucket,
  type OutcomeBucket,
  type RangePreset,
  type ReviewOutcome,
} from './contract'

/**
 * Turkish strings for the audit area.
 *
 * They live beside the screens that render them rather than in
 * `@/lib/messages`, which is the console's shared vocabulary, and nowhere near
 * `@da/i18n`, which is the product catalogue shipped to devices.
 *
 * The action dictionary is the one place in the console that translates an
 * audit token into a sentence. It is a presentation layer over an open set: an
 * action the dictionary does not know is rendered verbatim, because inventing a
 * label for a token nobody recognised would be worse than showing the token.
 */

export const auditMessages = {
  log: {
    title: 'Denetim kaydı',
    description:
      'Asistanın ve ekibin yaptığı her işlemin kaydı. Satırlar sayım, durum kodu ve zaman damgasıdır; hiçbir sütun ileti içeriği, konu başlığı, ad veya tam adres taşımaz.',
    rangeLabel: 'Tarih aralığı',
    rangeFrom: 'Başlangıç',
    rangeTo: 'Bitiş',
    rangeApply: 'Uygula',
    rangeSummary: (from: string, to: string): string => `${from} – ${to}`,
    rangeClamped: 'Bitiş tarihi bugüne çekildi.',
    rangeSwapped: 'Başlangıç bitişten sonraydı; iki tarih yer değiştirdi.',
    tableCaption: 'Denetim kaydı satırları',
    empty: 'Bu aralıkta ve bu filtrelerle kayıt yok.',
    emptyWiden: 'Aralığı genişlet',
    invalidUser: 'Kullanıcı filtresi geçerli bir kimlik değil; yok sayıldı.',
    backToLog: 'Kayda dön',
  },

  columns: {
    time: 'Zaman',
    action: 'İşlem',
    actor: 'Aktör',
    subject: 'Konu kullanıcı',
    entity: 'Nesne',
    outcome: 'Sonuç',
    reason: 'Gerekçe',
    metadata: 'Meta anahtarları',
    review: 'İnceleme',
    count: 'Adet',
    share: 'Pay',
  },

  tiles: {
    matching: 'Eşleşen kayıt',
    matchingHint: 'Seçili aralık ve filtrelerle',
    staff: 'Ekip işlemi',
    staffHint: 'Bir kişinin butona bastığı satırlar',
    failed: 'Başarısız sonuç',
    failedHint: "Sonucu 'success' olmayan satırlar",
    userLinked: 'Kullanıcıya bağlı',
    userLinkedHint: 'Konu kullanıcısı dolu satırlar',
  },

  actor: {
    ekip: 'Ekip',
    sistem: 'Sistem',
    kullanici: 'Kullanıcı',
    isaretsiz: 'İşaretsiz',
    diger: 'Diğer',
    filterLabel: 'Aktör',
    unmarkedNote:
      "İşaretsiz satırlar ürünün kendi uç fonksiyonlarından gelir: metadata'da actor anahtarı yoktur. Bu araç yalnızca 'staff' ve 'system' yazar.",
  },

  outcome: {
    basarili: 'Başarılı',
    hata: 'Hata',
    belirtilmemis: 'Belirtilmemiş',
    filterLabel: 'Sonuç',
    note: "Üç kova birbirini dışlar ve toplamı satır sayısına eşittir: outcome = 'success', 'success' olmayan dolu bir değer, ya da hiç anahtar yok.",
  },

  filters: {
    action: 'İşlem',
    actionAll: 'Tüm işlemler',
    user: 'Konu kullanıcı',
    userPlaceholder: 'Kullanıcı kimliği (uuid)',
    unknownAction: (action: string): string => `${action} (listede yok)`,
  },

  range: {
    bugun: 'Bugün',
    '7g': '7 gün',
    '30g': '30 gün',
    '90g': '90 gün',
    '400g': '400 gün',
    custom: 'Özel aralık',
    presetLabel: 'Hazır aralık',
  },

  pager: {
    label: 'Sayfalama',
    newer: 'Daha yeni',
    older: 'Daha eski',
    first: 'En yeni sayfa',
    position: (shown: number, total: number): string =>
      total > shown ? `${total} kayıttan ${shown} tanesi` : `${shown} kayıt`,
    shownOnly: (shown: number): string => `Bu sayfada ${shown} kayıt`,
    countUnavailable: 'Toplam sayı getirilemedi',
    keysetNote:
      'Sayfalama anahtar tabanlıdır: her sayfa son satırın zaman damgası ve kimliğiyle devam eder, satır atlamaz ve büyüyen tabloda yavaşlamaz.',
  },

  retention: {
    title: 'Saklama ve anonimleştirme',
    description: (days: number): string =>
      `Denetim kayıtları silinmez. ${days} günü aşan satırların nesne kimliği ve meta verisi gece süpürmesinde boşaltılır; satırın kendisi, işlemi ve zamanı kalır.`,
    columnsNote: (columns: string): string => `Boşaltılan sütunlar: ${columns}.`,
    scheduleNote: (utc: string, local: string): string =>
      `Süpürme her gün ${utc} UTC (${local} İstanbul) çalışır.`,
    cutoff: 'Anonimleştirme sınırı',
    oldest: 'En eski kayıt',
    overdue: 'Sınırı aşmış satır',
    anonymised: 'Anonimleştirilmiş',
    pending: 'Bekleyen',
    pendingHealthy: 'Süpürme güncel.',
    pendingBehind: 'Süpürme geride: sınırı aşmış satırlarda hâlâ meta veri var.',
    lastSweep: 'Son süpürme',
    nextSweep: 'Sıradaki süpürme',
    sweepNever: 'Kayıt bulunamadı',
    sweepNeverHint:
      'Süpürme çalıştığında bir retention.swept satırı yazar. Hiç yoksa iş planlanmamış olabilir.',
    whatIsKept: 'Ne saklanır',
    whatIsKeptBody:
      'Satırın kimliği, işlemi, nesne türü, aktörü, sonucu ve zamanı. Ekip işlemlerinde ekibin yazdığı gerekçe de saklanır.',
    whatIsNever: 'Ne hiç yazılmaz',
    whatIsNeverBody:
      'İleti gövdesi, konu başlığı, kişi adı, tam e-posta adresi ve sağlayıcı hata metni. bo_audit görünümü bu sütunların hiçbirine dokunmaz; serbest metin alanları bo_identifier() süzgecinden geçer ve boşluk ya da @ içeren her değer düşer.',
  },

  breakdown: {
    title: 'İşlem dağılımı',
    description:
      'Seçili aralıktaki her işlem tokenının tam sayımı. Her satır Postgres tarafında sayılan bir count(*) sonucudur; hiçbir sayı örneklem değildir.',
    section: 'İşleme göre',
    actorSection: 'Aktöre göre',
    outcomeSection: 'Sonuca göre',
    groupColumn: 'Alan',
    remainder: 'Listelenmemiş işlem',
    remainderHint:
      'Toplamdan sayılan işlemler çıkarıldığında kalan satırlar. Sıfırdan büyükse bu araç tanımadığı bir işlem tokenı görüyor demektir.',
    othersNote: (count: number): string =>
      `${count} işlem tokenı sayıldı; aralıkta hiç geçmeyenler listelenmez.`,
    truncated: (limit: number): string =>
      `Yalnızca ilk ${limit} işlem tokenı sayıldı; kalanlar listelenmemiş satırlara dahildir.`,
    totalRow: 'Toplam',
    openInLog: 'Kayıtta aç',
    discoveryNote: (limit: number): string =>
      `İşlem sözlüğü, bilinen tokenlar ile aralığın en yeni ${limit} satırında geçen tokenların birleşimidir; sayımlar bu listeden bağımsız olarak tam sayımdır.`,
  },

  review: {
    section: 'Kayıt incelemesi',
    open: 'İncele',
    close: 'Kapat',
    entry: 'İncelenen kayıt',
    notFound: 'Kayıt bulunamadı. Anonimleştirilmiş ya da hiç var olmamış olabilir.',
    reasonLabel: 'Gerekçe',
    reasonPlaceholder: 'Bu kaydı neden inceledin ve ne sonuca vardın?',
    reasonHint: (min: number, max: number): string => `${min}-${max} karakter. Denetime yazılır.`,
    submit: 'İncelendi olarak işle',
    submitting: 'İşleniyor…',
    existing: 'Önceki incelemeler',
    existingEmpty: 'Bu kayıt için henüz inceleme notu yok.',
    marked: 'İncelendi',
    markedBy: (count: number): string => (count === 1 ? '1 inceleme' : `${count} inceleme`),
    effectNote:
      'İnceleme notu bir denetim satırıdır: bu sayfada, aynı saklama kuralı altında görünür. Kayıtta hiçbir şeyi değiştirmez, üzerine bir satır ekler.',
  },

  access: {
    heading: 'Erişim kaydı',
    pending: 'Bu görünümün açılışı denetime işleniyor…',
    recorded: 'Bu görünümün açılışı denetim kaydına işlendi.',
    deduped: (minutes: number): string =>
      `Bu görünüm son ${minutes} dakika içinde zaten işlendi; yinelenen satır yazılmadı.`,
    failed: 'Erişim kaydı yazılamadı. Kayıt eksik kalmış olabilir.',
    explain: (minutes: number): string =>
      `Denetim kaydını okumak da bir ekip işlemidir. Her açılış değil, her ekip üyesi için her filtre kümesi ${minutes} dakikada bir kez ${'audit.log_inspected'} satırı olarak yazılır ve aşağıdaki tabloda görünür.`,
    scope: 'Filtre kümesi',
  },

  refresh: {
    label: 'Yenile',
    pending: 'Yenileniyor…',
  },

  tabs: {
    log: 'Kayıt',
    breakdown: 'Dağılım',
    label: 'Denetim görünümleri',
  },

  result: {
    heading: 'Sonuç',
    entry: 'Kayıt',
    dismiss: 'Kapat',
  },

  loading: {
    announce: 'Denetim kaydı yükleniyor…',
  },
} as const

/** Preset labels, in the order the picker renders them. */
export const RANGE_PRESET_LABEL: Readonly<Record<RangePreset, string>> = {
  bugun: auditMessages.range.bugun,
  '7g': auditMessages.range['7g'],
  '30g': auditMessages.range['30g'],
  '90g': auditMessages.range['90g'],
  '400g': auditMessages.range['400g'],
}

export const ACTOR_LABEL: Readonly<Record<ActorBucket | 'diger', string>> = {
  ekip: auditMessages.actor.ekip,
  sistem: auditMessages.actor.sistem,
  kullanici: auditMessages.actor.kullanici,
  isaretsiz: auditMessages.actor.isaretsiz,
  diger: auditMessages.actor.diger,
}

export const OUTCOME_LABEL: Readonly<Record<OutcomeBucket, string>> = {
  basarili: auditMessages.outcome.basarili,
  hata: auditMessages.outcome.hata,
  belirtilmemis: auditMessages.outcome.belirtilmemis,
}

export const REVIEW_OUTCOME_MESSAGE: Readonly<Record<ReviewOutcome, string>> = {
  isaretlendi: 'Kayıt incelendi olarak işlendi.',
  yinelenen: 'Bu kaydı son bir saat içinde zaten işledin; ikinci satır yazılmadı.',
  bulunamadi: 'Kayıt bulunamadı.',
  gecersiz: 'Kayıt kimliği ya da gerekçe geçersiz.',
  yetkisiz: 'Bu işlem için yetkin yok.',
  basarisiz: 'İşlem tamamlanamadı; denetim satırı yazılamadı.',
}

export const ACCESS_OUTCOME_TONE: Readonly<
  Record<AccessOutcome, 'success' | 'warning' | 'critical'>
> = {
  islendi: 'success',
  zaten_var: 'warning',
  basarisiz: 'critical',
}

/**
 * What each audit action means, in a sentence an operator can act on.
 *
 * Extended alongside the action that writes it. An unmapped token falls through
 * to `@/lib/messages`' small shared set and then to the token itself.
 */
export const ACTION_LABEL: Readonly<Record<string, string>> = {
  'account.connected': 'Hesap bağlandı',
  'account.disconnected': 'Hesap bağlantısı kesildi',
  'account.scope_granted': 'Kapsam izni verildi',
  'account.token_decrypted': 'Kimlik bilgisi çözüldü',
  'account.token_refreshed': 'Erişim jetonu yenilendi',
  'account.token_revoked': 'Erişim jetonu iptal edildi',
  'sync.started': 'Senkronizasyon başladı',
  'sync.completed': 'Senkronizasyon tamamlandı',
  'sync.failed': 'Senkronizasyon başarısız',
  'sync.resync_requested': 'Yeniden senkronizasyon istendi',
  'approval.created': 'Onay istendi',
  'approval.approved': 'Onay verildi',
  'approval.rejected': 'Onay reddedildi',
  'approval.executed': 'Onaylanan işlem yürütüldü',
  'approval.failed': 'Onaylanan işlem başarısız',
  'approval.expired': 'Onay süresi doldu',
  'approval.rejection_reviewed': 'Ret oranı incelendi',
  'approval.failure_triaged': 'Onay hatası triyaj edildi',
  'briefing.generated': 'Brifing üretildi',
  'briefing.skipped': 'Brifing atlandı',
  'briefing.regenerate_requested': 'Brifing yeniden üretimi istendi',
  'assistant.query': 'Asistana soru soruldu',
  'capture.analyzed': 'Yakalama çözümlendi',
  'notification.sent': 'Bildirim gönderildi',
  'subscription.updated': 'Abonelik güncellendi',
  'referral.redeemed': 'Davet kodu kullanıldı',
  'referral.rejected': 'Davet kodu reddedildi',
  'referral.credit_revoke_ordered': 'Davet kredisi iptali istendi',
  'privacy.export_requested': 'Veri dışa aktarımı istendi',
  'privacy.export_rerun_ordered': 'Dışa aktarım yeniden çalıştırma emri',
  'privacy.history_deleted': 'Geçmiş silindi',
  'privacy.account_deleted': 'Hesap silindi',
  'retention.swept': 'Saklama süpürmesi çalıştı',
  'ai.quota_reviewed': 'Model kotası incelendi',
  'staff.signed_in': 'Ekip üyesi giriş yaptı',
  'staff.signed_out': 'Ekip üyesi çıkış yaptı',
  'staff.sign_in_denied': 'Giriş reddedildi',
  'audit.entry_reviewed': 'Denetim kaydı incelendi',
  'audit.log_inspected': 'Denetim kaydı görüntülendi',
}

/** The subsystem an action belongs to, named. */
export const ACTION_GROUP_LABEL: Readonly<Record<string, string>> = {
  account: 'Hesap bağlantıları',
  sync: 'Senkronizasyon',
  approval: 'Onaylar',
  briefing: 'Brifingler',
  assistant: 'Asistan',
  capture: 'Yakalamalar',
  notification: 'Bildirimler',
  subscription: 'Abonelik',
  referral: 'Davetler',
  privacy: 'Gizlilik',
  retention: 'Saklama',
  ai: 'Model maliyeti',
  staff: 'Ekip oturumları',
  audit: 'Denetim',
  diger: 'Diğer',
}

/** A label for an action token, falling back to the token itself. */
export function actionLabel(action: string | null): string {
  if (action === null) return messages.fields.unknown
  return ACTION_LABEL[action] ?? messages.audit.actions[action] ?? action
}

export function actionGroupLabel(group: string): string {
  return ACTION_GROUP_LABEL[group] ?? group
}
