import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  formatAxisDay,
  formatAxisHour,
  formatDate,
  formatDateTime,
  formatRelative,
} from '../format.ts'
import { ADMIN_ROLES } from '../permissions.ts'
import {
  ABSENT_LABEL_TR,
  HIDDEN_LABEL_TR,
  REDACTION_MESSAGES_TR,
  REVEAL_DENIAL_MESSAGES_TR,
  baseRedactionLevel,
  canSeeIndividuals,
  formatMinutesRemainingTr,
  hidden,
  isUuid,
  redactEmail,
  redactEmailFor,
  renderRedacted,
  revealed,
  safeIdentifier,
  shortId,
  userRefFor,
} from '../redact.ts'

/**
 * Redaction: the default the whole product is sold on.
 *
 * The database applies `bo_redact_email()` and `bo_identifier()` to everything
 * it projects. These helpers exist for the handful of values the application
 * composes itself, and they must behave identically — a heading that echoed a
 * searched-for address in full would undo the view that redacted it. The last
 * block of this file reads the SQL and checks the two definitions still agree.
 */

describe('redactEmail — first character, three bullets, domain', () => {
  it('matches the shape bo_redact_email() produces', () => {
    expect(redactEmail('yasemin@example.com')).toBe('y•••@example.com')
    expect(redactEmail('a@b.co')).toBe('a•••@b.co')
  })

  it('returns null rather than echoing anything that is not an address', () => {
    expect(redactEmail(null)).toBeNull()
    expect(redactEmail(undefined)).toBeNull()
    expect(redactEmail('')).toBeNull()
    expect(redactEmail('not-an-address')).toBeNull()
    expect(redactEmail('@example.com')).toBeNull()
    expect(redactEmail('nobody@')).toBeNull()
  })

  it('never contains the local part beyond its first character', () => {
    const redacted = redactEmail('confidential.person@example.com')
    expect(redacted).toBe('c•••@example.com')
    expect(redacted).not.toContain('onfidential')
  })
})

describe('safeIdentifier — the shape guard from bo_identifier()', () => {
  it('passes a token-shaped identifier through unchanged', () => {
    expect(safeIdentifier('email_message')).toBe('email_message')
    expect(safeIdentifier('sync.gmail:messages/2026')).toBe('sync.gmail:messages/2026')
    expect(safeIdentifier('  padded  ')).toBe('padded')
  })

  it('collapses anything sentence-shaped or address-shaped', () => {
    expect(safeIdentifier('Fatura hatırlatması')).toBe('unstructured')
    expect(safeIdentifier('someone@example.com')).toBe('unstructured')
    expect(safeIdentifier('has space')).toBe('unstructured')
    expect(safeIdentifier('_leading')).toBe('unstructured')
    expect(safeIdentifier('x'.repeat(129))).toBe('unstructured')
  })

  it('returns null for nothing at all', () => {
    expect(safeIdentifier(null)).toBeNull()
    expect(safeIdentifier('   ')).toBeNull()
  })
})

describe('identifiers', () => {
  it('recognises a uuid and refuses anything else', () => {
    expect(isUuid('3f2a1c44-0000-4000-8000-000000000001')).toBe(true)
    expect(isUuid('3f2a1c44-0000-4000-8000-00000000000')).toBe(false)
    expect(isUuid('not-a-uuid')).toBe(false)
    expect(isUuid(null)).toBe(false)
  })

  it('shortens long ids for a dense table and leaves short ones alone', () => {
    expect(shortId('3f2a1c44-0000-4000-8000-000000000001')).toBe('3f2a…0001')
    expect(shortId('short')).toBe('short')
  })
})

