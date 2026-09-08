import type { Pool } from 'pg'
import { FixtureRequestError, FixtureUnsupportedError } from './errors.ts'

/**
 * What the connected database actually contains, read from its own catalogue.
 *
 * Every identifier that reaches a statement in `rest.ts` and `rpc.ts` is checked
 * against this map first, so a relation name, a column name or a function name
 * arriving from a query string can only ever be one Postgres already declares.
 * That is the whole defence: values are bound as parameters and identifiers are
 * whitelisted, so there is no path through this server by which a request builds
 * SQL out of its own text.
 *
 * It is read once at boot rather than per request — the schema is fixed for the
 * life of a run, and the alternative is a catalogue round trip in front of every
 * page render.
 */

export interface ColumnInfo {
  readonly name: string
  /** `format_type` output, e.g. `text`, `uuid`, `support_access_scope[]`. */
  readonly type: string
  readonly isArray: boolean
  readonly isJson: boolean
}

export interface RelationInfo {
  readonly name: string
  readonly columns: ReadonlyMap<string, ColumnInfo>
}

export interface ProcedureArg {
  readonly name: string
  readonly type: string
}

export interface ProcedureInfo {
  readonly name: string
  readonly returnsSet: boolean
  readonly args: readonly ProcedureArg[]
}

export interface Catalog {
  /** Every relation, for diagnostics. */
  readonly relationNames: readonly string[]
  relation(name: string): RelationInfo
  column(relation: RelationInfo, name: string): ColumnInfo
  /** The overload whose argument names match what the caller supplied. */
  procedure(name: string, provided: readonly string[]): ProcedureInfo
}

interface RelationRow {
  relation: string
  column: string
  type: string
  is_array: boolean
  is_json: boolean
}

interface ProcedureRow {
  name: string
  returns_set: boolean
  arg_names: string[] | null
  arg_types: string[] | null
}

const RELATION_SQL = `
  select c.relname                                   as relation,
         a.attname                                   as column,
         format_type(a.atttypid, a.atttypmod)        as type,
         (t.typcategory = 'A')                       as is_array,
         (t.typname in ('json', 'jsonb'))            as is_json
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  join pg_type t on t.oid = a.atttypid
  where n.nspname = 'public'
    and c.relkind in ('r', 'v', 'm', 'p', 'f')
`

/**
 * `proargnames` lists IN arguments first and then the OUT columns a
 * `returns table (…)` function declares, while `proargtypes` holds the IN
 * arguments alone — so the names are truncated to the argument count rather
 * than zipped, which would otherwise pair `p_token_hash` with the type of the
 * first returned column.
 */
const PROCEDURE_SQL = `
  select p.proname     as name,
         p.proretset   as returns_set,
         p.proargnames as arg_names,
         (select array_agg(format_type(t.oid, null) order by u.ord)
            from unnest(p.proargtypes) with ordinality as u(oid, ord)
            join pg_type t on t.oid = u.oid) as arg_types
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
`

export async function loadCatalog(pool: Pool): Promise<Catalog> {
  const relations = new Map<string, Map<string, ColumnInfo>>()
  const relationResult = await pool.query<RelationRow>(RELATION_SQL)
  for (const row of relationResult.rows) {
    let columns = relations.get(row.relation)
    if (columns === undefined) {
      columns = new Map<string, ColumnInfo>()
      relations.set(row.relation, columns)
    }
    columns.set(row.column, {
      name: row.column,
      type: row.type,
      isArray: row.is_array,
      isJson: row.is_json,
    })
  }

  const procedures = new Map<string, ProcedureInfo[]>()
  const procedureResult = await pool.query<ProcedureRow>(PROCEDURE_SQL)
  for (const row of procedureResult.rows) {
    const types = row.arg_types ?? []
    const names = (row.arg_names ?? []).slice(0, types.length)
    const args: ProcedureArg[] = types.map((type, index) => ({
      name: names[index] ?? `arg${index + 1}`,
      type,
    }))
    const existing = procedures.get(row.name)
    const info: ProcedureInfo = { name: row.name, returnsSet: row.returns_set, args }
    if (existing === undefined) procedures.set(row.name, [info])
    else existing.push(info)
  }

  return {
    relationNames: [...relations.keys()].sort(),

    relation(name: string): RelationInfo {
      const columns = relations.get(name)
      if (columns === undefined) {
        throw new FixtureRequestError(
          404,
          '42P01',
          `relation "public.${name}" does not exist in the fixture database`,
        )
      }
      return { name, columns }
    },

    column(relation: RelationInfo, name: string): ColumnInfo {
      const column = relation.columns.get(name)
      if (column === undefined) {
        throw new FixtureRequestError(
          400,
          '42703',
          `column "${name}" does not exist on "public.${relation.name}"`,
        )
      }
      return column
    },

    procedure(name: string, provided: readonly string[]): ProcedureInfo {
      const overloads = procedures.get(name)
      if (overloads === undefined || overloads.length === 0) {
        throw new FixtureRequestError(
          404,
          '42883',
          `function "public.${name}" does not exist in the fixture database`,
        )
      }
      const wanted = new Set(provided)
      const match = overloads.find(
        (overload) =>
          overload.args.length === wanted.size &&
          overload.args.every((arg) => wanted.has(arg.name)),
      )
      if (match !== undefined) return match

      // Defaulted arguments would land here. Nothing the console calls uses one,
      // and guessing which overload was meant is exactly the kind of silent
      // approximation this shim refuses to make.
      throw new FixtureUnsupportedError(
        'rpc argument matching',
        `no overload of "${name}" takes exactly (${[...wanted].sort().join(', ')})`,
      )
    },
  }
}
