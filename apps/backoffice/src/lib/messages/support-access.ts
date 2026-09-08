import type { ErrorCode } from '@da/domain'
import type { DatabaseHint } from '@/lib/db'
import { REVEAL_DENIAL_MESSAGES_TR, type SupportAccessStatus } from '@/lib/redact'

/**
 * Every Turkish string the Support Access area renders.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE READS LIKE A WARNING LABEL
 * ---------------------------------------------------------------------------
 *
 * Support Access is the one mechanism in this product that can put a person's
 * private life on an operator's screen. Everywhere else the console is blind by
 * construction — the `bo_*` views have no content column to project — so the
 * words on those pages only have to be accurate. Here they have to be
 * *dissuasive*: the request form states, before anything is ticked, exactly
 * what the requester is about to be able to read, for how long, and that every
 * single view is recorded against their name and kept.
 *
 * That is not decoration. An operator who does not understand what they are
 * asking for cannot write a reason a reviewer can weigh six months later, and
 * the written reason is the entire accountability story.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS NOT HERE
 * ---------------------------------------------------------------------------
 *
 * No scope labels and no scope descriptions: those are `SCOPE_LABELS_TR` and
 * `SCOPE_DESCRIPTIONS_TR` in `@/lib/redact`, beside the guard that decides
 * whether a scope may be spent. Restating them here would be a second
 * vocabulary for the same enum, and the two would eventually disagree about
 * what `email_body` unlocks — on the screen whose whole job is to say so.
 */

// ===========================================================================
// The status vocabulary
// ===========================================================================

/** One label per member of the `support_access_status` enum. */
export const GRANT_STATUS_LABELS_TR: Readonly<Record<SupportAccessStatus, string>> = Object.freeze({
  pending_approval: 'Onay bekliyor',
  active: 'Etkin',
  denied: 'Reddedildi',
  expired: 'Süresi doldu',
  revoked: 'Geri alındı',
})

/**
 * What each status means for the account being looked at, in one sentence.
 * Rendered under the badge on the detail page: "etkin" is a claim about
 * somebody's mailbox and deserves a sentence, not a colour.
 */
export const GRANT_STATUS_HINTS_TR: Readonly<Record<SupportAccessStatus, string>> = Object.freeze({
  pending_approval:
    'Henüz hiçbir şey açılmadı. Talebi açan yöneticiden başka bir yönetici onaylayana kadar bu izinle tek bir kayıt bile görüntülenemez.',
  active:
    'Bu izin şu anda kullanılabilir durumda. Talep eden yönetici, kapsamdaki içeriği süre dolana kadar görüntüleyebilir ve her görüntüleme tek tek kaydedilir.',
  denied: 'Talep reddedildi. Bu izinle hiçbir içerik görüntülenemez.',
  expired: 'Süre doldu. Yeni bir görüntüleme için yeni bir talep ve yeni bir onay gerekir.',
  revoked: 'İzin süresi dolmadan geri alındı. Bu izinle artık hiçbir içerik görüntülenemez.',
})

/**
 * The line a lapsed-but-unswept grant gets.
 *
 * `admin_cleanup_expired()` moves an `active` row to `expired` on a schedule, so
 * between the lapse and the sweep the stored status still reads `active`. The
 * screen reports the timestamps rather than the column, and says why the two
 * disagree instead of quietly showing a green badge over a dead grant.
 */
export const GRANT_LAPSED_NOTE_TR =
  'Kayıtlı durum hâlâ "Etkin" görünüyor çünkü süresi dolan izinleri kapatan temizlik işi henüz çalışmadı. Süre dolduğu için bu izinle içerik görüntülenemez.'

// ===========================================================================
// Failures
//
// A screen never quotes a database message. These are the sentences that stand
// in for one, chosen by the typed `ErrorCode` the action came back with.
// ===========================================================================

/** The generic sentence for a failure nothing more specific explains. */
export const GENERIC_FAILURE_TR = 'İşlem tamamlanamadı. Sayfayı yenileyip tekrar deneyin.'

