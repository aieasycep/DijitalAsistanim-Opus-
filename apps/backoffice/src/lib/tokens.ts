/**
 * The opaque tokens this console mints, and the one-way digest it stores in
 * their place.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS STORED IS NOT WHAT IS SHOWN
 * ---------------------------------------------------------------------------
 *
 * An admin invite token and an admin session token are both bearer credentials:
 * whoever holds one can act. Neither is ever written to Postgres. Only the
 * SHA-256 of the token reaches `admin_invites.token_hash` and
 * `admin_sessions.token_hash`, both constrained to 32 bytes, and `@/lib/db`
 * refuses to select either column back — so a full database dump grants nobody
 * access. An invite token exists in the operator's clipboard and in the mail
 * they send, and nowhere else; a session token exists in one cookie.
 *
 * That is only true because the digest is one-way. There is no function in this
 * module that turns a stored value back into a token, and there is none that
 * could be written: SHA-256 of 32 bytes of `crypto.getRandomValues` is not
 * guessable, and the stored form is a fixed-width digest that carries no prefix,
 * no length and no fragment of its input.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS ITS OWN MODULE
 * ---------------------------------------------------------------------------
 *
 * It has no dependencies at all — WebCrypto and `TextEncoder` are platform
 * globals — so the rule above is testable without a database, a request context
 * or a `server-only` import. `@/lib/db` used to hold these three functions
 * privately, which meant the one property the invite flow rests on could only be
 * checked by reading it.
 */

const encoder = new TextEncoder()

/** 32 bytes of entropy, base64url — 43 characters an operator can copy once. */
export const INVITE_TOKEN_BYTES = 32

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/**
 * Base64url without padding, so the token survives a URL, a form field and a
 * mail client that helpfully "fixes" a trailing `=`.
 */
export function encodeBase64Url(bytes: Uint8Array): string {
  let out = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0
    const second = bytes[index + 1]
    const third = bytes[index + 2]

    out += B64URL.charAt(first >> 2)
    out += B64URL.charAt(((first & 0x03) << 4) | ((second ?? 0) >> 4))
    if (second === undefined) break
    out += B64URL.charAt(((second & 0x0f) << 2) | ((third ?? 0) >> 6))
    if (third === undefined) break
    out += B64URL.charAt(third & 0x3f)
  }
  return out
}

/**
 * A fresh invite token.
 *
 * `crypto.getRandomValues` rather than anything derived from the invited
 * address, the inviting admin or the clock: a token that can be reconstructed
 * from facts another admin already knows is not a credential.
 */
export function newInviteToken(): string {
  const bytes = new Uint8Array(INVITE_TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  return encodeBase64Url(bytes)
}

export function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return hex
}

/** `\x…` literal for a `bytea` argument. The only form a token is stored in. */
export async function sha256Bytea(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return `\\x${toHex(digest)}`
}
