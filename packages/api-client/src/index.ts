import { type ApiClientConfig } from './config'
import { createDemoClient } from './demo/demo-client'
import { createAccountsApi, type AccountsApi } from './endpoints/accounts'
import { createApprovalsApi, type ApprovalsApi } from './endpoints/approvals'
import { createAssistantApi, type AssistantApi } from './endpoints/assistant'
import { createBriefingsApi, type BriefingsApi } from './endpoints/briefings'
import { createCapturesApi, type CapturesApi } from './endpoints/captures'
import { createCommitmentsApi, type CommitmentsApi } from './endpoints/commitments'
import { createFollowUpsApi, type FollowUpsApi } from './endpoints/followups'
import { createMeetingsApi, type MeetingsApi } from './endpoints/meetings'
import { createNotificationsApi, type NotificationsApi } from './endpoints/notifications'
import { createPeopleApi, type PeopleApi } from './endpoints/people'
import { createPlanApi, type PlanApi } from './endpoints/plan'
import { createPrivacyApi, type PrivacyApi } from './endpoints/privacy'
import { createReferralApi, type ReferralApi } from './endpoints/referral'
import { createRemindersApi, type RemindersApi } from './endpoints/reminders'
import { createReplyApi, type ReplyApi } from './endpoints/reply'
import { createRulesApi, type RulesApi } from './endpoints/rules'
import { createSearchApi, type SearchApi } from './endpoints/search'
import { createSettingsApi, type SettingsApi } from './endpoints/settings'
import { createSubscriptionApi, type SubscriptionApi } from './endpoints/subscription'
import { createSyncApi, type SyncApi } from './endpoints/sync'
import { createThreadsApi, type ThreadsApi } from './endpoints/threads'
import { createTodayApi, type TodayApi } from './endpoints/today'
import { createHttp } from './http'
import { createDb, createSupabase } from './supabase'
import type { EndpointContext } from './types'

/** The whole backend surface, in one typed object. Nothing else talks to it. */
export interface ApiClient {
  mode: 'live' | 'demo'
  accounts: AccountsApi
  sync: SyncApi
  today: TodayApi
  briefings: BriefingsApi
  threads: ThreadsApi
  reply: ReplyApi
  followUps: FollowUpsApi
  commitments: CommitmentsApi
  plan: PlanApi
  meetings: MeetingsApi
  assistant: AssistantApi
  search: SearchApi
  captures: CapturesApi
  approvals: ApprovalsApi
  reminders: RemindersApi
  people: PeopleApi
  rules: RulesApi
  settings: SettingsApi
  subscription: SubscriptionApi
  referral: ReferralApi
  privacy: PrivacyApi
  notifications: NotificationsApi
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  if (config.mode === 'demo') return createDemoClient(config)

  const http = createHttp(config)
  const db = createDb(createSupabase(config))
  const ctx: EndpointContext = { http, db, config }

  return {
    mode: 'live',
    accounts: createAccountsApi(ctx),
    sync: createSyncApi(ctx),
    today: createTodayApi(ctx),
    briefings: createBriefingsApi(ctx),
    threads: createThreadsApi(ctx),
    reply: createReplyApi(ctx),
    followUps: createFollowUpsApi(ctx),
    commitments: createCommitmentsApi(ctx),
    plan: createPlanApi(ctx),
    meetings: createMeetingsApi(ctx),
    assistant: createAssistantApi(ctx),
    search: createSearchApi(ctx),
    captures: createCapturesApi(ctx),
    approvals: createApprovalsApi(ctx),
    reminders: createRemindersApi(ctx),
    people: createPeopleApi(ctx),
    rules: createRulesApi(ctx),
    settings: createSettingsApi(ctx),
    subscription: createSubscriptionApi(ctx),
    referral: createReferralApi(ctx),
    privacy: createPrivacyApi(ctx),
    notifications: createNotificationsApi(ctx),
  }
}

export { qk, type QueryKey } from './query-keys'
export { DEFAULT_TIMEOUT_MS, type ApiClientConfig } from './config'
export {
  createHttp,
  parseRequest,
  rowOf,
  type CallOptions,
  type Http,
  type ResponseSchema,
} from './http'
export { createDb, createSupabase, type Db, type Filter, type SelectOptions } from './supabase'
export { createDemoStore, type DemoStore } from './demo/fixtures'

export type {
  AccountsApi,
  ApprovalsApi,
  AssistantApi,
  BriefingsApi,
  CapturesApi,
  CommitmentsApi,
  FollowUpsApi,
  MeetingsApi,
  NotificationsApi,
  PeopleApi,
  PlanApi,
  PrivacyApi,
  ReferralApi,
  RemindersApi,
  ReplyApi,
  RulesApi,
  SearchApi,
  SettingsApi,
  SubscriptionApi,
  SyncApi,
  ThreadsApi,
  TodayApi,
}

export type {
  AssistantAnswer,
  BriefingWithItems,
  CaptureUploadTarget,
  DayLoadSummary,
  DayPlan,
  DeleteHistoryResult,
  EndpointContext,
  ExportStatusView,
  FlowFilter,
  MeetingAttendeeBrief,
  MeetingPrepBrief,
  NudgeDraft,
  OAuthStartResult,
  PlanConflict,
  PlanFreeBlock,
  PlanRange,
  PlanSuggestion,
  PostMeetingNoteInput,
  PostMeetingNoteResult,
  ReferralSummary,
  ReplyDraft,
  ReplyDraftInput,
  ScopeGroup,
  SearchHit,
  SearchPage,
  ThreadDetail,
  ThreadFilter,
  TodayFeed,
  WeekPlan,
} from './types'

export * from './mappers'
