import { AppError } from '../domain.ts'
import { fetchWithLimits, withRetry } from '../http.ts'

/**
 * Google Workspace client — Gmail, Calendar and Tasks.
 *
 * Every method takes an already-resolved access token: this module never sees
 * a refresh token and never decides when to refresh, which keeps credential
 * handling in exactly one place (`_shared/oauth.ts`).
 */

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'
const CALENDAR = 'https://www.googleapis.com/calendar/v3'
const TASKS = 'https://tasks.googleapis.com/tasks/v1'

function call<T>(
  url: string,
  accessToken: string,
  init: RequestInit = {},
  errorCode:
    'mail_provider_unavailable' | 'calendar_provider_unavailable' = 'mail_provider_unavailable',
): Promise<T> {
  return withRetry(async () => {
    const { response, body } = await fetchWithLimits(
      url,
      {
        ...init,
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
          ...(init.headers ?? {}),
        },
      },
      { timeoutMs: 30_000, errorCode },
    )

    if (response.status === 401) throw new AppError('oauth_expired', { detail: 'google_401' })
    if (response.status === 403) {
      // Google returns 403 both for a missing scope and for a rate limit; the
      // body distinguishes them, and the two need very different handling.
      const isRateLimit =
        body.includes('rateLimitExceeded') || body.includes('userRateLimitExceeded')
      throw isRateLimit
        ? new AppError('rate_limited', { detail: 'google_quota' })
        : new AppError('oauth_scope_missing', { detail: 'google_403' })
    }
    if (response.status === 404) throw new AppError('not_found', { detail: 'google_404' })
    if (response.status === 429) throw new AppError('rate_limited', { detail: 'google_429' })
    if (!response.ok) throw new AppError(errorCode, { detail: `google_${response.status}` })

    return body ? (JSON.parse(body) as T) : ({} as T)
  })
}

// ── Identity ─────────────────────────────────────────────────────────────────

export interface GoogleProfile {
  email: string
  name: string | null
  picture: string | null
}

export async function getProfile(accessToken: string): Promise<GoogleProfile> {
  const data = await call<{ email?: string; name?: string; picture?: string }>(
    'https://www.googleapis.com/oauth2/v3/userinfo',
    accessToken,
  )
  if (!data.email) throw new AppError('oauth_failed', { detail: 'no_email_in_userinfo' })
  return { email: data.email, name: data.name ?? null, picture: data.picture ?? null }
}

// ── Gmail ────────────────────────────────────────────────────────────────────

export interface GmailMessageRef {
  id: string
  threadId: string
}

export interface GmailListResult {
  messages: GmailMessageRef[]
  nextPageToken: string | null
  /** Delta cursor for incremental sync. */
  historyId: string | null
}

/**
 * List message ids matching a Gmail search query.
 *
 * Only ids come back here; bodies are fetched separately and lazily, because
 * a full-body list of a busy inbox is both slow and far more data than the
 * triage stage needs.
 */
export async function listMessages(
  accessToken: string,
  options: { query?: string; pageToken?: string | null; maxResults?: number } = {},
): Promise<GmailListResult> {
  const params = new URLSearchParams({
    maxResults: String(options.maxResults ?? 100),
    // Drafts, spam and trash are never product-relevant.
    q: options.query ?? '-in:spam -in:trash -in:drafts',
  })
  if (options.pageToken) params.set('pageToken', options.pageToken)

  const data = await call<{
    messages?: GmailMessageRef[]
    nextPageToken?: string
    resultSizeEstimate?: number
  }>(`${GMAIL}/messages?${params.toString()}`, accessToken)

  const profile = await call<{ historyId?: string }>(`${GMAIL}/profile`, accessToken)

  return {
    messages: data.messages ?? [],
    nextPageToken: data.nextPageToken ?? null,
    historyId: profile.historyId ?? null,
  }
}

export interface GmailHeader {
  name: string
  value: string
}

export interface GmailPart {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: GmailHeader[]
  body?: { size?: number; data?: string; attachmentId?: string }
  parts?: GmailPart[]
}

export interface GmailMessage {
  id: string
  threadId: string
  labelIds: string[]
  snippet: string
  internalDate: string
  payload?: GmailPart
  sizeEstimate?: number
}

export function getMessage(accessToken: string, id: string): Promise<GmailMessage> {
  return call<GmailMessage>(`${GMAIL}/messages/${id}?format=full`, accessToken)
}

