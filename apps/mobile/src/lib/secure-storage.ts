import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'
import { MMKV } from 'react-native-mmkv'

/**
 * Local persistence, split by sensitivity.
 *
 * Three tiers, and the split is the point:
 *   - `secureStore`  — Keychain / Keystore. Session tokens only.
 *   - `encryptedCache` — an encrypted MMKV instance for cached user content
 *     (briefing text, thread summaries, person names). Encrypted because a
 *     summary of your inbox is nearly as sensitive as the inbox.
 *   - `plainCache` — an unencrypted MMKV instance for things that leak nothing:
 *     the chosen theme, the last tab, a collapsed-section flag.
 *
 * Raw message bodies are never cached at any tier.
 */

// v2: the v1 key was 64 hex characters, of which MMKV used the first 16. See
// `getOrCreateCacheKey` for why that is 64 bits rather than the 256 intended.
// An existing cache is unreadable under the new key, which is harmless — every
// cached value is a copy of something the server still holds.
const ENCRYPTION_KEY_ITEM = 'da.cache.key.v2'
const LEGACY_ENCRYPTION_KEY_ITEM = 'da.cache.key.v1'

/**
 * MMKV's crypt key is AES-128 — 16 bytes — and anything longer is silently
 * truncated rather than rejected:
 *
 *   MMKVPredef.h    constexpr size_t AES_KEY_LEN = 16;
 *   AESCrypt.cpp:51 memcpy(m_key, key, (keyLength > AES_KEY_LEN) ? AES_KEY_LEN : keyLength);
 *
 * The key crosses the bridge as a string, so those 16 bytes are 16 *characters*.
 * A 64-character hex string therefore contributed its first 16 hex digits —
 * eight of the thirty-two random bytes, 64 bits — while looking like 256.
 *
 * Sixteen characters drawn from a 64-symbol alphabet is 96 bits and survives
 * the UTF-8 round trip intact, which is the most that fits in the 16 bytes MMKV
 * will read. `byte & 63` is uniform because 256 divides exactly by 64.
 */
const KEY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const KEY_LENGTH = 16

let encrypted: MMKV | null = null

/**
 * Whether this process wiped local data since it started.
 *
 * MMKV caches native instances by id and returns the cached one without
 * re-applying the key: `mmkvWithID` in MMKV_Android.cpp looks up
 * `g_instanceDic` and, on a hit, returns it. So after a sign-out mints a new
 * key, `new MMKV({ id: 'da.cache', encryptionKey: fresh })` hands back the
 * pre-wipe instance still encrypting with the old one — everything written for
 * the rest of the process would be unreadable on the next cold start, and the
 * Keychain key would stop describing the data.
 *
 * Only a wipe can produce that mismatch, so only a wipe pays for `recrypt()`.
 */
let wipedThisProcess = false
const plain = new MMKV({ id: 'da.prefs' })

/**
 * Fetch or mint the MMKV encryption key. It lives in the Keychain, so wiping
 * the keychain entry on logout makes the whole cache unreadable even before
 * the files are deleted.
 */
async function getOrCreateCacheKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(ENCRYPTION_KEY_ITEM)
  if (existing) return existing

  // `getRandomBytes` from expo-crypto, NOT the global `crypto.getRandomValues`.
  //
  // There is no global `crypto` on this platform. Expo's winter runtime installs
  // `fetch`, `FormData`, `URL`, `TextDecoder`, `AbortSignal` and `DOMException`,
  // and no crypto; `expo-crypto` installs a global only in its `.web` build. On
  // Hermes the identifier is simply undefined.
  //
  // This line used to read `crypto.getRandomValues(bytes)` above a comment
  // asserting the polyfill existed. It threw on **every fresh install** — the
  // key is minted only when SecureStore has none, which is exactly the first
  // launch — so `boot()` caught it and the app opened on its recovery screen
  // and never got further. It survived every gate because Node has had a global
  // `crypto` since 19, so the unit tests exercised a binding the device does
  // not have.
  const bytes = Crypto.getRandomBytes(KEY_LENGTH)
  const key = Array.from(bytes, (b) => KEY_ALPHABET[b & 63]).join('')

  await SecureStore.setItemAsync(ENCRYPTION_KEY_ITEM, key, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  })
  return key
}

/** Called once during boot, before any cached read. */
export async function initEncryptedCache(): Promise<void> {
  if (encrypted) return
  const key = await getOrCreateCacheKey()
  const instance = new MMKV({ id: 'da.cache', encryptionKey: key })
  if (wipedThisProcess) {
    // See `wipedThisProcess`: this handle is the pre-wipe native instance, and
    // the constructor's key was ignored. Re-key the handle we were given.
    instance.recrypt(key)
    wipedThisProcess = false
  }
  encrypted = instance
}

function requireEncrypted(): MMKV {
  if (!encrypted) {
    throw new Error('Encrypted cache used before initEncryptedCache() completed')
  }
  return encrypted
}

export const secureStore = {
  async get(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key)
  },
  async set(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    })
  },
  async remove(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key)
  },
}

export const encryptedCache = {
  getString(key: string): string | undefined {
    return requireEncrypted().getString(key)
  },
  set(key: string, value: string): void {
    requireEncrypted().set(key, value)
  },
  getJson<T>(key: string): T | null {
    const raw = requireEncrypted().getString(key)
    if (!raw) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      // A corrupt entry is dropped rather than crashing the screen that reads it.
      requireEncrypted().delete(key)
      return null
    }
  },
  setJson(key: string, value: unknown): void {
    requireEncrypted().set(key, JSON.stringify(value))
  },
  delete(key: string): void {
    requireEncrypted().delete(key)
  },
  clearAll(): void {
    encrypted?.clearAll()
  },
}

export const plainCache = {
  getString(key: string): string | undefined {
    return plain.getString(key)
  },
  set(key: string, value: string | boolean | number): void {
    plain.set(key, value)
  },
  getBoolean(key: string): boolean | undefined {
    return plain.getBoolean(key)
  },
  delete(key: string): void {
    plain.delete(key)
  },
  clearAll(): void {
    plain.clearAll()
  },
}

/**
 * Wipe every local trace of the signed-in user.
 *
 * Called on sign-out and on account deletion. The keychain key goes last so
 * that if the process dies half-way the cache is already unreadable.
 */
export async function wipeLocalData(): Promise<void> {
  encryptedCache.clearAll()
  plainCache.clearAll()
  encrypted = null
  wipedThisProcess = true
  await SecureStore.deleteItemAsync(ENCRYPTION_KEY_ITEM)
  await SecureStore.deleteItemAsync(LEGACY_ENCRYPTION_KEY_ITEM)
}

export const STORAGE_KEYS = {
  session: 'da.session.v1',
  colorScheme: 'da.pref.colorScheme',
  language: 'da.pref.language',
  reduceMotion: 'da.pref.reduceMotion',
  lastTab: 'da.nav.lastTab',
  onboardingStep: 'da.onboarding.step',
  cachedToday: 'da.cache.today',
  cachedBriefing: 'da.cache.briefing',
  cachedPlan: 'da.cache.plan',
  pendingActions: 'da.queue.pendingActions',
  demoMode: 'da.demo.enabled',
  deviceId: 'da.device.id',
  pushToken: 'da.push.token',
} as const
