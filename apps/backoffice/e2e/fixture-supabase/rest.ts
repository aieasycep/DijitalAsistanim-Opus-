import type { Pool } from 'pg'
import type { Catalog } from './catalog.ts'
import { FixtureRequestError, FixtureUnsupportedError } from './errors.ts'
import {
  Params,
  orderFragment,
  quoteIdentifier,
  readWindow,
  selectFragment,
  whereClause,
} from './query.ts'

/**
 * `/rest/v1/<relation>` — the PostgREST verbs the console uses.
 *
 * Reads go through `bo_*` views and the operator-owned tables; writes are the
 * three tables `auth.ts` may write plus the ones the Server Actions insert into.
 * Nothing here decides what may be read: that is `db.ts`'s frozen registry and
 * the migrations' own grants, and this server deliberately does not re-implement
 * either — a request naming a content table would be answered honestly, which is
 * what makes the content-blindness spec a real test of the application rather
 * than of this file.
 */

export interface RestRequest {
  readonly method: string
  readonly relation: string
  readonly params: URLSearchParams
  readonly headers: Readonly<Record<string, string | undefined>>
  readonly body: unknown
}

export interface RestResponse {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: string | null
}

function preferences(headers: RestRequest['headers']): readonly string[] {
  const raw = headers['prefer']
  if (raw === undefined) return []
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
}

function wantsRepresentation(headers: RestRequest['headers']): boolean {
  return preferences(headers).includes('return=representation')
}

function wantsExactCount(headers: RestRequest['headers']): boolean {
  return preferences(headers).some((preference) => preference.startsWith('count='))
}

function json(body: unknown): string {
  return JSON.stringify(body)
}

/**
 * Rows are rendered to JSON by Postgres, not by the driver.
 *
 * `node-postgres` decodes what it recognises and hands back the raw literal for
 * everything else — a `text[]` becomes a JavaScript array but an
 * `account_kind[]` stays the string `{mail,calendar}`, a `bigint` stays a string
 * and a `timestamptz` becomes a `Date` that stringifies to a different shape
 * from the one PostgREST sends. Every one of those is a difference the console
 * would trip over in a way it never would in production — `kinds.map is not a
 * function` in a table cell, a count that renders as `"12"`, a keyset cursor
 * that does not round-trip. `to_jsonb` is the same conversion PostgREST
 * performs, so the wire shape matches.
 */
function asJsonRows(inner: string): string {
  return `select to_jsonb(t) as row from (${inner}) as t`
}

interface JsonRow {
  row: unknown
}

function contentRange(offset: number, returned: number, total: number | null): string {
  const suffix = total === null ? '*' : String(total)
  if (returned === 0) return `*/${suffix}`
  return `${offset}-${offset + returned - 1}/${suffix}`
}

/** The rows a write should return, as a `returning` clause or null. */
function returningClause(catalog: Catalog, relation: string, params: URLSearchParams): string {
  const info = catalog.relation(relation)
  return selectFragment(catalog, info, params.get('select'))
}

// ===========================================================================
// Reading
// ===========================================================================

async function handleSelect(
  pool: Pool,
  catalog: Catalog,
  request: RestRequest,
): Promise<RestResponse> {
  const relation = catalog.relation(request.relation)
  const bind = new Params()
  const projection = selectFragment(catalog, relation, request.params.get('select'))
  const where = whereClause(catalog, relation, request.params, bind)
  const order = orderFragment(catalog, relation, request.params.get('order'))
  const window = readWindow(request.params, request.headers['range'])

  const source = `public.${quoteIdentifier(relation.name)}`
  let inner = `select ${projection} from ${source}${where.text}`
  if (order !== null) inner += ` order by ${order}`
  if (window.limit !== null) inner += ` limit ${window.limit}`
  if (window.offset > 0) inner += ` offset ${window.offset}`

  const wantsCount = wantsExactCount(request.headers)
  const isHead = request.method === 'HEAD'

  // `head: true` means the caller wants the count and nothing else, so the row
  // bodies never leave Postgres either.
  const rows = isHead
    ? []
    : (await pool.query<JsonRow>({ text: asJsonRows(inner), values: [...bind.list()] })).rows.map(
        (row) => row.row,
      )

  let total: number | null = null
  if (wantsCount) {
    const countBind = new Params()
    const countWhere = whereClause(catalog, relation, request.params, countBind)
    const countResult = await pool.query<{ total: string }>({
      text: `select count(*)::text as total from ${source}${countWhere.text}`,
      values: [...countBind.list()],
    })
    total = Number(countResult.rows[0]?.total ?? '0')
  }

  const returned = isHead && wantsCount ? 0 : rows.length
  const partial = window.fromHeader && total !== null && total > returned
  return {
    status: partial ? 206 : 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-range': contentRange(window.offset, returned, total),
      'range-unit': 'items',
    },
    body: isHead ? null : json(rows),
  }
}

// ===========================================================================
// Writing
// ===========================================================================

function rowsFromBody(body: unknown): readonly Record<string, unknown>[] {
  if (Array.isArray(body)) {
    return body.map((entry) => {
      if (typeof entry !== 'object' || entry === null) {
        throw new FixtureRequestError(400, 'PGRST102', 'insert payload must be objects')
      }
      return entry as Record<string, unknown>
    })
  }
  if (typeof body === 'object' && body !== null) return [body as Record<string, unknown>]
  throw new FixtureRequestError(400, 'PGRST102', 'insert payload must be an object or an array')
}

