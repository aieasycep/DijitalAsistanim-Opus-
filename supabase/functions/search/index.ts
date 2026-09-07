import { searchRequestSchema } from '@da/validation'
import { requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { searchMemory } from '../_shared/memory.ts'

/**
 * Cross-entity search.
 *
 * Two passes are merged: the memory index (semantic when embeddings are
 * configured, full-text otherwise) and a direct keyword scan over the entities
 * a user thinks of by name — a person, a flight, a payment. The response says
 * which mode answered rather than implying semantic search is always on.
 */
serveFunction('search', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, searchRequestSchema)
  const term = body.query.trim()
  const pattern = `%${term.replace(/[%_]/g, (c) => `\\${c}`)}%`
  const client = serviceClient()

  // An empty filter means every type; otherwise the request's own union narrows it.
  const requested = new Set<string>(body.types)
  const wants = (type: string): boolean => requested.size === 0 || requested.has(type)

  const [memory, threads, events, contacts, life, commitments] = await Promise.all([
    searchMemory(user.id, term, body.limit),
    wants('email')
      ? client
          .from('email_threads')
          .select('id, subject, summary, last_message_at')
          .eq('user_id', user.id)
          .is('suppressed_at', null)
          .ilike('subject', pattern)
          .order('last_message_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [], error: null }),
    wants('calendar_event')
      ? client
          .from('calendar_events')
          .select('id, title, location, starts_at')
          .eq('user_id', user.id)
          .ilike('title', pattern)
          .order('starts_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [], error: null }),
    wants('contact')
      ? client
          .from('contacts')
          .select('id, name, email, last_contact_at')
          .eq('user_id', user.id)
          .is('deleted_at', null)
          .or(`name.ilike.${pattern},email.ilike.${pattern}`)
          .limit(10)
      : Promise.resolve({ data: [], error: null }),
    wants('life_event')
      ? client
          .from('life_events')
          .select('id, title, detail, type, occurs_at, reference')
          .eq('user_id', user.id)
          .or(`title.ilike.${pattern},reference.ilike.${pattern}`)
          .limit(10)
      : Promise.resolve({ data: [], error: null }),
    wants('commitment')
      ? client
          .from('commitments')
          .select('id, text, person_name, due_at')
          .eq('user_id', user.id)
          .ilike('text', pattern)
          .limit(10)
      : Promise.resolve({ data: [], error: null }),
  ])

  interface Row {
    id: string
    type: string
    title: string
    snippet: string
    occurredAt: string | null
    score: number
    sourceLabel: string
  }

  const results: Row[] = []
  const seen = new Set<string>()
  const push = (row: Row) => {
    const key = `${row.type}:${row.id}`
    if (seen.has(key)) return
    seen.add(key)
    results.push(row)
  }

  // Memory hits rank highest: they carry an actual relevance score.
  for (const hit of memory.hits) {
    push({
      id: hit.sourceId,
      type: hit.sourceType,
      title: hit.sourceLabel,
      snippet: hit.content.slice(0, 240),
      occurredAt: hit.occurredAt,
      score: hit.score,
      sourceLabel: hit.sourceLabel,
    })
  }

  for (const row of threads.data ?? []) {
    push({
      id: row.id as string,
      type: 'email',
      title: (row.subject as string | null) ?? '',
      snippet: (row.summary as string | null) ?? '',
      occurredAt: row.last_message_at as string | null,
      score: 0.5,
      sourceLabel: 'Mail',
    })
  }
  for (const row of events.data ?? []) {
    push({
      id: row.id as string,
      type: 'calendar_event',
      title: (row.title as string | null) ?? '',
      snippet: (row.location as string | null) ?? '',
      occurredAt: row.starts_at as string | null,
      score: 0.5,
      sourceLabel: 'Takvim',
    })
  }
  for (const row of contacts.data ?? []) {
    push({
      id: row.id as string,
      type: 'contact',
      title: (row.name as string | null) ?? (row.email as string),
      snippet: row.email as string,
      occurredAt: row.last_contact_at as string | null,
      score: 0.45,
      sourceLabel: 'Kişi',
    })
  }
  for (const row of life.data ?? []) {
    push({
      id: row.id as string,
      type: 'life_event',
      title: (row.title as string | null) ?? '',
      snippet: (row.detail as string | null) ?? (row.reference as string | null) ?? '',
      occurredAt: row.occurs_at as string | null,
      score: 0.45,
      sourceLabel: String(row.type ?? ''),
    })
  }
  for (const row of commitments.data ?? []) {
    push({
      id: row.id as string,
      type: 'commitment',
      title: (row.text as string | null) ?? '',
      snippet: (row.person_name as string | null) ?? '',
      occurredAt: row.due_at as string | null,
      score: 0.4,
      sourceLabel: 'Taahhüt',
    })
  }

  results.sort((a, b) => b.score - a.score)

  return jsonResponse(
    { results: results.slice(0, body.limit), nextCursor: null, mode: memory.mode },
    200,
    origin,
  )
})