export const FAILURE_MESSAGES_TR: Readonly<Partial<Record<ErrorCode, string>>> = Object.freeze({
  not_found: 'Bu Destek Erişimi kaydı bulunamadı.',
  forbidden: 'Bu işlem için gereken yetkiye sahip değilsiniz.',
  unauthorized: 'Oturumunuzun süresi dolmuş görünüyor. Tekrar giriş yapın.',
  validation_failed: 'Girilen bilgiler veritabanının kabul ettiği biçimde değil.',
  sync_conflict: 'Kayıt siz bu ekranı açtıktan sonra değişti. Yenileyip tekrar bakın.',
  rate_limited: 'Çok fazla deneme yapıldı. Bir süre bekleyip tekrar deneyin.',
  server_unavailable: 'Veritabanına ulaşılamadı. Kısa süre sonra tekrar deneyin.',
})

export function failureMessage(code: ErrorCode): string {
  return FAILURE_MESSAGES_TR[code] ?? GENERIC_FAILURE_TR
}

/**
 * The six refusals `sa_assert_grant()` raises, in Turkish.
 *
 * Five of them are the same sentences `REVEAL_DENIAL_MESSAGES_TR` uses for the
 * console-side mirror in `redact.ts`, and they are reused rather than restated:
 * a refusal must read the same whether Postgres produced it or the screen
 * anticipated it, or an operator comparing the two would think they were
 * looking at different problems. The sixth — an id that names no grant at all —
 * has no console-side counterpart, because the console only ever reaches this
 * path from a row it has already read.
 */
const REVEAL_REFUSAL_MESSAGES_TR: Readonly<Partial<Record<DatabaseHint, string>>> = Object.freeze({
  support_access_unknown_grant: 'Bu Destek Erişimi kaydı bulunamadı.',
  support_access_wrong_admin: REVEAL_DENIAL_MESSAGES_TR.wrong_admin,
  support_access_wrong_subject: REVEAL_DENIAL_MESSAGES_TR.wrong_subject,
  support_access_grant_not_live: REVEAL_DENIAL_MESSAGES_TR.grant_not_live,
  support_access_scope_denied: REVEAL_DENIAL_MESSAGES_TR.scope_denied,
  support_access_permission_lost: REVEAL_DENIAL_MESSAGES_TR.permission_denied,
})

/**
 * The sentence for a refusal Postgres named, or the sentence for the error code
 * when it named nothing. A raw database message never reaches a screen.
 */
export function revealRefusalMessage(hint: DatabaseHint | null, code: ErrorCode): string {
  if (hint !== null) {
    const named = REVEAL_REFUSAL_MESSAGES_TR[hint]
    if (named !== undefined) return named
  }
  return failureMessage(code)
}

// ===========================================================================
// The strings
// ===========================================================================

