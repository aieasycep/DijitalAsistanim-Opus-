import {
  searchRequest,
  searchTypeSchema,
  type SearchHit,
  type SearchHitType,
  type SearchResponse,
} from '@da/validation'
import { dbError, requireUser, serviceClient } from '../_shared/db.ts'
import { jsonResponse, parseBody, serveFunction } from '../_shared/http.ts'
import { searchMemory } from '../_shared/memory.ts'

/** How many rows each keyword scan may contribute before the merge. */
const PER_SOURCE_LIMIT = 10

/** Longest snippet worth sending; the screen renders two lines of it. */
const SNIPPET_LENGTH = 240

/**
 * The kinds the keyword pass scans a table for. The rest of the union —
 * a notification, a note the user typed — exists only inside the memory index,
 * which carries its own relevance.
 */
type KeywordKind = Extract<
  SearchHitType,
  'email' | 'calendar_event' | 'contact' | 'life_event' | 'commitment' | 'task' | 'capture'
>

/**
 * Base relevance for a keyword match, by kind.
 *
 * A keyword hit has no measured relevance — it either matched the pattern or
 * it did not — so the kinds are ranked against each other instead: a mail or a
 * meeting the user named is a better answer than a commitment that merely
 * mentions the word. A memory hit carries a real score and overrides these
 * whenever it is higher.
 */
const KEYWORD_SCORE: Record<KeywordKind, number> = {
  email: 0.5,
  calendar_event: 0.5,
  contact: 0.45,
  life_event: 0.45,
  commitment: 0.4,
  task: 0.4,
  capture: 0.35,
}

interface ThreadRow {
  id: string
  subject: string | null
  summary: string | null
  last_message_at: string | null
}

interface EventRow {
  id: string
  title: string | null
  location: string | null
  starts_at: string | null
}

interface ContactRow {
  id: string
  name: string | null
  email: string
  last_contact_at: string | null
}

interface LifeEventRow {
  id: string
  title: string | null
  detail: string | null
  reference: string | null
  occurs_at: string | null
}

interface CommitmentRow {
  id: string
  text: string | null
  person_name: string | null
  due_at: string | null
}

interface TaskRow {
  id: string
  title: string | null
  notes: string | null
  due_at: string | null
}

interface CaptureRow {
  id: string
  raw_text: string | null
  source_url: string | null
  extracted: unknown
  created_at: string
}

/**
 * PostgREST parses `or(...)` as a comma-separated list of filters, so a search
 * term containing a comma, a dot or a parenthesis would be split into
 * fragments and quietly change what the query means. Quoting the value keeps
 * the term whole; the backslashes escape the quoting itself, not the LIKE
 * wildcards, which are escaped before this is called.
 */
function orValue(pattern: string): string {
  return `"${pattern.replace(/["\\]/g, (char) => `\\${char}`)}"`
}

/** The `title` an extraction found, when the model actually found one. */
function extractedTitle(extracted: unknown): string | null {
  if (typeof extracted !== 'object' || extracted === null) return null
  const title = (extracted as Record<string, unknown>).title
  return typeof title === 'string' && title.trim().length > 0 ? title.trim() : null
}

function snippetOf(value: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, SNIPPET_LENGTH)
}

/**
 * Cross-entity search.
 *
 * Two passes are merged: the memory index (semantic when embeddings are
 * configured, full-text otherwise) and a direct keyword scan over the entities
 * a user thinks of by name — a person, a flight, a payment. The response says
 * which mode answered rather than implying semantic search is always on.
 *
 * Both passes obey the caller's `types` filter. They used to disagree: the
 * keyword scan narrowed and the memory pass did not, so asking for mail alone
 * still returned meetings and commitments the index happened to remember.
 */