async function handleInsert(
  pool: Pool,
  catalog: Catalog,
  request: RestRequest,
): Promise<RestResponse> {
  const relation = catalog.relation(request.relation)
  const rows = rowsFromBody(request.body)
  if (rows.length === 0) {
    throw new FixtureRequestError(400, 'PGRST102', 'insert payload is empty')
  }

  // PostgREST takes the column set from the first object and requires the rest
  // to match; the console only ever inserts one row at a time.
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))]
  for (const column of columns) catalog.column(relation, column)

  const bind = new Params()
  const tuples = rows.map(
    (row) => `(${columns.map((column) => bind.add(row[column] ?? null)).join(', ')})`,
  )
  const target = `public.${quoteIdentifier(relation.name)}`
  const returning = wantsRepresentation(request.headers)
  const statement = `insert into ${target} (${columns.map(quoteIdentifier).join(', ')}) values ${tuples.join(', ')}`
  if (!returning) {
    await pool.query({ text: statement, values: [...bind.list()] })
    return { status: 201, headers: { 'content-range': '*/*' }, body: null }
  }

  const projection = returningClause(catalog, request.relation, request.params)
  const result = await pool.query<JsonRow>({
    text: `with written as (${statement} returning ${projection}) ${asJsonRows('select * from written')}`,
    values: [...bind.list()],
  })
  const written = result.rows.map((row) => row.row)
  return {
    status: 201,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-range': contentRange(0, written.length, written.length),
    },
    body: json(written),
  }
}

async function handleUpdate(
  pool: Pool,
  catalog: Catalog,
  request: RestRequest,
): Promise<RestResponse> {
  const relation = catalog.relation(request.relation)
  if (typeof request.body !== 'object' || request.body === null || Array.isArray(request.body)) {
    throw new FixtureRequestError(400, 'PGRST102', 'update payload must be a single object')
  }
  const patch = request.body as Record<string, unknown>
  const columns = Object.keys(patch)
  if (columns.length === 0) {
    throw new FixtureRequestError(400, 'PGRST102', 'update payload has no columns')
  }
  for (const column of columns) catalog.column(relation, column)

  const bind = new Params()
  const assignments = columns
    .map((column) => `${quoteIdentifier(column)} = ${bind.add(patch[column] ?? null)}`)
    .join(', ')
  const where = whereClause(catalog, relation, request.params, bind)
  if (where.count === 0) {
    // PostgREST refuses an unfiltered mutation, and so does `db.ts`. Accepting
    // one here would let a bug that dropped a filter pass its test.
    throw new FixtureRequestError(400, 'PGRST103', 'an unfiltered update is refused')
  }

  const returning = wantsRepresentation(request.headers)
  const statement = `update public.${quoteIdentifier(relation.name)} set ${assignments}${where.text}`
  if (!returning) {
    await pool.query({ text: statement, values: [...bind.list()] })
    return { status: 204, headers: { 'content-range': '*/*' }, body: null }
  }

  const projection = returningClause(catalog, request.relation, request.params)
  const result = await pool.query<JsonRow>({
    text: `with written as (${statement} returning ${projection}) ${asJsonRows('select * from written')}`,
    values: [...bind.list()],
  })
  const rows = result.rows.map((row) => row.row)
  return {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-range': contentRange(0, rows.length, rows.length),
    },
    body: json(rows),
  }
}

async function handleDelete(
  pool: Pool,
  catalog: Catalog,
  request: RestRequest,
): Promise<RestResponse> {
  const relation = catalog.relation(request.relation)
  const bind = new Params()
  const where = whereClause(catalog, relation, request.params, bind)
  if (where.count === 0) {
    throw new FixtureRequestError(400, 'PGRST103', 'an unfiltered delete is refused')
  }

  const returning = wantsRepresentation(request.headers)
  const statement = `delete from public.${quoteIdentifier(relation.name)}${where.text}`
  if (!returning) {
    await pool.query({ text: statement, values: [...bind.list()] })
    return { status: 204, headers: { 'content-range': '*/*' }, body: null }
  }

  const projection = returningClause(catalog, request.relation, request.params)
  const result = await pool.query<JsonRow>({
    text: `with written as (${statement} returning ${projection}) ${asJsonRows('select * from written')}`,
    values: [...bind.list()],
  })
  const rows = result.rows.map((row) => row.row)
  return {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-range': contentRange(0, rows.length, rows.length),
    },
    body: json(rows),
  }
}

export async function handleRest(
  pool: Pool,
  catalog: Catalog,
  request: RestRequest,
): Promise<RestResponse> {
  switch (request.method) {
    case 'GET':
    case 'HEAD':
      return handleSelect(pool, catalog, request)
    case 'POST':
      return handleInsert(pool, catalog, request)
    case 'PATCH':
      return handleUpdate(pool, catalog, request)
    case 'DELETE':
      return handleDelete(pool, catalog, request)
    default:
      throw new FixtureUnsupportedError('rest method', request.method)
  }
}
