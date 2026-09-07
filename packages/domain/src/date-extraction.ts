import { addLocalDays, type IsoInstant, toZonedParts, zonedTimeToUtc } from './clock.ts'

/**
 * Turkish and English date/time extraction from free text.
 *
 * This exists so a deadline can be *verified* against the source rather than
 * taken on the model's word. The pipeline runs it over the original message
 * and refuses any model-proposed deadline that this extractor cannot also
 * find — the guard behind "AI never invents a date".
 */

export interface ExtractedDate {
  /** Resolved instant in UTC. */
  at: IsoInstant
  /** Exact substring the date was read from, for the source chip. */
  quote: string
  /** Character offset of `quote` in the input. */
  index: number
  /** True when the text gave a time of day; false when only a date was found. */
  hasTime: boolean
  /** 0..1 — explicit calendar dates score higher than relative phrases. */
  confidence: number
}

const TR_MONTHS: Record<string, number> = {
  ocak: 1,
  şubat: 2,
  subat: 2,
  mart: 3,
  nisan: 4,
  mayıs: 5,
  mayis: 5,
  haziran: 6,
  temmuz: 7,
  ağustos: 8,
  agustos: 8,
  eylül: 9,
  eylul: 9,
  ekim: 10,
  kasım: 11,
  kasim: 11,
  aralık: 12,
  aralik: 12,
}

const EN_MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

/** 0 = Sunday. Turkish weekday names, with and without diacritics. */
const TR_WEEKDAYS: Record<string, number> = {
  pazar: 0,
  pazartesi: 1,
  salı: 2,
  sali: 2,
  çarşamba: 3,
  carsamba: 3,
  perşembe: 4,
  persembe: 4,
  cuma: 5,
  cumartesi: 6,
}

const EN_WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

/** Default hour for a date given with no time — end of the working day. */
const DEFAULT_HOUR = 17

function clampTime(hour: number, minute: number): { hour: number; minute: number } {
  return {
    hour: Math.max(0, Math.min(23, hour)),
    minute: Math.max(0, Math.min(59, minute)),
  }
}

function makeInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): string {
  return zonedTimeToUtc({ year, month, day, hour, minute }, timeZone).toISOString()
}

/**
 * Extract every date-like expression from `text`.
 *
 * Deliberately conservative: an expression only produces a result when the
 * text names enough to resolve it. "Yakında" and "en kısa sürede" yield
 * nothing, because a made-up deadline is worse than no deadline.
 */