describe('role-level redaction — the analyst sees no individuals', () => {
  it('puts only the analyst on aggregates', () => {
    for (const role of ADMIN_ROLES) {
      const expected = role === 'analyst' ? 'aggregate' : 'metadata'
      expect(baseRedactionLevel(role)).toBe(expected)
      expect(canSeeIndividuals(role)).toBe(role !== 'analyst')
    }
  })

  it('hides even a redacted address from the analyst', () => {
    expect(redactEmailFor('support', 'yasemin@example.com')).toBe('y•••@example.com')
    expect(redactEmailFor('analyst', 'yasemin@example.com')).toBeNull()
  })

  it('hides the user reference from the analyst and validates it for everyone else', () => {
    const id = '3f2a1c44-0000-4000-8000-000000000001'
    expect(userRefFor('support', id)).toBe(id)
    expect(userRefFor('analyst', id)).toBeNull()
    expect(userRefFor('support', 'not-a-uuid')).toBeNull()
    expect(userRefFor('support', null)).toBeNull()
  })
})

describe('the redacted value', () => {
  it('renders the value when revealed and the Turkish placeholder when not', () => {
    expect(renderRedacted(revealed('Fatura'))).toBe('Fatura')
    expect(renderRedacted(hidden<string>())).toBe(HIDDEN_LABEL_TR)
    expect(HIDDEN_LABEL_TR).toBe('Gizli')
    expect(ABSENT_LABEL_TR).toBe('—')
  })

  it('has a Turkish sentence for every reason it can refuse', () => {
    for (const message of Object.values(REDACTION_MESSAGES_TR)) {
      expect(message.length).toBeGreaterThan(0)
    }
    for (const message of Object.values(REVEAL_DENIAL_MESSAGES_TR)) {
      expect(message.length).toBeGreaterThan(0)
    }
  })

  it('counts a grant down in Turkish', () => {
    expect(formatMinutesRemainingTr(0)).toBe('süresi doldu')
    expect(formatMinutesRemainingTr(43)).toBe('43 dakika')
    expect(formatMinutesRemainingTr(120)).toBe('2 saat')
    expect(formatMinutesRemainingTr(125)).toBe('2 saat 5 dakika')
  })
})

describe('parity with the SQL definitions', () => {
  const sql = readFileSync(
    fileURLToPath(
      new URL('../../../../../supabase/migrations/0017_backoffice.sql', import.meta.url),
    ),
    'utf8',
  )

  it('redacts an address the same way bo_redact_email() does', () => {
    // `left(raw, 1) || repeat(chr(8226), 3) || '@' || split_part(raw, '@', 2)`
    expect(sql).toContain("left(raw, 1) || repeat(chr(8226), 3) || '@' || split_part(raw, '@', 2)")
    // chr(8226) is U+2022 BULLET — the character used here.
    expect(String.fromCharCode(8226)).toBe('•')
    expect(redactEmail('yasemin@example.com')).toBe(
      `y${String.fromCharCode(8226).repeat(3)}@example.com`,
    )
  })

  it('guards identifiers with the same pattern bo_identifier() uses', () => {
    expect(sql).toContain("'^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$'")
    expect(sql).toContain("else 'unstructured'")
  })
})

// ===========================================================================
// Nothing content-shaped survives a formatter
//
// The database is the first guarantee: the `bo_*` views have no content column
// to project, so a subject line has nowhere to come from. These tests are the
// second — the handful of application-side helpers that a value passes through
// on its way to a screen, checked against a corpus of exactly the things this
// product promises never to render.
// ===========================================================================

/** A subject, a body fragment, a name, an address, a phone, a meeting. */
const CONTENT = [
  'Fatura hatırlatması: Eylül ayı ödemeniz',
  'Merhaba Yasemin, ekteki sözleşmeyi bugün inceleyebilir misiniz?',
  'Yasemin Demir',
  'yasemin.demir@example.com',
  '+90 532 000 00 00',
  'Toplantı: Perşembe 14:00, Levent ofis',
] as const

/** Every substring of `value` of exactly `length` characters. */
function fragments(value: string, length: number): readonly string[] {
  const out: string[] = []
  for (let start = 0; start + length <= value.length; start += 1) {
    out.push(value.slice(start, start + length))
  }
  return out
}

