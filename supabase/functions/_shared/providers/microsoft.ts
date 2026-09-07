import { AppError } from '../domain.ts'
import { fetchWithLimits, withRetry } from '../http.ts'

/**
 * Microsoft Graph client — Outlook mail, calendar and To Do.
 *
 * Mirrors the Google module's shape so the sync and executor functions can
 * treat the two providers uniformly. Graph differs in three ways that matter:
 * delta links carry their own paging, bodies come back as HTML by default, and
 * there is no token revocation endpoint.
 */

const GRAPH = 'https://graph.microsoft.com/v1.0'

function call<T>(
  url: string,
  accessToken: string,
  init: RequestInit = {},
  errorCode:
    'mail_provider_unavailable' | 'calendar_provider_unavailable' = 'mail_provider_unavailable',
): Promise<T> {
  return withRetry(async () => {
    const { response, body } = await fetchWithLimits(
      url.startsWith('http') ? url : `${GRAPH}${url}`,
      {
        ...init,
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
          // Ask Graph for plain text bodies; the HTML alternative would have to
          // be stripped anyway and is several times larger.
          prefer: 'outlook.body-content-type="text"',
          ...(init.headers ?? {}),
        },
      },
      { timeoutMs: 30_000, errorCode },
    )

    if (response.status === 401) throw new AppError('oauth_expired', { detail: 'graph_401' })
    if (response.status === 403) throw new AppError('oauth_scope_missing', { detail: 'graph_403' })
    if (response.status === 404) throw new AppError('not_found', { detail: 'graph_404' })
    if (response.status === 429) throw new AppError('rate_limited', { detail: 'graph_429' })
    if (response.status === 412) throw new AppError('sync_conflict', { detail: 'graph_etag' })
    if (!response.ok) throw new AppError(errorCode, { detail: `graph_${response.status}` })

    return body ? (JSON.parse(body) as T) : ({} as T)
  })
}

// ── Identity ─────────────────────────────────────────────────────────────────

export interface MicrosoftProfile {
  email: string
  name: string | null
}

export async function getProfile(accessToken: string): Promise<MicrosoftProfile> {
  const data = await call<{ mail?: string; userPrincipalName?: string; displayName?: string }>(
    '/me?$select=mail,userPrincipalName,displayName',
    accessToken,
  )
  const email = data.mail ?? data.userPrincipalName
  if (!email) throw new AppError('oauth_failed', { detail: 'no_email_on_graph_me' })
  return { email: email.toLowerCase(), name: data.displayName ?? null }
}

// ── Mail ─────────────────────────────────────────────────────────────────────

export interface GraphRecipient {
  emailAddress?: { address?: string; name?: string }
}

export interface GraphMessage {
  id: string
  conversationId?: string
  internetMessageId?: string
  subject?: string
  bodyPreview?: string
  body?: { contentType?: string; content?: string }
  from?: GraphRecipient
  sender?: GraphRecipient
  toRecipients?: GraphRecipient[]
  ccRecipients?: GraphRecipient[]
  receivedDateTime?: string
  sentDateTime?: string
  isRead?: boolean
  isDraft?: boolean
  hasAttachments?: boolean
  webLink?: string
  categories?: string[]
  internetMessageHeaders?: Array<{ name: string; value: string }>
}

export interface MessageListResult {
  messages: GraphMessage[]
  /** Follow for the next page of the same delta round. */
  nextLink: string | null
  /** Persist as the cursor for the next incremental sync. */
  deltaLink: string | null
  expired: boolean
}

const MESSAGE_FIELDS =
  'id,conversationId,internetMessageId,subject,bodyPreview,body,from,sender,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,isDraft,hasAttachments,webLink'

/**
 * List inbox messages, either from scratch (a time window) or incrementally
 * (a stored delta link).
 */