/** Fetch many messages with bounded concurrency, so a large inbox does not
 *  trip Google's per-user rate limit or exhaust the function's sockets. */
export async function getMessages(
  accessToken: string,
  ids: string[],
  concurrency = 5,
): Promise<GmailMessage[]> {
  const out: GmailMessage[] = []
  for (let i = 0; i < ids.length; i += concurrency) {
    const batch = ids.slice(i, i + concurrency)
    const results = await Promise.allSettled(batch.map((id) => getMessage(accessToken, id)))
    for (const result of results) {
      // One unreadable message must not abort a whole sync page.
      if (result.status === 'fulfilled') out.push(result.value)
    }
  }
  return out
}

export interface GmailHistoryResult {
  addedMessageIds: string[]
  deletedMessageIds: string[]
  historyId: string | null
  /** True when the stored cursor was too old and a full resync is needed. */
  expired: boolean
}

/** Incremental sync via the history API. */
export async function listHistory(
  accessToken: string,
  startHistoryId: string,
): Promise<GmailHistoryResult> {
  try {
    const data = await call<{
      history?: Array<{
        messagesAdded?: Array<{ message: GmailMessageRef }>
        messagesDeleted?: Array<{ message: GmailMessageRef }>
      }>
      historyId?: string
    }>(
      `${GMAIL}/history?startHistoryId=${encodeURIComponent(startHistoryId)}&historyTypes=messageAdded&historyTypes=messageDeleted`,
      accessToken,
    )

    const added = new Set<string>()
    const deleted = new Set<string>()
    for (const entry of data.history ?? []) {
      for (const item of entry.messagesAdded ?? []) added.add(item.message.id)
      for (const item of entry.messagesDeleted ?? []) deleted.add(item.message.id)
    }

    return {
      addedMessageIds: [...added],
      deletedMessageIds: [...deleted],
      historyId: data.historyId ?? null,
      expired: false,
    }
  } catch (error) {
    // A 404 means the history id has aged out of Gmail's window; the caller
    // has to fall back to a bounded full list rather than silently syncing
    // nothing from then on.
    if (error instanceof AppError && error.code === 'not_found') {
      return { addedMessageIds: [], deletedMessageIds: [], historyId: null, expired: true }
    }
    throw error
  }
}

export interface DecodedMessage {
  fromEmail: string
  fromName: string | null
  to: string[]
  cc: string[]
  subject: string
  bodyText: string
  sentAt: string
  headers: Record<string, string>
  attachments: Array<{ externalId: string; filename: string; mimeType: string; sizeBytes: number }>
}

