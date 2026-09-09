/**
 * A no-op stand-in for the `server-only` package under Vitest.
 *
 * `server-only` has no runtime behaviour. Its whole job is to be un-importable
 * from a client bundle: it ships an entry that throws so that a build fails
 * loudly when a module holding the service-role key drifts into the browser.
 * That guarantee is a *bundler* guarantee, and Next still enforces it — the
 * console's own build is what proves it, not this file.
 *
 * Under Vitest there is no bundler and no client, so the import is pure
 * obstruction: it made the modules that hold the console's most consequential
 * decisions — whether a reason is acceptable, whether an action may proceed —
 * the only ones that could not be tested. Aliasing it away buys their coverage
 * and gives up nothing, because no test here can put anything in a browser.
 */
export {}