export async function listMessages(
  accessToken: string,
  options: { deltaLink?: string | null; nextLink?: string | null; since?: string } = {},
): Promise<MessageListResult> {
  let url: string
  if (options.nextLink) url = options.nextLink
  else if (options.deltaLink) url = options.deltaLink
  else {
    const filter = options.since
      ? `&$filter=${encodeURIComponent(`receivedDateTime ge ${options.since}`)}`
      : ''
    url = `/me/mailFolders/inbox/messages/delta?$select=${MESSAGE_FIELDS}&$top=50${filter}`
  }

  try {
    const data = await call<{
      value?: GraphMessage[]
      '@odata.nextLink'?: string
      '@odata.deltaLink'?: string
    }>(url, accessToken)

    return {
      // Drafts are never product-relevant.
      messages: (data.value ?? []).filter((m) => !m.isDraft),
      nextLink: data['@odata.nextLink'] ?? null,
      deltaLink: data['@odata.deltaLink'] ?? null,
      expired: false,
    }
  } catch (error) {
    // Graph replies 410 Gone when a delta token has aged out.
    if (error instanceof AppError && error.detail?.includes('410')) {
      return { messages: [], nextLink: null, deltaLink: null, expired: true }
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
  externalUrl: string | null
  internetMessageId: string | null
}

function addressOf(recipient: GraphRecipient | undefined): string {
  return (recipient?.emailAddress?.address ?? '').trim().toLowerCase()
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

export function decodeMessage(message: GraphMessage): DecodedMessage {
  const headers: Record<string, string> = {}
  for (const header of message.internetMessageHeaders ?? []) {
    headers[header.name.toLowerCase()] = header.value
  }

  const rawBody = message.body?.content ?? ''
  const isHtml = (message.body?.contentType ?? '').toLowerCase() === 'html'
  const text = isHtml ? stripHtml(rawBody) : rawBody.trim()

  const from = message.from ?? message.sender

  return {
    fromEmail: addressOf(from),
    fromName: from?.emailAddress?.name ?? null,
    to: (message.toRecipients ?? []).map(addressOf).filter(Boolean),
    cc: (message.ccRecipients ?? []).map(addressOf).filter(Boolean),
    subject: message.subject ?? '',
    bodyText: text || (message.bodyPreview ?? ''),
    sentAt: message.receivedDateTime ?? message.sentDateTime ?? new Date().toISOString(),
    headers,
    externalUrl: message.webLink ?? null,
    internetMessageId: message.internetMessageId ?? null,
  }
}

export interface SendMailInput {
  to: string[]
  cc: string[]
  subject: string
  body: string
  /** Graph message id being replied to; enables native threading. */
  replyToMessageId: string | null
}

export async function sendMail(
  accessToken: string,
  input: SendMailInput,
): Promise<{ id: string | null }> {
  const recipients = (addresses: string[]) =>
    addresses.map((address) => ({ emailAddress: { address } }))

  if (input.replyToMessageId) {
    // `createReply` then `send` keeps the conversation intact and preserves the
    // quoted history, which a fresh `sendMail` would lose.
    const draft = await call<{ id: string }>(
      `/me/messages/${encodeURIComponent(input.replyToMessageId)}/createReply`,
      accessToken,
      { method: 'POST', body: JSON.stringify({}) },
    )
    await call(`/me/messages/${encodeURIComponent(draft.id)}`, accessToken, {
      method: 'PATCH',
      body: JSON.stringify({
        body: { contentType: 'Text', content: input.body },
        toRecipients: recipients(input.to),
        ...(input.cc.length > 0 ? { ccRecipients: recipients(input.cc) } : {}),
      }),
    })
    await call(`/me/messages/${encodeURIComponent(draft.id)}/send`, accessToken, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    return { id: draft.id }
  }

  await call('/me/sendMail', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: { contentType: 'Text', content: input.body },
        toRecipients: recipients(input.to),
        ...(input.cc.length > 0 ? { ccRecipients: recipients(input.cc) } : {}),
      },
      saveToSentItems: true,
    }),
  })
  // `sendMail` returns 202 with no body, so there is no id to report.
  return { id: null }
}

// ── Calendar ─────────────────────────────────────────────────────────────────

export interface GraphEvent {
  id: string
  subject?: string
  bodyPreview?: string
  location?: { displayName?: string }
  start?: { dateTime?: string; timeZone?: string }
  end?: { dateTime?: string; timeZone?: string }
  isAllDay?: boolean
  isCancelled?: boolean
  organizer?: GraphRecipient
  attendees?: Array<{
    emailAddress?: { address?: string; name?: string }
    status?: { response?: string }
    type?: string
  }>
  onlineMeeting?: { joinUrl?: string }
  onlineMeetingUrl?: string
  webLink?: string
  lastModifiedDateTime?: string
  '@odata.etag'?: string
}

export interface EventListResult {
  events: GraphEvent[]
  nextLink: string | null
  deltaLink: string | null
  expired: boolean
}

export async function listEvents(
  accessToken: string,
  options: {
    deltaLink?: string | null
    nextLink?: string | null
    start?: string
    end?: string
  } = {},
): Promise<EventListResult> {
  let url: string
  if (options.nextLink) url = options.nextLink
  else if (options.deltaLink) url = options.deltaLink
  else {
    const start = options.start ?? new Date().toISOString()
    const end = options.end ?? new Date(Date.now() + 30 * 86_400_000).toISOString()
    url = `/me/calendarView/delta?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}&$top=100`
  }

  try {
    const data = await call<{
      value?: GraphEvent[]
      '@odata.nextLink'?: string
      '@odata.deltaLink'?: string
    }>(url, accessToken, {}, 'calendar_provider_unavailable')

    return {
      events: data.value ?? [],
      nextLink: data['@odata.nextLink'] ?? null,
      deltaLink: data['@odata.deltaLink'] ?? null,
      expired: false,
    }
  } catch (error) {
    if (error instanceof AppError && error.detail?.includes('410')) {
      return { events: [], nextLink: null, deltaLink: null, expired: true }
    }
    throw error
  }
}

