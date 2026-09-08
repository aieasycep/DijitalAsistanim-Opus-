import type {
  ApprovalAction,
  AssistantMessage,
  AssistantThread,
  AttachmentMeta,
  Briefing,
  BriefingItem,
  BriefingStats,
  CalendarEvent,
  Capture,
  CaptureExtraction,
  Commitment,
  ConnectedAccount,
  Contact,
  DataExportRequest,
  EmailMessage,
  EmailThread,
  EventAttendee,
  FollowUp,
  Insight,
  LearnedPreference,
  LifeEvent,
  NotificationPreferences,
  PriorityRule,
  Profile,
  PushToken,
  Reminder,
  SourceRef,
  Subscription,
  SyncState,
  Task,
  UserPreferences,
} from '@da/domain'
import type {
  ApprovalActionRow,
  AssistantMessageRow,
  AssistantThreadRow,
  AttachmentMetaRow,
  BriefingItemRow,
  BriefingRow,
  BriefingStatsRow,
  CalendarEventRow,
  CaptureExtractionRow,
  CaptureRow,
  CommitmentRow,
  ConnectedAccountRow,
  ContactRow,
  DataExportRequestRow,
  EmailMessageRow,
  EmailThreadRow,
  EventAttendeeRow,
  FollowUpRow,
  InsightRow,
  LearnedPreferenceRow,
  LifeEventRow,
  NotificationPreferencesRow,
  PriorityRuleRow,
  ProfileRow,
  PushTokenRow,
  ReminderRow,
  SourceRefRow,
  SubscriptionRow,
  SyncStateRow,
  TaskRow,
  UserPreferencesRow,
} from './types'

/**
 * Rows are snake_case because Postgres is; entities are camelCase because the
 * app is. The boundary lives here and nowhere else — no screen ever sees a row.
 */

export function mapSourceRef(row: SourceRefRow): SourceRef {
  return {
    type: row.type,
    id: row.id,
    label: row.label,
    provider: row.provider,
    personName: row.person_name,
    occurredAt: row.occurred_at,
    externalUrl: row.external_url,
  }
}

export function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    givenName: row.given_name,
    avatarUrl: row.avatar_url,
    timeZone: row.time_zone,
    locale: row.locale,
    onboardingCompletedAt: row.onboarding_completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

export function mapUserPreferences(row: UserPreferencesRow): UserPreferences {
  return {
    userId: row.user_id,
    colorScheme: row.color_scheme,
    language: row.language,
    morningBriefingTime: row.morning_briefing_time,
    middayPulseEnabled: row.midday_pulse_enabled,
    middayPulseTime: row.midday_pulse_time,
    eveningCloseEnabled: row.evening_close_enabled,
    eveningCloseTime: row.evening_close_time,
    weeklyReviewEnabled: row.weekly_review_enabled,
    weeklyReviewWeekday: row.weekly_review_weekday,
    weeklyReviewTime: row.weekly_review_time,
    briefingOnWeekends: row.briefing_on_weekends,
    quietDays: row.quiet_days ?? [],
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    learnFromInteractions: row.learn_from_interactions,
    analyzeAttachments: row.analyze_attachments,
    retentionWindow: row.retention_window,
    historyDays: row.history_days,
    reduceMotion: row.reduce_motion,
    audioBriefingVoice: row.audio_briefing_voice,
    audioBriefingSpeed: row.audio_briefing_speed,
    updatedAt: row.updated_at,
  }
}

export function mapNotificationPreferences(
  row: NotificationPreferencesRow,
): NotificationPreferences {
  return {
    userId: row.user_id,
    categories: row.categories ?? {},
    onlyIfImportant: row.only_if_important,
    lockScreenPrivacy: row.lock_screen_privacy,
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    updatedAt: row.updated_at,
  }
}

export function mapConnectedAccount(row: ConnectedAccountRow): ConnectedAccount {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    provider: row.provider,
    kinds: row.kinds ?? [],
    externalAccountId: row.external_account_id,
    displayName: row.display_name,
    email: row.email,
    status: row.status,
    grantedScopes: row.granted_scopes ?? [],
    lastSyncedAt: row.last_synced_at,
    lastErrorCode: row.last_error_code,
    lastErrorAt: row.last_error_at,
    isPrimary: row.is_primary,
  }
}

export function mapSyncState(row: SyncStateRow): SyncState {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    connectedAccountId: row.connected_account_id,
    resource: row.resource,
    status: row.status,
    cursor: row.cursor,
    backfillCursor: row.backfill_cursor,
    backfillCompletedAt: row.backfill_completed_at,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    consecutiveFailures: row.consecutive_failures,
    lastError: row.last_error,
  }
}

export function mapEmailThread(row: EmailThreadRow): EmailThread {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    connectedAccountId: row.connected_account_id,
    externalThreadId: row.external_thread_id,
    subject: row.subject,
    participantEmails: row.participant_emails ?? [],
    lastMessageAt: row.last_message_at,
    messageCount: row.message_count,
    isRead: row.is_read,
    importance: row.importance,
    category: row.category,
    summary: row.summary,
    reasonImportant: row.reason_important,
    requiresUserAction: row.requires_user_action,
    deadline: row.deadline,
    confidence: row.confidence,
    priorityScore: row.priority_score,
    suppressedAt: row.suppressed_at,
    archivedAt: row.archived_at,
  }
}

