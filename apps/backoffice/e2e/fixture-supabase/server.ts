import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import pg from 'pg'
import { loadCatalog, type Catalog } from './catalog.ts'
import { FixtureRequestError, isFixtureRequest, isFixtureUnsupported } from './errors.ts'
import { FixtureGoTrue } from './gotrue.ts'
import { handleRest, type RestResponse } from './rest.ts'
import { handleRpc } from './rpc.ts'

/**
 * A Supabase project, as far as the backoffice can tell, backed by a real
 * PostgreSQL database.
 *
 * The console talks to exactly three surfaces — GoTrue at `/auth/v1`, PostgREST
 * at `/rest/v1`, and `/rest/v1/rpc` for the admin platform's functions — and
 * this server implements those three against the same migrations CI applies. It
 * is not a mock: every filter becomes SQL, every constraint that refuses a write
 * is the constraint in `0019_admin_platform.sql`, and every `sa_reveal_*` call
 * runs the real `security definer` function with its real four-eyes check.
 *
 * ---------------------------------------------------------------------------
 * WHY IT REFUSES INSTEAD OF COPING
 * ---------------------------------------------------------------------------
 *
 * The failure mode a shim like this invites is silence: an unrecognised filter
 * becomes "no filter", the page renders an empty table, and a suite that asserts
 * "no user content appears here" passes because nothing appeared at all. So
 * there is no default branch that returns `[]`. Anything unimplemented raises a
 * named `FixtureUnsupportedError`, which is logged, counted, and answered 501 —
 * and `/__fixture/diagnostics` exposes the counter so a spec can assert the
 * whole run stayed inside the translated subset.
 */

export interface FixtureSupabaseOptions {
  readonly databaseUrl: string
  readonly jwtSecret: string
  readonly anonKey: string
  readonly serviceRoleKey: string
  readonly port?: number
}

export interface UnsupportedRecord {
  readonly feature: string
  readonly detail: string
  readonly method: string
  readonly path: string
}

export interface FixtureSupabase {
  readonly url: string
  readonly port: number
  unsupported(): readonly UnsupportedRecord[]
  close(): Promise<void>
}

const SQLSTATE_STATUS: Readonly<Record<string, number>> = Object.freeze({
  '23505': 409,
  '23503': 409,
  '23502': 400,
  '23514': 400,
  '22P02': 400,
  '22003': 400,
  P0001: 400,
  '42501': 403,
  '42P01': 404,
  '42883': 404,
  '57014': 504,
})

interface PostgresError {
  code?: string
  message?: string
  detail?: string
  hint?: string
}

function isPostgresError(error: unknown): error is PostgresError {
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return null
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new FixtureRequestError(400, 'PGRST102', 'request body is not valid json')
  }
}

function headerRecord(request: IncomingMessage): Record<string, string | undefined> {
  const headers: Record<string, string | undefined> = {}
  for (const [name, value] of Object.entries(request.headers)) {
    headers[name] = Array.isArray(value) ? value.join(', ') : value
  }
  return headers
}

function send(response: ServerResponse, result: RestResponse): void {
  for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value)
  response.statusCode = result.status
  if (result.body === null) {
    response.end()
    return
  }
  response.end(result.body)
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status
  if (body === null) {
    response.end()
    return
  }
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body))
}

export async function startFixtureSupabase(
  options: FixtureSupabaseOptions,
): Promise<FixtureSupabase> {
  const pool = new pg.Pool({ connectionString: options.databaseUrl, max: 12 })
  const catalog: Catalog = await loadCatalog(pool)
  const unsupported: UnsupportedRecord[] = []

  // Only known once the socket has a port, and read late by the token issuer.
  let issuer = ''
  const goTrue = new FixtureGoTrue({
    pool,
    jwtSecret: options.jwtSecret,
    issuer: () => issuer,
  })

  const server: Server = createServer((request, response) => {
    void route(request, response)
  })

  async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', issuer === '' ? 'http://fixture.invalid' : issuer)
    const method = (request.method ?? 'GET').toUpperCase()
    const headers = headerRecord(request)

    try {
      if (url.pathname === '/__fixture/health') {
        sendJson(response, 200, { ok: true })
        return
      }
      if (url.pathname === '/__fixture/diagnostics') {
        sendJson(response, 200, { unsupported })
        return
      }

      // Both Supabase clients and both bare `fetch` call sites in the console
      // send the project key. Refusing without it turns a misconfigured client
      // into a visible failure instead of an anonymous read.
      const apikey = headers['apikey'] ?? ''
      if (apikey !== options.anonKey && apikey !== options.serviceRoleKey) {
        sendJson(response, 401, {
          message: 'No API key found in request',
          hint: 'the fixture project expects the anon or service-role key in the apikey header',
        })
        return
      }

      const body = method === 'GET' || method === 'HEAD' ? null : await readBody(request)

      if (url.pathname.startsWith('/auth/v1')) {
        const result = await goTrue.handle(
          method,
          url.pathname.slice('/auth/v1'.length),
          url.searchParams,
          headers,
          body,
        )
        sendJson(response, result.status, result.body)
        return
      }

      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const name = decodeURIComponent(url.pathname.slice('/rest/v1/rpc/'.length))
        send(response, await handleRpc(pool, catalog, name, body))
        return
      }

      if (url.pathname.startsWith('/rest/v1/')) {
        const relation = decodeURIComponent(url.pathname.slice('/rest/v1/'.length))
        send(
          response,
          await handleRest(pool, catalog, {
            method,
            relation,
            params: url.searchParams,
            headers,
            body,
          }),
        )
        return
      }

      throw new FixtureRequestError(404, 'PGRST404', `no route for ${method} ${url.pathname}`)
    } catch (error) {
      handleFailure(method, url.pathname, error, response)
    }
  }

  function handleFailure(
    method: string,
    path: string,
    error: unknown,
    response: ServerResponse,
  ): void {
    if (isFixtureUnsupported(error)) {
      unsupported.push({ feature: error.feature, detail: error.message, method, path })
      // Loud on purpose: this is the shim admitting it cannot answer, and a
      // silent 200 here is the one failure mode that would make the whole suite
      // dishonest.
      console.error(`[fixture-supabase] UNSUPPORTED ${method} ${path}: ${error.message}`)
      sendJson(response, 501, {
        code: 'FIXTURE_UNSUPPORTED',
        message: error.message,
        details: error.feature,
        hint: null,
      })
      return
    }

    if (isFixtureRequest(error)) {
      sendJson(response, error.status, {
        code: error.code,
        message: error.message,
        details: null,
        hint: null,
      })
      return
    }

    if (isPostgresError(error)) {
      const code = error.code ?? 'XX000'
      sendJson(response, SQLSTATE_STATUS[code] ?? 500, {
        code,
        message: error.message ?? 'database error',
        details: error.detail ?? null,
        hint: error.hint ?? null,
      })
      return
    }

    console.error(`[fixture-supabase] unexpected failure on ${method} ${path}`, error)
    sendJson(response, 500, {
      code: 'XX000',
      message: error instanceof Error ? error.message : 'unknown failure',
      details: null,
      hint: null,
    })
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 0, '127.0.0.1', resolve)
  })

  const address = server.address() as AddressInfo
  issuer = `http://127.0.0.1:${address.port}`

  return {
    url: issuer,
    port: address.port,
    unsupported: () => unsupported,
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve()
        })
      })
      await pool.end()
    },
  }
}
