import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// Type-only, so it is erased at compile time and does not evaluate the module
// before the `Deno` stand-in below exists.
import type * as CryptoModule from '../functions/_shared/crypto.ts'

/**
 * The refresh-token envelope, exercised outside Deno.
 *
 * A provider refresh token is a long-lived key to somebody's whole mailbox.
 * The rules it has to satisfy are: never readable from the database alone,
 * never the same ciphertext twice, tamper-evident, and decryptable across a
 * key rotation. Each of those is a test below.
 *
 * `_shared/crypto.ts` reads `Deno.env`, so the module is imported after a
 * minimal stand-in is installed — the WebCrypto it actually uses is the same
 * implementation in both runtimes.
 */

const KEY_V1 = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=' // 32 bytes
const KEY_V2 = 'Hx4dHBsaGRgXFhUUExIREA8ODQwLCgkIBwYFBAMCAQA=' // 32 different bytes

const env = new Map<string, string>([
  ['OAUTH_ENCRYPTION_KEY', KEY_V1],
  ['OAUTH_ENCRYPTION_KEY_V2', KEY_V2],
  ['OAUTH_ENCRYPTION_KEY_VERSION', '1'],
])

let crypto_: typeof CryptoModule

const globalWithDeno = globalThis as typeof globalThis & { Deno?: unknown }
const originalDeno = globalWithDeno.Deno

beforeAll(async () => {
  globalWithDeno.Deno = { env: { get: (name: string) => env.get(name) } }
  crypto_ = await import('../functions/_shared/crypto.ts')
})

afterAll(() => {
  globalWithDeno.Deno = originalDeno
})

describe('encryptSecret / decryptSecret', () => {
  // Shaped like a Google refresh token, and marked as a fixture so the
  // secret scanner can tell it apart from one.
  const token = '1//0gL9Xk-fake-refresh-token-fixture'

  it('round-trips a token', async () => {
    const blob = await crypto_.encryptSecret(token)
    expect(await crypto_.decryptSecret(blob)).toBe(token)
  })

  it('never stores the plaintext in the ciphertext', async () => {
    const blob = await crypto_.encryptSecret(token)
    const asText = new TextDecoder().decode(blob.ciphertext)
    expect(asText).not.toContain('refresh-token')
    expect(crypto_.bytesToHex(blob.ciphertext)).not.toContain(
      [...token].map((c) => c.charCodeAt(0).toString(16)).join(''),
    )
  })

  it('produces a different ciphertext every time', async () => {
    // A deterministic ciphertext would let anyone with read access to the
    // table tell which two users connected the same account.
    const a = await crypto_.encryptSecret(token)
    const b = await crypto_.encryptSecret(token)
    expect(crypto_.bytesToHex(a.nonce)).not.toBe(crypto_.bytesToHex(b.nonce))
    expect(crypto_.bytesToHex(a.ciphertext)).not.toBe(crypto_.bytesToHex(b.ciphertext))
  })

  it('uses a 96-bit nonce', async () => {
    const blob = await crypto_.encryptSecret(token)
    expect(blob.nonce.length).toBe(12)
  })

  it('fails closed when the ciphertext is tampered with', async () => {
    const blob = await crypto_.encryptSecret(token)
    const tampered = Uint8Array.from(blob.ciphertext)
    tampered[0] ^= 0xff
    await expect(crypto_.decryptSecret({ ...blob, ciphertext: tampered })).rejects.toThrow()
  })

  it('fails closed when the nonce is tampered with', async () => {
    const blob = await crypto_.encryptSecret(token)
    const tampered = Uint8Array.from(blob.nonce)
    tampered[0] ^= 0xff
    await expect(crypto_.decryptSecret({ ...blob, nonce: tampered })).rejects.toThrow()
  })

  it('cannot be decrypted with the wrong key version', async () => {
    const blob = await crypto_.encryptSecret(token)
    await expect(crypto_.decryptSecret({ ...blob, keyVersion: 2 })).rejects.toThrow()
  })

  it('round-trips an empty string and a long multibyte token', async () => {
    for (const value of ['', 'ş'.repeat(4000), '🔐 token — with em dash']) {
      const blob = await crypto_.encryptSecret(value)
      expect(await crypto_.decryptSecret(blob)).toBe(value)
    }
  })
})

