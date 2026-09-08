import type { Pool } from 'pg'
import type { Catalog } from './catalog.ts'
import { FixtureRequestError } from './errors.ts'
import { Params, quoteIdentifier } from './query.ts'
import type { RestResponse } from './rest.ts'

/**
 * `/rest/v1/rpc/<function>` — the half of the admin platform that is not a view.
 *
 * `admin_touch_session`, `admin_write_audit`, `admin_enforce_rate_limit` and the
 * `sa_reveal_*` family are `security definer` functions that enforce their own
 * rules, so calling them through this shim exercises the real ones: the
 * four-eyes check, the accountability trigger and the reveal log are all doing
 * their actual work behind these calls.
 *
 * Arguments are passed by name and cast to the type the catalogue reports, which
 * is what PostgREST does and what makes `p_token_hash` arrive as a `bytea`
 * rather than as the literal text `\x…`.
 */

function argumentValue(value: unknown): unknown {
  // `pg` renders arrays as Postgres array literals and stringifies plain
  // objects, which is exactly the text form the `::jsonb` cast below expects.
  if (value === undefined) return null
  return value
}

export async function handleRpc(
  pool: Pool,
  catalog: Catalog,
  name: string,
  body: unknown,
): Promise<RestResponse> {
  if (body !== null && (typeof body !== 'object' || Array.isArray(body))) {
    throw new FixtureRequestError(400, 'PGRST102', 'rpc arguments must be a json object')
  }
  const args = (body ?? {}) as Record<string, unknown>
  const names = Object.keys(args)
  const procedure = catalog.procedure(name, names)

  const bind = new Params()
  const call = procedure.args
    .map(
      (arg) =>
        `${quoteIdentifier(arg.name)} => ${bind.add(argumentValue(args[arg.name]))}::${arg.type}`,
    )
    .join(', ')
  const invocation = `public.${quoteIdentifier(procedure.name)}(${call})`

  // A set-returning function is a table to PostgREST and comes back as an array;
  // a scalar one comes back as the value itself. `to_jsonb` covers both, and for
  // a `returns setof <scalar>` it yields the scalar rather than wrapping it —
  // which is how `admin_permissions_for` reads as a list of strings.
  const text = procedure.returnsSet
    ? `select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as result from ${invocation} as t`
    : `select to_jsonb(${invocation}) as result`

  const result = await pool.query<{ result: unknown }>({ text, values: [...bind.list()] })
  const value = result.rows[0]?.result ?? null

  return {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(value),
  }
}
