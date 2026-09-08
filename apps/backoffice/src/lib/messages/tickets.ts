import type {
  NoteVisibility,
  TicketCategory,
  TicketChannel,
  TicketOutcome,
  TicketPriority,
  TicketStatus,
} from '@/components/tickets/contract'

/**
 * Every Turkish string the support queue renders.
 *
 * Kept out of `@/lib/messages` so this module owns its own vocabulary, and kept
 * out of the components so a wording change is one file rather than eleven.
 * The label maps are typed against the contract's unions, so a status added to
 * the database — and therefore to the contract — fails to compile until it has
 * a Turkish name, rather than rendering as `waiting_user` on a support screen.
 */

export const ticketStatusLabels: Readonly<Record<TicketStatus, string>> = Object.freeze({
  open: 'Açık',
  in_progress: 'İşlemde',
  waiting_user: 'Kullanıcı bekleniyor',
  resolved: 'Çözüldü',
  closed: 'Kapatıldı',
})

export const ticketPriorityLabels: Readonly<Record<TicketPriority, string>> = Object.freeze({
  low: 'Düşük',
  normal: 'Normal',
  high: 'Yüksek',
  critical: 'Kritik',
})

export const ticketCategoryLabels: Readonly<Record<TicketCategory, string>> = Object.freeze({
  account: 'Hesap',
  integration: 'Entegrasyon',
  sync: 'Senkronizasyon',
  billing: 'Abonelik',
  ai_quality: 'Yapay zekâ kalitesi',
  notification: 'Bildirim',
  privacy: 'Gizlilik',
  other: 'Diğer',
})

export const ticketChannelLabels: Readonly<Record<TicketChannel, string>> = Object.freeze({
  in_app: 'Uygulama içi',
  email: 'E-posta',
  store_review: 'Mağaza yorumu',
  internal: 'Dahili',
  phone: 'Telefon',
})

export const noteVisibilityLabels: Readonly<Record<NoteVisibility, string>> = Object.freeze({
  internal: 'Dahili not',
  user: 'Kullanıcıya iletildi',
})