export function createEvent(
  accessToken: string,
  input: {
    subject: string
    body: string | null
    location: string | null
    startsAt: string
    endsAt: string
    timeZone: string
    attendees: string[]
  },
): Promise<GraphEvent> {
  return call<GraphEvent>(
    '/me/events',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        subject: input.subject,
        body: input.body ? { contentType: 'Text', content: input.body } : undefined,
        location: input.location ? { displayName: input.location } : undefined,
        start: { dateTime: input.startsAt.replace(/Z$/, ''), timeZone: input.timeZone },
        end: { dateTime: input.endsAt.replace(/Z$/, ''), timeZone: input.timeZone },
        attendees: input.attendees.map((address) => ({
          emailAddress: { address },
          type: 'required',
        })),
      }),
    },
    'calendar_provider_unavailable',
  )
}

export function updateEvent(
  accessToken: string,
  input: {
    eventId: string
    changes: { subject?: string; location?: string | null; startsAt?: string; endsAt?: string }
    timeZone: string
    etag: string | null
  },
): Promise<GraphEvent> {
  const body: Record<string, unknown> = {}
  if (input.changes.subject !== undefined) body.subject = input.changes.subject
  if (input.changes.location !== undefined) {
    body.location = { displayName: input.changes.location ?? '' }
  }
  if (input.changes.startsAt) {
    body.start = { dateTime: input.changes.startsAt.replace(/Z$/, ''), timeZone: input.timeZone }
  }
  if (input.changes.endsAt) {
    body.end = { dateTime: input.changes.endsAt.replace(/Z$/, ''), timeZone: input.timeZone }
  }

  return call<GraphEvent>(
    `/me/events/${encodeURIComponent(input.eventId)}`,
    accessToken,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
      // Graph answers 412 when the ETag no longer matches, which is what turns
      // a blind overwrite into a detectable conflict.
      ...(input.etag ? { headers: { 'if-match': input.etag } } : {}),
    },
    'calendar_provider_unavailable',
  )
}

export function conferenceUrlOf(event: GraphEvent): string | null {
  return event.onlineMeeting?.joinUrl ?? event.onlineMeetingUrl ?? null
}

// ── To Do ────────────────────────────────────────────────────────────────────

export interface GraphTodoTask {
  id: string
  title?: string
  body?: { content?: string }
  dueDateTime?: { dateTime?: string; timeZone?: string }
  status?: string
  lastModifiedDateTime?: string
  completedDateTime?: { dateTime?: string }
}

export async function listTodoLists(
  accessToken: string,
): Promise<Array<{ id: string; displayName: string }>> {
  const data = await call<{ value?: Array<{ id: string; displayName: string }> }>(
    '/me/todo/lists',
    accessToken,
  )
  return data.value ?? []
}

export async function listTodoTasks(accessToken: string, listId: string): Promise<GraphTodoTask[]> {
  const data = await call<{ value?: GraphTodoTask[] }>(
    `/me/todo/lists/${encodeURIComponent(listId)}/tasks?$top=100`,
    accessToken,
  )
  return data.value ?? []
}

export function createTodoTask(
  accessToken: string,
  listId: string,
  input: { title: string; notes: string | null; dueAt: string | null; timeZone: string },
): Promise<GraphTodoTask> {
  return call<GraphTodoTask>(`/me/todo/lists/${encodeURIComponent(listId)}/tasks`, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      body: input.notes ? { contentType: 'text', content: input.notes } : undefined,
      dueDateTime: input.dueAt
        ? { dateTime: input.dueAt.replace(/Z$/, ''), timeZone: input.timeZone }
        : undefined,
    }),
  })
}

// ── Change notifications ─────────────────────────────────────────────────────

/**
 * Create a Graph change subscription.
 *
 * Graph caps mail subscriptions at roughly three days, so the renewal job has
 * to run well before expiry; without it the app silently stops receiving
 * pushes and falls back to polling.
 */
export function createSubscription(
  accessToken: string,
  input: { resource: string; notificationUrl: string; clientState: string; expiresAt: string },
): Promise<{ id: string; expirationDateTime: string }> {
  return call<{ id: string; expirationDateTime: string }>('/subscriptions', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      changeType: 'created,updated',
      notificationUrl: input.notificationUrl,
      resource: input.resource,
      expirationDateTime: input.expiresAt,
      clientState: input.clientState,
    }),
  })
}

export function renewSubscription(
  accessToken: string,
  subscriptionId: string,
  expiresAt: string,
): Promise<{ id: string; expirationDateTime: string }> {
  return call<{ id: string; expirationDateTime: string }>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    accessToken,
    { method: 'PATCH', body: JSON.stringify({ expirationDateTime: expiresAt }) },
  )
}
