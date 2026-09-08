import type { Catalog, ColumnInfo, RelationInfo } from './catalog.ts'
import { FixtureRequestError, FixtureUnsupportedError } from './errors.ts'

/**
 * The PostgREST query language, as much of it as this console speaks.
 *
 * The subset is not a guess. It is what `lib/db.ts` and `lib/auth.ts` can
 * actually emit: their `applyFilters` switches enumerate every operator between
 * them, `pagination.ts` is the only producer of an `or=` expression, and
 * `selectList()` never builds anything but a comma-separated list of plain
 * column names. Everything outside that — an embedded resource, a full-text
 * search, a range operator, a computed column — reaches `unsupported()` and
 * stops the request, because a shim that shrugged at one of those would answer
 * a broken query with an empty table.
 *
 * Values are always bound as parameters. Identifiers are always looked up in the
 * catalogue first and quoted afterwards, so the only strings that ever become
 * SQL text are ones Postgres itself declared.
 */

export interface SqlFragment {
  readonly text: string
}

/** Collects bind parameters so a fragment can be built without concatenating. */
export class Params {
  private readonly values: unknown[] = []

  add(value: unknown): string {
    this.values.push(value)
    return `$${this.values.length}`
  }

  list(): readonly unknown[] {
    return this.values
  }
}

export function quoteIdentifier(name: string): string {
  // Every name reaching here came out of `pg_attribute` or `pg_class`, so the
  // escape is belt-and-braces rather than the defence — the defence is that an
  // unknown name never gets this far.
  return `"${name.replace(/"/g, '""')}"`
}

// ===========================================================================
// Tokenising
// ===========================================================================

/**
 * Split on commas that are not inside parentheses, braces or a quoted string.
 *
 * PostgREST's own grammar: `or=(a.eq.1,and(b.eq.2,c.eq.3))` and `in.("x,y",z)`
 * both hinge on this, and splitting naively on `,` is how a keyset cursor
 * containing a comma silently becomes two filters.
 */
export function splitTopLevel(input: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quoted = false
  let escaped = false
  let current = ''

  for (const char of input) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (quoted) {
      if (char === '\\') {
        current += char
        escaped = true
        continue
      }
      if (char === '"') quoted = false
      current += char
      continue
    }
    if (char === '"') {
      quoted = true
      current += char
      continue
    }
    if (char === '(' || char === '{') depth += 1
    else if (char === ')' || char === '}') depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }
  parts.push(current)
  return parts
}