export const ticketMessages = {
  queue: {
    title: 'Destek talepleri',
    description:
      'Vardiyadaki kuyruk. Varsayılan görünüm açık ve işlemdeki talepleri en eskiden başlayarak listeler; süresi geçenler kırmızı satırla işaretlenir.',
    caption: 'Destek talepleri kuyruğu',
    defaultOrder: 'Varsayılan sıralama: en eski talep önce.',
    metaLabel: 'Oluşturma aralığı',
    filtersHeading: 'Kuyruk filtreleri',
    statusFilter: 'Durum',
    statusAll: 'Tüm durumlar (kapananlar dâhil)',
    statusActive: 'Kapanmamış tüm talepler',
    statusDefault: 'Sırada (açık + işlemde)',
    priorityFilter: 'Öncelik',
    categoryFilter: 'Kategori',
    assigneeFilter: 'Atanan',
    assigneeMine: 'Bana atanan',
    assigneeUnassigned: 'Atanmamış',
    referenceFilter: 'Talep no',
    referencePlaceholder: 'DA-001234',
    windowFilter: 'Açılış zamanı',
    windowAll: 'Tüm zamanlar',
    windowNote: 'Tarih filtresi uygulanmadı; kuyruktaki her yaştaki talep listeleniyor.',
    empty: 'Kuyrukta talep yok.',
    emptyFiltered: 'Bu filtrelerle eşleşen talep yok.',
    emptyHint: 'Durum filtresini genişletmeyi ya da tarih aralığını uzatmayı dene.',
    errorHint: 'Sorgu yeniden denenebilir. Sorun sürerse altyapıyı kontrol et.',
    reset: 'Filtreleri sıfırla',
    privacyNote:
      'Bu ekranda posta içeriği, takvim ayrıntısı ya da asistan konuşması yoktur. Kullanıcı yalnızca kimliği ve maskeli adresiyle görünür; içerik görmek yalnızca onaylı ve süreli bir Destek Erişimi ile mümkündür.',
  },

  columns: {
    reference: 'Talep',
    subject: 'Konu',
    status: 'Durum',
    priority: 'Öncelik',
    category: 'Kategori',
    channel: 'Kanal',
    assignee: 'Atanan',
    subjectUser: 'Kullanıcı',
    age: 'Yaş',
    firstResponse: 'İlk yanıt',
    due: 'Termin',
    updated: 'Güncelleme',
  },

  columnHints: {
    age: 'Talebin açılmasından bu yana geçen süre.',
    firstResponse:
      'Talebin açılmasıyla kullanıcıya iletilen ilk not arasındaki süre. Dahili notlar ilk yanıt sayılmaz.',
    due: 'Termin dolduğunda talep gecikmiş sayılır.',
  },

  values: {
    unassigned: 'Atanmamış',
    noSubjectUser: 'Kullanıcı bağlı değil',
    noDueDate: 'Termin yok',
    overdue: 'Gecikti',
    awaitingResponse: 'Yanıt bekliyor',
    closedWithoutResponse: 'Yanıtsız kapandı',
    deletedAdmin: 'Kapatılmış yönetici',
  },

  tiles: {
    open: 'Açık talep',
    openHint: 'Durumu “Açık” olan tüm talepler.',
    unassigned: 'Atanmamış',
    unassignedHint: 'Açık, işlemde ya da kullanıcı beklenen, sahibi olmayan talepler.',
    overdue: 'Gecikmiş',
    overdueHint: 'Termini geçmiş ve hâlâ kapanmamış talepler.',
    firstResponse: 'İlk yanıt (ortanca)',
    firstResponseHint: (days: number, sampled: number, total: number): string =>
      total > sampled
        ? `Son ${days} günde yanıtlanan ${total} talebin en yenisi ${sampled} tanesi üzerinden.`
        : `Son ${days} günde yanıtlanan ${total} talebin tamamı üzerinden.`,
    firstResponseEmpty: (days: number): string => `Son ${days} günde yanıtlanan talep yok.`,
    p90: (value: string): string => `%90'lık dilim: ${value}`,
    scopeNote: 'Sayılar tüm kuyruğu kapsar; üstteki filtrelerden etkilenmez.',
  },

  detail: {
    kicker: 'Destek talebi',
    backToQueue: 'Kuyruğa dön',
    notFoundTitle: 'Talep bulunamadı',
    notFoundBody:
      'Bu numarayla bir talep yok. Bağlantı yanlış kopyalanmış ya da talep hiç açılmamış olabilir.',
    notFoundAction: 'Kuyruğa dön',
    sectionSummary: 'Talep özeti',
    sectionBody: 'Talebin metni',
    sectionBodyDescription:
      'Kullanıcının destek formuna yazdığı metin. Posta kutusundan değil, doğrudan bu talepten gelir.',
    bodyEmpty: 'Bu talep metin olmadan açılmış.',
    sectionNotes: 'Notlar',
    sectionNotesDescription:
      'Dahili notlar yalnızca ekipte kalır; kullanıcıya iletilen notlar ilk yanıt süresini başlatır.',
    sectionHistory: 'İşlem geçmişi',
    sectionHistoryDescription:
      'Bu talep üzerinde yapılan her yetkili işlem: kim yaptı, ne zaman ve hangi gerekçeyle.',
    sectionContext: 'Kullanıcının operasyonel durumu',
    sectionContextDescription:
      'Bağlantı sağlığı, son senkronizasyon, plan ve son onay hataları. İçerik değil, yalnızca işletim verisi.',
    sectionActions: 'İşlemler',
    noSubjectUser:
      'Bu talep bir kullanıcı hesabına bağlı değil, bu yüzden operasyonel durum gösterilemiyor.',
    resolutionHeading: 'Çözüm notu',
    resolutionEmpty: 'Henüz bir çözüm notu yazılmadı.',
    reopenedNote: 'Talep yeniden açıldı; aşağıdaki not önceki çözümden kalmıştır.',
    externalRef: 'Yardım masası kaydı',
    channel: 'Geliş kanalı',
    openedBy: 'Açan',
    openedBySystem: 'Kullanıcı / sistem',
    createdAt: 'Açılış',
    updatedAt: 'Son güncelleme',
    firstResponseAt: 'İlk yanıt',
    resolvedAt: 'Çözüm',
    closedAt: 'Kapanış',
    dueAt: 'Termin',
    notesEmpty: 'Bu talebe henüz not eklenmemiş.',
    notesCount: (n: number): string => `${n} not`,
    notesTruncated: (shown: number, total: number): string =>
      `${total} nottan en yeni ${shown} tanesi gösteriliyor.`,
    historyEmpty: 'Bu talep üzerinde henüz yetkili bir işlem yapılmamış.',
    contextEmpty: 'Bu kullanıcı için operasyonel kayıt bulunamadı.',
    accountsHeading: 'Bağlı hesaplar',
    accountsEmpty: 'Bağlı hesap yok.',
    failuresHeading: 'Son onay hataları',
    failuresEmpty: 'Son dönemde başarısız onay yok.',
    openUser: 'Kullanıcı sayfasını aç',
  },

  context: {
    plan: 'Plan',
    connections: 'Bağlantı',
    connectionsValue: (connected: number, total: number): string => `${connected} / ${total} bağlı`,
    connectionErrors: 'Bağlantı hatası',
    lastSync: 'Son senkronizasyon',
    syncErrors: 'Senkronizasyon hatası',
    approvalsPending: 'Bekleyen onay',
    approvalsFailed: 'Başarısız onay',
    notificationsFailed: 'Başarısız bildirim (30g)',
    messages30d: 'İşlenen e-posta (30g)',
    onboarding: 'Kurulum',
    onboardingDone: 'Tamamlandı',
    onboardingPending: 'Tamamlanmadı',
    deleted: 'Hesap silinmiş',
    accountColumns: {
      provider: 'Sağlayıcı',
      status: 'Durum',
      lastSync: 'Son senkron',
      error: 'Hata kodu',
    },
    failureColumns: {
      type: 'Tür',
      code: 'Hata kodu',
      attempts: 'Deneme',
      at: 'Zaman',
    },
  },

  actions: {
    assignHeading: 'Atama',
    assignDescription:
      'Talep yalnızca destek talebi yazma yetkisi olan yöneticilere atanabilir. Değişiklik gerekçesiyle birlikte denetim kaydına yazılır.',
    assignLabel: 'Atanacak yönetici',
    assignSelf: 'Bana ata',
    assignSubmit: 'Atamayı kaydet',
    assignPending: 'Kaydediliyor…',
    assignNone: 'Atamayı kaldır',
    assignCurrent: (name: string): string => `Şu anda ${name} üzerinde.`,
    assignEmpty: 'Atanabilecek yetkili yönetici bulunamadı.',
    assignNoPermission: 'Talep atama yetkin yok.',

    statusHeading: 'Durum',
    statusDescription:
      'Çalışma durumları arasında geçiş. Çözüm ve yeniden açma ayrı işlemlerdir; her ikisi de aşağıda.',
    statusCurrent: 'Mevcut durum',
    statusConfirmTitle: (label: string): string => `Durum “${label}” olarak değiştirilsin mi?`,
    statusConfirmBody: (from: string, to: string): string =>
      `Talep “${from}” durumundan “${to}” durumuna geçecek. Bu değişiklik gerekçesiyle birlikte denetim kaydına yazılır.`,
    statusConfirmAction: 'Durumu değiştir',
    statusLocked:
      'Çözülmüş ya da kapatılmış bir talebin durumu doğrudan değiştirilemez; önce yeniden aç.',

    priorityHeading: 'Öncelik',
    priorityDescription: 'Kuyruğun sıralamasını ve terminleri etkiler.',
    priorityCurrent: 'Mevcut öncelik',
    priorityConfirmTitle: (label: string): string => `Öncelik “${label}” yapılsın mı?`,
    priorityConfirmBody: (from: string, to: string): string =>
      `Öncelik “${from}” seviyesinden “${to}” seviyesine alınacak. Gerekçe denetim kaydına yazılır.`,
    priorityConfirmAction: 'Önceliği değiştir',

    noteHeading: 'Not ekle',
    noteDescription:
      'Dahili not yalnızca ekipte kalır. Kullanıcıya iletilen ilk not, talebin ilk yanıt süresini belirler.',
    noteLabel: 'Not',
    notePlaceholder: 'Ne yapıldı, ne bekleniyor?',
    noteVisibilityLabel: 'Görünürlük',
    noteSubmit: 'Notu ekle',
    notePending: 'Ekleniyor…',
    noteTooShort: (min: number): string => `Not en az ${min} karakter olmalı.`,
    noteRemaining: (n: number): string => `${n} karakter kaldı`,
    noteFirstResponseWarning:
      'Bu talebe henüz kullanıcıya iletilen bir not eklenmemiş. “Kullanıcıya iletildi” seçilirse ilk yanıt süresi bu nota göre hesaplanır.',

    resolveHeading: 'Çözüm',
    resolveDescription:
      'Çözüm notu hem talebe hem de denetim kaydına yazılır; ayrıca bir gerekçe istenmez.',
    resolveTrigger: 'Talebi çöz',
    resolveConfirmTitle: 'Talep çözüldü olarak işaretlensin mi?',
    resolveConfirmBody:
      'Talep “Çözüldü” durumuna geçer ve çözüm notu kaydedilir. Kullanıcıya iletilmiş bir not yoksa bu not ilk yanıt olarak sayılır.',
    resolveConfirmAction: 'Çözüldü olarak işaretle',
    resolveNoteLabel: 'Çözüm notu',
    resolveNotePlaceholder: 'Sorun neydi, nasıl çözüldü?',
    resolveNoteDescription:
      'Bu cümle talebe kaydedilir ve aynı zamanda denetim kaydındaki gerekçedir.',

    closeTrigger: 'Talebi kapat',
    closeConfirmTitle: 'Talep kapatılsın mı?',
    closeConfirmBody:
      'Talep “Kapatıldı” durumuna geçer ve kuyruktan düşer. Gerektiğinde yeniden açılabilir.',
    closeConfirmAction: 'Kapat',

    reopenHeading: 'Yeniden açma',
    reopenDescription:
      'Talebi tekrar kuyruğa alır; çözüm ve kapanış zaman damgaları temizlenir, çözüm notu geçmiş olarak kalır.',
    reopenTrigger: 'Yeniden aç',
    reopenConfirmTitle: 'Talep yeniden açılsın mı?',
    reopenConfirmBody:
      'Talep “Açık” durumuna döner. Çözüm ve kapanış zamanları silinir; bu, çözüm süresi ölçümünü değiştirir.',
    reopenConfirmAction: 'Yeniden aç',

    readOnly: 'Bu talep üzerinde değişiklik yapma yetkin yok.',
    reasonLabel: 'Gerekçe',
    reasonPlaceholder: 'Bu değişikliği neden yapıyorsun?',
  },

  result: {
    heading: 'Sonuç',
    ticketLabel: 'Talep',
    dismiss: 'Kapat',
    assigned: 'Talep atandı.',
    unassigned: 'Talebin ataması kaldırıldı.',
    status_changed: 'Talebin durumu değiştirildi.',
    priority_changed: 'Talebin önceliği değiştirildi.',
    note_added: 'Not eklendi.',
    resolved: 'Talep çözüldü olarak işaretlendi.',
    reopened: 'Talep yeniden açıldı.',
    noop: 'Talep zaten bu durumdaydı; hiçbir şey yazılmadı.',
    ineligible: 'Talebin bulunduğu durum bu işleme izin vermiyor. Sayfayı yenile.',
    invalid: 'Gönderilen bilgiler geçersiz. Alanları kontrol edip tekrar dene.',
    notfound: 'Talep bulunamadı; silinmiş ya da bağlantı hatalı olabilir.',
    forbidden: 'Bu işlem için yetkin yok.',
    rate_limited: 'Çok fazla işlem yaptın. Kısa bir süre bekleyip tekrar dene.',
    failed: 'İşlem tamamlanamadı. Talep değişmedi.',
    audit_failed:
      'Değişiklik uygulandı ancak denetim kaydı yazılamadı. Bunu operasyon ekibine bildir.',
  } satisfies Readonly<Record<TicketOutcome | 'heading' | 'ticketLabel' | 'dismiss', string>>,

  audit: {
    actorLabel: 'İşlemi yapan',
    actionLabel: 'İşlem',
    reasonLabel: 'Gerekçe',
    whenLabel: 'Zaman',
    outcomeLabel: 'Sonuç',
    outcomeSuccess: 'Başarılı',
    outcomeFailure: 'Başarısız',
    unknownActor: 'Bilinmeyen yönetici',
    actionLabels: {
      'admin.ticket_assigned': 'Talep atandı',
      'admin.ticket_status_changed': 'Durum değiştirildi',
      'admin.ticket_priority_changed': 'Öncelik değiştirildi',
      'admin.ticket_note_added': 'Not eklendi',
      'admin.ticket_resolved': 'Talep çözüldü',
      'admin.ticket_reopened': 'Talep yeniden açıldı',
    } as Record<string, string>,
  },

  /** Reasons the console writes for itself, where the operator's own text is the record. */
  generatedReasons: {
    internalNote: 'Talebe dahili not eklendi.',
    userNote: 'Talebe kullanıcıya iletilen not eklendi.',
  },
} as const

export type TicketMessages = typeof ticketMessages
