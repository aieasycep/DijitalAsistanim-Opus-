import type { Capture, CaptureKind, CaptureStatus } from '@da/domain'
import {
  captureUploadUrlRequestSchema,
  captureUploadUrlResponseSchema,
  createCaptureRequestSchema,
} from '@da/validation'
import { z } from 'zod'
import { parseRequest, rowOf } from '../http'
import { mapCapture } from '../mappers'
import type { Filter } from '../supabase'
import type { CaptureRow, CaptureUploadTarget, EndpointContext } from '../types'

const captureEnvelopeSchema = z.object({ capture: rowOf<CaptureRow>() })

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
      const request = parseRequest(captureUploadUrlRequestSchema, input)
      const result = await ctx.http.callFunction(
        'capture-upload-url',
        request,
        captureUploadUrlResponseSchema,
        { retry: false },
      )
      return {
        uploadUrl: result.uploadUrl,
        storagePath: result.storagePath,
        expiresIn: result.expiresIn,
      }
    },

    async create(input) {
      const request = parseRequest(createCaptureRequestSchema, {
        kind: input.kind,
        storagePath: input.storagePath ?? null,
        sourceUrl: input.sourceUrl ?? null,
        rawText: input.rawText ?? null,
        mimeType: input.mimeType ?? null,
        sizeBytes: input.sizeBytes ?? null,
      })
      const result = await ctx.http.callFunction('capture-create', request, captureEnvelopeSchema, {
        retry: false,
      })
      return mapCapture(result.capture)
    },

    async get(captureId) {
      const row = await ctx.db.selectOne<CaptureRow>('captures', {
        filters: [{ column: 'id', op: 'eq', value: captureId }],
      })
      return row ? mapCapture(row) : null
    },

    async list(input = {}) {
      const filters: Filter[] = []
      if (input.status) filters.push({ column: 'status', op: 'eq', value: input.status })
      const rows = await ctx.db.selectMany<CaptureRow>('captures', {
        filters,
        order: { column: 'created_at', ascending: false },
        limit: input.limit ?? 50,
      })
      return rows.map(mapCapture)
    },
  }
}
