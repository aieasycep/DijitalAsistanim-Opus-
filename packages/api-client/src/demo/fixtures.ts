import {
  APPROVAL_TTL_MS,
  DAY_MS,
  DEFAULT_TIME_ZONE,
  HOUR_MS,
  MINUTE_MS,
  addLocalDays,
  startOfLocalDay,
  toIsoDate,
  type ApprovalAction,
  type AssistantMessage,
  type AssistantThread,
  type Briefing,
  type BriefingItem,
  type BriefingSection,
  type CalendarEvent,
  type Capture,
  type Clock,
  type Commitment,
  type ConnectedAccount,
  type Contact,
  type DataExportRequest,
  type EmailCategory,
  type EmailMessage,
  type EmailThread,
  type EventAttendee,
  type FollowUp,
  type Importance,
  type Insight,
  type IsoInstant,
  type LearnedPreference,
  type LifeEvent,
  type LifeEventType,
  type NotificationPreferences,
  type PriorityRule,
  type Profile,
  type PushToken,
  type Reminder,
  type SourceRef,
  type Subscription,
  type SyncState,
  type Task,
  type UserPreferences,
} from '@da/domain'

/**
 * The demo dataset: one deterministic Turkish day. Every instant is derived
 * from the injected clock, so the same store read at any hour still describes
 * "today" — and screenshots, tests and the App Store review build agree.
 */
export interface DemoStore {
  userId: string
  timeZone: string
  profile: Profile
  preferences: UserPreferences
  notificationPreferences: NotificationPreferences
  accounts: ConnectedAccount[]
  syncStates: SyncState[]
  contacts: Contact[]
  threads: EmailThread[]
  messages: EmailMessage[]
  events: CalendarEvent[]
  tasks: Task[]
  commitments: Commitment[]
  reminders: Reminder[]
  priorityRules: PriorityRule[]
  learnedPreferences: LearnedPreference[]
  insights: Insight[]
  lifeEvents: LifeEvent[]
  briefings: Briefing[]
  briefingItems: BriefingItem[]
  approvals: ApprovalAction[]
  assistantThreads: AssistantThread[]
  assistantMessages: AssistantMessage[]
  captures: Capture[]
  followUps: FollowUp[]
  subscription: Subscription
  pushTokens: PushToken[]
  exports: DataExportRequest[]
  referral: { code: string; redemptionCount: number; bonusDaysEarned: number }
}

/** Stable, uuid-shaped ids so demo rows survive schema validation anywhere. */
export function demoId(seed: number): string {
  return `da000000-0000-4000-8000-${String(seed).padStart(12, '0')}`
}

const USER_ID = demoId(1)
const GOOGLE_ACCOUNT_ID = demoId(10)
const MICROSOFT_ACCOUNT_ID = demoId(11)

const AHMET = { id: demoId(20), name: 'Ahmet Yılmaz', email: 'ahmet.yilmaz@arkasinsaat.com.tr' }
const MEHMET = { id: demoId(21), name: 'Mehmet Yılmaz', email: 'mehmet@yilmazholding.com' }
const ZEYNEP = { id: demoId(22), name: 'Zeynep Demir', email: 'zeynep.demir@novadijital.com.tr' }
const ELIF = { id: demoId(23), name: 'Elif Şahin', email: 'elif.sahin@dijitalasistan.app' }
const SELF_EMAIL = 'deniz.kaya@dijitalasistan.app'

