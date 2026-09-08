import { AppError } from '@da/domain'

/**
 * Server-side configuration, and the console's awareness of which deployment it
 * is talking to.
 *
 * ---------------------------------------------------------------------------
 * WHY THE SECRETS LIVE HERE AND NOWHERE ELSE
 * ---------------------------------------------------------------------------
 *
 * Nothing read here is prefixed `NEXT_PUBLIC_`, which is the point: the
 * service-role key bypasses row level security entirely, so a build that
 * inlined it into a client bundle would hand every visitor the whole database.
 * `readEnv()` is imported by `db.ts` alone — which is `server-only` — so the key
 * stays on the server by construction rather than by convention.
 *
 * ---------------------------------------------------------------------------
 * WHY THE ENVIRONMENT IS PART OF THE SAME MODULE
 * ---------------------------------------------------------------------------
 *
 * An operations console that looks identical against production and against
 * staging is a console where someone eventually disconnects a real customer's
 * mailbox while trying to reproduce a bug. The specification asks for an
 * unmistakable banner and for dangerous actions to be visually distinct outside
 * production, so the environment has to be a first-class, typed fact that the
 * shell can render and that an action can branch on — not a string somebody
 * re-derives from `NODE_ENV` in three different components.
 *
 * `describeEnvironment()` reads the server's own configuration and refuses to
 * run in a browser, because a client bundle has no access to these variables and
 * would silently report "development" while pointed at production. The
 * descriptor it returns is a plain serialisable object: a Server Component
 * renders the banner and passes the descriptor down to any Client Component that
 * needs it. The pure helpers at the bottom of this file operate on that
 * descriptor and are safe to import anywhere.
 */

// ===========================================================================
// Secrets
// ===========================================================================

export interface BackofficeEnv {
  supabaseUrl: string
  serviceRoleKey: string
  anonKey: string
}

/** Every variable this application reads, in the order a deploy sets them. */
export const ENV_VARIABLES = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'BACKOFFICE_ENV',
  'BACKOFFICE_HASH_SALT',
  'BACKOFFICE_RELEASE',
] as const

export type EnvVariable = (typeof ENV_VARIABLES)[number]

/** First non-empty of the given variables, trimmed, or undefined. */
function optional(...names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]
    if (value !== undefined && value.trim() !== '') return value.trim()
  }
  return undefined
}

/** First non-empty of the given variables, or a 500 naming all of them. */
function required(...names: readonly string[]): string {
  const value = optional(...names)
  if (value !== undefined) return value
  throw new AppError('unknown', {
    detail: `${names.join(' / ')} is not set`,
    status: 500,
  })
}

let cached: BackofficeEnv | null = null

