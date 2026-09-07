import { describe, expect, it } from 'vitest'
import {
  ANALYTICS_EVENTS,
  FORBIDDEN_ANALYTICS_KEYS,
  findAnalyticsViolations,
  isAnalyticsEnum,
  type AnalyticsProperties,
} from './analytics-events.ts'

/**
 * The product promise is that nothing anyone wrote to the user, and nobody's
 * name or address, ever reaches an analytics vendor. The type system covers
 * the honest path; this guard covers the cast, and these tests cover the
 * guard.
 */

const violationKeys = (properties: AnalyticsProperties): string[] =>
  findAnalyticsViolations(properties)
    .map((v) => v.key)
    .sort()

/**
 * The compiler already refuses free text as a property value, so reaching the
 * runtime guard at all means reproducing the one way past it: a cast. That is
 * precisely the case the guard is written for, so the tests below go through
 * this helper rather than pretending the type error does not exist.
 */
const unchecked = (properties: Record<string, unknown>): AnalyticsProperties =>
  properties as AnalyticsProperties

describe('forbidden keys', () => {
  it('accepts a payload of counts, flags and enums', () => {
    expect(
      findAnalyticsViolations({
        thread_count: 12,
        had_conflict: true,
        provider: 'google',
        surface: 'today',
      }),
    ).toEqual([])
  })

  it.each(FORBIDDEN_ANALYTICS_KEYS)('rejects the property %s outright', (key) => {
    const violations = findAnalyticsViolations({ [key]: 1 })
    expect(violations).toEqual([{ key, reason: 'forbidden_key' }])
  })

  it('rejects a forbidden key regardless of case', () => {
    expect(violationKeys({ Subject: 1, EMAIL: 2 })).toEqual(['EMAIL', 'Subject'])
  })

  it('rejects a suffixed variant of a forbidden key', () => {
    // `sender_email`, `recipient_name` and friends are the shapes a property
    // actually arrives in.
    expect(violationKeys({ sender_email: 1, recipient_name: 2, thread_subject: 3 })).toEqual([
      'recipient_name',
      'sender_email',
      'thread_subject',
    ])
  })

  it('does not reject a key that merely contains a forbidden word', () => {
    // `email_count` is a count of emails, not an address.
    expect(findAnalyticsViolations({ email_count: 4, name_length: 7 })).toEqual([])
  })
})

describe('free-text values', () => {
  it('rejects any string that is not a known enum, whatever the key is called', () => {
    // The second line of defence: a well-named key with a mail subject in it.
    expect(findAnalyticsViolations(unchecked({ bucket: 'Yarınki toplantı hakkında' }))).toEqual([
      { key: 'bucket', reason: 'free_text_value' },
    ])
  })

  it('rejects an address smuggled through an innocuous key', () => {
    expect(violationKeys(unchecked({ segment: 'ayse@example.com' }))).toEqual(['segment'])
  })

  it('accepts the closed set of enum values', () => {
    for (const value of ['google', 'pro', 'morning', 'email_send', 'ios', 'tr', 'success']) {
      expect(isAnalyticsEnum(value)).toBe(true)
      expect(findAnalyticsViolations(unchecked({ v: value }))).toEqual([])
    }
  })

  it('treats an empty string as free text rather than a safe default', () => {
    expect(isAnalyticsEnum('')).toBe(false)
    expect(violationKeys(unchecked({ v: '' }))).toEqual(['v'])
  })

  it('reports every violation in a payload, not just the first', () => {
    expect(
      violationKeys(unchecked({ subject: 1, body: 2, note: 'serbest metin', count: 3 })),
    ).toEqual(['body', 'note', 'subject'])
  })
})

describe('event catalogue', () => {
  it('names events in snake_case with no free text in the name', () => {
    for (const event of ANALYTICS_EVENTS) {
      expect(event).toMatch(/^[a-z][a-z0-9_]*$/)
    }
  })

  it('has no duplicate event names', () => {
    expect(new Set(ANALYTICS_EVENTS).size).toBe(ANALYTICS_EVENTS.length)
  })
})
