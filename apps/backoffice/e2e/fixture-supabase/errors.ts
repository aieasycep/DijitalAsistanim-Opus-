/**
 * The rule this whole shim is built around.
 *
 * A stand-in for PostgREST that answered a filter it did not understand with an
 * empty array would be worse than no test at all: the console would render an
 * empty table, every assertion about "no forbidden content on this page" would
 * pass, and a real regression in a query would look exactly like a quiet
 * afternoon. So there is no branch anywhere in this server that degrades. Every
 * request it cannot translate faithfully becomes one of these — named, counted,
 * logged, and answered with a 5xx, so the page that made it fails loudly and the
 * suite's diagnostics assertion fails with it.
 */
export class FixtureUnsupportedError extends Error {
  /** Short, stable token naming the surface that is missing. */
  readonly feature: string

  constructor(feature: string, detail: string) {
    super(`fixture-supabase does not implement ${feature} — ${detail}`)
    this.name = 'FixtureUnsupportedError'
    this.feature = feature
  }
}

export function isFixtureUnsupported(error: unknown): error is FixtureUnsupportedError {
  return error instanceof FixtureUnsupportedError
}

/**
 * A refusal the real PostgREST would also make: an unknown relation, a filter
 * naming a column that does not exist, a PATCH with no `where`.
 *
 * Separate from `FixtureUnsupportedError` because the two mean opposite things.
 * This one says the console asked for something wrong; that one says the shim is
 * incomplete. Only the second is a defect in the test harness.
 */
export class FixtureRequestError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'FixtureRequestError'
    this.status = status
    this.code = code
  }
}

export function isFixtureRequest(error: unknown): error is FixtureRequestError {
  return error instanceof FixtureRequestError
}
