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
 * exactly like a string that names something present, so each kind of name is
 * resolved here against the filesystem: edge-function slugs, navigation
 * targets, the scripts CI invokes, the console's sidebar links and the
 * permission each one advertises, and the packages the mobile build
 * configuration names.
 *
 * The last of those was added after `babel.config.js` spent the whole project
 * naming a preset the app did not depend on. It resolved on every machine where
 * pnpm happened to hoist it and failed on a clean CI install, five minutes into
 * a Gradle build, as `Cannot find module`.
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

// ── 3. Every backoffice sidebar link names a real page ──────────────────────

// The console's sidebar, command palette and breadcrumb all read `nav.ts`, so
// an entry pointing at an unbuilt page is a 404 with a nice icon in three
// places at once. Comments are stripped first: the file deliberately documents
// destinations that have no page YET, and those must not count as references.

const backofficeApp = path.join(root, 'apps', 'backoffice', 'src', 'app')
const navFile = path.join(root, 'apps', 'backoffice', 'src', 'lib', 'nav.ts')

let navRefs = 0
if (existsSync(navFile) && existsSync(backofficeApp)) {
  const consoleRoutes = new Map()
  for (const file of walk(backofficeApp, new Set(['.tsx']))) {
    if (path.basename(file) !== 'page.tsx') continue
    const segments = path
      .relative(backofficeApp, path.dirname(file))
      .split(path.sep)
      .filter((segment) => segment !== '.' && !/^\(.*\)$/.test(segment))
    consoleRoutes.set('/' + segments.join('/'), file)
  }

  const navSource = readFileSync(navFile, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  for (const match of navSource.matchAll(/href:\s*'(\/[^']*)'/g)) {
    const href = match[1]
    if (!href) continue
    navRefs++
    if (!consoleRoutes.has(href)) {
      problems.push({
        at: path.relative(root, navFile),
        rule: `sidebar entry points at "${href}", which has no page.tsx under apps/backoffice/src/app`,
      })
    }
  }

  // ── 3b. And the page enforces the permission the entry advertises ─────────
  //
  // Drawing an entry is a promise that whoever can see it can open it. Eleven
  // page groups still called the deprecated `requireStaff(tier)` bridge, which
  // maps every tier to one arbitrary permission — `ops` became
  // `integration.resync` — so `/ai`, `/billing` and `/audit` demanded a resync
  // permission to be *read*, and were unreachable for the analyst and finance
  // roles whose sidebar drew all three. Nothing failed: the operator saw the
  // link, clicked it, and got a 403.
  //
  // The sidebar and the page had no reason to agree, so they stopped. This is
  // the reason they have to.

  for (const entry of navSource.matchAll(/href:\s*'(\/[^']*)'[^}]*?requires:\s*'([^']+)'/gs)) {
    const [, href, required] = entry
    const file = href ? consoleRoutes.get(href) : undefined
    if (!file || !required) continue

    const source = readFileSync(file, 'utf8')
    const single = /requirePermission\(\s*'([^']+)'/.exec(source)
    const anyOf = /requirePermission\(\s*\{[^}]*anyOf:\s*\[([^\]]*)\]/s.exec(source)
    const enforced = anyOf?.[1]
      ? [...anyOf[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
      : single?.[1]
        ? [single[1]]
        : []

    if (enforced.length === 0) {
      problems.push({
        at: path.relative(root, file),
        rule: `the sidebar offers this page to anyone holding "${required}", but the page calls no requirePermission — so what it actually enforces cannot be read here`,
      })
    } else if (!enforced.includes(required)) {
      problems.push({
        at: path.relative(root, file),
        rule: `the sidebar offers this page to anyone holding "${required}", but the page requires ${enforced.map((p) => `"${p}"`).join(' or ')} — everyone with the advertised permission gets a 403`,
      })
    }
  }
}

// ── 4. Every script and task a workflow invokes exists ──────────────────────

// A workflow that calls a renamed script fails only when someone runs it, and
// for the APK workflow that could be days later. (Whether the YAML itself
// PARSES is already covered by `format:check`, which is how the malformed
// signing step in android-apk.yml was caught.)

const workflowsDir = path.join(root, '.github', 'workflows')
const packageScripts = new Set(
  Object.keys(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts ?? {}),
)

let ciRefs = 0
for (const file of walk(workflowsDir, new Set(['.yml', '.yaml']))) {
  const relative = path.relative(root, file)
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      const at = `${relative}:${index + 1}`

      for (const match of line.matchAll(/\bnode\s+(scripts\/[\w./-]+\.mjs)/g)) {
        const script = match[1]
        if (!script) continue
        ciRefs++
        if (!existsSync(path.join(root, script))) {
          problems.push({ at, rule: `workflow runs "node ${script}", which does not exist` })
        }
      }

      for (const match of line.matchAll(/\bpnpm\s+run\s+([\w:-]+)/g)) {
        const script = match[1]
        if (!script) continue
        ciRefs++
        if (!packageScripts.has(script)) {
          problems.push({
            at,
            rule: `workflow runs "pnpm run ${script}", which package.json does not define`,
          })
        }
      }
    })
}