function decodeBase64Url(data: string): string {
  const normalised = data.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalised + '='.repeat((4 - (normalised.length % 4)) % 4)
  try {
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return ''
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function parseAddressList(raw: string): string[] {
  return raw
    .split(',')
    .map((part) => {
      const angled = /<([^>]+)>/.exec(part)
      return (angled?.[1] ?? part).trim().toLowerCase()
    })
    .filter((address) => address.includes('@'))
}

function parseFrom(raw: string): { email: string; name: string | null } {
  const angled = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(raw)
  if (angled) {
    const name = (angled[1] ?? '').replace(/^["']|["']$/g, '').trim()
    return { email: (angled[2] ?? '').trim().toLowerCase(), name: name || null }
  }
  return { email: raw.trim().toLowerCase(), name: null }
}

/** Walk the MIME tree, preferring text/plain and falling back to stripped HTML. */
function collectBody(part: GmailPart | undefined, acc: { plain: string[]; html: string[] }): void {
  if (!part) return
  const mime = part.mimeType ?? ''
  if (mime === 'text/plain' && part.body?.data) acc.plain.push(decodeBase64Url(part.body.data))
  else if (mime === 'text/html' && part.body?.data) acc.html.push(decodeBase64Url(part.body.data))
  for (const child of part.parts ?? []) collectBody(child, acc)
}

function collectAttachments(part: GmailPart | undefined, acc: DecodedMessage['attachments']): void {
  if (!part) return
  if (part.filename && part.body?.attachmentId) {
    acc.push({
      externalId: part.body.attachmentId,
      filename: part.filename,
      mimeType: part.mimeType ?? 'application/octet-stream',
      sizeBytes: part.body.size ?? 0,
    })
  }
  for (const child of part.parts ?? []) collectAttachments(child, acc)
}

export function decodeMessage(message: GmailMessage): DecodedMessage {
  const headers: Record<string, string> = {}
  for (const header of message.payload?.headers ?? []) {
    headers[header.name.toLowerCase()] = header.value
  }

  const body = { plain: [] as string[], html: [] as string[] }
  collectBody(message.payload, body)
  const attachments: DecodedMessage['attachments'] = []
  collectAttachments(message.payload, attachments)

  const from = parseFrom(headers['from'] ?? '')
  const text =
    body.plain.length > 0 ? body.plain.join('\n').trim() : stripHtml(body.html.join('\n'))

  return {
    fromEmail: from.email,
    fromName: from.name,
    to: parseAddressList(headers['to'] ?? ''),
    cc: parseAddressList(headers['cc'] ?? ''),
    subject: headers['subject'] ?? '',
    bodyText: text || message.snippet,
    sentAt: new Date(Number(message.internalDate)).toISOString(),
    headers,
    attachments,
  }
}

export interface SendMessageInput {
  to: string[]
  cc: string[]
  subject: string
  body: string
  /** RFC-822 Message-ID being replied to, for correct threading. */
  inReplyTo: string | null
  threadId: string | null
  fromEmail: string
}

function encodeRfc2047(value: string): string {
  // Non-ASCII headers (Turkish subjects) must be encoded or they arrive mojibake.
  if (/^[\x20-\x7E]*$/.test(value)) return value
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `=?UTF-8?B?${btoa(binary)}?=`
}

export function sendMessage(
  accessToken: string,
  input: SendMessageInput,
): Promise<{ id: string; threadId: string }> {
  const lines = [
    `From: ${input.fromEmail}`,
    `To: ${input.to.join(', ')}`,
    ...(input.cc.length > 0 ? [`Cc: ${input.cc.join(', ')}`] : []),
    `Subject: ${encodeRfc2047(input.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    ...(input.inReplyTo
      ? [`In-Reply-To: ${input.inReplyTo}`, `References: ${input.inReplyTo}`]
      : []),
    '',
  ]

  const bodyBytes = new TextEncoder().encode(input.body)
  let bodyBinary = ''
  for (const byte of bodyBytes) bodyBinary += String.fromCharCode(byte)
  const raw = `${lines.join('\r\n')}\r\n${btoa(bodyBinary)}`

  const encoded = btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  return call<{ id: string; threadId: string }>(`${GMAIL}/messages/send`, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      raw: encoded,
      ...(input.threadId ? { threadId: input.threadId } : {}),
    }),
  })
}

/** Register a Pub/Sub watch so Gmail pushes changes instead of being polled. */
export async function watchMailbox(
  accessToken: string,
  topicName: string,
): Promise<{ historyId: string; expiration: string }> {
  const data = await call<{ historyId?: string; expiration?: string }>(
    `${GMAIL}/watch`,
    accessToken,
    { method: 'POST', body: JSON.stringify({ topicName, labelIds: ['INBOX'] }) },
  )
  return {
    historyId: data.historyId ?? '',
    expiration: data.expiration ?? String(Date.now() + 7 * 86_400_000),
  }
}

// ── Calendar ─────────────────────────────────────────────────────────────────

export interface GoogleEvent {
  id: string
  status?: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  updated?: string
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string; timeZone?: string }
  organizer?: { email?: string; self?: boolean }
  attendees?: Array<{
    email?: string
    displayName?: string
    responseStatus?: string
    organizer?: boolean
    self?: boolean
  }>
  hangoutLink?: string
  conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> }
}

export interface EventListResult {
  events: GoogleEvent[]
  nextPageToken: string | null
  nextSyncToken: string | null
  /** True when the sync token expired and a full re-read is required. */
  expired: boolean
}

export async function listEvents(
  accessToken: string,
  options: {
    calendarId?: string
    timeMin?: string
    timeMax?: string
    syncToken?: string | null
    pageToken?: string | null
  } = {},
): Promise<EventListResult> {
  const calendarId = encodeURIComponent(options.calendarId ?? 'primary')
  const params = new URLSearchParams({ maxResults: '250', singleEvents: 'true' })

  if (options.syncToken) {
    // A sync token cannot be combined with a time window.
    params.set('syncToken', options.syncToken)
  } else {
    if (options.timeMin) params.set('timeMin', options.timeMin)
    if (options.timeMax) params.set('timeMax', options.timeMax)
    params.set('orderBy', 'startTime')
  }
  if (options.pageToken) params.set('pageToken', options.pageToken)

  try {
    const data = await call<{
      items?: GoogleEvent[]
      nextPageToken?: string
      nextSyncToken?: string
    }>(
      `${CALENDAR}/calendars/${calendarId}/events?${params.toString()}`,
      accessToken,
      {},
      'calendar_provider_unavailable',
    )
    return {
      events: data.items ?? [],
      nextPageToken: data.nextPageToken ?? null,
      nextSyncToken: data.nextSyncToken ?? null,
      expired: false,
    }
  } catch (error) {
    if (error instanceof AppError && error.code === 'not_found' && options.syncToken) {
      return { events: [], nextPageToken: null, nextSyncToken: null, expired: true }
    }
    throw error
  }
}

export interface CreateEventInput {
  calendarId?: string
  summary: string
  description: string | null
  location: string | null
  startsAt: string
  endsAt: string
  timeZone: string
  attendees: string[]
}

export function createEvent(accessToken: string, input: CreateEventInput): Promise<GoogleEvent> {
  const calendarId = encodeURIComponent(input.calendarId ?? 'primary')
  return call<GoogleEvent>(
    `${CALENDAR}/calendars/${calendarId}/events`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        summary: input.summary,
        description: input.description ?? undefined,
        location: input.location ?? undefined,
        start: { dateTime: input.startsAt, timeZone: input.timeZone },
        end: { dateTime: input.endsAt, timeZone: input.timeZone },
        attendees: input.attendees.map((email) => ({ email })),
      }),
    },
    'calendar_provider_unavailable',
  )
}

export interface UpdateEventInput {
  calendarId?: string
  eventId: string
  changes: {
    summary?: string
    location?: string | null
    startsAt?: string
    endsAt?: string
  }
  timeZone: string
  /** Optimistic concurrency: the ETag observed when the change was proposed. */
  etag: string | null
}

export function updateEvent(accessToken: string, input: UpdateEventInput): Promise<GoogleEvent> {
  const calendarId = encodeURIComponent(input.calendarId ?? 'primary')
  const body: Record<string, unknown> = {}
  if (input.changes.summary !== undefined) body.summary = input.changes.summary
  if (input.changes.location !== undefined) body.location = input.changes.location ?? ''
  if (input.changes.startsAt) {
    body.start = { dateTime: input.changes.startsAt, timeZone: input.timeZone }
  }
  if (input.changes.endsAt) body.end = { dateTime: input.changes.endsAt, timeZone: input.timeZone }

  return call<GoogleEvent>(
    `${CALENDAR}/calendars/${calendarId}/events/${encodeURIComponent(input.eventId)}`,
    accessToken,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
      // If-Match makes the update fail rather than clobber a concurrent edit.
      ...(input.etag ? { headers: { 'if-match': input.etag } } : {}),
    },
    'calendar_provider_unavailable',
  )
}

/** The join URL, when the event actually has one. Never synthesised. */
export function conferenceUrlOf(event: GoogleEvent): string | null {
  if (event.hangoutLink) return event.hangoutLink
  const entry = event.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')
  return entry?.uri ?? null
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export interface GoogleTask {
  id: string
  title?: string
  notes?: string
  due?: string
  status?: string
  updated?: string
  completed?: string
}

export async function listTaskLists(
  accessToken: string,
): Promise<Array<{ id: string; title: string }>> {
  const data = await call<{ items?: Array<{ id: string; title: string }> }>(
    `${TASKS}/users/@me/lists`,
    accessToken,
  )
  return data.items ?? []
}

export async function listTasks(accessToken: string, listId: string): Promise<GoogleTask[]> {
  const data = await call<{ items?: GoogleTask[] }>(
    `${TASKS}/lists/${encodeURIComponent(listId)}/tasks?showCompleted=true&showHidden=false&maxResults=100`,
    accessToken,
  )
  return data.items ?? []
}

export function createTask(
  accessToken: string,
  listId: string,
  input: { title: string; notes: string | null; dueAt: string | null },
): Promise<GoogleTask> {
  return call<GoogleTask>(`${TASKS}/lists/${encodeURIComponent(listId)}/tasks`, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      notes: input.notes ?? undefined,
      // Google Tasks only stores a date, not a time — sending an instant is
      // accepted but the time component is dropped.
      due: input.dueAt ?? undefined,
    }),
  })
}
