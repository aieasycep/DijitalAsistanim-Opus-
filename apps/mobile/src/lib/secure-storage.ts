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

const ENCRYPTION_KEY_ITEM = 'da.cache.key.v1'

let encrypted: MMKV | null = null
const plain = new MMKV({ id: 'da.prefs' })

/**
 * Fetch or mint the MMKV encryption key. It lives in the Keychain, so wiping
 * the keychain entry on logout makes the whole cache unreadable even before
 * the files are deleted.
 */
async function getOrCreateCacheKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(ENCRYPTION_KEY_ITEM)
  if (existing) return existing

  const bytes = new Uint8Array(32)
  // `crypto.getRandomValues` is provided by expo-crypto's global polyfill,
  // which is installed by the Expo runtime before any application code runs.
  crypto.getRandomValues(bytes)
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

  await SecureStore.setItemAsync(ENCRYPTION_KEY_ITEM, key, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  })
  return key
}

/** Called once during boot, before any cached read. */
export async function initEncryptedCache(): Promise<void> {
  if (encrypted) return
  const key = await getOrCreateCacheKey()
  encrypted = new MMKV({ id: 'da.cache', encryptionKey: key })
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
  await SecureStore.deleteItemAsync(ENCRYPTION_KEY_ITEM)
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