export const supportAccessMessages = {
  list: {
    title: 'Destek Erişimi',
    description:
      'Bir yöneticinin tek bir kullanıcının içeriğini görebildiği tek yol. Her talep burada durur: kim istedi, kim hakkında, hangi kapsamlar, hangi gerekçe, kim onayladı, ne zaman biter ve kaç kez kullanıldı.',
    newGrant: 'Yeni erişim talebi',
    tableCaption: 'Destek Erişimi talepleri',
    empty: 'Henüz hiçbir Destek Erişimi talebi açılmamış.',
    emptyFiltered: 'Bu filtrelerle eşleşen talep yok.',
    detailLink: 'Ayrıntı',
    noRequestPermission:
      'Talep açma yetkiniz yok. Bu sayfayı yalnızca inceleme amacıyla görüyorsunuz.',
  },

  filters: {
    status: 'Durum',
    liveOnly: 'Yalnızca etkin',
    holder: 'Talep eden',
    holderAll: 'Herkes',
    holderMine: 'Ben',
    subject: 'Kullanıcı kimliği',
    subjectPlaceholder: 'Kullanıcı UUID',
    subjectInvalid: 'Girilen değer bir kullanıcı kimliği (UUID) değil; filtre uygulanmadı.',
  },

  tiles: {
    pending: 'Onay bekleyen',
    pendingHint: 'Karar verilmemiş talepler',
    live: 'Şu anda etkin',
    liveHint: 'Süresi devam eden, kullanılabilir izinler',
    reveals24h: 'Görüntüleme işlemi (24s)',
    reveals24hHint: 'Tek tek kaydedilmiş görüntüleme çağrıları',
    requested30d: 'Talep (30g)',
    requested30dHint: 'Son otuz günde açılan talepler',
  },

  columns: {
    requestedAt: 'Talep',
    holder: 'Talep eden',
    subject: 'Kullanıcı',
    scopes: 'Kapsam',
    reason: 'Gerekçe',
    status: 'Durum',
    expires: 'Bitiş',
    /**
     * `support_access_grants.reveal_count` is maintained by trigger as the sum
     * of `item_count`, so it counts *records opened*, not the number of reveal
     * calls. The label says records, because the reveal log on the detail page
     * has one row per call and the two numbers must not look like the same
     * count disagreeing with itself.
     */
    reveals: 'Açılan kayıt',
    revealsTitle:
      'Bu izinle açılan toplam kayıt sayısı (her çağrıda birden çok kayıt açılmış olabilir)',
    approver: 'Onaylayan',
    detail: 'Ayrıntı',
  },

  request: {
    title: 'Yeni Destek Erişimi talebi',
    description:
      'Bir kullanıcının içeriğini görüntüleyebilmek için yazılı gerekçe, ikinci bir yöneticinin onayı ve süreli bir pencere gerekir. Bu form yalnızca talebi açar; hiçbir şeyi açmaz.',

    subjectLabel: 'Kullanıcı kimliği',
    subjectDescription:
      'Hakkında erişim istenen kullanıcının UUID değeri. Kullanıcı listesinden kopyalayın; bu konsolda kullanıcı adresiyle arama yapılmaz.',
    subjectPlaceholder: '00000000-0000-0000-0000-000000000000',
    subjectInvalid: 'Geçerli bir kullanıcı kimliği (UUID) girin.',
    subjectUnknown: 'Bu kimlikle bir kullanıcı bulunamadı.',
    subjectFound: 'Kullanıcı bulundu',
    subjectLookupFailed: 'Kullanıcı doğrulanamadı; talep açılmadı.',
    subjectOpen: 'Kullanıcı kaydını aç',

    lookupTitle: 'Önce hesaba bakın',
    lookupDescription:
      'Kullanıcı kimliğini girin; talebi açmadan önce o hesabın işletim özetini ve daha önce açılmış izinlerini görün.',
    lookupSubmit: 'Kullanıcıyı getir',
    lookupPending:
      'Bir kullanıcı kimliği girip getirdiğinizde, o hesap hakkında izin gerektirmeyen tüm bilgiler burada listelenir.',

    scopesLabel: 'Kapsamlar',
    scopesDescription:
      'Yalnızca soruyu yanıtlamaya yeten en dar kapsamı seçin. Liste, en az açığa çıkarandan en çok açığa çıkarana doğru sıralıdır.',
    scopesRequired: 'En az bir kapsam seçmelisiniz.',

    reasonLabel: 'Gerekçe',
    reasonPlaceholder:
      'Örn. DA-001042 numaralı talepte kullanıcı, brifingin boş geldiğini bildirdi; konu başlıklarının senkronize olup olmadığını doğrulamam gerekiyor.',
    reasonDescription: (min: number): string =>
      `En az ${min} karakter. Bu cümleyi altı ay sonra bir denetçi okuyacak: neyi, neden görmen gerektiğini yaz.`,
    reasonTooShort: (min: number): string => `Gerekçe en az ${min} karakter olmalıdır.`,
    reasonTooLong: (max: number): string => `Gerekçe en fazla ${max} karakter olabilir.`,

    ticketLabel: 'Destek talebi referansı (isteğe bağlı)',
    ticketDescription:
      'Varsa bu erişimi doğuran destek talebinin referansı, örn. DA-001042. Boş bırakılabilir.',
    ticketPlaceholder: 'DA-001042',
    ticketUnknown: 'Bu referansla bir destek talebi bulunamadı.',
    ticketLookupFailed: 'Destek talebi doğrulanamadı; talep açılmadı.',

    windowLabel: 'Süre',
    windowDescription: (maxHours: number): string =>
      `Onaydan sonra iznin ne kadar açık kalacağı. Veritabanı ${maxHours} saatten uzun bir pencereyi kabul etmez. En kısa yeterli süreyi seçin.`,
    windowOption: (minutes: number): string =>
      minutes < 60
        ? `${minutes} dakika`
        : minutes % 60 === 0
          ? `${minutes / 60} saat`
          : `${Math.floor(minutes / 60)} saat ${minutes % 60} dakika`,

    submit: 'Talebi aç',
    submitting: 'Talep açılıyor…',

    successTitle: 'Talep açıldı',
    successBody:
      'Talep onay bekliyor. Sizden başka, onay yetkisi olan bir yöneticinin onaylaması gerekiyor; o ana kadar hiçbir içerik görüntülenemez.',
    successOpen: 'Talebi aç',

    /** The dissuasive panel above the form. */
    consequenceTitle: 'Bu talep onaylanırsa ne olacak',
    consequences: [
      'Seçtiğiniz kapsamlardaki kayıtları, yalnızca bu tek kullanıcı için ve yalnızca seçtiğiniz süre boyunca görüntüleyebilirsiniz.',
      'Açtığınız her kayıt tek tek kaydedilir: hangi kayıt, ne zaman, hangi gerekçeyle. Bu kayıtlar sizin adınıza yazılır ve silinemez.',
      'Bu izin size ait olur; başka bir yöneticiye devredilemez ve kullanıcı adına işlem yapma yetkisi vermez.',
      'Süre dolduğunda erişim kendiliğinden kapanır. Onaylayan yönetici veya siz, süre dolmadan da geri alabilirsiniz.',
    ] as readonly string[],
    consequenceClosing:
      'Bağlantı durumu, son senkronizasyon zamanı, işlenen ve başarısız kayıt sayıları Destek Erişimi olmadan da görülebilir. Soru bunlarla yanıtlanabiliyorsa bu talebi açmayın.',

    /** The operational panel that usually makes the request unnecessary. */
    metadataTitle: 'Erişim olmadan hâlihazırda görebildikleriniz',
    metadataDescription:
      'Aşağıdaki sayıların hiçbiri içerik değildir ve hiçbiri için izin gerekmez. Destek çağrılarının çoğu bu tabloyla yanıtlanır.',
    metadataUnavailable: 'Bu kullanıcının işletim özeti getirilemedi.',
    metadata: {
      accounts: 'Bağlı hesap',
      accountsError: 'Hatalı hesap',
      lastSync: 'Son senkronizasyon',
      syncErrors: 'Senkronizasyon hatası',
      emailMessages: 'İşlenen e-posta',
      emailMessages30d: 'E-posta (30g)',
      calendarEvents: 'Takvim etkinliği',
      assistantMessages: 'Asistan mesajı',
      approvalsPending: 'Bekleyen onay',
      approvalsFailed: 'Başarısız onay',
      briefingsFailed: 'Başarısız brifing (30g)',
      notificationsFailed: 'Ulaşmayan bildirim (30g)',
      lastEmail: 'Son e-posta',
    },

    existingTitle: 'Bu kullanıcı için önceki talepler',
    existingDescription:
      'Aynı kullanıcı hakkında daha önce açılmış talepler. Bir yönetici, bir kullanıcı için aynı anda yalnızca bir etkin izin tutabilir.',
    existingEmpty: 'Bu kullanıcı için daha önce hiç talep açılmamış.',
    existingLive:
      'Bu kullanıcı için hâlihazırda etkin bir izniniz var. Yeni bir talep, mevcut izin bitene veya geri alınana kadar onaylanamaz.',
    existingLiveOpen: 'Etkin izni aç',
  },

  detail: {
    title: 'Destek Erişimi kaydı',
    backToList: 'Listeye dön',
    notFound: 'Bu Destek Erişimi kaydı bulunamadı.',
    notFoundHint: 'Bağlantı yanlış olabilir ya da kayıt hiç var olmamış olabilir.',

    summary: 'Özet',
    holder: 'Talep eden yönetici',
    subject: 'Hakkında erişim istenen kullanıcı',
    subjectOpen: 'Kullanıcı kaydını aç',
    requestedAt: 'Talep zamanı',
    approver: 'Onaylayan yönetici',
    approverUnknown: 'Onaylayan yönetici kaydı okunamadı.',
    grantedAt: 'Başlangıç',
    expiresAt: 'Bitiş',
    deniedAt: 'Red zamanı',
    revokedAt: 'Geri alma zamanı',
    windowMinutes: 'Talep edilen pencere',
    remaining: 'Kalan süre',
    ticket: 'Destek talebi',
    consent: 'Kullanıcı onayı',
    consentRecorded: 'Kayıtlı',
    consentAbsent: 'Kayıtlı değil',
    reasonTitle: 'Talep gerekçesi',
    reasonDescription:
      'Talebi açan yöneticinin kendi cümleleri. Değiştirilemez ve iznin ömrü boyunca saklanır.',
    scopesTitle: 'Kapsamlar',
    scopesDescription:
      'Bu izin yalnızca aşağıdaki içerik türlerini ve yalnızca bu tek kullanıcı için açar.',

    revealsTitle: 'Görüntüleme kaydı',
    revealsDescription:
      'Her görüntüleme çağrısı için bir satır. Hangi kaydın açıldığını gösterir, ne gösterildiğini değil.',
    revealsEmpty: 'Bu izinle henüz hiçbir kayıt görüntülenmedi.',
    revealsCaption: 'Bu izin kapsamında yapılan görüntülemeler',
    revealsByScope: 'Kapsam başına görüntüleme işlemi',
    revealsTotal: (n: number): string => `${n} görüntüleme işlemi`,
    /**
     * The two counts on this page measure different things and the screen says
     * so rather than letting a reader assume one is wrong.
     */
    revealsCountNote:
      'Yukarıdaki "Açılan kayıt" sayısı, açılan tekil kayıtların toplamıdır; aşağıdaki liste ise her görüntüleme çağrısı için tek satır tutar. Bir çağrı birden çok kayıt döndürebildiği için iki sayı farklı olabilir.',
    revealsTile: 'Açılan kayıt',
    revealsTileHint: (calls: number): string => `${calls} görüntüleme çağrısında`,

    trailTitle: 'Karar geçmişi',
    trailDescription:
      'Bu izin üzerinde yapılan her işlem, işlemi yapanın kimliği ve yazdığı gerekçe ile birlikte denetim kaydından okunuyor.',
    trailEmpty: 'Bu izin için denetim kaydı satırı bulunamadı.',
    trailCaption: 'Bu izne ait denetim kaydı satırları',

    decisionTitle: 'Karar',
    decisionPending:
      'Bu talep karar bekliyor. Onaylandığında süre hemen işlemeye başlar; reddedildiğinde kayıt gerekçesiyle birlikte kalır.',
    decisionSettled: 'Bu talep sonuçlanmış. Yapılabilecek başka bir işlem yok.',
    decisionNoPermission:
      'Onay ve red yetkisi sizde değil. Bu kaydı yalnızca inceleme amacıyla görüyorsunuz.',
    fourEyesNotice:
      'Bu talebi siz açtınız. Dört göz kuralı gereği kendi talebinizi onaylayamaz veya reddedemezsiniz; bunu yapabilecek başka bir yönetici gerekir. İzni geri almak ise size açıktır.',
  },

  decision: {
    approve: 'Onayla',
    approveTitle: 'Destek Erişimini onayla',
    approveDescription:
      'Onayladığınızda talep eden yönetici, kapsamdaki içeriği hemen görüntüleyebilir hâle gelir. Süre bu andan itibaren işler ve yaptığınız onay adınıza kaydedilir.',
    approveConfirm: 'Onayla ve süreyi başlat',
    approveReasonLabel: 'Onay gerekçesi',
    approveReasonPlaceholder: 'Bu erişimi neden gerekli buluyorsun?',

    deny: 'Reddet',
    denyTitle: 'Destek Erişimini reddet',
    denyDescription:
      'Reddedildiğinde hiçbir içerik açılmaz. Kayıt, gerekçenizle birlikte kalıcı olarak saklanır.',
    denyConfirm: 'Talebi reddet',
    denyReasonLabel: 'Red gerekçesi',
    denyReasonPlaceholder: 'Bu talebi neden reddediyorsun?',

    revoke: 'Geri al',
    revokeTitle: 'Destek Erişimini geri al',
    revokeDescription:
      'Geri alındığında erişim anında kapanır ve süre dolmasını beklemez. Bugüne kadar yapılmış görüntülemeler kayıtta kalır.',
    revokeConfirm: 'Erişimi geri al',
    revokeReasonLabel: 'Geri alma gerekçesi',
    revokeReasonPlaceholder: 'Bu erişimi neden geri alıyorsun?',
    revokeHolderNote:
      'Bu izin size ait. Artık ihtiyacınız yoksa kimseye sormadan geri alabilirsiniz.',

    scopeSummary: (count: number): string => `${count} kapsam`,
    windowSummary: (label: string): string => `Pencere: ${label}`,
  },

  reveals: {
    columns: {
      revealedAt: 'Zaman',
      scope: 'Kapsam',
      entityType: 'Kayıt türü',
      entityId: 'Kayıt kimliği',
      itemCount: 'Adet',
      requestId: 'İstek kimliği',
      admin: 'Görüntüleyen',
    },
    wholeScope: 'Kapsamın tamamı',
  },

  /**
   * The one screen in this console that renders another person's own words.
   *
   * Every sentence here is written to be read by somebody who is about to do
   * that, and none of it is reassuring. The operator is not "checking a record"
   * — they are reading a stranger's mail under a permission a second
   * administrator granted them, for a window that is running down, and the
   * record of it outlives both of them.
   */
  reveal: {
    title: 'İçerik görüntüleme',
    description:
      'Bu ekran, onaylanmış bir Destek Erişimi izniyle tek bir kaydı açar. Açtığınız her kayıt tek tek kaydedilir ve bu kayıt silinemez.',
    open: 'İçerik görüntüle',
    openHint:
      'Bu izin size ait ve şu anda kullanılabilir. Kapsamdaki kayıtları tek tek açabilirsiniz.',
    backToGrant: 'İzin kaydına dön',

    noticeTitle: 'Başka bir kişinin özel verisine bakmak üzeresiniz',
    notices: [
      'Aşağıda göreceğiniz her şey, adı geçen kullanıcının kendi yazdığı ya da kendisine ait olan veridir. Onun izniyle değil, ikinci bir yöneticinin onayıyla açılıyor.',
      'Açtığınız her kayıt ayrı bir satır olarak kaydedilir: hangi kayıt, ne zaman, hangi gerekçeyle ve kimin adına. Bu satırlar sizin adınıza yazılır ve silinemez.',
      'Yalnızca aşağıda listelenen kapsamları ve yalnızca bu tek kullanıcıyı açabilirsiniz. Kapsam genişletilemez; süre dolduğunda bu ekranla tek bir kayıt bile açılamaz.',
      'Soru bağlantı durumu, senkronizasyon zamanı veya sayılarla yanıtlanabiliyorsa hiçbir kaydı açmayın; bu sayfadan geri dönün.',
    ] as readonly string[],

    remaining: 'Kalan süre',
    remainingHint: 'Süre dolduğunda erişim kendiliğinden kapanır.',
    spent: 'Açtığınız kayıt',
    spentHint: (calls: number): string => `${calls} görüntüleme çağrısında`,
    scopesTile: 'Açabildiğiniz kapsam',
    scopesTileHint: (granted: number): string => `İzin ${granted} kapsam içeriyor`,
    expires: 'Bitiş',

    grantTitle: 'Bu izin ne diyor',
    grantDescription:
      'Talebi açarken yazdığınız gerekçe. Her görüntüleme bu cümleyle birlikte kayda geçiyor.',

    scopePickerTitle: 'Ne açmak istiyorsunuz?',
    scopePickerDescription:
      'Tek seferde tek bir kapsam açılır. Listede yalnızca bu iznin kapsadığı türler var; en dar olanla başlayın.',
    scopeSelected: 'Seçili',
    scopeSpent: (count: number): string =>
      count === 0 ? 'Bu izinle hiç açılmadı' : `Bu izinle ${count} kez açıldı`,
    scopeNotChosen:
      'Yukarıdan bir kapsam seçin. Kapsam seçmek hiçbir şeyi açmaz; kaydı yalnızca aşağıdaki düğme açar.',
    scopeRejected:
      'Adresteki kapsam bu iznin kapsamında değil, bu yüzden açılmadı. Bir iznin kapsamı sonradan genişletilemez; o tür için yeni bir talep açmanız gerekir.',

    formTitle: (label: string): string => `${label}: tek kayıt aç`,
    recordLabel: 'Kayıt kimliği',
    recordLabels: {
      email_body: 'Mesaj kimliği',
      assistant_conversation: 'Konuşma kimliği',
      capture_content: 'Yakalama kimliği',
      approval_payload: 'Onay kimliği',
      notification_content: 'Bildirim kimliği',
    } as Readonly<Record<string, string>>,
    recordDescription:
      'Açmak istediğiniz tek kaydın UUID değeri. Kimlik bu kullanıcıya ait değilse hiçbir şey dönmez, görüntüleme yine de kayda geçer.',
    recordInvalid: 'Geçerli bir kayıt kimliği (UUID) girin.',

    limitLabel: 'Kaç başlık',
    limitDescription:
      'Konu başlıkları en yeniden eskiye doğru listelenir. Kaç başlık açtığınız da kayda geçer; en küçük yeterli sayıyı seçin.',
    limitOption: (limit: number): string => `${limit} başlık`,

    fromLabel: 'Başlangıç günü',
    toLabel: 'Bitiş günü',
    rangeDescription: (days: number): string =>
      `Etkinlikler Europe/Istanbul gününe göre listelenir. Aralıktaki her etkinlik açılmış sayılır, bu yüzden en fazla ${days} günlük aralık açılabilir.`,
    rangeInvalid: 'Geçerli bir gün girin (YYYY-AA-GG).',
    rangeBackwards: 'Bitiş günü başlangıç gününden önce olamaz.',
    rangeTooWide: (days: number): string => `Aralık en fazla ${days} gün olabilir.`,

    identityDescription:
      'Bu kapsamda açılacak tek bir kayıt vardır: kullanıcının kimlik bilgileri. Ek bir kimlik girmeniz gerekmez.',

    submit: 'Kaydı aç ve kayda geçir',
    submitting: 'Açılıyor…',

    resultTitle: 'Açılan kayıt',
    resultLogged: (count: number): string =>
      `${count} kayıt açıldı ve görüntüleme kaydına yazıldı. Bu satır geri alınamaz.`,
    resultEmpty:
      'Bu kimlikle bu kullanıcıya ait bir kayıt bulunamadı. Görüntüleme denemesi yine de kayda geçti.',
    resultRequestId: 'İstek kimliği',
    resultAt: 'Görüntüleme zamanı',
    resultHide: 'Ekrandan gizle',
    resultHidden: 'İçerik ekrandan kaldırıldı. Görüntüleme kaydı yerinde duruyor ve silinemez.',

    logTitle: 'Bu izinle şimdiye kadar açtıklarınız',
    logDescription:
      'Her görüntüleme çağrısı için bir satır. Hangi kaydın açıldığını gösterir, ne gösterildiğini değil.',

    refusedTitle: 'Bu izinle şu anda hiçbir kayıt açılamaz',
    refusedHint:
      'Bu ekran erişim vermez; yalnızca zaten verilmiş bir izni kullanır. Durumu izin kaydından görebilirsiniz.',
    rateLimited:
      'Bu izinle saatte açılabilecek kayıt sayısı aşıldı. Bir izin, tek bir sorunun yanıtı içindir; bir posta kutusunu kayıt kayıt gezmek için değil.',

    /** Field labels for the records themselves. The only content on this page. */
    fields: {
      identity: {
        displayName: 'Ad',
        email: 'E-posta adresi',
        givenName: 'Verilen ad',
        locale: 'Dil',
        timeZone: 'Saat dilimi',
        createdAt: 'Kayıt tarihi',
      },
      emailSubject: {
        subject: 'Konu',
        summary: 'Özet',
        category: 'Kategori',
        importance: 'Önem',
        messageCount: 'Mesaj',
        lastMessageAt: 'Son mesaj',
      },
      emailMessage: {
        from: 'Gönderen',
        to: 'Alıcılar',
        subject: 'Konu',
        sentAt: 'Gönderim',
        snippet: 'Önizleme',
        body: 'Gövde',
        thread: 'Konuşma kimliği',
      },
      calendar: {
        title: 'Başlık',
        description: 'Açıklama',
        location: 'Konum',
        organizer: 'Düzenleyen',
        startsAt: 'Başlangıç',
        endsAt: 'Bitiş',
      },
      assistant: { role: 'Taraf', content: 'Mesaj', model: 'Model', createdAt: 'Zaman' },
      capture: {
        kind: 'Tür',
        status: 'Durum',
        rawText: 'Ham metin',
        extracted: 'Çıkarılan alanlar',
        sourceUrl: 'Kaynak bağlantısı',
        storagePath: 'Saklama yolu',
        createdAt: 'Oluşturma',
      },
      approval: {
        type: 'İşlem türü',
        status: 'Durum',
        what: 'Ne yapılacak',
        why: 'Neden',
        payload: 'İçerik',
        originalPayload: 'Kullanıcı düzenlemeden önce',
        createdAt: 'Oluşturma',
      },
      notification: {
        category: 'Kategori',
        title: 'Başlık',
        body: 'Gövde',
        scheduledFor: 'Planlanan',
        sentAt: 'Gönderim',
        failedAt: 'Başarısız',
      },
    },
  },

  trail: {
    columns: {
      time: 'Zaman',
      action: 'İşlem',
      actor: 'Yönetici',
      outcome: 'Sonuç',
      reason: 'Gerekçe',
    },
    actions: {
      'support_access.requested': 'Talep açıldı',
      'support_access.approved': 'Onaylandı',
      'support_access.denied': 'Reddedildi',
      'support_access.revoked': 'Geri alındı',
      'support_access.revealed': 'İçerik görüntülendi',
    } as Readonly<Record<string, string>>,
    outcomes: {
      success: 'Başarılı',
      failure: 'Başarısız',
    } as Readonly<Record<string, string>>,
  },

  /**
   * What a completed Server Action reports back through the URL.
   *
   * Every one of these is a real outcome of a real attempt. `fourEyes` and
   * `liveGrant` in particular are the database's own refusals, translated: the
   * check constraint and the partial unique index are what actually stopped the
   * write, and these sentences say so instead of showing a Postgres string.
   */
  outcomes: {
    approved: {
      tone: 'success',
      title: 'Erişim onaylandı',
      body: 'Süre bu andan itibaren işliyor. Talep eden yöneticinin yapacağı her görüntüleme kayda geçecek.',
    },
    denied: {
      tone: 'success',
      title: 'Talep reddedildi',
      body: 'Hiçbir içerik açılmadı. Gerekçeniz kayda geçti.',
    },
    revoked: {
      tone: 'success',
      title: 'Erişim geri alındı',
      body: 'Erişim kapatıldı. Bu izinle artık hiçbir kayıt görüntülenemez.',
    },
    fourEyes: {
      tone: 'critical',
      title: 'Dört göz kuralı',
      body: 'Veritabanı bu işlemi reddetti: bir Destek Erişimi talebi, talebi açan yönetici tarafından onaylanamaz veya reddedilemez. Onay yetkisi olan başka bir yönetici gerekiyor.',
    },
    liveGrant: {
      tone: 'critical',
      title: 'Zaten etkin bir izin var',
      body: 'Talebi açan yönetici bu kullanıcı için hâlihazırda etkin bir izin tutuyor. Bir yönetici bir kullanıcı için aynı anda yalnızca bir etkin izne sahip olabilir; önceki izin bitmeli ya da geri alınmalı.',
    },
    ceiling: {
      tone: 'critical',
      title: 'Yirmi dört saatlik tavan aşıldı',
      body: 'Bir izin, talebin açıldığı andan itibaren en fazla yirmi dört saat sürebilir. Bu talep için tavan geçmiş durumda; kullanılabilir bir pencere kalmadı. Yeni bir talep açın.',
    },
    stale: {
      tone: 'warning',
      title: 'Kayıt değişmiş',
      body: 'Bu kayıt siz ekranı açtıktan sonra başka biri tarafından değiştirildi. Güncel durumu aşağıda görüyorsunuz.',
    },
    notfound: {
      tone: 'critical',
      title: 'Kayıt bulunamadı',
      body: 'Bu Destek Erişimi kaydı artık okunamıyor.',
    },
    invalid: {
      tone: 'critical',
      title: 'Eksik veya geçersiz bilgi',
      body: 'İşlem, yazılı gerekçe dâhil tüm alanlar doğru doldurulmadan tamamlanamaz.',
    },
    forbidden: {
      tone: 'critical',
      title: 'Yetki yok',
      body: 'Bu işlem için gereken yetkiye sahip değilsiniz. Deneme, kimliğinizle birlikte denetim kaydına yazıldı.',
    },
    ratelimited: {
      tone: 'warning',
      title: 'Çok fazla deneme',
      body: 'Kısa sürede çok fazla işlem denendi. Bir süre bekleyip tekrar deneyin.',
    },
    failed: {
      tone: 'critical',
      title: 'İşlem tamamlanamadı',
      body: GENERIC_FAILURE_TR,
    },
    auditMissing: {
      tone: 'critical',
      title: 'Denetim kaydı yazılamadı',
      body: 'İşlem uygulandı ancak denetim satırı yazılamadı. Bu, kayıtsız bir yetkili işlem anlamına gelir; altyapı ekibine hemen bildirin.',
    },
  },

  /**
   * The line that appears wherever this area could be mistaken for a viewer.
   *
   * It says "this screen" rather than "these screens" because one screen in the
   * area — the reveal console — is exactly the exception, and a blanket promise
   * that the section never shows content would be false the moment an operator
   * opened it. The sentence names where the exception lives instead.
   */
  boundaryNote:
    'Bu ekran erişimi yönetir, içerik göstermez: burada hiçbir e-posta gövdesi, takvim ayrıntısı ya da asistan konuşması render edilmez. İçerik yalnızca ayrı görüntüleme ekranında, tek tek ve her seferinde kayda geçerek açılır.',
} as const

export type SupportAccessOutcomeKey = keyof typeof supportAccessMessages.outcomes
