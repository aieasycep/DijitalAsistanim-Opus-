import type { Capture, CaptureKind, CaptureStatus } from '@da/domain'
import {
  captureCreateRequest,
  captureCreateResponse,
  captureExtraction,
  captureUploadUrlRequest,
  captureUploadUrlResponse,
} from '@da/validation'
import { parseRequest } from '../http'
import { mapCapture } from '../mappers'
import type { Filter } from '../supabase'
import type { CaptureRow, CaptureUploadTarget, EndpointContext } from '../types'

/**
 * A row the function already selected and RLS already scoped. The contract
 * pins the envelope around it; the mapper narrows the row itself.
 */
function rowOf<T>(value: Record<string, unknown>): T {
  return value as unknown as T
}

/**
 * A capture, with its extraction read through the contract.
 *
 * `captures.extracted` is a JSONB blob, not a set of columns: `capture-create`
 * writes it with the domain's own field names, exactly as the column comment
 * in migration 0008 says, and the demo client produces the same shape. The
 * row-side type in this package had guessed the column convention
 * (`starts_at`, `key_points`, `suggested_actions`), so the mapper read those
 * three back as `undefined` — the capture screen showed a summary with no
 * date, no key points and no actions. The blob is therefore parsed with the
 * schema both sides now share, and the rest of the row — which really is
 * columns — still goes through the mapper.
 *
 * `captureExtraction` also drops a claim whose verbatim quote is missing, so a
 * row written before the quotes existed loses its unverified amount rather
 * than presenting it as something the source said.
 */
function toCapture(row: CaptureRow): Capture {
  const extracted = captureExtraction.safeParse(row.extracted)
  return { ...mapCapture(row), extracted: extracted.success ? extracted.data : null }
}

export interface CreateCaptureInput {
  kind: CaptureKind
  storagePath?: string | null
  sourceUrl?: string | null
  rawText?: string | null
  mimeType?: string | null
  sizeBytes?: number | null
}

export interface CapturesApi {
  uploadUrl(input: {
    filename: string
    mimeType: string
    sizeBytes: number
  }): Promise<CaptureUploadTarget>
  create(input: CreateCaptureInput): Promise<Capture>
  get(captureId: string): Promise<Capture | null>
  list(input?: { status?: CaptureStatus; limit?: number }): Promise<Capture[]>
}

export function createCapturesApi(ctx: EndpointContext): CapturesApi {
  return {
    async uploadUrl(input) {
      const request = parseRequest(captureUploadUrlRequest, input)
      const result = await ctx.http.callFunction(
        'capture-upload-url',
        request,
        captureUploadUrlResponse,
        { retry: false },
      )
      return {
        uploadUrl: result.uploadUrl,
        storagePath: result.storagePath,
        expiresIn: result.expiresIn,
      }
    },

    async create(input) {
      // A capture with no storage path, no URL and no text is the row the
      // table refuses; the contract refuses it here, before the network.
      const request = parseRequest(captureCreateRequest, {
        kind: input.kind,
        storagePath: input.storagePath ?? null,
        sourceUrl: input.sourceUrl ?? null,
        rawText: input.rawText ?? null,
        mimeType: input.mimeType ?? null,
        sizeBytes: input.sizeBytes ?? null,
      })
      const result = await ctx.http.callFunction('capture-create', request, captureCreateResponse, {
        retry: false,
      })
      return toCapture(rowOf<CaptureRow>(result.capture))
    },

    async get(captureId) {
      const row = await ctx.db.selectOne<CaptureRow>('captures', {
        filters: [{ column: 'id', op: 'eq', value: captureId }],
      })
      return row ? toCapture(row) : null
    },

    async list(input = {}) {
      const filters: Filter[] = []
      if (input.status) filters.push({ column: 'status', op: 'eq', value: input.status })
      const rows = await ctx.db.selectMany<CaptureRow>('captures', {
        filters,
        order: { column: 'created_at', ascending: false },
        limit: input.limit ?? 50,
      })
      return rows.map(toCapture)
    },
  }
}