// ── 5. Every package the mobile config names is a declared dependency ───────

// `babel.config.js` said `presets: ['babel-preset-expo']` while the app did not
// depend on `babel-preset-expo`. It resolved anyway on any machine where pnpm
// had hoisted it into `.pnpm/node_modules`, and did not on a clean CI install —
// so the app bundled locally and failed in Gradle with `Cannot find module`,
// after five minutes of compiling. `@expo/metro-runtime` was the same shape.
//
// A tool reads these files and requires what they name; npm and Yarn hide the
// omission by hoisting, and pnpm surfaces it only sometimes. Naming a package
// is depending on it, so this checks that the manifest says so.

const MOBILE = path.join(root, 'apps', 'mobile')

/** Bare specifiers inside a named array literal, e.g. `presets: [ … ]`. */
function specifiersInArray(source, key) {
  const start = new RegExp(`${key}\\s*:\\s*\\[`).exec(source)
  if (!start) return []
  const open = source.indexOf('[', start.index)
  let depth = 0
  let end = open
  for (let i = open; i < source.length; i++) {
    if (source[i] === '[') depth++
    else if (source[i] === ']') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  return [...source.slice(open, end).matchAll(/['"`]([^'"`]+)['"`]/g)].map((m) => m[1])
}

/** The package a specifier belongs to, or null when it is not one. */
function packageOf(specifier) {
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/')) return null
  if (specifier.startsWith('node:') || !/^[@a-z]/.test(specifier)) return null
  const parts = specifier.split('/')
  const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
  // A plugin entry can be a bare word that is not a package at all.
  return name && /^(@[\w.-]+\/)?[\w.-]+$/.test(name) ? name : null
}

let depRefs = 0
if (existsSync(path.join(MOBILE, 'package.json'))) {
  const manifest = JSON.parse(readFileSync(path.join(MOBILE, 'package.json'), 'utf8'))
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ])

  /** Where a package name can appear, and how it is written there. */
  const CONFIG_SOURCES = [
    { file: 'babel.config.js', keys: ['presets', 'plugins'] },
    { file: 'app.config.ts', keys: ['plugins'] },
  ]

  for (const source of CONFIG_SOURCES) {
    const file = path.join(MOBILE, source.file)
    if (!existsSync(file)) continue
    const text = readFileSync(file, 'utf8')
    for (const key of source.keys) {
      for (const specifier of specifiersInArray(text, key)) {
        const name = packageOf(specifier)
        if (name === null) continue
        depRefs++
        if (!declared.has(name)) {
          problems.push({
            at: `apps/mobile/${source.file}`,
            rule: `${key} names "${specifier}", but apps/mobile/package.json does not depend on "${name}". It may resolve here through pnpm's hoisted layer and not on a clean install.`,
          })
        }
      }
    }
  }

  // Config files loaded through `require`, which Metro and Jest do at startup.
  for (const configFile of ['metro.config.js', 'jest.config.js']) {
    const file = path.join(MOBILE, configFile)
    if (!existsSync(file)) continue
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/(?:require\(|preset:\s*)['"]([^'"]+)['"]/g)) {
      const name = packageOf(match[1])
      if (name === null) continue
      depRefs++
      if (!declared.has(name)) {
        problems.push({
          at: `apps/mobile/${configFile}`,
          rule: `requires "${match[1]}", but apps/mobile/package.json does not depend on "${name}".`,
        })
      }
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
    `${routeRefs} navigation target(s) across ${routes.length} routes, ` +
    `${ciRefs} script reference(s) in CI, ` +
    `${navRefs} backoffice sidebar link(s), ` +
    `and ${depRefs} package(s) named by the mobile config, all resolve.` +
    (dynamicRefs > 0
      ? `\n${dynamicRefs} navigation call(s) take a computed target and cannot be resolved statically.`
      : ''),
)
