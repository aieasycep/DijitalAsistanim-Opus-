import { describe, expect, it } from 'vitest'
import {
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  normaliseReason,
  reasonIssue,
} from '../admin-action.ts'
import { MAX_REASON_LENGTH as TRAIL_CEILING } from '../permissions.ts'

/**
 * The written justification, from the operator's keyboard to the audit row.
 *
 * This is the subsystem's whole product. Everything else `runAdminAction` does
 * — the permission, the rate limit, the audit write on both paths — exists so
 * that six months later somebody can read why an action was taken. A reason
 * that arrives in the row shorter than it was typed defeats that quietly, which
 * is the worst way to defeat it.
 */

describe('the reason a destructive action is recorded with', () => {
  it('is bounded by the number the row is actually written with', () => {
    // These were 500 and 280. `readReason()` normalised — and truncated —
    // before `reasonIssue()` validated, and `audit.ts` sliced again at 280 on
    // the way to Postgres. A 400-character justification passed every check and
    // reached the trail 120 characters shorter, with nothing raised anywhere.
    expect(MAX_REASON_LENGTH).toBe(TRAIL_CEILING)
  })

  it('holds the console to a stricter floor than the database', () => {
    // Not a duplicate of the database's three-character check: three characters
    // is what Postgres refuses to store, ten is what this console refuses to
    // accept. The distinction is deliberate, so it is asserted rather than left
    // to whoever next reads two constants with the same name.
    expect(MIN_REASON_LENGTH).toBeGreaterThan(3)
  })

  it('refuses a reason that is too long instead of shortening it', () => {
    const tooLong = 'a'.repeat(MAX_REASON_LENGTH + 1)
    const issue = reasonIssue(tooLong)
    expect(issue).not.toBeNull()
    expect(issue?.path).toBe('reason')
    expect(issue?.message).toContain(String(MAX_REASON_LENGTH))
  })

  it('accepts one of exactly the maximum length', () => {
    expect(reasonIssue('a'.repeat(MAX_REASON_LENGTH))).toBeNull()
  })

  it('refuses an empty reason, and one under the floor', () => {
    expect(reasonIssue(null)?.path).toBe('reason')
    expect(reasonIssue('   ')?.path).toBe('reason')
    expect(reasonIssue('a'.repeat(MIN_REASON_LENGTH - 1))?.message).toContain(
      String(MIN_REASON_LENGTH),
    )
    expect(reasonIssue('a'.repeat(MIN_REASON_LENGTH))).toBeNull()
  })

  it('normalises whitespace without ever removing a character of content', () => {
    expect(normaliseReason('  müşteri   talebi \n üzerine  ')).toBe('müşteri talebi üzerine')
  })

  it('does not truncate, so validation sees what the operator typed', () => {
    // The order matters and is the reason the defect was invisible:
    // `readReason()` runs `normaliseReason()` first, then `reasonIssue()`
    // judges the result. While normalisation truncated, an over-long reason
    // arrived at the check already trimmed to the limit and passed it — the
    // validator could not see the problem it exists to catch.
    const overLong = 'ü'.repeat(MAX_REASON_LENGTH + 50)
    expect(normaliseReason(overLong)).toHaveLength(MAX_REASON_LENGTH + 50)
    expect(reasonIssue(normaliseReason(overLong))).not.toBeNull()
  })
})