export function extractDates(text: string, now: Date, timeZone: string): ExtractedDate[] {
  const results: ExtractedDate[] = []
  const nowParts = toZonedParts(now, timeZone)
  const push = (r: ExtractedDate) => {
    // Keep the highest-confidence reading of any one span.
    const clash = results.find((x) => Math.abs(x.index - r.index) < 3)
    if (!clash) results.push(r)
    else if (r.confidence > clash.confidence) Object.assign(clash, r)
  }

  const timeSuffix = String.raw`(?:\s*(?:saat\s*)?(?:at\s*)?(\d{1,2})[:.](\d{2}))?`

  // ── Explicit numeric dates: 12/09/2026, 12.09.2026, 2026-09-12 ──────────
  const numeric = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b|\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/g
  for (const m of text.matchAll(numeric)) {
    let year: number, month: number, day: number
    if (m[1]) {
      year = Number(m[1])
      month = Number(m[2])
      day = Number(m[3])
    } else {
      day = Number(m[4])
      month = Number(m[5])
      const rawYear = m[6]
      year = rawYear
        ? rawYear.length === 2
          ? 2000 + Number(rawYear)
          : Number(rawYear)
        : nowParts.year
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) continue

    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 12)
    const t = /^\s*(?:saat\s*)?(\d{1,2})[:.](\d{2})/.exec(after)
    const time = t ? clampTime(Number(t[1]), Number(t[2])) : { hour: DEFAULT_HOUR, minute: 0 }

    push({
      at: makeInstant(year, month, day, time.hour, time.minute, timeZone),
      quote: m[0] + (t ? t[0] : ''),
      index: m.index,
      hasTime: Boolean(t),
      confidence: m[6] || m[1] ? 0.95 : 0.85,
    })
  }

  // ── Named months: "12 Eylül", "12 Eylül 2026", "September 12" ───────────
  const monthNames = [...Object.keys(TR_MONTHS), ...Object.keys(EN_MONTHS)].join('|')
  const dayFirst = new RegExp(
    String.raw`\b(\d{1,2})\s+(${monthNames})(?:\s+(\d{4}))?` + timeSuffix,
    'gi',
  )
  for (const m of text.matchAll(dayFirst)) {
    const day = Number(m[1])
    const name = (m[2] ?? '').toLowerCase()
    const month = TR_MONTHS[name] ?? EN_MONTHS[name]
    if (!month || day < 1 || day > 31) continue
    const year = m[3] ? Number(m[3]) : inferYear(nowParts, month, day)
    const time =
      m[4] && m[5] ? clampTime(Number(m[4]), Number(m[5])) : { hour: DEFAULT_HOUR, minute: 0 }
    push({
      at: makeInstant(year, month, day, time.hour, time.minute, timeZone),
      quote: m[0].trim(),
      index: m.index,
      hasTime: Boolean(m[4]),
      confidence: 0.9,
    })
  }

  const monthFirst = new RegExp(String.raw`\b(${monthNames})\s+(\d{1,2})(?:,?\s+(\d{4}))?`, 'gi')
  for (const m of text.matchAll(monthFirst)) {
    const name = (m[1] ?? '').toLowerCase()
    const month = TR_MONTHS[name] ?? EN_MONTHS[name]
    const day = Number(m[2])
    if (!month || day < 1 || day > 31) continue
    const year = m[3] ? Number(m[3]) : inferYear(nowParts, month, day)
    push({
      at: makeInstant(year, month, day, DEFAULT_HOUR, 0, timeZone),
      quote: m[0].trim(),
      index: m.index,
      hasTime: false,
      confidence: 0.88,
    })
  }

  // ── Relative days: bugün / yarın / today / tomorrow ──────────────────────
  const relatives: Array<[RegExp, number]> = [
    [/\b(bugün|bugun|today)\b/gi, 0],
    [/\b(yarın|yarin|tomorrow)\b/gi, 1],
    [/\b(öbür gün|obur gun|day after tomorrow)\b/gi, 2],
  ]
  for (const [re, offset] of relatives) {
    for (const m of text.matchAll(re)) {
      const target = addLocalDays(now, offset, timeZone)
      const p = toZonedParts(target, timeZone)
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 16)
      const t = /^\s*(?:saat\s*)?(\d{1,2})[:.](\d{2})/.exec(after)
      const time = t ? clampTime(Number(t[1]), Number(t[2])) : { hour: DEFAULT_HOUR, minute: 0 }
      push({
        at: makeInstant(p.year, p.month, p.day, time.hour, time.minute, timeZone),
        quote: m[0] + (t ? t[0] : ''),
        index: m.index,
        hasTime: Boolean(t),
        confidence: t ? 0.85 : 0.7,
      })
    }
  }

  // ── Weekday references: "cuma", "önümüzdeki salı", "next Monday" ─────────
  const weekdayNames = [...Object.keys(TR_WEEKDAYS), ...Object.keys(EN_WEEKDAYS)].join('|')
  const weekdayRe = new RegExp(
    String.raw`\b(gelecek|önümüzdeki|onumuzdeki|haftaya|next)?\s*(${weekdayNames})\b` + timeSuffix,
    'gi',
  )
  for (const m of text.matchAll(weekdayRe)) {
    const name = (m[2] ?? '').toLowerCase()
    const target = TR_WEEKDAYS[name] ?? EN_WEEKDAYS[name]
    if (target === undefined) continue
    // "cuma" said on a Friday means the coming Friday, not today; an explicit
    // "önümüzdeki cuma" pushes a further week out.
    let delta = (target - nowParts.weekday + 7) % 7
    if (delta === 0) delta = 7
    if (m[1]) delta += 7

    const at = addLocalDays(now, delta, timeZone)
    const p = toZonedParts(at, timeZone)
    const time =
      m[3] && m[4] ? clampTime(Number(m[3]), Number(m[4])) : { hour: DEFAULT_HOUR, minute: 0 }
    push({
      at: makeInstant(p.year, p.month, p.day, time.hour, time.minute, timeZone),
      quote: m[0].trim(),
      index: m.index,
      hasTime: Boolean(m[3]),
      confidence: 0.65,
    })
  }

  // ── "N gün/hafta içinde", "in N days" ───────────────────────────────────
  const within = /\b(\d{1,2})\s*(gün|gun|hafta|day|days|week|weeks)\s*(içinde|icinde|sonra)?\b/gi
  for (const m of text.matchAll(within)) {
    const n = Number(m[1])
    const unit = (m[2] ?? '').toLowerCase()
    const days = unit.startsWith('hafta') || unit.startsWith('week') ? n * 7 : n
    if (!Number.isFinite(days) || days <= 0 || days > 365) continue
    const at = addLocalDays(now, days, timeZone)
    const p = toZonedParts(at, timeZone)
    push({
      at: makeInstant(p.year, p.month, p.day, DEFAULT_HOUR, 0, timeZone),
      quote: m[0].trim(),
      index: m.index,
      hasTime: false,
      confidence: 0.6,
    })
  }

  return results.sort((a, b) => a.index - b.index)
}

/**
 * A bare "12 Eylül" with no year means the next occurrence: this year if it
 * has not passed, otherwise next year.
 */
function inferYear(
  nowParts: { year: number; month: number; day: number },
  month: number,
  day: number,
): number {
  if (month > nowParts.month) return nowParts.year
  if (month < nowParts.month) return nowParts.year + 1
  return day >= nowParts.day ? nowParts.year : nowParts.year + 1
}

/**
 * The guard the AI pipeline calls before persisting a model-proposed deadline.
 *
 * Returns the matching source expression when the text really does contain
 * that instant (within `toleranceMinutes`), and `null` when it does not — in
 * which case the deadline is dropped and the item degrades to "kaynakta
 * kesinleşmiyor" rather than asserting a date nobody wrote.
 */
export function verifyDateAgainstSource(
  proposed: IsoInstant,
  sourceText: string,
  now: Date,
  timeZone: string,
  toleranceMinutes = 24 * 60,
): ExtractedDate | null {
  const target = new Date(proposed).getTime()
  if (!Number.isFinite(target)) return null
  const found = extractDates(sourceText, now, timeZone)
  let best: ExtractedDate | null = null
  let bestDelta = Number.POSITIVE_INFINITY
  for (const candidate of found) {
    const delta = Math.abs(new Date(candidate.at).getTime() - target)
    if (delta <= toleranceMinutes * 60_000 && delta < bestDelta) {
      best = candidate
      bestDelta = delta
    }
  }
  return best
}
