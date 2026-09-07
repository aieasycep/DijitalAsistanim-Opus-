import { AppError, type SourceType } from './domain.ts'
import { dbError, serviceClient } from './db.ts'
import { fetchWithLimits } from './http.ts'

/**
 * Semantic memory.
 *
 * Two deliberate constraints:
 *
 *  - What is stored is a *normalised summary*, never a raw message body.
 *    Memory is what the assistant is allowed to reason over later, and keeping
 *    whole mailboxes in it would multiply both the privacy surface and the
 *    retrieval noise.
 *  - Embeddings are optional. Without an embedding provider the same search
 *    runs through PostgreSQL full-text, and the caller is told which path
 *    answered so the UI can be honest rather than silently degrading.
 */

export interface MemoryChunkInput {
  userId: string
  /** A summary or normalised extract. Never a full body. */
  content: string
  sourceType: SourceType
  sourceId: string
  sourceLabel: string
  occurredAt: string
  personIds?: string[]
  topic?: string | null
}

/** Rough token estimate; Turkish averages a little under 4 chars per token. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.6)
}

export async function upsertMemoryChunk(input: MemoryChunkInput): Promise<void> {
  const content = input.content.trim()
  // A one-line fragment costs a row and an embedding without helping retrieval.
  if (content.length < 20) return

  const embedding = await embedText(content)

  const { error } = await serviceClient().from('memory_chunks').upsert(
    {
      user_id: input.userId,
      content,
      source_type: input.sourceType,
      source_id: input.sourceId,
      source_label: input.sourceLabel,
      occurred_at: input.occurredAt,
      person_ids: input.personIds ?? [],
      topic: input.topic ?? null,
      embedding,
      token_count: estimateTokens(content),
    },
    { onConflict: 'user_id,source_type,source_id' },
  )

  if (error) throw dbError(error)
}

function embeddingConfig(): { url: string; apiKey: string; model: string } | null {
  const provider = Deno.env.get('EMBEDDING_PROVIDER')?.trim()
  const apiKey = Deno.env.get('EMBEDDING_API_KEY')?.trim()
  if (!provider || !apiKey) return null

  const model = Deno.env.get('EMBEDDING_MODEL')?.trim() ?? 'text-embedding-3-small'
  // Only OpenAI-compatible embedding endpoints are supported; that covers
  // OpenAI itself and the several providers that mirror its shape.
  const url =
    provider === 'openai'
      ? 'https://api.openai.com/v1/embeddings'
      : (Deno.env.get('EMBEDDING_URL')?.trim() ?? '')

  return url ? { url, apiKey, model } : null
}

export function isEmbeddingConfigured(): boolean {
  return embeddingConfig() !== null
}

/** Returns null when no provider is configured — a supported state, not an error. */
export async function embedText(text: string): Promise<number[] | null> {
  const config = embeddingConfig()
  if (!config) return null

  try {
    const { response, body } = await fetchWithLimits(
      config.url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
        // Embedding models have their own input ceiling; 8k chars is well inside
        // every current one and far more than a summary needs.
        body: JSON.stringify({ model: config.model, input: text.slice(0, 8000) }),
      },
      { timeoutMs: 20_000, errorCode: 'ai_unavailable' },
    )

    if (!response.ok) return null

    const parsed = JSON.parse(body) as { data?: Array<{ embedding?: number[] }> }
    const vector = parsed.data?.[0]?.embedding
    return Array.isArray(vector) && vector.length > 0 ? vector : null
  } catch {
    // Search still works without embeddings, so a provider outage degrades the
    // ranking rather than failing the request.
    return null
  }
}

export interface MemoryHit {
  id: string
  content: string
  sourceType: string
  sourceId: string
  sourceLabel: string
  occurredAt: string | null
  score: number
}

export interface MemorySearchResult {
  hits: MemoryHit[]
  mode: 'semantic' | 'keyword'
}

export async function searchMemory(
  userId: string,
  query: string,
  limit = 10,
): Promise<MemorySearchResult> {
  const embedding = await embedText(query)

  const { data, error } = await serviceClient().rpc('search_memory', {
    p_user_id: userId,
    p_query: query,
    p_embedding: embedding,
    p_match_count: limit,
  })

  if (error) throw dbError(error)

  const rows = (data ?? []) as Array<{
    id: string
    content: string
    source_type: string
    source_id: string
    source_label: string | null
    occurred_at: string | null
    score: number | string
    mode: string
  }>

  return {
    hits: rows.map((row) => ({
      id: row.id,
      content: row.content,
      sourceType: row.source_type,
      sourceId: row.source_id,
      sourceLabel: row.source_label ?? row.source_type,
      occurredAt: row.occurred_at,
      score: typeof row.score === 'string' ? Number(row.score) : row.score,
    })),
    mode: rows[0]?.mode === 'semantic' ? 'semantic' : 'keyword',
  }
}

/** Remove every memory chunk derived from one source record. */
export async function deleteMemoryForSource(
  userId: string,
  sourceType: SourceType,
  sourceId: string,
): Promise<void> {
  const { error } = await serviceClient()
    .from('memory_chunks')
    .delete()
    .eq('user_id', userId)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
  if (error) throw dbError(error)
}

/** Guard used by the assistant before it claims a citation is grounded. */
export function assertGrounded(hits: MemoryHit[], citedIds: string[]): string[] {
  const known = new Set(hits.map((hit) => hit.sourceId))
  const invented = citedIds.filter((id) => !known.has(id))
  if (invented.length > 0 && citedIds.length > 0 && invented.length === citedIds.length) {
    throw new AppError('ai_invalid_output', { detail: 'all_citations_fabricated' })
  }
  return invented
}
