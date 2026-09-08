import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  INVITE_TOKEN_BYTES,
  encodeBase64Url,
  newInviteToken,
  sha256Bytea,
  toHex,
} from '../tokens.ts'

/**
 * The invite token: shown once, stored never.
 *
 * An invite token is a bearer credential — whoever holds one becomes an
 * administrator of this console — and the whole design rests on one claim: what
 * reaches `admin_invites.token_hash` cannot be turned back into what the
 * operator copied. A database dump therefore grants nobody anything.
 *
 * A claim like that cannot be checked by reading the code, because the failure
 * mode is silent: a digest that quietly kept a prefix, or a "token" derived from
 * the invited address, would look exactly like this one on screen. So the tests
 * below go the other way round — they take the stored form and search it for the
 * token, they compare the digest against an independent SHA-256, and they check
 * that two tokens of very different lengths are stored at the same width.
 */

/** Enough draws that a repeat or a fixed character would show up. */
const DRAWS = 200

const B64URL_ONLY = /^[A-Za-z0-9_-]+$/

/** Every substring of `value` of exactly `length` characters. */
function fragments(value: string, length: number): readonly string[] {
  const out: string[] = []
  for (let start = 0; start + length <= value.length; start += 1) {
    out.push(value.slice(start, start + length))
  }
  return out
}

/** SHA-256 by a different implementation, so the digest is checked, not echoed. */
function independentSha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

describe('newInviteToken — 32 bytes an operator can copy once', () => {
  it('is 43 base64url characters, unpadded', () => {
    const token = newInviteToken()
    // 32 bytes is 42⅔ base64 characters; unpadded that is 43.
    expect(token).toHaveLength(43)
    expect(token).toMatch(B64URL_ONLY)
    expect(token).not.toContain('=')
    expect(INVITE_TOKEN_BYTES).toBe(32)
  })

  it('never repeats, and never fixes a position', () => {
    const tokens = Array.from({ length: DRAWS }, () => newInviteToken())
    expect(new Set(tokens).size).toBe(DRAWS)

    // A constant character anywhere would mean the entropy is not what the
    // length claims. Checked on the first byte's worth, where a broken encoder
    // would show first.
    for (let index = 0; index < 8; index += 1) {
      const seen = new Set(tokens.map((token) => token.charAt(index)))
      expect(seen.size).toBeGreaterThan(1)
    }
  })

  it('is not derived from anything a second admin already knows', () => {
    // Two tokens minted in the same millisecond differ, so nothing about the
    // clock, the process or a counter is in them.
    const [first, second] = [newInviteToken(), newInviteToken()]
    expect(first).not.toBe(second)
  })
})

describe('encodeBase64Url', () => {
  it('agrees with the platform encoder on the bytes it is given', () => {
    for (const length of [0, 1, 2, 3, 4, 5, 31, 32, 33]) {
      const bytes = new Uint8Array(length)
      for (let index = 0; index < length; index += 1) bytes[index] = (index * 37 + 11) % 256
      const expected = Buffer.from(bytes).toString('base64url')
      expect(encodeBase64Url(bytes)).toBe(expected)
    }
  })

  it('emits nothing a URL or a mail client would rewrite', () => {
    const bytes = new Uint8Array([251, 255, 254, 253, 252, 250])
    const encoded = encodeBase64Url(bytes)
    expect(encoded).toMatch(B64URL_ONLY)
    expect(encoded).not.toContain('+')
    expect(encoded).not.toContain('/')
  })
})

describe('toHex', () => {
  it('pads every byte to two lowercase digits', () => {
    const bytes = new Uint8Array([0, 1, 15, 16, 171, 255])
    expect(toHex(bytes.buffer)).toBe('00010f10abff')
  })
})