export function readEnv(): BackofficeEnv {
  if (cached) return cached
  cached = {
    supabaseUrl: required('SUPABASE_URL').replace(/\/+$/, ''),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    // The anon key signs staff in through GoTrue and refreshes their token at
    // the edge. It is public by design and is never used for a data read: every
    // read goes through the bo_* views with the service role. The
    // NEXT_PUBLIC_ name is accepted as a fallback so a deployment that already
    // has the project's standard variables set needs no new secret.
    anonKey: required('SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  }
  return cached
}

/** True when the process has everything it needs to reach Supabase. */
export function isConfigured(): boolean {
  try {
    readEnv()
    return true
  } catch {
    return false
  }
}

/**
 * Keying material for the one-way hashes the admin platform stores — the
 * rate-limiter's `subject_key` and `admin_sessions.ip_hash`, both of which are
 * constrained to 64 hex characters precisely so a raw address can never be
 * written into them.
 *
 * An unkeyed SHA-256 of an email address is reversible by anyone with a word
 * list, so the hash is keyed. `BACKOFFICE_HASH_SALT` is the intended source. It
 * is optional rather than required because a deployment that has not set it must
 * still boot: the fallback is the service-role key, which is high-entropy,
 * server-only, and already the most sensitive value this process holds. That is
 * a legitimate HMAC key — it never leaves the server and no hash discloses it —
 * but rotating it rotates every bucket, so a real deployment should set the
 * dedicated variable. `secretInventory()` reports which of the two is in use.
 */
export function readHashKey(): string {
  const salt = optional('BACKOFFICE_HASH_SALT')
  if (salt !== undefined) return salt
  return readEnv().serviceRoleKey
}

/** True when a dedicated salt is configured rather than the fallback. */
export function hasDedicatedHashSalt(): boolean {
  return optional('BACKOFFICE_HASH_SALT') !== undefined
}

// ===========================================================================
// Environment awareness
// ===========================================================================

export const DEPLOYMENT_ENVIRONMENTS = ['production', 'staging', 'development'] as const
export type DeploymentEnvironment = (typeof DEPLOYMENT_ENVIRONMENTS)[number]

/**
 * Everything the shell needs to render the environment banner, and everything an
 * action needs to decide whether it is operating on real customer data.
 *
 * Serialisable by design: a Server Component obtains it and passes it to Client
 * Components as a prop.
 */
export interface EnvironmentDescriptor {
  environment: DeploymentEnvironment
  /** Turkish label for the banner. */
  label: string
  /** Four-character chip: PROD / TEST / GELS. */
  code: string
  isProduction: boolean
  /**
   * Whether the shell must render the environment banner. False in production
   * only: a permanent banner on the real console is noise that trains operators
   * to ignore banners.
   */
  showBanner: boolean
  /**
   * Whether destructive controls must be rendered in their non-production
   * treatment. True everywhere except production, so an operator can tell at a
   * glance that the button in front of them will not touch a customer.
   */
  markDangerousActions: boolean
  /**
   * The Supabase project this console is pointed at, e.g. `abcdefgh` from
   * `https://abcdefgh.supabase.co`. An identifier, not a secret: it is what
   * makes "am I on staging?" answerable from the screen rather than from a
   * deployment dashboard. Null for a self-hosted or local URL.
   */
  projectRef: string | null
  /** The deployed commit, when the platform provides one. */
  release: string | null
  /** False when Supabase credentials are missing; the console cannot read. */
  configured: boolean
}

const ENVIRONMENT_LABELS: Readonly<Record<DeploymentEnvironment, { label: string; code: string }>> =
  Object.freeze({
    production: { label: 'Canlı ortam', code: 'PROD' },
    staging: { label: 'Hazırlık ortamı', code: 'TEST' },
    development: { label: 'Geliştirme ortamı', code: 'GELŞ' },
  })

function isDeploymentEnvironment(value: string): value is DeploymentEnvironment {
  return (DEPLOYMENT_ENVIRONMENTS as readonly string[]).includes(value)
}

/**
 * Resolve the deployment from configuration.
 *
 * `BACKOFFICE_ENV` wins because it is the explicit answer. `VERCEL_ENV` is
 * mapped next (`preview` is a staging deployment, whatever its branch), then
 * `NODE_ENV`. Anything unrecognised resolves to `development`, which is the safe
 * direction to be wrong in: an over-cautious banner on the real console is a
 * nuisance, while a missing one on staging is how a test disconnect lands on a
 * paying customer.
 */
function resolveEnvironment(): DeploymentEnvironment {
  const explicit = optional('BACKOFFICE_ENV', 'APP_ENV')
  if (explicit !== undefined) {
    const normalised = explicit.toLowerCase()
    if (isDeploymentEnvironment(normalised)) return normalised
    if (normalised === 'prod' || normalised === 'live') return 'production'
    if (normalised === 'preview' || normalised === 'test' || normalised === 'stage') {
      return 'staging'
    }
    if (normalised === 'dev' || normalised === 'local') return 'development'
    return 'development'
  }

  const vercel = optional('VERCEL_ENV')
  if (vercel === 'production') return 'production'
  if (vercel === 'preview') return 'staging'
  if (vercel === 'development') return 'development'

  return process.env.NODE_ENV === 'production' ? 'production' : 'development'
}

/** `abcdefgh` from `https://abcdefgh.supabase.co`, or null when self-hosted. */
export function projectRefOf(supabaseUrl: string): string | null {
  try {
    const host = new URL(supabaseUrl).hostname
    if (!host.endsWith('.supabase.co') && !host.endsWith('.supabase.in')) return null
    const ref = host.split('.')[0]
    return ref !== undefined && ref.length > 0 ? ref : null
  } catch {
    return null
  }
}

/**
 * The environment, as a fact the console can render.
 *
 * Throws in a browser rather than guessing. None of the variables it reads are
 * `NEXT_PUBLIC_`, so a Client Component calling this would receive `undefined`
 * for every one of them and be told it was in development while pointed at
 * production — an environment banner that lies is worse than no banner.
 */
export function describeEnvironment(): EnvironmentDescriptor {
  if (typeof window !== 'undefined') {
    throw new AppError('forbidden', {
      detail:
        'describeEnvironment() is server-side; render the banner in a Server Component and pass the descriptor down as a prop',
      status: 500,
    })
  }

  const environment = resolveEnvironment()
  const naming = ENVIRONMENT_LABELS[environment]
  const supabaseUrl = optional('SUPABASE_URL')

  return {
    environment,
    label: naming.label,
    code: naming.code,
    isProduction: environment === 'production',
    showBanner: environment !== 'production',
    markDangerousActions: environment !== 'production',
    projectRef: supabaseUrl === undefined ? null : projectRefOf(supabaseUrl),
    release: optional('BACKOFFICE_RELEASE', 'VERCEL_GIT_COMMIT_SHA') ?? null,
    configured: isConfigured(),
  }
}

// ===========================================================================
// Secret inventory
//
// The specification is explicit: secret configuration shows "configured" or
// "not configured" and nothing more. This returns exactly that — a name, a
// presence flag and a Turkish description. No value, no prefix, no length, no
// fingerprint. A page that renders this cannot leak a key because it is never
// given one.
// ===========================================================================

export interface SecretStatus {
  variable: EnvVariable
  configured: boolean
  /** Whether the console is unusable without it. */
  required: boolean
  /** Turkish description of what this variable is for. */
  description: string
  /**
   * Set when the variable is absent but the console is still working because
   * something else is standing in for it. Turkish, rendered as a caveat rather
   * than as a green tick.
   */
  fallbackNote: string | null
}

export function secretInventory(): readonly SecretStatus[] {
  return [
    {
      variable: 'SUPABASE_URL',
      configured: optional('SUPABASE_URL') !== undefined,
      required: true,
      description: 'Supabase proje adresi. Tüm okumalar buraya gider.',
      fallbackNote: null,
    },
    {
      variable: 'SUPABASE_SERVICE_ROLE_KEY',
      configured: optional('SUPABASE_SERVICE_ROLE_KEY') !== undefined,
      required: true,
      description: 'Servis anahtarı. Yalnızca sunucuda tutulur, hiçbir ekrana yazılmaz.',
      fallbackNote: null,
    },
    {
      variable: 'SUPABASE_ANON_KEY',
      configured: optional('SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY') !== undefined,
      required: true,
      description: 'Yönetici girişinde GoTrue ile konuşmak için kullanılır.',
      fallbackNote:
        optional('SUPABASE_ANON_KEY') === undefined &&
        optional('NEXT_PUBLIC_SUPABASE_ANON_KEY') !== undefined
          ? 'NEXT_PUBLIC_SUPABASE_ANON_KEY üzerinden okunuyor.'
          : null,
    },
    {
      variable: 'BACKOFFICE_ENV',
      configured: optional('BACKOFFICE_ENV', 'APP_ENV') !== undefined,
      required: false,
      description: 'Ortam etiketi (production / staging / development).',
      fallbackNote:
        optional('BACKOFFICE_ENV', 'APP_ENV') === undefined
          ? 'Ayarlanmamış; ortam VERCEL_ENV ve NODE_ENV üzerinden çıkarsanıyor.'
          : null,
    },
    {
      variable: 'BACKOFFICE_HASH_SALT',
      configured: hasDedicatedHashSalt(),
      required: false,
      description: 'Hız sınırı ve IP özetlerinde kullanılan anahtar.',
      fallbackNote: hasDedicatedHashSalt()
        ? null
        : 'Ayarlanmamış; servis anahtarı geçici olarak kullanılıyor. Kendi değerinizi tanımlayın.',
    },
    {
      variable: 'BACKOFFICE_RELEASE',
      configured: optional('BACKOFFICE_RELEASE', 'VERCEL_GIT_COMMIT_SHA') !== undefined,
      required: false,
      description: 'Yayındaki sürüm etiketi. Hata raporlarında gösterilir.',
      fallbackNote: null,
    },
  ]
}

// ===========================================================================
// Pure helpers
//
// These take a descriptor rather than reading configuration, so a Client
// Component can import them and operate on the prop it was handed.
// ===========================================================================

/** True when the console is pointed at something other than production. */
export function isNonProduction(descriptor: EnvironmentDescriptor): boolean {
  return !descriptor.isProduction
}

/**
 * The banner text, complete. Kept here rather than in a component so the
 * production/staging wording cannot drift between the shell and a dialog.
 *
 * The production sentence is the opposite of the others and is deliberately
 * kept: the shell does not render a banner there, but a dialog that quotes this
 * function must not tell an operator their production data is fake.
 */
export function environmentBannerText(descriptor: EnvironmentDescriptor): string {
  const project = descriptor.projectRef === null ? '' : ` · ${descriptor.projectRef}`
  if (descriptor.isProduction) {
    return `${descriptor.label}${project} — bu konsol gerçek müşteri verisiyle çalışıyor.`
  }
  return `${descriptor.label}${project} — bu ekrandaki veriler canlı müşteri verisi değildir.`
}

/**
 * The warning shown next to a destructive control. Null in production, where the
 * button's own confirmation dialog is the warning and an extra banner would
 * dilute it.
 */
export function dangerousActionNote(descriptor: EnvironmentDescriptor): string | null {
  if (!descriptor.markDangerousActions) return null
  return `${descriptor.label}: bu işlem gerçek müşteriyi etkilemez.`
}
