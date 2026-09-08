import { randomUUID, timingSafeEqual } from 'node:crypto'
import type { Pool } from 'pg'
import { FixtureUnsupportedError } from './errors.ts'
import { signAccessToken, verifyAccessToken } from './jwt.ts'

/**
 * `/auth/v1/*` — enough GoTrue for the console's sign-in, and no more.
 *
 * The console reaches GoTrue in three places: `signInWithPassword()` through
 * `supabase-js`, `readGoTrueUser()` through a bare fetch to `/user`, and the
 * edge proxy's refresh through `/token?grant_type=refresh_token`. Each is
 * implemented here against the run's own credential table; everything else on
 * the GoTrue surface — magic links, OTP, admin endpoints, factor enrolment —
 * answers with a named refusal, because a console that started depending on one
 * of them should fail a test rather than quietly work in production only.
 *
 * The passwords live in a `e2e_fixture` schema inside the scratch database
 * rather than in this file: they are generated per run, so there is nothing here
 * to leak and nothing to rotate.
 */

export interface GoTrueResult {
  readonly status: number
  readonly body: unknown
}

interface CredentialRow {
  user_id: string
  email: string
  password: string
  created_at: string
}

interface RefreshRecord {
  readonly userId: string
  readonly aal: 'aal1' | 'aal2'
}

const ACCESS_TOKEN_TTL_SECONDS = 3600

export interface GoTrueOptions {
  readonly pool: Pool
  readonly jwtSecret: string
  /** Read late: the server's own origin is only known once it has a port. */
  readonly issuer: () => string
}

export class FixtureGoTrue {
  private readonly pool: Pool
  private readonly jwtSecret: string
  private readonly issuer: () => string
  private readonly refreshTokens = new Map<string, RefreshRecord>()

  constructor(options: GoTrueOptions) {
    this.pool = options.pool
    this.jwtSecret = options.jwtSecret
    this.issuer = options.issuer
  }

  async handle(
    method: string,
    path: string,
    params: URLSearchParams,
    headers: Readonly<Record<string, string | undefined>>,
    body: unknown,
  ): Promise<GoTrueResult> {
    if (method === 'POST' && path === '/token') {
      const grant = params.get('grant_type')
      if (grant === 'password') return this.password(body)
      if (grant === 'refresh_token') return this.refresh(body)
      throw new FixtureUnsupportedError('auth grant type', `grant_type=${grant ?? '(missing)'}`)
    }
    if (method === 'GET' && path === '/user') return this.user(headers)
    if (method === 'POST' && path === '/logout') {
      // The console clears its own cookies either way; GoTrue answers 204.
      return { status: 204, body: null }
    }
    throw new FixtureUnsupportedError('auth endpoint', `${method} /auth/v1${path}`)
  }

  private async lookup(email: string): Promise<CredentialRow | null> {
    const result = await this.pool.query<CredentialRow>(
      `select c.user_id, c.email, c.password, u.created_at
         from e2e_fixture.credentials c
         join auth.users u on u.id = c.user_id
        where lower(c.email) = lower($1)`,
      [email],
    )
    return result.rows[0] ?? null
  }

  private async password(body: unknown): Promise<GoTrueResult> {
    const input = (body ?? {}) as { email?: unknown; password?: unknown }
    const email = typeof input.email === 'string' ? input.email : ''
    const password = typeof input.password === 'string' ? input.password : ''
    if (email === '' || password === '') return invalidGrant()

    const row = await this.lookup(email)
    if (row === null) return invalidGrant()

    const presented = Buffer.from(password)
    const stored = Buffer.from(row.password)
    if (presented.length !== stored.length || !timingSafeEqual(presented, stored)) {
      return invalidGrant()
    }

    return { status: 200, body: this.session(row.user_id, row.email, row.created_at, 'aal1') }
  }

  private async refresh(body: unknown): Promise<GoTrueResult> {
    const input = (body ?? {}) as { refresh_token?: unknown }
    const token = typeof input.refresh_token === 'string' ? input.refresh_token : ''
    const record = this.refreshTokens.get(token)
    if (record === undefined) return invalidGrant()
    // Single use, as GoTrue rotates them: a replayed refresh token is refused.
    this.refreshTokens.delete(token)

    const result = await this.pool.query<{ email: string | null; created_at: string }>(
      'select email, created_at from auth.users where id = $1',
      [record.userId],
    )
    const user = result.rows[0]
    if (user === undefined) return invalidGrant()

    return {
      status: 200,
      body: this.session(record.userId, user.email ?? '', user.created_at, record.aal),
    }
  }

  private async user(headers: Readonly<Record<string, string | undefined>>): Promise<GoTrueResult> {
    const authorization = headers['authorization'] ?? ''
    const token = authorization.toLowerCase().startsWith('bearer ')
      ? authorization.slice('bearer '.length).trim()
      : ''
    const claims = token === '' ? null : verifyAccessToken(this.jwtSecret, token)
    if (claims === null) {
      return {
        status: 401,
        body: { code: 401, error_code: 'bad_jwt', msg: 'invalid claim: missing sub claim' },
      }
    }

    const result = await this.pool.query<{ email: string | null; created_at: string }>(
      'select email, created_at from auth.users where id = $1',
      [claims.sub],
    )
    const row = result.rows[0]
    if (row === undefined) {
      return {
        status: 403,
        body: { code: 403, error_code: 'user_not_found', msg: 'User not found' },
      }
    }
    return { status: 200, body: userRecord(claims.sub, row.email ?? '', row.created_at) }
  }

  private session(
    userId: string,
    email: string,
    createdAt: string,
    aal: 'aal1' | 'aal2',
  ): Record<string, unknown> {
    const issuedAt = Math.floor(Date.now() / 1000)
    const expiresAt = issuedAt + ACCESS_TOKEN_TTL_SECONDS
    const accessToken = signAccessToken(this.jwtSecret, {
      sub: userId,
      email,
      aal,
      amr: [{ method: 'password', timestamp: issuedAt }],
      exp: expiresAt,
      iat: issuedAt,
      iss: `${this.issuer()}/auth/v1`,
      aud: 'authenticated',
      role: 'authenticated',
      session_id: randomUUID(),
    })
    const refreshToken = randomUUID().replace(/-/g, '')
    this.refreshTokens.set(refreshToken, { userId, aal })

    return {
      access_token: accessToken,
      token_type: 'bearer',
      // `auth-js` treats a response without `expires_in` as sessionless, so this
      // field is load-bearing rather than decorative.
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      expires_at: expiresAt,
      refresh_token: refreshToken,
      user: userRecord(userId, email, createdAt),
    }
  }
}

function invalidGrant(): GoTrueResult {
  // The wording GoTrue itself uses. The console never renders it — it maps every
  // refusal to one Turkish sentence — and that is the property the sign-in spec
  // checks, so the message here must not be the one on screen.
  return {
    status: 400,
    body: {
      code: 400,
      error_code: 'invalid_credentials',
      error: 'invalid_grant',
      error_description: 'Invalid login credentials',
      msg: 'Invalid login credentials',
    },
  }
}

function userRecord(id: string, email: string, createdAt: string): Record<string, unknown> {
  return {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    email_confirmed_at: createdAt,
    phone: '',
    confirmed_at: createdAt,
    last_sign_in_at: createdAt,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    // No enrolled factor: `BACKOFFICE_MFA_POLICY` is left at its default, under
    // which an admin with no enrolment signs in with a password alone.
    factors: [],
    created_at: createdAt,
    updated_at: createdAt,
    is_anonymous: false,
  }
}
