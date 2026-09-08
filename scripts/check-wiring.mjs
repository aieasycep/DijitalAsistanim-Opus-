#!/usr/bin/env node
/**
 * Wiring verifier: does everything this code points at actually exist?
 *
 * Three classes of defect shipped past every other gate because each half of
 * the system type-checked perfectly against its own idea of the other half:
 *
 *  1. Five scheduled jobs POSTed to edge-function slugs that were never
 *     written (`briefing-dispatch`, `follow-up-detect`, …), so no background
 *     work ran at all — no briefing, no reminder, no push.
 *  2. The API client called `reminder-create`, which did not exist.
 *  3. The Today screen's largest tap target pushed `/briefing/morning`, a
 *     route with no file, landing the user on the router's not-found screen.
 *
 * None of these is a type error. A string that names something absent looks
 * exactly like a string that names something present. This resolves the three
 * kinds of name against the filesystem.
 *
 * Route matching is intentionally forgiving about *parameters* and strict
 * about *structure*: `/thread/${id}` matches `app/thread/[id].tsx` because a
 * dynamic segment accepts anything, while `/briefing/morning` does not match
 * `app/briefing/index.tsx` because that route has no second segment.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const problems = []

function walk(dir, extensions, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, extensions, out)
    else if (extensions.has(path.extname(entry))) out.push(full)
  }
  return out
}

// ── 1. Every edge function slug names a deployed function ───────────────────

const functionsDir = path.join(root, 'supabase', 'functions')
const functionSlugs = new Set(
  readdirSync(functionsDir).filter(
    (entry) =>
      !entry.startsWith('_') &&
      !entry.startsWith('.') &&
      statSync(path.join(functionsDir, entry)).isDirectory() &&
      existsSync(path.join(functionsDir, entry, 'index.ts')),
  ),
)

/** Where a slug can be referenced, and how it is written there. */
const SLUG_SOURCES = [
  {
    label: 'scheduled job',
    files: walk(path.join(root, 'supabase', 'migrations'), new Set(['.sql'])),
    pattern: /format\(v_invoke,\s*'([a-z0-9-]+)'/g,
  },
  {
    label: 'API client call',
    files: walk(path.join(root, 'packages', 'api-client', 'src'), new Set(['.ts'])),
    pattern: /callFunction(?:<[^>]*>)?\(\s*'([a-z0-9-]+)'/g,
  },
  {
    label: 'app call',
    files: walk(path.join(root, 'apps', 'mobile', 'src'), new Set(['.ts', '.tsx'])),
    pattern: /functions\/v1\/([a-z0-9-]+)/g,
  },
]

let slugRefs = 0
for (const source of SLUG_SOURCES) {
  for (const file of source.files) {
    const relative = path.relative(root, file)
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        for (const match of line.matchAll(source.pattern)) {
          const slug = match[1]
          if (!slug) continue
          slugRefs++
          if (!functionSlugs.has(slug)) {
            problems.push({
              at: `${relative}:${index + 1}`,
              rule: `${source.label} names edge function "${slug}", which has no supabase/functions/${slug}/index.ts`,
            })
          }
        }
      })
  }
}

// ── 2. Every navigation target names a real route ───────────────────────────

const appDir = path.join(root, 'apps', 'mobile', 'app')

/**
 * Turn a route file into its matchable segments.
 *
 * `(group)` segments are organisational and do not appear in a URL; `index`
 * contributes nothing; `[param]` and `[[...rest]]` match anything.
 */
function routeSegments(file) {
  const relative = path.relative(appDir, file).replace(/\.tsx?$/, '')
  if (relative.startsWith('+') || path.basename(relative).startsWith('_')) return null
  const parts = relative
    .split(path.sep)
    .filter((segment) => !/^\(.*\)$/.test(segment))
    .filter((segment) => segment !== 'index')
  return parts.map((segment) =>
    /^\[\[?\.\.\..+\]\]?$/.test(segment) ? '**' : /^\[.+\]$/.test(segment) ? '*' : segment,
  )
}

const routes = []
for (const file of walk(appDir, new Set(['.tsx']))) {
  const segments = routeSegments(file)
  if (segments) routes.push({ segments, file: path.relative(root, file) })
}

function routeMatches(target) {
  const wanted = target.split('/').filter(Boolean)
  return routes.some(({ segments }) => {
    if (segments.includes('**')) {
      const head = segments.slice(0, segments.indexOf('**'))
      return head.every((segment, i) => segment === '*' || segment === wanted[i])
    }
    if (segments.length !== wanted.length) return false
    return segments.every((segment, i) => segment === '*' || segment === wanted[i])
  })
}

/**
 * Navigation call sites. Three forms are in use and all three matter:
 *
 *   router.push('/followups')
 *   router.push(`/thread/${thread.id}`)
 *   router.push({ pathname: '/(auth)/verify', params: { … } })
 *
 * So the target is the first string literal within the call, optionally behind
 * `pathname:`. A call whose argument is a variable cannot be resolved here and
 * is counted as unresolvable rather than silently skipped.
 */
const NAV_CALL = /router\.(?:push|replace|navigate)\s*\(/g

let routeRefs = 0
let dynamicRefs = 0

for (const file of walk(appDir, new Set(['.tsx', '.ts'])).concat(
  walk(path.join(root, 'apps', 'mobile', 'src'), new Set(['.tsx', '.ts'])),
)) {
  const relative = path.relative(root, file)
  const text = readFileSync(file, 'utf8')

  for (const call of text.matchAll(NAV_CALL)) {
    const start = (call.index ?? 0) + call[0].length
    // One call never spans more than this in practice, and a window keeps a
    // variable argument from swallowing the next call's literal.
    const window = text.slice(start, start + 240)
    const literal = /^[\s{]*(?:pathname\s*:\s*)?(['"`])([^'"`]*)\1?/.exec(window)
    const line = text.slice(0, start).split('\n').length

    if (!literal?.[2]) {
      dynamicRefs++
      continue
    }

    const raw = literal[2]
    if (!raw.startsWith('/')) {
      dynamicRefs++
      continue
    }

    // The query string does not select a route, and a template literal's
    // interpolation is a route parameter that `routeMatches` accepts anyway.
    const pathOnly = raw.split('?')[0] ?? ''

    // Groups are organisational: `/(tabs)/today` and `/today` are one route.
    const normalised =
      '/' +
      pathOnly
        .split('/')
        .filter(Boolean)
        .filter((segment) => !/^\(.*\)$/.test(segment))
        .join('/')

    if (normalised === '/') continue
    routeRefs++
    if (!routeMatches(normalised)) {
      problems.push({
        at: `${relative}:${line}`,
        rule: `navigates to "${raw}", which matches no route file under apps/mobile/app`,
      })
    }
  }
}

// ── Report ──────────────────────────────────────────────────────────────────

if (problems.length > 0) {
  console.error(`Wiring check failed: ${problems.length} dangling reference(s).\n`)
  for (const problem of problems) {
    console.error(`  ${problem.at}\n    ${problem.rule}\n`)
  }
  process.exit(1)
}

console.log(
  `Wiring check passed: ${slugRefs} edge-function reference(s) across ${functionSlugs.size} functions, ` +
    `and ${routeRefs} navigation target(s) across ${routes.length} routes, all resolve.` +
    (dynamicRefs > 0
      ? `\n${dynamicRefs} navigation call(s) take a computed target and cannot be resolved statically.`
      : ''),
)