function mapAttachmentMeta(row: AttachmentMetaRow): AttachmentMeta {
  return {
    externalId: row.external_id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    extractedTextRef: row.extracted_text_ref,
  }
}

export function mapEmailMessage(row: EmailMessageRow): EmailMessage {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    threadId: row.thread_id,
    connectedAccountId: row.connected_account_id,
    externalMessageId: row.external_message_id,
    fromEmail: row.from_email,
    fromName: row.from_name,
    toEmails: row.to_emails ?? [],
    ccEmails: row.cc_emails ?? [],
    subject: row.subject,
    snippet: row.snippet,
    bodyText: row.body_text,
    sentAt: row.sent_at,
    isFromUser: row.is_from_user,
    hasAttachments: row.has_attachments,
    attachmentMeta: (row.attachment_meta ?? []).map(mapAttachmentMeta),
    contentHash: row.content_hash,
    externalUrl: row.external_url,
  }
}

function mapEventAttendee(row: EventAttendeeRow): EventAttendee {
  return {
    email: row.email,
    name: row.name,
    responseStatus: row.response_status,
    isOrganizer: row.is_organizer,
    isSelf: row.is_self,
  }
}

export function mapCalendarEvent(row: CalendarEventRow): CalendarEvent {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    connectedAccountId: row.connected_account_id,
    externalEventId: row.external_event_id,
    provider: row.provider,
    title: row.title,
    description: row.description,
    location: row.location,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isAllDay: row.is_all_day,
    timeZone: row.time_zone,
    attendees: (row.attendees ?? []).map(mapEventAttendee),
    organizerEmail: row.organizer_email,
    conferenceUrl: row.conference_url,
    status: row.status,
    providerUpdatedAt: row.provider_updated_at,
    externalUrl: row.external_url,
  }
}

export function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    connectedAccountId: row.connected_account_id,
    externalTaskId: row.external_task_id,
    provider: row.provider,
    title: row.title,
    notes: row.notes,
    dueAt: row.due_at,
    status: row.status,
    completedAt: row.completed_at,
    source: row.source ? mapSourceRef(row.source) : null,
    providerUpdatedAt: row.provider_updated_at,
  }
}

export function mapCommitment(row: CommitmentRow): Commitment {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    text: row.text,
    direction: row.direction,
    personId: row.person_id,
    personName: row.person_name,
    dueAt: row.due_at,
    status: row.status,
    source: mapSourceRef(row.source),
    quote: row.quote,
    confidence: row.confidence,
    confirmedByUser: row.confirmed_by_user,
    completedAt: row.completed_at,
    snoozedUntil: row.snoozed_until,
  }
}

export function mapReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    title: row.title,
    body: row.body,
    remindAt: row.remind_at,
    preset: row.preset,
    source: row.source ? mapSourceRef(row.source) : null,
    relatedEntityType: row.related_entity_type,
    relatedEntityId: row.related_entity_id,
    status: row.status,
    firedAt: row.fired_at,
    category: row.category,
  }
}

export function mapContact(row: ContactRow): Contact {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    email: row.email,
    name: row.name,
    alternateEmails: row.alternate_emails ?? [],
    company: row.company,
    role: row.role,
    avatarUrl: row.avatar_url,
    lastContactAt: row.last_contact_at,
    interactionCount: row.interaction_count,
    isVip: row.is_vip,
    vipSetAt: row.vip_set_at,
  }
}

export function mapPriorityRule(row: PriorityRuleRow): PriorityRule {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    kind: row.kind,
    matchValue: row.match_value,
    matchCategory: row.match_category,
    enabled: row.enabled,
    note: row.note,
  }
}

export function mapLearnedPreference(row: LearnedPreferenceRow): LearnedPreference {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    statement: row.statement,
    kind: row.kind,
    matchValue: row.match_value,
    strength: row.strength,
    observationCount: row.observation_count,
    enabled: row.enabled,
    lastObservedAt: row.last_observed_at,
  }
}

export function mapInsight(row: InsightRow): Insight {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    title: row.title,
    detail: row.detail,
    importance: row.importance,
    category: row.category,
    source: row.source ? mapSourceRef(row.source) : null,
    reasonImportant: row.reason_important,
    actions: row.actions ?? [],
    dueAt: row.due_at,
    priorityScore: row.priority_score,
    completedAt: row.completed_at,
    dismissedAt: row.dismissed_at,
    forDate: row.for_date,
  }
}

export function mapLifeEvent(row: LifeEventRow): LifeEvent {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    type: row.type,
    title: row.title,
    detail: row.detail,
    occursAt: row.occurs_at,
    amount: row.amount ? { value: row.amount.value, currency: row.amount.currency } : null,
    reference: row.reference,
    trackingUrl: row.tracking_url,
    source: mapSourceRef(row.source),
    confidence: row.confidence,
    status: row.status,
  }
}