export function createDemoStore(clock: Clock): DemoStore {
  const timeZone = DEFAULT_TIME_ZONE
  const now = clock.now()
  const nowIso = now.toISOString()
  const today = toIsoDate(now, timeZone)
  const midnight = startOfLocalDay(now, timeZone)

  /** Local wall-clock instant, `days` from today. */
  const at = (days: number, hour: number, minute = 0): IsoInstant =>
    new Date(
      addLocalDays(midnight, days, timeZone).getTime() + hour * HOUR_MS + minute * MINUTE_MS,
    ).toISOString()

  const owned = (
    createdOffsetDays: number,
  ): { userId: string; createdAt: IsoInstant; updatedAt: IsoInstant } => ({
    userId: USER_ID,
    createdAt: at(createdOffsetDays, 8),
    updatedAt: nowIso,
  })

  const deadlineFriday = at(2, 17)

  const source = (input: {
    type: SourceRef['type']
    id: string
    label: string
    personName?: string | null
    occurredAt?: IsoInstant | null
  }): SourceRef => ({
    type: input.type,
    id: input.id,
    label: input.label,
    provider: 'google',
    personName: input.personName ?? null,
    occurredAt: input.occurredAt ?? null,
    externalUrl: null,
  })

  const profile: Profile = {
    id: USER_ID,
    email: SELF_EMAIL,
    displayName: 'Deniz Kaya',
    givenName: 'Deniz',
    avatarUrl: null,
    timeZone,
    locale: 'tr',
    onboardingCompletedAt: at(-30, 9),
    createdAt: at(-30, 9),
    updatedAt: nowIso,
    deletedAt: null,
  }

  const preferences: UserPreferences = {
    userId: USER_ID,
    colorScheme: 'system',
    language: 'tr',
    morningBriefingTime: '07:15',
    middayPulseEnabled: true,
    middayPulseTime: '13:00',
    eveningCloseEnabled: true,
    eveningCloseTime: '18:30',
    weeklyReviewEnabled: true,
    weeklyReviewWeekday: 0,
    weeklyReviewTime: '19:00',
    briefingOnWeekends: false,
    quietDays: [],
    quietHoursStart: '23:00',
    quietHoursEnd: '07:00',
    learnFromInteractions: true,
    analyzeAttachments: true,
    retentionWindow: '90d',
    historyDays: 30,
    reduceMotion: false,
    audioBriefingVoice: null,
    audioBriefingSpeed: 1,
    updatedAt: nowIso,
  }

  const notificationPreferences: NotificationPreferences = {
    userId: USER_ID,
    categories: { weekly_review: false },
    onlyIfImportant: false,
    lockScreenPrivacy: 'title_only',
    quietHoursStart: '23:00',
    quietHoursEnd: '07:00',
    updatedAt: nowIso,
  }

  const accounts: ConnectedAccount[] = [
    {
      id: GOOGLE_ACCOUNT_ID,
      ...owned(-30),
      provider: 'google',
      kinds: ['mail', 'calendar', 'contacts'],
      externalAccountId: SELF_EMAIL,
      displayName: 'Deniz Kaya',
      email: SELF_EMAIL,
      status: 'connected',
      grantedScopes: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/calendar.events',
      ],
      lastSyncedAt: at(0, 7, 10),
      lastErrorCode: null,
      lastErrorAt: null,
      isPrimary: true,
    },
    {
      id: MICROSOFT_ACCOUNT_ID,
      ...owned(-21),
      provider: 'microsoft',
      kinds: ['mail', 'calendar'],
      externalAccountId: 'deniz.kaya@novadijital.com.tr',
      displayName: 'Nova Dijital',
      email: 'deniz.kaya@novadijital.com.tr',
      status: 'connected',
      grantedScopes: ['Mail.Read', 'Calendars.ReadWrite'],
      lastSyncedAt: at(0, 7, 8),
      lastErrorCode: null,
      lastErrorAt: null,
      isPrimary: false,
    },
  ]

  const syncStates: SyncState[] = [
    {
      id: demoId(30),
      ...owned(-30),
      connectedAccountId: GOOGLE_ACCOUNT_ID,
      resource: 'mail',
      status: 'idle',
      cursor: 'history-84213',
      backfillCursor: null,
      backfillCompletedAt: at(-29, 10),
      lastRunAt: at(0, 7, 10),
      nextRunAt: at(0, 8, 10),
      consecutiveFailures: 0,
      lastError: null,
    },
    {
      id: demoId(31),
      ...owned(-30),
      connectedAccountId: GOOGLE_ACCOUNT_ID,
      resource: 'calendar',
      status: 'idle',
      cursor: 'delta-19a4',
      backfillCursor: null,
      backfillCompletedAt: at(-29, 10),
      lastRunAt: at(0, 7, 11),
      nextRunAt: at(0, 8, 11),
      consecutiveFailures: 0,
      lastError: null,
    },
  ]

  const contacts: Contact[] = [
    {
      id: AHMET.id,
      ...owned(-28),
      email: AHMET.email,
      name: AHMET.name,
      alternateEmails: [],
      company: 'Arkas İnşaat',
      role: 'Satın Alma Müdürü',
      avatarUrl: null,
      lastContactAt: at(0, 8, 42),
      interactionCount: 47,
      isVip: false,
      vipSetAt: null,
    },
    {
      id: MEHMET.id,
      ...owned(-28),
      email: MEHMET.email,
      name: MEHMET.name,
      alternateEmails: ['m.yilmaz@yilmazholding.com'],
      company: 'Yılmaz Holding',
      role: 'Yönetim Kurulu Üyesi',
      avatarUrl: null,
      lastContactAt: at(-1, 16, 20),
      interactionCount: 132,
      isVip: true,
      vipSetAt: at(-20, 11),
    },
    {
      id: ZEYNEP.id,
      ...owned(-25),
      email: ZEYNEP.email,
      name: ZEYNEP.name,
      alternateEmails: [],
      company: 'Nova Dijital',
      role: 'Proje Yöneticisi',
      avatarUrl: null,
      lastContactAt: at(-4, 10, 5),
      interactionCount: 61,
      isVip: false,
      vipSetAt: null,
    },
    {
      id: ELIF.id,
      ...owned(-25),
      email: ELIF.email,
      name: ELIF.name,
      alternateEmails: [],
      company: 'Dijital Asistan',
      role: 'Ürün Tasarımcısı',
      avatarUrl: null,
      lastContactAt: at(0, 9, 12),
      interactionCount: 88,
      isVip: false,
      vipSetAt: null,
    },
  ]

  interface ThreadSeed {
    id: string
    subject: string
    participants: string[]
    lastMessageAt: IsoInstant
    importance: Importance
    category: EmailCategory
    summary: string
    reasonImportant: string | null
    requiresUserAction: boolean
    deadline: IsoInstant | null
    isRead: boolean
    priorityScore: number
    accountId?: string
  }

  const threadSeeds: ThreadSeed[] = [
    {
      id: demoId(100),
      subject: 'Revize teklif — Arkas İnşaat',
      participants: [AHMET.email, SELF_EMAIL],
      lastMessageAt: at(0, 8, 42),
      importance: 'critical',
      category: 'deadline',
      summary:
        'Ahmet, revize teklifi cuma 17:00’a kadar bekliyor. Birim fiyat tablosunun güncellenmesini istiyor.',
      reasonImportant: 'Süreli bir iş ve cevabı senden bekleniyor.',
      requiresUserAction: true,
      deadline: deadlineFriday,
      isRead: false,
      priorityScore: 96,
    },
    {
      id: demoId(101),
      subject: 'Ürün stratejisi — gündem maddeleri',
      participants: [ELIF.email, SELF_EMAIL],
      lastMessageAt: at(0, 9, 12),
      importance: 'high',
      category: 'meeting',
      summary:
        'Elif bugünkü toplantı için üç gündem maddesi paylaştı ve senden dördüncüsünü ekleme istedi.',
      reasonImportant: 'Bugün 14:00’taki toplantının hazırlığı.',
      requiresUserAction: true,
      deadline: null,
      isRead: false,
      priorityScore: 81,
    },
    {
      id: demoId(102),
      subject: 'Yatırım komitesi notları',
      participants: [MEHMET.email, SELF_EMAIL],
      lastMessageAt: at(-1, 16, 20),
      importance: 'high',
      category: 'action_required',
      summary: 'Mehmet, komite sunumuna büyüme senaryosunun eklenmesini istedi.',
      reasonImportant: 'Mehmet Yılmaz’ı VIP olarak işaretledin.',
      requiresUserAction: true,
      deadline: null,
      isRead: true,
      priorityScore: 78,
    },
    {
      id: demoId(103),
      subject: 'Siparişin kargoya verildi',
      participants: ['kargo@trendyol.com', SELF_EMAIL],
      lastMessageAt: at(-1, 18, 4),
      importance: 'normal',
      category: 'shipment',
      summary: 'Kablosuz klavye siparişin yola çıktı, yarın teslim ediliyor.',
      reasonImportant: null,
      requiresUserAction: false,
      deadline: null,
      isRead: true,
      priorityScore: 34,
    },
    {
      id: demoId(104),
      subject: 'Uçuş biletin hazır — TK1985',
      participants: ['bilet@turkishairlines.com', SELF_EMAIL],
      lastMessageAt: at(-2, 12, 30),
      importance: 'normal',
      category: 'travel',
      summary: 'Pazartesi 07:40 İstanbul–Berlin uçuşun için check-in yarın açılıyor.',
      reasonImportant: null,
      requiresUserAction: false,
      deadline: null,
      isRead: true,
      priorityScore: 41,
    },
    {
      id: demoId(105),
      subject: 'Elektrik faturan hazır',
      participants: ['fatura@enerjisa.com.tr', SELF_EMAIL],
      lastMessageAt: at(-1, 9, 15),
      importance: 'normal',
      category: 'payment',
      summary: 'Son ödeme tarihi 12 gün sonra; tutar faturada yazıyor.',
      reasonImportant: null,
      requiresUserAction: false,
      deadline: at(12, 17),
      isRead: true,
      priorityScore: 44,
    },
    {
      id: demoId(106),
      subject: 'Spotify Premium aboneliğin yenileniyor',
      participants: ['no-reply@spotify.com', SELF_EMAIL],
      lastMessageAt: at(-1, 7, 45),
      importance: 'low',
      category: 'subscription',
      summary: 'Abonelik üç gün sonra otomatik yenilenecek.',
      reasonImportant: null,
      requiresUserAction: false,
      deadline: null,
      isRead: true,
      priorityScore: 22,
    },
    {
      id: demoId(107),
      subject: 'Hesabında yeni cihaz girişi',
      participants: ['security@google.com', SELF_EMAIL],
      lastMessageAt: at(0, 6, 20),
      importance: 'high',
      category: 'security',
      summary: 'Ankara’dan yeni bir cihazla giriş yapıldı. Sen değilsen şifreni değiştir.',
      reasonImportant: 'Güvenlik uyarıları her zaman öne alınır.',
      requiresUserAction: false,
      deadline: null,
      isRead: false,
      priorityScore: 72,
    },
    {
      id: demoId(108),
      subject: 'Sözleşme taslağı — Nova Dijital',
      participants: [ZEYNEP.email, SELF_EMAIL],
      lastMessageAt: at(-4, 10, 5),
      importance: 'normal',
      category: 'waiting_for_other',
      summary: 'Taslağı Zeynep’e gönderdin, dört gündür yanıt gelmedi.',
      reasonImportant: 'Yanıt bekliyorsun.',
      requiresUserAction: false,
      deadline: null,
      isRead: true,
      priorityScore: 57,
      accountId: MICROSOFT_ACCOUNT_ID,
    },
  ]

  const threads: EmailThread[] = threadSeeds.map((seed) => ({
    id: seed.id,
    ...owned(-5),
    connectedAccountId: seed.accountId ?? GOOGLE_ACCOUNT_ID,
    externalThreadId: `gmail-${seed.id.slice(-6)}`,
    subject: seed.subject,
    participantEmails: seed.participants,
    lastMessageAt: seed.lastMessageAt,
    messageCount: 2,
    isRead: seed.isRead,
    importance: seed.importance,
    category: seed.category,
    summary: seed.summary,
    reasonImportant: seed.reasonImportant,
    requiresUserAction: seed.requiresUserAction,
    deadline: seed.deadline,
    confidence: 0.88,
    priorityScore: seed.priorityScore,
    suppressedAt: null,
    archivedAt: null,
  }))

  interface MessageSeed {
    id: string
    threadId: string
    fromEmail: string
    fromName: string | null
    snippet: string
    body: string
    sentAt: IsoInstant
    isFromUser: boolean
  }

  const messageSeeds: MessageSeed[] = [
    {
      id: demoId(200),
      threadId: demoId(100),
      fromEmail: SELF_EMAIL,
      fromName: 'Deniz Kaya',
      snippet: 'Merhaba Ahmet, ilk teklifi ekte paylaşıyorum.',
      body: 'Merhaba Ahmet,\n\nİlk teklifi ekte paylaşıyorum. Görüşlerini bekliyorum.\n\nDeniz',
      sentAt: at(-3, 15, 10),
      isFromUser: true,
    },
    {
      id: demoId(201),
      threadId: demoId(100),
      fromEmail: AHMET.email,
      fromName: AHMET.name,
      snippet: 'Birim fiyat tablosunu güncelleyip cuma 17:00’a kadar gönderebilir misin?',
      body: 'Merhaba Deniz,\n\nTeklifi komiteye taşıyacağım. Birim fiyat tablosunu güncelleyip revize teklifi cuma 17:00’a kadar gönderebilir misin?\n\nİyi çalışmalar,\nAhmet Yılmaz',
      sentAt: at(0, 8, 42),
      isFromUser: false,
    },
    {
      id: demoId(202),
      threadId: demoId(101),
      fromEmail: ELIF.email,
      fromName: ELIF.name,
      snippet: 'Bugünkü ürün stratejisi için üç madde hazırladım.',
      body: 'Selam Deniz,\n\nBugünkü ürün stratejisi toplantısı için üç madde hazırladım: yol haritası, fiyatlandırma ve ekip planı. Dördüncü maddeyi sen eklersin diye boş bıraktım.\n\nElif',
      sentAt: at(0, 9, 12),
      isFromUser: false,
    },
    {
      id: demoId(203),
      threadId: demoId(102),
      fromEmail: MEHMET.email,
      fromName: MEHMET.name,
      snippet: 'Sunuma büyüme senaryosunu da ekleyelim.',
      body: 'Deniz merhaba,\n\nKomite sunumuna büyüme senaryosunu da ekleyelim. Hafta içinde bir taslak görebilir miyim?\n\nMehmet Yılmaz',
      sentAt: at(-1, 16, 20),
      isFromUser: false,
    },
    {
      id: demoId(204),
      threadId: demoId(103),
      fromEmail: 'kargo@trendyol.com',
      fromName: 'Trendyol',
      snippet: 'Siparişin kargoya verildi. Takip numarası: TY9384726150.',
      body: 'Siparişin kargoya verildi. Takip numarası: TY9384726150. Tahmini teslim: yarın.',
      sentAt: at(-1, 18, 4),
      isFromUser: false,
    },
    {
      id: demoId(205),
      threadId: demoId(108),
      fromEmail: SELF_EMAIL,
      fromName: 'Deniz Kaya',
      snippet: 'Zeynep, sözleşme taslağını ekte gönderiyorum.',
      body: 'Merhaba Zeynep,\n\nSözleşme taslağını ekte gönderiyorum. Uygun olduğunda dönüş yapabilir misin?\n\nDeniz',
      sentAt: at(-4, 10, 5),
      isFromUser: true,
    },
    {
      id: demoId(206),
      threadId: demoId(107),
      fromEmail: 'security@google.com',
      fromName: 'Google',
      snippet: 'Hesabına Ankara’dan yeni bir cihazla giriş yapıldı.',
      body: 'Hesabına Ankara’dan yeni bir cihazla giriş yapıldı. Bu sen değilsen şifreni hemen değiştir.',
      sentAt: at(0, 6, 20),
      isFromUser: false,
    },
  ]

  const messages: EmailMessage[] = messageSeeds.map((seed) => ({
    id: seed.id,
    ...owned(-5),
    threadId: seed.threadId,
    connectedAccountId: GOOGLE_ACCOUNT_ID,
    externalMessageId: `msg-${seed.id.slice(-6)}`,
    fromEmail: seed.fromEmail,
    fromName: seed.fromName,
    toEmails: seed.isFromUser ? [AHMET.email] : [SELF_EMAIL],
    ccEmails: [],
    subject: threadSeeds.find((t) => t.id === seed.threadId)?.subject ?? 'Konu',
    snippet: seed.snippet,
    bodyText: seed.body,
    sentAt: seed.sentAt,
    isFromUser: seed.isFromUser,
    hasAttachments: false,
    attachmentMeta: [],
    contentHash: `hash-${seed.id.slice(-6)}`,
    externalUrl: null,
  }))

  const attendee = (
    email: string,
    name: string,
    isSelf: boolean,
    isOrganizer: boolean,
  ): EventAttendee => ({
    email,
    name,
    responseStatus: 'accepted',
    isOrganizer,
    isSelf,
  })

  const events: CalendarEvent[] = [
    {
      id: demoId(300),
      ...owned(-7),
      connectedAccountId: GOOGLE_ACCOUNT_ID,
      externalEventId: 'evt-sync-weekly',
      provider: 'google',
      title: 'Haftalık ekip senkronu',
      description: 'Geçen haftanın çıktıları ve bu haftanın öncelikleri.',
      location: null,
      startsAt: at(0, 9, 30),
      endsAt: at(0, 10, 0),
      isAllDay: false,
      timeZone,
      attendees: [
        attendee(SELF_EMAIL, 'Deniz Kaya', true, true),
        attendee(ELIF.email, ELIF.name, false, false),
      ],
      organizerEmail: SELF_EMAIL,
      conferenceUrl: 'https://meet.google.com/dai-demo-sync',
      status: 'confirmed',
      providerUpdatedAt: at(-1, 20),
      externalUrl: null,
    },
    {
      id: demoId(301),
      ...owned(-4),
      connectedAccountId: GOOGLE_ACCOUNT_ID,
      externalEventId: 'evt-product-strategy',
      provider: 'google',
      title: 'Ürün stratejisi',
      description: 'Yol haritası, fiyatlandırma ve ekip planı.',
      location: 'Levent Ofis — 4. kat',
      startsAt: at(0, 14, 0),
      endsAt: at(0, 15, 0),
      isAllDay: false,
      timeZone,
      attendees: [
        attendee(SELF_EMAIL, 'Deniz Kaya', true, false),
        attendee(ELIF.email, ELIF.name, false, true),
        attendee(MEHMET.email, MEHMET.name, false, false),
      ],
      organizerEmail: ELIF.email,
      conferenceUrl: 'https://meet.google.com/dai-demo-strategy',
      status: 'confirmed',
      providerUpdatedAt: at(-1, 18),
      externalUrl: null,
    },
    {
      id: demoId(302),
      ...owned(-3),
      connectedAccountId: GOOGLE_ACCOUNT_ID,
      externalEventId: 'evt-arkas-call',
      provider: 'google',
      title: 'Arkas İnşaat teklif görüşmesi',
      description: 'Revize teklifin sunumu.',
      location: null,
      startsAt: at(1, 11, 0),
      endsAt: at(1, 12, 0),
      isAllDay: false,
      timeZone,
      attendees: [
        attendee(SELF_EMAIL, 'Deniz Kaya', true, true),
        attendee(AHMET.email, AHMET.name, false, false),
      ],
      organizerEmail: SELF_EMAIL,
      conferenceUrl: null,
      status: 'confirmed',
      providerUpdatedAt: at(-1, 12),
      externalUrl: null,
    },
  ]

  const tasks: Task[] = [
    {
      id: demoId(400),
      ...owned(-2),
      connectedAccountId: GOOGLE_ACCOUNT_ID,
      externalTaskId: 'task-birim-fiyat',
      provider: 'google',
      title: 'Birim fiyat tablosunu güncelle',
      notes: 'Teklif ekindeki tabloyu son maliyetlerle yenile.',
      dueAt: at(1, 17, 0),
      status: 'open',
      completedAt: null,
      source: source({
        type: 'email',
        id: demoId(100),
        label: 'Gmail · Ahmet Yılmaz · 08:42',
        personName: AHMET.name,
        occurredAt: at(0, 8, 42),
      }),
      providerUpdatedAt: at(-2, 9),
    },
  ]

  const commitments: Commitment[] = [
    {
      id: demoId(500),
      ...owned(0),
      text: 'Ahmet’e revize teklifi göndereceksin',
      direction: 'user_owes',
      personId: AHMET.id,
      personName: AHMET.name,
      dueAt: deadlineFriday,
      status: 'open',
      source: source({
        type: 'email',
        id: demoId(100),
        label: 'Gmail · Ahmet Yılmaz · 08:42',
        personName: AHMET.name,
        occurredAt: at(0, 8, 42),
      }),
      quote:
        'Birim fiyat tablosunu güncelleyip revize teklifi cuma 17:00’a kadar gönderebilir misin?',
      confidence: 0.94,
      confirmedByUser: false,
      completedAt: null,
      snoozedUntil: null,
    },
  ]

  const reminders: Reminder[] = [
    {
      id: demoId(600),
      ...owned(0),
      title: 'Teklif için birim fiyatları kontrol et',
      body: 'Cuma 17:00 teslimi öncesi son kontrol.',
      remindAt: at(1, 16, 0),
      preset: 'smart',
      source: source({
        type: 'email',
        id: demoId(100),
        label: 'Gmail · Ahmet Yılmaz · 08:42',
        personName: AHMET.name,
        occurredAt: at(0, 8, 42),
      }),
      relatedEntityType: 'email',
      relatedEntityId: demoId(100),
      status: 'scheduled',
      firedAt: null,
      category: 'deadline',
    },
  ]

  const priorityRules: PriorityRule[] = [
    {
      id: demoId(700),
      ...owned(-20),
      kind: 'vip_always_notify',
      matchValue: MEHMET.email,
      matchCategory: null,
      enabled: true,
      note: 'Yönetim kurulu yazışmaları',
    },
    {
      id: demoId(701),
      ...owned(-18),
      kind: 'category_low_priority',
      matchValue: 'promotion',
      matchCategory: 'promotion',
      enabled: true,
      note: null,
    },
  ]

  const learnedPreferences: LearnedPreference[] = [
    {
      id: demoId(710),
      ...owned(-14),
      statement: 'Ahmet Yılmaz’ın teklif yazışmalarını hep öne alıyorsun.',
      kind: 'sender_always_important',
      matchValue: AHMET.email,
      strength: 0.82,
      observationCount: 9,
      enabled: true,
      lastObservedAt: at(-1, 9),
    },
    {
      id: demoId(711),
      ...owned(-12),
      statement: 'Kampanya e-postalarını okumadan geçiyorsun.',
      kind: 'category_low_priority',
      matchValue: 'promotion',
      strength: 0.71,
      observationCount: 23,
      enabled: true,
      lastObservedAt: at(-1, 20),
    },
  ]

  const insights: Insight[] = [
    {
      id: demoId(800),
      ...owned(0),
      title: 'Revize teklif cuma 17:00’a yetişmeli',
      detail: 'Ahmet birim fiyat tablosunun güncellenmesini istedi.',
      importance: 'critical',
      category: 'deadline',
      source: source({
        type: 'email',
        id: demoId(100),
        label: 'Gmail · Ahmet Yılmaz · 08:42',
        personName: AHMET.name,
        occurredAt: at(0, 8, 42),
      }),
      reasonImportant: 'Süre kısıtlı ve iş sende.',
      actions: [
        { kind: 'draft_reply', label: 'Yanıt taslağı', params: { threadId: demoId(100) } },
        { kind: 'set_reminder', label: 'Hatırlatıcı kur', params: { entityId: demoId(100) } },
      ],
      dueAt: deadlineFriday,
      priorityScore: 96,
      completedAt: null,
      dismissedAt: null,
      forDate: today,
    },
    {
      id: demoId(801),
      ...owned(0),
      title: 'Ürün stratejisi toplantısına dördüncü maddeyi ekle',
      detail: 'Elif gündemde senin için bir satır bıraktı.',
      importance: 'high',
      category: 'meeting',
      source: source({
        type: 'calendar_event',
        id: demoId(301),
        label: 'Takvim · Ürün stratejisi · 14:00',
        personName: ELIF.name,
        occurredAt: at(0, 14, 0),
      }),
      reasonImportant: 'Toplantı bugün 14:00’ta.',
      actions: [
        { kind: 'prepare_meeting', label: 'Toplantıya hazırlan', params: { eventId: demoId(301) } },
      ],
      dueAt: at(0, 14, 0),
      priorityScore: 81,
      completedAt: null,
      dismissedAt: null,
      forDate: today,
    },
    {
      id: demoId(802),
      ...owned(0),
      title: 'Zeynep dört gündür yanıt vermedi',
      detail: 'Sözleşme taslağı için nazik bir hatırlatma gönderebilirsin.',
      importance: 'normal',
      category: 'follow_up',
      source: source({
        type: 'email',
        id: demoId(108),
        label: 'Outlook · Zeynep Demir · 10:05',
        personName: ZEYNEP.name,
        occurredAt: at(-4, 10, 5),
      }),
      reasonImportant: 'Yanıt bekleyen tek konu bu.',
      actions: [
        { kind: 'draft_reply', label: 'Hatırlatma taslağı', params: { threadId: demoId(108) } },
      ],
      dueAt: at(0, 12, 0),
      priorityScore: 57,
      completedAt: null,
      dismissedAt: null,
      forDate: today,
    },
  ]

  interface LifeEventSeed {
    id: string
    type: LifeEventType
    title: string
    detail: string
    occursAt: IsoInstant | null
    amount: { value: number; currency: string } | null
    reference: string | null
    trackingUrl: string | null
    threadId: string
    label: string
  }

  const lifeEventSeeds: LifeEventSeed[] = [
    {
      id: demoId(900),
      type: 'shipment',
      title: 'Kablosuz klavye kargoda',
      detail: 'Trendyol siparişin yarın teslim ediliyor.',
      occursAt: at(1, 12, 0),
      amount: null,
      reference: 'TY9384726150',
      trackingUrl: 'https://kargotakip.araskargo.com.tr/TY9384726150',
      threadId: demoId(103),
      label: 'Gmail · Trendyol · 18:04',
    },
    {
      id: demoId(901),
      type: 'flight',
      title: 'TK1985 İstanbul → Berlin',
      detail: 'Check-in yarın açılıyor; kalkış 07:40.',
      occursAt: at(4, 7, 40),
      amount: null,
      reference: 'TK1985',
      trackingUrl: null,
      threadId: demoId(104),
      label: 'Gmail · Türk Hava Yolları · 12:30',
    },
    {
      id: demoId(902),
      type: 'payment',
      title: 'Elektrik faturası',
      detail: 'Son ödeme tarihi yaklaşıyor.',
      occursAt: at(12, 17, 0),
      amount: { value: 1284.6, currency: 'TRY' },
      reference: 'ENR-2026-884213',
      trackingUrl: null,
      threadId: demoId(105),
      label: 'Gmail · Enerjisa · 09:15',
    },
    {
      id: demoId(903),
      type: 'subscription',
      title: 'Spotify Premium yenilemesi',
      detail: 'Abonelik üç gün sonra otomatik yenilenecek.',
      occursAt: at(3, 9, 0),
      amount: { value: 99.99, currency: 'TRY' },
      reference: null,
      trackingUrl: null,
      threadId: demoId(106),
      label: 'Gmail · Spotify · 07:45',
    },
    {
      id: demoId(904),
      type: 'security',
      title: 'Yeni cihazdan giriş',
      detail: 'Ankara’dan bir giriş kaydedildi.',
      occursAt: at(0, 6, 20),
      amount: null,
      reference: null,
      trackingUrl: null,
      threadId: demoId(107),
      label: 'Gmail · Google · 06:20',
    },
  ]

  const lifeEvents: LifeEvent[] = lifeEventSeeds.map((seed) => ({
    id: seed.id,
    ...owned(-1),
    type: seed.type,
    title: seed.title,
    detail: seed.detail,
    occursAt: seed.occursAt,
    amount: seed.amount,
    reference: seed.reference,
    trackingUrl: seed.trackingUrl,
    source: source({
      type: 'email',
      id: seed.threadId,
      label: seed.label,
      occurredAt: seed.occursAt,
    }),
    confidence: 0.91,
    status: 'active',
  }))

  const briefingId = demoId(1000)
  const briefings: Briefing[] = [
    {
      id: briefingId,
      ...owned(0),
      kind: 'morning',
      status: 'ready',
      forDate: today,
      headline: 'Bugünün tek kritik işi: Ahmet’in revize teklifi.',
      narrative:
        'Günaydın Deniz. Gecede 34 e-posta geldi, dördü seni ilgilendiriyor. Ahmet Yılmaz revize teklifi cuma 17:00’a kadar istiyor; birim fiyat tablosunu güncellemen gerekiyor. Saat 14:00’taki ürün stratejisi toplantısında gündemin dördüncü maddesi hâlâ boş. Zeynep’ten dört gündür yanıt yok, istersen kısa bir hatırlatma gönderebilirsin. Kargon yarın teslim ediliyor, pazartesi uçuşun için check-in yarın açılıyor.',
      durationSeconds: 95,
      audioUrl: null,
      audioProvider: null,
      generatedAt: at(0, 7, 15),
      openedAt: null,
      contentHash: 'demo-morning-1',
      stats: {
        emailsAnalyzed: 34,
        importantCount: 4,
        meetingCount: 2,
        deadlineCount: 1,
        followUpCount: 1,
        estimatedMinutesSaved: 26,
      },
    },
  ]

  interface ItemSeed {
    id: string
    section: BriefingSection
    position: number
    title: string
    detail: string
    importance: Importance
    entityType: SourceRef['type']
    entityId: string
    label: string
  }

  const itemSeeds: ItemSeed[] = [
    {
      id: demoId(1001),
      section: 'priorities',
      position: 0,
      title: 'Revize teklif — Arkas İnşaat',
      detail: 'Ahmet birim fiyat tablosunu güncellemeni istiyor.',
      importance: 'critical',
      entityType: 'email',
      entityId: demoId(100),
      label: 'Gmail · Ahmet Yılmaz · 08:42',
    },
    {
      id: demoId(1002),
      section: 'priorities',
      position: 1,
      title: 'Yatırım komitesi sunumu',
      detail: 'Mehmet büyüme senaryosunu bekliyor.',
      importance: 'high',
      entityType: 'email',
      entityId: demoId(102),
      label: 'Gmail · Mehmet Yılmaz · 16:20',
    },
    {
      id: demoId(1003),
      section: 'schedule',
      position: 0,
      title: 'Ürün stratejisi · 14:00–15:00',
      detail: 'Levent Ofis, 4. kat. Elif ve Mehmet katılıyor.',
      importance: 'high',
      entityType: 'calendar_event',
      entityId: demoId(301),
      label: 'Takvim · Ürün stratejisi · 14:00',
    },
    {
      id: demoId(1004),
      section: 'expected_from_you',
      position: 0,
      title: 'Gündemin dördüncü maddesi',
      detail: 'Elif senin eklemeni bekliyor.',
      importance: 'high',
      entityType: 'email',
      entityId: demoId(101),
      label: 'Gmail · Elif Şahin · 09:12',
    },
    {
      id: demoId(1005),
      section: 'waiting_on_others',
      position: 0,
      title: 'Zeynep Demir — sözleşme taslağı',
      detail: 'Dört gündür yanıt yok.',
      importance: 'normal',
      entityType: 'email',
      entityId: demoId(108),
      label: 'Outlook · Zeynep Demir · 10:05',
    },
    {
      id: demoId(1006),
      section: 'deadlines',
      position: 0,
      title: 'Cuma 17:00 — revize teklif',
      detail: 'İki gün kaldı.',
      importance: 'critical',
      entityType: 'commitment',
      entityId: demoId(500),
      label: 'Taahhüt · Ahmet Yılmaz',
    },
    {
      id: demoId(1007),
      section: 'personal',
      position: 0,
      title: 'Kargon yarın teslim',
      detail: 'Kablosuz klavye siparişi yolda.',
      importance: 'low',
      entityType: 'email',
      entityId: demoId(103),
      label: 'Gmail · Trendyol · 18:04',
    },
    {
      id: demoId(1008),
      section: 'personal',
      position: 1,
      title: 'TK1985 uçuşu için check-in yarın açılıyor',
      detail: 'Pazartesi 07:40 İstanbul–Berlin.',
      importance: 'normal',
      entityType: 'email',
      entityId: demoId(104),
      label: 'Gmail · Türk Hava Yolları · 12:30',
    },
  ]

  const briefingItems: BriefingItem[] = itemSeeds.map((seed) => ({
    id: seed.id,
    ...owned(0),
    briefingId,
    section: seed.section,
    position: seed.position,
    title: seed.title,
    detail: seed.detail,
    source: source({ type: seed.entityType, id: seed.entityId, label: seed.label }),
    relatedEntityType: seed.entityType,
    relatedEntityId: seed.entityId,
    importance: seed.importance,
  }))

  const expiresAt = new Date(now.getTime() + APPROVAL_TTL_MS).toISOString()

  const approvals: ApprovalAction[] = [
    {
      id: demoId(1100),
      ...owned(0),
      type: 'email_send',
      status: 'pending',
      what: 'Ahmet Yılmaz’a yanıt gönder',
      why: 'Revize teklifin cuma 17:00’a yetişeceğini teyit ediyorsun.',
      source: source({
        type: 'email',
        id: demoId(100),
        label: 'Gmail · Ahmet Yılmaz · 08:42',
        personName: AHMET.name,
        occurredAt: at(0, 8, 42),
      }),
      payload: {
        kind: 'email_send',
        connectedAccountId: GOOGLE_ACCOUNT_ID,
        threadId: demoId(100),
        inReplyToMessageId: 'msg-000201',
        to: [AHMET.email],
        cc: [],
        subject: 'Re: Revize teklif — Arkas İnşaat',
        body: 'Merhaba Ahmet,\n\nBirim fiyat tablosunu güncelliyorum; revize teklifi cuma 17:00’dan önce ileteceğim.\n\nİyi çalışmalar,\nDeniz',
        tone: 'professional',
      },
      originalPayload: {
        kind: 'email_send',
        connectedAccountId: GOOGLE_ACCOUNT_ID,
        threadId: demoId(100),
        inReplyToMessageId: 'msg-000201',
        to: [AHMET.email],
        cc: [],
        subject: 'Re: Revize teklif — Arkas İnşaat',
        body: 'Merhaba Ahmet,\n\nBirim fiyat tablosunu güncelliyorum; revize teklifi cuma 17:00’dan önce ileteceğim.\n\nİyi çalışmalar,\nDeniz',
        tone: 'professional',
      },
      idempotencyKey: 'demo-approval-email-1',
      expiresAt,
      approvedAt: null,
      executedAt: null,
      rejectedAt: null,
      failureReason: null,
      attemptCount: 0,
      resultRef: null,
    },
    {
      id: demoId(1101),
      ...owned(0),
      type: 'calendar_create',
      status: 'pending',
      what: 'Yarın 09:00–10:00 arasına hazırlık bloğu ekle',
      why: 'Teklifi bitirmek için takvimindeki tek boş saat bu.',
      source: source({
        type: 'commitment',
        id: demoId(500),
        label: 'Taahhüt · Ahmet Yılmaz',
        personName: AHMET.name,
      }),
      payload: {
        kind: 'calendar_create',
        connectedAccountId: GOOGLE_ACCOUNT_ID,
        title: 'Teklif hazırlığı',
        description: 'Birim fiyat tablosunu güncelle.',
        location: null,
        startsAt: at(1, 9, 0),
        endsAt: at(1, 10, 0),
        timeZone,
        attendees: [],
      },
      originalPayload: {
        kind: 'calendar_create',
        connectedAccountId: GOOGLE_ACCOUNT_ID,
        title: 'Teklif hazırlığı',
        description: 'Birim fiyat tablosunu güncelle.',
        location: null,
        startsAt: at(1, 9, 0),
        endsAt: at(1, 10, 0),
        timeZone,
        attendees: [],
      },
      idempotencyKey: 'demo-approval-calendar-1',
      expiresAt,
      approvedAt: null,
      executedAt: null,
      rejectedAt: null,
      failureReason: null,
      attemptCount: 0,
      resultRef: null,
    },
  ]

  const assistantThreadId = demoId(1200)
  const assistantThreads: AssistantThread[] = [
    {
      id: assistantThreadId,
      ...owned(-1),
      title: 'Teklif takibi',
      lastMessageAt: at(0, 8, 50),
      messageCount: 2,
    },
  ]

  const assistantMessages: AssistantMessage[] = [
    {
      id: demoId(1201),
      ...owned(0),
      threadId: assistantThreadId,
      role: 'user',
      content: 'Ahmet’e ne söz vermiştim?',
      citations: [],
      proposedApprovalId: null,
      tokensIn: null,
      tokensOut: null,
      model: null,
      wasVoice: false,
    },
    {
      id: demoId(1202),
      ...owned(0),
      threadId: assistantThreadId,
      role: 'assistant',
      content:
        'Revize teklifi cuma 17:00’a kadar göndereceğini söyledin. Ahmet birim fiyat tablosunun güncellenmesini istiyor.',
      citations: [
        source({
          type: 'email',
          id: demoId(100),
          label: 'Gmail · Ahmet Yılmaz · 08:42',
          personName: AHMET.name,
          occurredAt: at(0, 8, 42),
        }),
      ],
      proposedApprovalId: null,
      tokensIn: 420,
      tokensOut: 96,
      model: 'demo',
      wasVoice: false,
    },
  ]

  const captures: Capture[] = [
    {
      id: demoId(1300),
      ...owned(-1),
      kind: 'photo',
      status: 'ready',
      storagePath: `${USER_ID}/demo/afis.jpg`,
      sourceUrl: null,
      rawText: 'Tasarım Buluşmaları — 19 Eylül, 19:00, Salt Galata',
      mimeType: 'image/jpeg',
      sizeBytes: 482_113,
      detectedIntent: 'event',
      extracted: {
        title: 'Tasarım Buluşmaları',
        summary: 'Salt Galata’da akşam etkinliği.',
        startsAt: at(6, 19, 0),
        endsAt: at(6, 21, 0),
        location: 'Salt Galata, İstanbul',
        people: [],
        amount: null,
        reference: null,
        keyPoints: ['Kayıt gerekiyor', 'Kontenjan sınırlı'],
        confidence: 0.86,
        suggestedActions: [
          { kind: 'add_to_calendar', label: 'Takvime ekle', params: { captureId: demoId(1300) } },
        ],
      },
      failureReason: null,
      analyzedAt: at(-1, 21, 5),
    },
  ]

  const followUps: FollowUp[] = [
    {
      id: demoId(1400),
      ...owned(-4),
      threadId: demoId(108),
      messageId: demoId(205),
      recipientEmail: ZEYNEP.email,
      recipientName: ZEYNEP.name,
      sentAt: at(-4, 10, 5),
      dueAt: at(0, 10, 0),
      status: 'waiting',
      repliedAt: null,
      closedAt: null,
      dismissCount: 0,
    },
  ]

  const subscription: Subscription = {
    userId: USER_ID,
    status: 'trialing',
    entitlement: 'pro',
    productId: 'da_pro_monthly',
    store: 'app_store',
    currentPeriodEnd: new Date(now.getTime() + 9 * DAY_MS).toISOString(),
    trialEndsAt: new Date(now.getTime() + 9 * DAY_MS).toISOString(),
    revenueCatCustomerId: 'demo-customer',
    updatedAt: nowIso,
  }

  return {
    userId: USER_ID,
    timeZone,
    profile,
    preferences,
    notificationPreferences,
    accounts,
    syncStates,
    contacts,
    threads,
    messages,
    events,
    tasks,
    commitments,
    reminders,
    priorityRules,
    learnedPreferences,
    insights,
    lifeEvents,
    briefings,
    briefingItems,
    approvals,
    assistantThreads,
    assistantMessages,
    captures,
    followUps,
    subscription,
    pushTokens: [],
    exports: [],
    referral: { code: 'DA7K2M9P', redemptionCount: 2, bonusDaysEarned: 28 },
  }
}
