import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
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