describe('key rotation', () => {
  it('reads rows written under either key while both are configured', async () => {
    const underV1 = await crypto_.encryptSecret('written-before-rotation')
    expect(underV1.keyVersion).toBe(1)

    env.set('OAUTH_ENCRYPTION_KEY_VERSION', '2')
    const underV2 = await crypto_.encryptSecret('written-after-rotation')
    expect(underV2.keyVersion).toBe(2)

    // The point of storing the version per row: the old rows still open.
    expect(await crypto_.decryptSecret(underV1)).toBe('written-before-rotation')
    expect(await crypto_.decryptSecret(underV2)).toBe('written-after-rotation')

    env.set('OAUTH_ENCRYPTION_KEY_VERSION', '1')
  })

  it('defaults to version 1 when the variable is absent or nonsense', () => {
    env.delete('OAUTH_ENCRYPTION_KEY_VERSION')
    expect(crypto_.currentKeyVersion()).toBe(1)
    env.set('OAUTH_ENCRYPTION_KEY_VERSION', 'not-a-number')
    expect(crypto_.currentKeyVersion()).toBe(1)
    env.set('OAUTH_ENCRYPTION_KEY_VERSION', '0')
    expect(crypto_.currentKeyVersion()).toBe(1)
    env.set('OAUTH_ENCRYPTION_KEY_VERSION', '1')
  })

  it('refuses a key that is not 32 bytes, with an actionable message', async () => {
    env.set('OAUTH_ENCRYPTION_KEY_V3', 'c2hvcnQ=')
    env.set('OAUTH_ENCRYPTION_KEY_VERSION', '3')
    await expect(crypto_.encryptSecret('x')).rejects.toThrow(/exactly 32 bytes/)
    env.set('OAUTH_ENCRYPTION_KEY_VERSION', '1')
  })

  it('refuses to encrypt at all when the key is missing', async () => {
    env.set('OAUTH_ENCRYPTION_KEY_VERSION', '4')
    await expect(crypto_.encryptSecret('x')).rejects.toThrow(/OAUTH_ENCRYPTION_KEY_V4/)
    env.set('OAUTH_ENCRYPTION_KEY_VERSION', '1')
  })
})

describe('bytea representation', () => {
  it('round-trips through the Postgres hex form', () => {
    const bytes = new Uint8Array([0x00, 0x0b, 0xad, 0xc0, 0xde, 0xff])
    const hex = crypto_.bytesToHex(bytes)
    expect(hex).toBe('\\x000badc0deff')
    expect([...crypto_.hexToBytes(hex)]).toEqual([...bytes])
  })

  it('accepts the hex form with or without the escape prefix', () => {
    expect([...crypto_.hexToBytes('0badc0de')]).toEqual([0x0b, 0xad, 0xc0, 0xde])
    expect([...crypto_.hexToBytes('\\x0badc0de')]).toEqual([0x0b, 0xad, 0xc0, 0xde])
  })

  it('survives a full encrypt → hex → parse → decrypt cycle', async () => {
    const blob = await crypto_.encryptSecret('through-the-database')
    const stored = {
      ciphertext: crypto_.bytesToHex(blob.ciphertext),
      nonce: crypto_.bytesToHex(blob.nonce),
    }
    const restored = await crypto_.decryptSecret({
      ciphertext: crypto_.hexToBytes(stored.ciphertext),
      nonce: crypto_.hexToBytes(stored.nonce),
      keyVersion: blob.keyVersion,
    })
    expect(restored).toBe('through-the-database')
  })
})

describe('signature helpers', () => {
  it('hashes deterministically', async () => {
    expect(await crypto_.sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(await crypto_.sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  it('computes HMAC-SHA256 against the RFC 4231 vector', async () => {
    // Test case 2: key "Jefe", data "what do ya want for nothing?".
    expect(await crypto_.hmacSha256Hex('Jefe', 'what do ya want for nothing?')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    )
  })

  it('compares in constant time and still compares correctly', () => {
    expect(crypto_.timingSafeEqual('abc', 'abc')).toBe(true)
    expect(crypto_.timingSafeEqual('abc', 'abd')).toBe(false)
    expect(crypto_.timingSafeEqual('abc', 'ab')).toBe(false)
    expect(crypto_.timingSafeEqual('', '')).toBe(true)
    expect(crypto_.timingSafeEqual('ş', 'ş')).toBe(true)
  })
})

describe('OAuth randomness', () => {
  it('produces URL-safe tokens with no padding', () => {
    for (let i = 0; i < 20; i++) {
      expect(crypto_.randomToken()).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 200 }, () => crypto_.randomToken()))
    expect(seen.size).toBe(200)
  })

  it('computes the PKCE S256 challenge from the RFC 7636 example', async () => {
    expect(await crypto_.pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    )
  })
})
