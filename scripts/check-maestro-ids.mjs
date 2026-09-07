#!/usr/bin/env node
/**
 * Verify that every element the end-to-end flows reach for actually exists.
 *
 * A Maestro flow that names a `testID` no screen renders does not fail at
 * review time — it fails on a device, minutes into a CI run, with a timeout
 * that reads like a flake. This runs in a second and says exactly which id in
 * which flow has no home.
 *
 * Ids in the flows are regular expressions (`thread-.*`), and many testIDs in
 * the app are template literals (`thread-${item.id}`), so both sides are
 * reduced to a prefix before they are compared.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const flowsDir = path.join(root, 'apps', 'mobile', '.maestro')
const sourceDirs = [
  path.join(root, 'apps', 'mobile', 'app'),
  path.join(root, 'apps', 'mobile', 'src'),
]

function walk(dir, extensions, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry === 'node_modules') continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, extensions, out)
    else if (extensions.has(path.extname(entry))) out.push(full)
  }
  return out
}

/** Every testID the app renders, reduced to the literal part before any `${`. */
const definedPrefixes = new Set()
for (const dir of sourceDirs) {
  for (const file of walk(dir, new Set(['.tsx', '.ts']))) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/testID=(?:"([^"]+)"|\{`([^`]+)`\})/g)) {
      const raw = match[1] ?? match[2] ?? ''
      // `thread-${item.id}` can only be matched on its literal prefix.
      definedPrefixes.add(raw.split('${')[0])
    }
  }
}

/** A flow id matches when its literal prefix is one the app renders. */
const matches = (flowId) => {
  const prefix = flowId.replace(/\.\*$/, '')
  for (const defined of definedPrefixes) {
    if (defined === flowId) return true
    if (prefix && defined.startsWith(prefix)) return true
    // A concrete flow id (`commitment-due-3`) against a template prefix
    // (`commitment-due-`).
    if (defined && flowId.startsWith(defined) && defined.endsWith('-')) return true
  }
  return false
}

const problems = []
let checked = 0

for (const file of walk(flowsDir, new Set(['.yaml', '.yml']))) {
  const relative = path.relative(root, file)
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      const match = /^\s*id:\s*'([^']+)'\s*$/.exec(line)
      if (!match?.[1]) return
      checked++
      if (!matches(match[1])) {
        problems.push({ at: `${relative}:${index + 1}`, id: match[1] })
      }
    })
}

if (problems.length > 0) {
  console.error(`Maestro id check failed: ${problems.length} id(s) match no testID in the app.\n`)
  for (const problem of problems) {
    console.error(`  ${problem.at}\n    no screen renders testID "${problem.id}"\n`)
  }
  process.exit(1)
}

console.log(
  `Maestro id check passed: ${checked} element reference(s) across the flows, all rendered by the app.`,
)