/**
 * The `stats` blob carries the domain's field names, so this is a narrowing
 * rather than a rename — but it stays explicit, so a domain field that gains a
 * sibling is a compile error here rather than an `undefined` on the screen.
 */
function mapBriefingStats(row: BriefingStatsRow): BriefingStats {
  return {
    emailsAnalyzed: row.emailsAnalyzed,
    importantCount: row.importantCount,
    meetingCount: row.meetingCount,
    deadlineCount: row.deadlineCount,
    followUpCount: row.followUpCount,
    estimatedMinutesSaved: row.estimatedMinutesSaved,
  }
}

export function mapBriefing(row: BriefingRow): Briefing {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    kind: row.kind,
    status: row.status,
    forDate: row.for_date,
    narrative: row.narrative,
    headline: row.headline,
    durationSeconds: row.duration_seconds,
    audioUrl: row.audio_url,
    audioProvider: row.audio_provider,
    generatedAt: row.generated_at,
    openedAt: row.opened_at,
    contentHash: row.content_hash,
    stats: row.stats ? mapBriefingStats(row.stats) : null,
  }
}

export function mapBriefingItem(row: BriefingItemRow): BriefingItem {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    briefingId: row.briefing_id,
    section: row.section,
    position: row.position,
    title: row.title,
    detail: row.detail,
    source: row.source ? mapSourceRef(row.source) : null,
    relatedEntityType: row.related_entity_type,
    relatedEntityId: row.related_entity_id,
    importance: row.importance,
  }
}

export function mapApprovalAction(row: ApprovalActionRow): ApprovalAction {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    type: row.type,
    status: row.status,
    what: row.what,
    why: row.why,
    source: row.source ? mapSourceRef(row.source) : null,
    payload: row.payload,
    originalPayload: row.original_payload,
    idempotencyKey: row.idempotency_key,
    expiresAt: row.expires_at,
    approvedAt: row.approved_at,
    executedAt: row.executed_at,
    rejectedAt: row.rejected_at,
    failureReason: row.failure_reason,
    attemptCount: row.attempt_count,
    resultRef: row.result_ref,
  }
}

export function mapAssistantThread(row: AssistantThreadRow): AssistantThread {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    title: row.title,
    lastMessageAt: row.last_message_at,
    messageCount: row.message_count,
  }
}

export function mapAssistantMessage(row: AssistantMessageRow): AssistantMessage {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    threadId: row.thread_id,
    role: row.role,
    content: row.content,
    citations: (row.citations ?? []).map(mapSourceRef),
    proposedApprovalId: row.proposed_approval_id,
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
    model: row.model,
    wasVoice: row.was_voice,
  }
}

function mapCaptureExtraction(row: CaptureExtractionRow): CaptureExtraction {
  return {
    title: row.title,
    summary: row.summary,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
    people: row.people ?? [],
    amount: row.amount ? { value: row.amount.value, currency: row.amount.currency } : null,
    reference: row.reference,
    keyPoints: row.key_points ?? [],
    confidence: row.confidence,
    suggestedActions: row.suggested_actions ?? [],
  }
}

export function mapCapture(row: CaptureRow): Capture {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    kind: row.kind,
    status: row.status,
    storagePath: row.storage_path,
    sourceUrl: row.source_url,
    rawText: row.raw_text,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    detectedIntent: row.detected_intent,
    extracted: row.extracted ? mapCaptureExtraction(row.extracted) : null,
    failureReason: row.failure_reason,
    analyzedAt: row.analyzed_at,
  }
}

export function mapFollowUp(row: FollowUpRow): FollowUp {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    threadId: row.thread_id,
    messageId: row.message_id,
    recipientEmail: row.recipient_email,
    recipientName: row.recipient_name,
    sentAt: row.sent_at,
    dueAt: row.due_at,
    status: row.status,
    repliedAt: row.replied_at,
    closedAt: row.closed_at,
    dismissCount: row.dismiss_count,
  }
}

export function mapSubscription(row: SubscriptionRow): Subscription {
  return {
    userId: row.user_id,
    status: row.status,
    entitlement: row.entitlement,
    productId: row.product_id,
    store: row.store,
    currentPeriodEnd: row.current_period_end,
    trialEndsAt: row.trial_ends_at,
    revenueCatCustomerId: row.revenuecat_customer_id,
    updatedAt: row.updated_at,
  }
}

export function mapPushToken(row: PushTokenRow): PushToken {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    token: row.token,
    platform: row.platform,
    deviceId: row.device_id,
    deviceName: row.device_name,
    appVersion: row.app_version,
    lastSeenAt: row.last_seen_at,
    disabledAt: row.disabled_at,
  }
}

export function mapDataExportRequest(row: DataExportRequestRow): DataExportRequest {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    storagePath: row.storage_path,
    sizeBytes: row.size_bytes,
    readyAt: row.ready_at,
    expiresAt: row.expires_at,
    failureReason: row.failure_reason,
  }
}