/** PostgREST's double-quoted form, with `\"` and `\\` unescaped. */
function decodeOperand(raw: string): string {
  if (!raw.startsWith('"')) return raw
  if (!raw.endsWith('"') || raw.length < 2) {
    throw new FixtureRequestError(400, 'PGRST100', `unterminated quoted value: ${raw}`)
  }
  let out = ''
  let escaped = false
  for (const char of raw.slice(1, -1)) {
    if (escaped) {
      out += char
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    out += char
  }
  return out
}

// ===========================================================================
// Filters
// ===========================================================================

const COMPARISONS: Readonly<Record<string, string>> = Object.freeze({
  eq: '=',
  neq: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
})

const IS_VALUES: Readonly<Record<string, string>> = Object.freeze({
  null: 'is null',
  true: 'is true',
  false: 'is false',
  unknown: 'is unknown',
})

function likePattern(raw: string): string {
  // PostgREST's convenience: `*` in a filter means `%`, so a caller need not
  // percent-encode one into a query string.
  return raw.replace(/\*/g, '%')
}

function containsFragment(column: ColumnInfo, operand: string, params: Params): string {
  const target = quoteIdentifier(column.name)
  if (column.isArray) {
    // `cs.{a,b}` — the operand is already a Postgres array literal, so it is
    // bound as text and cast to the column's own element type.
    return `${target} @> ${params.add(operand)}::${column.type}`
  }
  if (column.isJson) {
    return `${target} @> ${params.add(operand)}::jsonb`
  }
  throw new FixtureUnsupportedError(
    'contains on a scalar column',
    `"${column.name}" is ${column.type}; cs. applies to arrays and json`,
  )
}

function inFragment(column: ColumnInfo, operand: string, params: Params): string {
  if (!operand.startsWith('(') || !operand.endsWith(')')) {
    throw new FixtureRequestError(400, 'PGRST100', `in. expects a parenthesised list: ${operand}`)
  }
  const inner = operand.slice(1, -1)
  const members = inner === '' ? [] : splitTopLevel(inner).map(decodeOperand)
  // An empty list matches nothing. `in ()` is a syntax error in Postgres, and
  // rendering it as `true` would quietly widen a filter to the whole table.
  if (members.length === 0) return 'false'
  const placeholders = members.map((member) => params.add(member)).join(', ')
  return `${quoteIdentifier(column.name)} in (${placeholders})`
}

/**
 * One `column=operator.value` filter, as SQL.
 *
 * `not.` may prefix any operator, which is how `db.ts` spells `is_not`.
 */
export function filterFragment(
  catalog: Catalog,
  relation: RelationInfo,
  columnName: string,
  rawValue: string,
  params: Params,
): string {
  const column = catalog.column(relation, columnName)

  let rest = rawValue
  let negated = false
  if (rest.startsWith('not.')) {
    negated = true
    rest = rest.slice(4)
  }

  const separator = rest.indexOf('.')
  if (separator <= 0) {
    throw new FixtureRequestError(400, 'PGRST100', `filter "${rawValue}" is not operator.value`)
  }
  const operator = rest.slice(0, separator)
  const operand = rest.slice(separator + 1)

  const fragment = comparisonFragment(column, operator, operand, params)
  return negated ? `not (${fragment})` : fragment
}

function comparisonFragment(
  column: ColumnInfo,
  operator: string,
  rawOperand: string,
  params: Params,
): string {
  const target = quoteIdentifier(column.name)

  const comparison = COMPARISONS[operator]
  if (comparison !== undefined) {
    const operand = decodeOperand(rawOperand)
    if (rawOperand === 'null') {
      // PostgREST compares against SQL NULL here, which matches nothing. That is
      // precisely the filter `db.ts` warns about — it makes a screen look empty
      // rather than broken — so the shim refuses instead of reproducing it.
      throw new FixtureUnsupportedError(
        `${operator} against a bare null`,
        'use is.null; a null comparison silently matches nothing',
      )
    }
    return `${target} ${comparison} ${params.add(operand)}`
  }

  switch (operator) {
    case 'is': {
      const predicate = IS_VALUES[rawOperand]
      if (predicate === undefined) {
        throw new FixtureRequestError(
          400,
          'PGRST100',
          `is. accepts null, true, false or unknown; got "${rawOperand}"`,
        )
      }
      return `${target} ${predicate}`
    }
    case 'in':
      return inFragment(column, rawOperand, params)
    case 'like':
      return `${target} like ${params.add(likePattern(decodeOperand(rawOperand)))}`
    case 'ilike':
      return `${target} ilike ${params.add(likePattern(decodeOperand(rawOperand)))}`
    case 'cs':
      return containsFragment(column, decodeOperand(rawOperand), params)
    default:
      throw new FixtureUnsupportedError(
        `filter operator "${operator}"`,
        `on column "${column.name}"; the console emits eq, neq, gt, gte, lt, lte, in, is, like, ilike and cs`,
      )
  }
}

/**
 * An `or=` / `and=` expression, which is a tree rather than a list.
 *
 * `pagination.ts` builds exactly one shape — `sort.lt.x,and(sort.eq.x,id.lt.y)`
 * — and that shape is a keyset comparison, so getting it wrong would page
 * through an audit trail skipping rows. It is parsed properly rather than
 * pattern-matched.
 */
export function logicFragment(
  catalog: Catalog,
  relation: RelationInfo,
  connective: 'or' | 'and',
  raw: string,
  params: Params,
): string {
  const inner = stripOuterParens(raw)
  const members = splitTopLevel(inner)
  const fragments = members.map((member) => logicMember(catalog, relation, member.trim(), params))
  if (fragments.length === 0) {
    throw new FixtureRequestError(400, 'PGRST100', `empty ${connective}() expression`)
  }
  return `(${fragments.join(` ${connective} `)})`
}

function stripOuterParens(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) {
    throw new FixtureRequestError(400, 'PGRST100', `expected a parenthesised expression: ${raw}`)
  }
  return trimmed.slice(1, -1)
}

function logicMember(
  catalog: Catalog,
  relation: RelationInfo,
  member: string,
  params: Params,
): string {
  let body = member
  let negated = false
  if (body.startsWith('not.')) {
    negated = true
    body = body.slice(4)
  }

  for (const connective of ['and', 'or'] as const) {
    if (body.startsWith(`${connective}(`)) {
      const fragment = logicFragment(
        catalog,
        relation,
        connective,
        body.slice(connective.length),
        params,
      )
      return negated ? `not ${fragment}` : fragment
    }
  }

  const separator = body.indexOf('.')
  if (separator <= 0) {
    throw new FixtureRequestError(400, 'PGRST100', `"${member}" is not column.operator.value`)
  }
  const columnName = body.slice(0, separator)
  const rest = body.slice(separator + 1)
  const fragment = filterFragment(catalog, relation, columnName, rest, params)
  return negated ? `not (${fragment})` : fragment
}

// ===========================================================================
// Projection and ordering
// ===========================================================================

const PLAIN_COLUMN = /^[a-z_][a-z0-9_]*$/

