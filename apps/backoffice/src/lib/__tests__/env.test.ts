import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEPLOYMENT_ENVIRONMENTS,
  ENV_VARIABLES,
  dangerousActionNote,
  environmentBannerText,
  hasDedicatedHashSalt,
  isNonProduction,
  projectRefOf,
  secretInventory,
  type EnvironmentDescriptor,
} from '../env.ts'

/**
 * Configuration, reported as presence and nothing else.
 *
 * Section 8 of the specification is one sentence long and this file is its
 * enforcement: a secret renders "Yapılandırıldı ✅" or "Yapılandırılmadı ❌",
 * and no value, prefix, length or fingerprint ever leaves the server. That is
 * not a property of the screen, which could always be rewritten — it is a
 * property of `secretInventory()`, which is never handed a value in the first
 * place. So the tests below do not check what the page renders; they take the
 * whole returned structure, serialise it, and search it for any trace of the
 * values the process was holding at the time.
 *
 * The sentinels are chosen to be findable: distinctive, long, and made of
 * characters that survive JSON encoding unchanged.
 */

/**
 * Deliberately meaningless: a sentinel made of real words would collide with
 * the Turkish descriptions and prove nothing about what actually leaked.
 */
const SERVICE_KEY = 'ZqXvKpMnBwTrYuJhGdSlPoWiEcRnZqXvKpMnBwT'
const ANON_KEY = 'WjNkFuHtLcVpQmXsZbRgYdKwNjFuHtLcVpQmXsZbR'
const HASH_SALT = 'PlOkMjIkNhBgVfCdXsZaQwErTyUiOpLkJhGfDsAaZxCvB'
const SUPABASE_URL = 'https://abcdefghijkl.supabase.co'

const SENTINELS = [SERVICE_KEY, ANON_KEY, HASH_SALT] as const

/** Every substring of `value` of at least `length` characters. */
function fragments(value: string, length: number): readonly string[] {
  const out: string[] = []
  for (let start = 0; start + length <= value.length; start += 1) {
    out.push(value.slice(start, start + length))
  }
  return out
}

let saved: Record<string, string | undefined> = {}

const MANAGED = [
  ...ENV_VARIABLES,
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'APP_ENV',
  'VERCEL_ENV',
  'VERCEL_GIT_COMMIT_SHA',
] as const

beforeEach(() => {
  saved = {}
  for (const name of MANAGED) {
    saved[name] = process.env[name]
    delete process.env[name]
  }
})

afterEach(() => {
  for (const name of MANAGED) {
    const previous = saved[name]
    if (previous === undefined) delete process.env[name]
    else process.env[name] = previous
  }
})

function configureEverything(): void {
  process.env['SUPABASE_URL'] = SUPABASE_URL
  process.env['SUPABASE_SERVICE_ROLE_KEY'] = SERVICE_KEY
  process.env['SUPABASE_ANON_KEY'] = ANON_KEY
  process.env['BACKOFFICE_HASH_SALT'] = HASH_SALT
  process.env['BACKOFFICE_ENV'] = 'staging'
  process.env['BACKOFFICE_RELEASE'] = 'c0ffee1'
}

