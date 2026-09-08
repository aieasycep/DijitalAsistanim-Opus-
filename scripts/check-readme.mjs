#!/usr/bin/env node
/**
 * Do the numbers in README.md still describe this repository?
 *
 * The README said "18 migrations · 39 tables" while the repository held 19 and
 * 56, and "389 tests" while the suite ran 586. Nothing was wrong with the
 * README when it was written; it simply stopped being true, quietly, and a
 * number nobody re-derives is worse than no number at all — a reader trusts it
 * precisely because it looks specific.
 *
 * So every count the README states about the shape of the repository is derived
 * here from the repository itself. Counts that move with ordinary work — how
 * many tests there are — are deliberately NOT stated in the README and not
 * checked here: a gate that fails whenever somebody adds a test teaches people
 * to edit documentation to make CI shut up, which is the opposite of the point.
 * What is checked is structural: migrations, tables, views, functions, routes.
 * Those change rarely, and when they do the change is worth a sentence anyway.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readme = readFileSync(path.join(root, 'README.md'), 'utf8')

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

/** Every distinct name a `create table` statement declares. */
function tableCount() {
  const names = new Set()
  for (const file of walk(path.join(root, 'supabase', 'migrations'), new Set(['.sql']))) {
    const sql = readFileSync(file, 'utf8')
    for (const match of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)/gi)) {
      if (match[1]) names.add(match[1].toLowerCase())
    }
  }
  return names.size
}

/** The content-blind views the console reads through. */
function boViewCount() {
  const names = new Set()
  for (const file of walk(path.join(root, 'supabase', 'migrations'), new Set(['.sql']))) {
    const sql = readFileSync(file, 'utf8')
    for (const match of sql.matchAll(/create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?(bo_\w+)/gi)) {
      if (match[1]) names.add(match[1].toLowerCase())
    }
  }
  return names.size
}

function edgeFunctionCount() {
  const dir = path.join(root, 'supabase', 'functions')
  return readdirSync(dir).filter(
    (entry) =>
      !entry.startsWith('_') &&
      !entry.startsWith('.') &&
      statSync(path.join(dir, entry)).isDirectory() &&
      existsSync(path.join(dir, entry, 'index.ts')),
  ).length
}

const mobileScreens = walk(path.join(root, 'apps', 'mobile', 'app'), new Set(['.tsx']))
const mobileLayouts = mobileScreens.filter((file) => path.basename(file) === '_layout.tsx')

const backofficePages = walk(path.join(root, 'apps', 'backoffice', 'src', 'app'), new Set(['.tsx'])).filter(
  (file) => path.basename(file) === 'page.tsx',
)

/**
 * Each claim is the sentence as it appears, with the number replaced by a
 * capture group, so a mismatch reports the phrase a reader would actually see
 * rather than a line number.
 */
const CLAIMS = [
  {
    what: 'migrations',
    pattern: /(\d+) migrations ·/,
    actual: readdirSync(path.join(root, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql'))
      .length,
  },
  { what: 'tables (repository layout)', pattern: /· (\d+) tables · RLS/, actual: tableCount() },
  { what: 'tables (DATA_MODEL row)', pattern: /\| (\d+) tables, their relationships/, actual: tableCount() },
  { what: 'content-blind views', pattern: /(\d+) content-blind bo_\* views/, actual: boViewCount() },
  { what: 'edge functions', pattern: /(\d+) Deno edge functions/, actual: edgeFunctionCount() },
  { what: 'console routes', pattern: /staff console, (\d+) routes/, actual: backofficePages.length },
  {
    what: 'mobile .tsx files',
    pattern: /app\/\s+(\d+) \.tsx files/,
    actual: mobileScreens.length,
  },
  {
    what: 'mobile routes',
    pattern: /\.tsx files: (\d+) routes/,
    actual: mobileScreens.length - mobileLayouts.length,
  },
  { what: 'mobile layouts', pattern: /routes and (\d+) layouts/, actual: mobileLayouts.length },
]

const problems = []
for (const claim of CLAIMS) {
  const match = claim.pattern.exec(readme)
  if (!match?.[1]) {
    problems.push(
      `README no longer states the ${claim.what} count where this expects it (${claim.pattern}). ` +
        `Either restore the sentence or drop the claim from scripts/check-readme.mjs.`,
    )
    continue
  }
  const stated = Number.parseInt(match[1], 10)
  if (stated !== claim.actual) {
    problems.push(`README says ${stated} ${claim.what}; the repository has ${claim.actual}.`)
  }
}

if (problems.length > 0) {
  console.error(`README check failed: ${problems.length} claim(s) no longer true.\n`)
  for (const problem of problems) console.error(`  ${problem}\n`)
  process.exit(1)
}

console.log(`README check passed: ${CLAIMS.length} stated counts all match the repository.`)