export function selectFragment(
  catalog: Catalog,
  relation: RelationInfo,
  raw: string | null,
): string {
  if (raw === null || raw === '' || raw === '*') return '*'
  const parts = splitTopLevel(raw).map((part) => part.trim())
  const columns = parts.map((part) => {
    if (!PLAIN_COLUMN.test(part)) {
      throw new FixtureUnsupportedError(
        'select projection',
        `"${part}" is not a plain column; embeddings, aliases, casts and json paths are not translated`,
      )
    }
    return quoteIdentifier(catalog.column(relation, part).name)
  })
  return columns.join(', ')
}

export function orderFragment(
  catalog: Catalog,
  relation: RelationInfo,
  raw: string | null,
): string | null {
  if (raw === null || raw === '') return null
  const terms = splitTopLevel(raw).map((term) => term.trim())
  const rendered = terms.map((term) => {
    const [columnName, ...modifiers] = term.split('.')
    if (columnName === undefined || columnName === '') {
      throw new FixtureRequestError(400, 'PGRST100', `order term "${term}" names no column`)
    }
    const column = quoteIdentifier(catalog.column(relation, columnName).name)
    let direction = 'asc'
    let nulls = ''
    for (const modifier of modifiers) {
      if (modifier === 'asc' || modifier === 'desc') direction = modifier
      else if (modifier === 'nullsfirst') nulls = ' nulls first'
      else if (modifier === 'nullslast') nulls = ' nulls last'
      else {
        throw new FixtureUnsupportedError('order modifier', `"${modifier}" in "${term}"`)
      }
    }
    return `${column} ${direction}${nulls}`
  })
  return rendered.join(', ')
}

// ===========================================================================
// Windowing
// ===========================================================================

export interface Window {
  readonly limit: number | null
  readonly offset: number
  /** True when the window came from a `Range` header rather than the query. */
  readonly fromHeader: boolean
}

function positiveInteger(raw: string, name: string): number {
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) {
    throw new FixtureRequestError(400, 'PGRST100', `${name} must be a non-negative integer`)
  }
  return value
}

/**
 * `limit`/`offset` from the query string, or an HTTP `Range`.
 *
 * `postgrest-js` only ever sends the query parameters, but PostgREST's own
 * documented interface is the header, and the console is entitled to be tested
 * against a server that honours it.
 */
export function readWindow(params: URLSearchParams, rangeHeader: string | undefined): Window {
  const rawLimit = params.get('limit')
  const rawOffset = params.get('offset')
  if (rawLimit !== null || rawOffset !== null) {
    return {
      limit: rawLimit === null ? null : positiveInteger(rawLimit, 'limit'),
      offset: rawOffset === null ? 0 : positiveInteger(rawOffset, 'offset'),
      fromHeader: false,
    }
  }

  if (rangeHeader === undefined || rangeHeader.trim() === '') {
    return { limit: null, offset: 0, fromHeader: false }
  }

  const match = /^(\d+)-(\d*)$/.exec(rangeHeader.trim())
  if (match === null) {
    throw new FixtureUnsupportedError('Range header', `"${rangeHeader}" is not <from>-<to>`)
  }
  const from = Number(match[1])
  const toRaw = match[2]
  if (toRaw === undefined || toRaw === '') {
    return { limit: null, offset: from, fromHeader: true }
  }
  const to = Number(toRaw)
  if (to < from) {
    throw new FixtureRequestError(416, 'PGRST103', 'requested range not satisfiable')
  }
  return { limit: to - from + 1, offset: from, fromHeader: true }
}

/** The parameters PostgREST reserves; everything else is a column filter. */
export const RESERVED_PARAMS: ReadonlySet<string> = new Set([
  'select',
  'order',
  'limit',
  'offset',
  'or',
  'and',
  'columns',
  'on_conflict',
])

export interface WhereClause {
  readonly text: string
  readonly count: number
}

/** Every filter on the request, combined with AND, as PostgREST combines them. */
export function whereClause(
  catalog: Catalog,
  relation: RelationInfo,
  params: URLSearchParams,
  bind: Params,
): WhereClause {
  const fragments: string[] = []
  for (const [key, value] of params.entries()) {
    if (key === 'or' || key === 'and') {
      fragments.push(logicFragment(catalog, relation, key, value, bind))
      continue
    }
    if (RESERVED_PARAMS.has(key)) continue
    if (key.includes('.')) {
      throw new FixtureUnsupportedError(
        'embedded-resource filter',
        `"${key}" targets a related table`,
      )
    }
    fragments.push(filterFragment(catalog, relation, key, value, bind))
  }
  return {
    text: fragments.length === 0 ? '' : ` where ${fragments.join(' and ')}`,
    count: fragments.length,
  }
}