describe('secretInventory — presence, and only presence', () => {
  it('reports every variable the console reads, once', () => {
    const names = secretInventory().map((entry) => entry.variable)
    expect(names).toEqual([...ENV_VARIABLES])
    expect(new Set(names).size).toBe(names.length)
  })

  it('carries no field that could hold a value', () => {
    configureEverything()
    for (const entry of secretInventory()) {
      expect(Object.keys(entry).sort()).toEqual([
        'configured',
        'description',
        'fallbackNote',
        'required',
        'variable',
      ])
      expect(typeof entry.configured).toBe('boolean')
      expect(typeof entry.required).toBe('boolean')
    }
  })

  it('leaks no fragment of any configured secret into its output', () => {
    configureEverything()
    const serialised = JSON.stringify(secretInventory())

    for (const secret of SENTINELS) {
      // Four characters is short enough that a prefix, a suffix or a "safe"
      // middle slice would all be caught, and long enough not to collide with
      // ordinary Turkish prose.
      for (const fragment of fragments(secret, 4)) {
        expect(serialised).not.toContain(fragment)
      }
    }
  })

  it('leaks no length and no fingerprint of any configured secret', () => {
    configureEverything()
    const serialised = JSON.stringify(secretInventory())

    for (const secret of SENTINELS) {
      // A length is the classic "harmless" disclosure: it narrows a guess and
      // it identifies which key is deployed.
      expect(serialised).not.toContain(String(secret.length))
      // Nothing in the output is hex- or base64-shaped, so no digest of a value
      // could be hiding in it.
      expect(serialised).not.toMatch(/[0-9a-f]{8,}/i)
    }
  })

  it('says nothing at all about a secret that is not set', () => {
    const serialised = JSON.stringify(secretInventory())
    for (const secret of SENTINELS) {
      for (const fragment of fragments(secret, 4)) {
        expect(serialised).not.toContain(fragment)
      }
    }
    expect(secretInventory().every((entry) => !entry.configured)).toBe(true)
  })

  it('flips the flag with the variable and nothing else', () => {
    expect(secretInventory().find((e) => e.variable === 'SUPABASE_URL')?.configured).toBe(false)
    process.env['SUPABASE_URL'] = SUPABASE_URL
    expect(secretInventory().find((e) => e.variable === 'SUPABASE_URL')?.configured).toBe(true)
  })

  it('treats whitespace as absent, so a blank deploy variable is not a tick', () => {
    process.env['SUPABASE_SERVICE_ROLE_KEY'] = '   '
    const entry = secretInventory().find((e) => e.variable === 'SUPABASE_SERVICE_ROLE_KEY')
    expect(entry?.configured).toBe(false)
  })

  it('marks the three the console cannot run without', () => {
    const required = secretInventory()
      .filter((entry) => entry.required)
      .map((entry) => entry.variable)
    expect(required).toEqual(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY'])
  })

  it('has a Turkish description for every variable', () => {
    for (const entry of secretInventory()) {
      expect(entry.description.length).toBeGreaterThan(0)
    }
  })
})

describe('the fallback notes are caveats, not green ticks', () => {
  it('names the public variable the anon key was actually read from', () => {
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = ANON_KEY
    const entry = secretInventory().find((e) => e.variable === 'SUPABASE_ANON_KEY')
    expect(entry?.configured).toBe(true)
    expect(entry?.fallbackNote).toBe('NEXT_PUBLIC_SUPABASE_ANON_KEY üzerinden okunuyor.')
    // The note names the variable. It does not quote what was in it.
    expect(entry?.fallbackNote).not.toContain(ANON_KEY.slice(0, 6))
  })

  it('drops the note once the dedicated variable is set', () => {
    process.env['SUPABASE_ANON_KEY'] = ANON_KEY
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = ANON_KEY
    expect(
      secretInventory().find((e) => e.variable === 'SUPABASE_ANON_KEY')?.fallbackNote,
    ).toBeNull()
  })

  it('says the service key is standing in for a missing hash salt', () => {
    process.env['SUPABASE_SERVICE_ROLE_KEY'] = SERVICE_KEY
    const entry = secretInventory().find((e) => e.variable === 'BACKOFFICE_HASH_SALT')
    expect(hasDedicatedHashSalt()).toBe(false)
    expect(entry?.configured).toBe(false)
    expect(entry?.fallbackNote).toContain('servis anahtarı geçici olarak kullanılıyor')
    // And it still does not print the key it is standing in for.
    for (const fragment of fragments(SERVICE_KEY, 4)) {
      expect(entry?.fallbackNote ?? '').not.toContain(fragment)
    }
  })

  it('reports a configured salt with no caveat', () => {
    process.env['BACKOFFICE_HASH_SALT'] = HASH_SALT
    expect(hasDedicatedHashSalt()).toBe(true)
    const entry = secretInventory().find((e) => e.variable === 'BACKOFFICE_HASH_SALT')
    expect(entry?.configured).toBe(true)
    expect(entry?.fallbackNote).toBeNull()
  })

  it('explains that an unset environment is being inferred', () => {
    const entry = secretInventory().find((e) => e.variable === 'BACKOFFICE_ENV')
    expect(entry?.configured).toBe(false)
    expect(entry?.fallbackNote).toContain('VERCEL_ENV')
  })
})

describe('projectRefOf — an identifier, never a secret', () => {
  it('reads the project reference out of a Supabase host', () => {
    expect(projectRefOf('https://abcdefghijkl.supabase.co')).toBe('abcdefghijkl')
    expect(projectRefOf('https://abcdefghijkl.supabase.in/rest/v1')).toBe('abcdefghijkl')
  })

  it('returns null for a self-hosted or malformed address rather than guessing', () => {
    expect(projectRefOf('https://db.internal.example.com')).toBeNull()
    expect(projectRefOf('http://localhost:54321')).toBeNull()
    expect(projectRefOf('not a url')).toBeNull()
    expect(projectRefOf('')).toBeNull()
  })

  it('does not treat a lookalike domain as a Supabase project', () => {
    expect(projectRefOf('https://abcdefgh.supabase.co.evil.example')).toBeNull()
  })
})

describe('the environment banner', () => {
  function descriptor(overrides: Partial<EnvironmentDescriptor> = {}): EnvironmentDescriptor {
    return {
      environment: 'staging',
      label: 'Hazırlık ortamı',
      code: 'TEST',
      isProduction: false,
      showBanner: true,
      markDangerousActions: true,
      projectRef: 'abcdefghijkl',
      release: null,
      configured: true,
      ...overrides,
    }
  }

  it('tells a staging operator the data in front of them is not real', () => {
    expect(environmentBannerText(descriptor())).toBe(
      'Hazırlık ortamı · abcdefghijkl — bu ekrandaki veriler canlı müşteri verisi değildir.',
    )
  })

  it('says the opposite in production, because a dialog may quote it', () => {
    const production = descriptor({
      environment: 'production',
      label: 'Canlı ortam',
      code: 'PROD',
      isProduction: true,
      showBanner: false,
      markDangerousActions: false,
    })
    expect(environmentBannerText(production)).toContain('gerçek müşteri verisiyle çalışıyor')
    expect(environmentBannerText(production)).not.toContain('değildir')
  })

  it('omits the project reference when there is none', () => {
    expect(environmentBannerText(descriptor({ projectRef: null }))).toBe(
      'Hazırlık ortamı — bu ekrandaki veriler canlı müşteri verisi değildir.',
    )
  })

  it('warns beside a destructive control everywhere but production', () => {
    expect(dangerousActionNote(descriptor())).toBe(
      'Hazırlık ortamı: bu işlem gerçek müşteriyi etkilemez.',
    )
    expect(dangerousActionNote(descriptor({ markDangerousActions: false }))).toBeNull()
  })

  it('agrees with itself about what is not production', () => {
    expect(isNonProduction(descriptor())).toBe(true)
    expect(isNonProduction(descriptor({ isProduction: true }))).toBe(false)
    expect(DEPLOYMENT_ENVIRONMENTS).toContain('production')
  })
})

describe('describeEnvironment — wrong in the safe direction', () => {
  /**
   * Read through a fresh module instance: `readEnv()` memoises, and the
   * descriptor's `configured` flag depends on it.
   */
  async function describe_(): Promise<EnvironmentDescriptor> {
    vi.resetModules()
    const fresh = await import('../env.ts')
    return fresh.describeEnvironment()
  }

  it('takes the explicit answer when there is one', async () => {
    process.env['BACKOFFICE_ENV'] = 'production'
    const result = await describe_()
    expect(result.environment).toBe('production')
    expect(result.isProduction).toBe(true)
    expect(result.showBanner).toBe(false)
  })

  it('accepts the spellings a deploy actually uses', async () => {
    process.env['BACKOFFICE_ENV'] = 'PROD'
    expect((await describe_()).environment).toBe('production')
    process.env['BACKOFFICE_ENV'] = 'preview'
    expect((await describe_()).environment).toBe('staging')
  })

  it('resolves an unrecognised value to development, never to production', async () => {
    process.env['BACKOFFICE_ENV'] = 'canary'
    const result = await describe_()
    expect(result.environment).toBe('development')
    expect(result.isProduction).toBe(false)
    expect(result.showBanner).toBe(true)
    expect(result.markDangerousActions).toBe(true)
  })

  it('maps a Vercel preview to staging when nothing explicit is set', async () => {
    process.env['VERCEL_ENV'] = 'preview'
    expect((await describe_()).environment).toBe('staging')
  })

  it('reports the project and the release without reporting a key', async () => {
    configureEverything()
    const result = await describe_()
    expect(result.projectRef).toBe('abcdefghijkl')
    expect(result.release).toBe('c0ffee1')
    expect(result.configured).toBe(true)

    const serialised = JSON.stringify(result)
    for (const secret of SENTINELS) {
      for (const fragment of fragments(secret, 4)) {
        expect(serialised).not.toContain(fragment)
      }
    }
  })

  it('reports itself unconfigured rather than throwing when a key is missing', async () => {
    process.env['SUPABASE_URL'] = SUPABASE_URL
    const result = await describe_()
    expect(result.configured).toBe(false)
    expect(result.projectRef).toBe('abcdefghijkl')
  })
})
