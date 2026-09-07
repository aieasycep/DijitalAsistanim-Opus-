/**
 * Envelope encryption for provider refresh tokens.
 *
 * A refresh token is a long-lived key to somebody's entire mailbox, so it is
 * never stored in plaintext and never leaves the server. AES-256-GCM gives
 * both confidentiality and integrity: a tampered ciphertext fails to decrypt
 * rather than yielding attacker-chosen bytes.
 *
 * The key comes from the `OAUTH_ENCRYPTION_KEY` function secret. `key_version`
 * is stored alongside each row so a rotation can re-encrypt lazily instead of
 * requiring one big migration — during a rotation both keys are configured and
 * decryption picks the one the row was written with.
 */

const ALGORITHM = 'AES-GCM'
const IV_BYTES = 12
const KEY_BYTES = 32

export interface EncryptedBlob {
  ciphertext: Uint8Array<ArrayBuffer>
  nonce: Uint8Array<ArrayBuffer>
  keyVersion: number
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function loadRawKey(version: number): Uint8Array<ArrayBuffer> {
  // Version 1 uses the primary variable; a rotation adds
  // OAUTH_ENCRYPTION_KEY_V2 and bumps OAUTH_ENCRYPTION_KEY_VERSION.
  const name = version <= 1 ? 'OAUTH_ENCRYPTION_KEY' : `OAUTH_ENCRYPTION_KEY_V${version}`
  const raw = Deno.env.get(name)
  if (!raw) {
    throw new Error(
      `Missing ${name}. Generate one with \`openssl rand -base64 32\` and set it with \`supabase secrets set\`.`,
    )
  }
  const bytes = decodeBase64(raw.trim())
  if (bytes.length !== KEY_BYTES) {
    throw new Error(`${name} must decode to exactly ${KEY_BYTES} bytes, got ${bytes.length}`)
  }
  return bytes
}

const keyCache = new Map<number, Promise<CryptoKey>>()

function getKey(version: number): Promise<CryptoKey> {
  const cached = keyCache.get(version)
  if (cached) return cached
  const promise = crypto.subtle.importKey('raw', loadRawKey(version), ALGORITHM, false, [
    'encrypt',
    'decrypt',
  ])
  keyCache.set(version, promise)
  return promise
}

export function currentKeyVersion(): number {
  const raw = Deno.env.get('OAUTH_ENCRYPTION_KEY_VERSION')
  const parsed = raw ? Number.parseInt(raw, 10) : 1
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

/**
 * Encrypt a secret. The GCM authentication tag is appended to the ciphertext
 * by WebCrypto, so `ciphertext` here is tag-inclusive and `auth_tag` is not
 * stored separately.
 */
export async function encryptSecret(plaintext: string): Promise<EncryptedBlob> {
  const version = currentKeyVersion()
  const key = await getKey(version)
  const nonce: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const encoded = new TextEncoder().encode(plaintext) as Uint8Array<ArrayBuffer>
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: ALGORITHM, iv: nonce }, key, encoded),
  )
  return { ciphertext, nonce, keyVersion: version }
}

export async function decryptSecret(blob: EncryptedBlob): Promise<string> {
  const key = await getKey(blob.keyVersion)
  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: blob.nonce },
    key,
    blob.ciphertext,
  )
  return new TextDecoder().decode(plaintext)
}

/**
 * Postgres `bytea` arrives from PostgREST as a hex string (`\x0badc0de`).
 * These two helpers are the only place that representation is dealt with.
 */
export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.startsWith('\\x') ? hex.slice(2) : hex
  const bytes: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(clean.length / 2))
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(clean.substr(i * 2, 2), 16)
  }
  return bytes
}

export function bytesToHex(bytes: Uint8Array<ArrayBuffer>): string {
  let out = '\\x'
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0')
  return out
}

/** SHA-256, hex-encoded. Used for content fingerprints and dedupe keys. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Constant-time string comparison, for verifying webhook signatures and shared
 * secrets. A plain `===` leaks the position of the first differing byte through
 * timing, which is enough to forge a signature given enough attempts.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a)
  const bBytes = new TextEncoder().encode(b)
  // Comparing lengths first is safe: the length is not the secret.
  if (aBytes.length !== bBytes.length) return false
  let diff = 0
  for (let i = 0; i < aBytes.length; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0)
  }
  return diff === 0
}

/** HMAC-SHA256, hex-encoded — for verifying provider webhook signatures. */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** A URL-safe random token, for OAuth `state` and PKCE verifiers. */
export function randomToken(byteLength = 32): string {
  const bytes: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(byteLength))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** PKCE S256 challenge for the authorization-code flow. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