describe('a content-shaped value cannot pass through a formatter', () => {
  it('collapses every one of them to `unstructured`', () => {
    for (const value of CONTENT) {
      expect(safeIdentifier(value)).toBe('unstructured')
    }
  })

  it('renders none of them as a date, a time or a chart tick', () => {
    for (const value of CONTENT) {
      expect(formatDateTime(value)).toBe(ABSENT_LABEL_TR)
      expect(formatDate(value)).toBe(ABSENT_LABEL_TR)
      expect(formatRelative(value)).toBe(ABSENT_LABEL_TR)
      expect(formatAxisDay(value)).toBe(ABSENT_LABEL_TR)
      expect(formatAxisHour(value)).toBe(ABSENT_LABEL_TR)
    }
  })

  it('refuses to turn any of them into a user reference', () => {
    for (const value of CONTENT) {
      expect(isUuid(value)).toBe(false)
      expect(userRefFor('support', value)).toBeNull()
      expect(userRefFor('super_admin', value)).toBeNull()
    }
  })

  it('renders a hidden value as the placeholder, never as the value', () => {
    for (const value of CONTENT) {
      const rendered = renderRedacted(hidden<string>())
      expect(rendered).toBe(HIDDEN_LABEL_TR)
      expect(rendered).not.toContain(value)
    }
  })

  it('leaks no fragment of any of them through the whole formatter set', () => {
    for (const value of CONTENT) {
      const rendered = [
        safeIdentifier(value),
        formatDateTime(value),
        formatDate(value),
        formatRelative(value),
        formatAxisDay(value),
        formatAxisHour(value),
        renderRedacted(hidden<string>()),
        String(userRefFor('support', value)),
      ].join(' | ')

      // Four characters is short enough to catch a prefix, a suffix or a
      // "safe" middle slice, and long enough not to collide with the Turkish
      // placeholders the formatters actually return.
      for (const fragment of fragments(value, 4)) {
        expect(rendered).not.toContain(fragment)
      }
    }
  })

  it('keeps nothing of an address but its first character and its domain', () => {
    const redacted = redactEmail('yasemin.demir@example.com')
    expect(redacted).toBe('y•••@example.com')
    // The local part is what identifies the person; the domain identifies the
    // organisation and is what makes a support call answerable at all.
    for (const fragment of fragments('yasemin.demir', 4)) {
      expect(redacted).not.toContain(fragment)
    }
    expect(redactEmailFor('analyst', 'yasemin.demir@example.com')).toBeNull()
  })

  it("renders no fragment of a name or an address in any role's view of it", () => {
    for (const role of ADMIN_ROLES) {
      const rendered = String(redactEmailFor(role, 'yasemin.demir@example.com'))
      for (const fragment of fragments('yasemin.demir', 4)) {
        expect(rendered).not.toContain(fragment)
      }
    }
  })

  it('is a shape guard, and the views are what make it sufficient', () => {
    // A single bare token passes, because `bo_identifier()` checks a shape
    // rather than classifying content. That is not a hole: the guard exists to
    // stop a sentence or an address reaching an audit detail, and the reason a
    // subject line never reaches it in the first place is that the view it
    // would have come from has no such column. Stated here so nobody later
    // mistakes this function for a content filter.
    expect(safeIdentifier('Yasemin')).toBe('Yasemin')
    expect(safeIdentifier('Yasemin Demir')).toBe('unstructured')
    expect(safeIdentifier('yasemin@example.com')).toBe('unstructured')
  })

  it('shortens only what is already an identifier', () => {
    // Every call site passes a uuid column; composed with the guard, a value
    // that is not identifier-shaped never reaches it.
    const guarded = (raw: string): string => shortId(safeIdentifier(raw) ?? '')
    for (const value of CONTENT) {
      expect(guarded(value)).toBe('unstructured')
    }
    expect(guarded('3f2a1c44-0000-4000-8000-000000000001')).toBe('3f2a…0001')
  })
})