serveFunction('search', async ({ request, origin }) => {
  const user = await requireUser(request)
  const body = await parseBody(request, searchRequest)
  const term = body.query.trim()
  // Backslash first: it is the LIKE escape character, so escaping it after the
  // wildcards would escape the escapes.
  const pattern = `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
  const quoted = orValue(pattern)
  const client = serviceClient()

  // An empty filter means every type; otherwise the request's own union narrows it.
  const requested = new Set<string>(body.types)
  const wants = (type: SearchHitType): boolean => requested.size === 0 || requested.has(type)

  const none = () => Promise.resolve({ data: [], error: null })

  const [memory, threads, events, contacts, life, commitments, tasks, captures, captureTitles] =
    await Promise.all([
      searchMemory(user.id, term, body.limit),
      wants('email')
        ? client
            .from('email_threads')
            .select('id, subject, summary, last_message_at')
            .eq('user_id', user.id)
            .is('suppressed_at', null)
            .ilike('subject', pattern)
            .order('last_message_at', { ascending: false })
            .limit(PER_SOURCE_LIMIT)
        : none(),
      wants('calendar_event')
        ? client
            .from('calendar_events')
            .select('id, title, location, starts_at')
            .eq('user_id', user.id)
            .neq('status', 'cancelled')
            .ilike('title', pattern)
            .order('starts_at', { ascending: false })
            .limit(PER_SOURCE_LIMIT)
        : none(),
      wants('contact')
        ? client
            .from('contacts')
            .select('id, name, email, last_contact_at')
            .eq('user_id', user.id)
            .is('deleted_at', null)
            .or(`name.ilike.${quoted},email.ilike.${quoted}`)
            .order('last_contact_at', { ascending: false, nullsFirst: false })
            .limit(PER_SOURCE_LIMIT)
        : none(),
      wants('life_event')
        ? client
            .from('life_events')
            .select('id, title, detail, reference, occurs_at')
            .eq('user_id', user.id)
            .neq('status', 'dismissed')
            .or(`title.ilike.${quoted},reference.ilike.${quoted}`)
            .order('occurs_at', { ascending: false, nullsFirst: false })
            .limit(PER_SOURCE_LIMIT)
        : none(),
      wants('commitment')
        ? client
            .from('commitments')
            .select('id, text, person_name, due_at')
            .eq('user_id', user.id)
            .ilike('text', pattern)
            .order('due_at', { ascending: false, nullsFirst: false })
            .limit(PER_SOURCE_LIMIT)
        : none(),
      wants('task')
        ? client
            .from('tasks')
            .select('id, title, notes, due_at')
            .eq('user_id', user.id)
            .ilike('title', pattern)
            .order('due_at', { ascending: false, nullsFirst: false })
            .limit(PER_SOURCE_LIMIT)
        : none(),
      wants('capture')
        ? client
            .from('captures')
            .select('id, raw_text, source_url, extracted, created_at')
            .eq('user_id', user.id)
            .is('deleted_at', null)
            .or(`raw_text.ilike.${quoted},source_url.ilike.${quoted}`)
            .order('created_at', { ascending: false })
            .limit(PER_SOURCE_LIMIT)
        : none(),
      // A photo or a PDF carries no raw text of its own: what it says lives in
      // the extraction, so the title the analysis found is searched separately
      // rather than being unreachable.
      wants('capture')
        ? client
            .from('captures')
            .select('id, raw_text, source_url, extracted, created_at')
            .eq('user_id', user.id)
            .is('deleted_at', null)
            .ilike('extracted->>title', pattern)
            .order('created_at', { ascending: false })
            .limit(PER_SOURCE_LIMIT)
        : none(),
    ])

  for (const result of [
    threads,
    events,
    contacts,
    life,
    commitments,
    tasks,
    captures,
    captureTitles,
  ]) {
    if (result.error) throw dbError(result.error)
  }

  /**
   * Merged by `type:id`, so a record found by both passes is one row.
   *
   * The keyword pass goes in first on purpose: it reads the record's own title
   * (a subject, a person's name), while a memory chunk only knows the label of
   * whatever it was extracted from — for a mail that is the sender, which as a
   * result headline reads as the wrong answer to the question asked. Memory
   * still contributes its measured relevance, which is what does the ranking.
   */
  const merged = new Map<string, SearchHit>()
  const add = (hit: SearchHit): void => {
    if (hit.title.length === 0) return
    const key = `${hit.type}:${hit.id}`
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, hit)
      return
    }
    merged.set(key, {
      ...existing,
      snippet: existing.snippet.length > 0 ? existing.snippet : hit.snippet,
      occurredAt: existing.occurredAt ?? hit.occurredAt,
      score: Math.max(existing.score, hit.score),
    })
  }

  for (const row of (threads.data ?? []) as ThreadRow[]) {
    add({
      id: row.id,
      type: 'email',
      title: snippetOf(row.subject),
      snippet: snippetOf(row.summary),
      occurredAt: row.last_message_at,
      score: KEYWORD_SCORE.email,
      sourceLabel: 'email_threads',
    })
  }

  for (const row of (events.data ?? []) as EventRow[]) {
    add({
      id: row.id,
      type: 'calendar_event',
      title: snippetOf(row.title),
      snippet: snippetOf(row.location),
      occurredAt: row.starts_at,
      score: KEYWORD_SCORE.calendar_event,
      sourceLabel: 'calendar_events',
    })
  }

  for (const row of (contacts.data ?? []) as ContactRow[]) {
    add({
      id: row.id,
      type: 'contact',
      title: snippetOf(row.name ?? row.email),
      snippet: snippetOf(row.email),
      occurredAt: row.last_contact_at,
      score: KEYWORD_SCORE.contact,
      sourceLabel: 'contacts',
    })
  }

  for (const row of (life.data ?? []) as LifeEventRow[]) {
    add({
      id: row.id,
      type: 'life_event',
      title: snippetOf(row.title),
      snippet: snippetOf(row.detail ?? row.reference),
      occurredAt: row.occurs_at,
      score: KEYWORD_SCORE.life_event,
      sourceLabel: 'life_events',
    })
  }

  for (const row of (commitments.data ?? []) as CommitmentRow[]) {
    add({
      id: row.id,
      type: 'commitment',
      title: snippetOf(row.text),
      snippet: snippetOf(row.person_name),
      occurredAt: row.due_at,
      score: KEYWORD_SCORE.commitment,
      sourceLabel: 'commitments',
    })
  }

  for (const row of (tasks.data ?? []) as TaskRow[]) {
    add({
      id: row.id,
      type: 'task',
      title: snippetOf(row.title),
      snippet: snippetOf(row.notes),
      occurredAt: row.due_at,
      score: KEYWORD_SCORE.task,
      sourceLabel: 'tasks',
    })
  }

  const captureRows = [
    ...((captures.data ?? []) as CaptureRow[]),
    ...((captureTitles.data ?? []) as CaptureRow[]),
  ]
  for (const row of captureRows) {
    const text = snippetOf(row.raw_text)
    add({
      id: row.id,
      type: 'capture',
      title: extractedTitle(row.extracted) ?? (text.length > 0 ? text : (row.source_url ?? '')),
      snippet: text.length > 0 ? text : snippetOf(row.source_url),
      occurredAt: row.created_at,
      score: KEYWORD_SCORE.capture,
      sourceLabel: 'captures',
    })
  }

  for (const hit of memory.hits) {
    const type = searchTypeSchema.safeParse(hit.sourceType)
    // A chunk whose source type the contract does not know is not renderable:
    // the screen would have no label, no icon and no destination for it.
    if (!type.success || !wants(type.data)) continue
    add({
      id: hit.sourceId,
      type: type.data,
      title: snippetOf(hit.sourceLabel),
      snippet: snippetOf(hit.content),
      occurredAt: hit.occurredAt,
      score: hit.score,
      sourceLabel: 'memory_chunks',
    })
  }

  const results = [...merged.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    // Same relevance: the more recent record is the better answer, and a record
    // with no date at all sorts last rather than randomly.
    return (b.occurredAt ?? '').localeCompare(a.occurredAt ?? '')
  })

  const payload: SearchResponse = {
    results: results.slice(0, body.limit),
    mode: memory.mode,
  }

  return jsonResponse(payload, 200, origin)
})
