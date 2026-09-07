import { z } from 'zod'

/**
 * Shared leaf schemas. Defined once so an "ISO instant" means the same thing
 * in an AI response, an API request and a database row.
 */

export const isoInstantSchema = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Expected an ISO-8601 instant' })

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')

export const localTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm')

export const uuidSchema = z.string().uuid()

export const emailSchema = z.string().email().max(320).toLowerCase()

export const timeZoneSchema = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz })
      return true
    } catch {
      return false
    }
  },
  { message: 'Unknown IANA time zone' },
)

/** 0..1, used for every model-reported confidence. */
export const confidenceSchema = z.number().min(0).max(1)

/**
 * A URL the app is willing to open or fetch. `javascript:`, `data:` and
 * `file:` are rejected here rather than at the call site so every consumer
 * inherits the same guard.
 */
export const safeUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((u) => {
    try {
      const parsed = new URL(u)
      return parsed.protocol === 'https:' || parsed.protocol === 'http:'
    } catch {
      return false
    }
  }, 'Only http(s) URLs are allowed')

export const moneySchema = z.object({
  value: z.number().finite(),
  /** ISO-4217. */
  currency: z.string().length(3).toUpperCase(),
})

export const paginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().max(500).nullish(),
})

export type Pagination = z.infer<typeof paginationSchema>