describe('sha256Bytea — the only form a token is stored in', () => {
  it('produces the `\\x` literal the column accepts', async () => {
    const digest = await sha256Bytea(newInviteToken())
    expect(digest.startsWith('\\x')).toBe(true)
    // 32 bytes as hex, plus the two-character prefix.
    expect(digest).toHaveLength(66)
    expect(digest.slice(2)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is a real SHA-256, checked against a different implementation', async () => {
    for (const value of ['', 'a', newInviteToken(), 'yasemin@example.com']) {
      expect(await sha256Bytea(value)).toBe(`\\x${independentSha256Hex(value)}`)
    }
  })

  it('is deterministic, so an invite can be looked up by presenting its token', async () => {
    const token = newInviteToken()
    expect(await sha256Bytea(token)).toBe(await sha256Bytea(token))
  })
})

describe('the stored form is not reversible to the shown form', () => {
  it('contains no fragment of the token it came from', async () => {
    for (let draw = 0; draw < 20; draw += 1) {
      const token = newInviteToken()
      const stored = await sha256Bytea(token)
      expect(stored).not.toContain(token)
      // Six characters, not three. Base64url and lowercase hex share sixteen
      // characters, so a three-character window over a 64-character digest
      // matches by chance often enough to fail this run roughly one time in
      // five — a red suite that proves nothing. Six is still only 36 bits, so a
      // digest that kept any run of the token is caught, and a chance match is
      // out of reach.
      for (const fragment of fragments(token, 6)) {
        expect(stored).not.toContain(fragment)
      }
    }
  })

  it('is the same width whatever it was given, so it leaks no length', async () => {
    const short = await sha256Bytea('a')
    const long = await sha256Bytea('x'.repeat(4_096))
    const token = await sha256Bytea(newInviteToken())
    expect(short).toHaveLength(long.length)
    expect(token).toHaveLength(long.length)
  })

  it('shares nothing with the digest of a token one character apart', async () => {
    const token = newInviteToken()
    const neighbour = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`
    expect(neighbour).not.toBe(token)

    const first = (await sha256Bytea(token)).slice(2)
    const second = (await sha256Bytea(neighbour)).slice(2)
    expect(first).not.toBe(second)

    // Nowhere near a shared prefix: an implementation that kept any part of its
    // input would show one immediately.
    let sharedPrefix = 0
    while (sharedPrefix < first.length && first[sharedPrefix] === second[sharedPrefix]) {
      sharedPrefix += 1
    }
    expect(sharedPrefix).toBeLessThan(8)
  })

  it('cannot be inverted by minting: no digest in a large corpus collides', async () => {
    const tokens = Array.from({ length: 100 }, () => newInviteToken())
    const digests = await Promise.all(tokens.map((token) => sha256Bytea(token)))
    expect(new Set(digests).size).toBe(tokens.length)
    // And no digest happens to be one of the tokens, which is the degenerate
    // way a "hash" could be an identity function.
    const tokenSet = new Set(tokens)
    for (const digest of digests) expect(tokenSet.has(digest)).toBe(false)
  })
})

describe('the raw token reaches the database in no other form', () => {
  const source = (path: string): string =>
    readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

  const admins = source('../actions/admins.ts')
  const db = source('../db.ts')

  it('writes only the digest into the invite row', () => {
    expect(admins).toContain('token_hash: await sha256Bytea(token)')
    // The only other spelling that would put a token in the row.
    expect(admins).not.toMatch(/token_hash:\s*token\b/)
    expect(admins).not.toMatch(/token:\s*token,[\s\S]{0,40}insertRow/)
  })

  it('puts the domain, not the address and not the token, in the audit detail', () => {
    const spec = admins.slice(admins.indexOf('const inviteSpec'))
    const detail = spec.slice(spec.indexOf('detail: (input, result) => ({'), spec.indexOf('run:'))

    expect(detail).toContain('invited_domain')
    // The trail records which organisation was invited. It does not put a
    // colleague's mailbox — or a live credential — in a jsonb document other
    // admins can read.
    expect(detail).not.toContain('token')
    expect(detail).not.toMatch(/\bemail:/)
  })

  it('keeps `token_hash` on the list of columns that may never be read back', () => {
    expect(db).toContain("admin_invites: ['token_hash']")
    expect(db).toContain("admin_sessions: ['token_hash', 'ip_hash']")
  })
})
