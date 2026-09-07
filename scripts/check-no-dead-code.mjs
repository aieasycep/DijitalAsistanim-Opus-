#!/usr/bin/env node
/**
 * Dead-code and dead-control verifier.
 *
 * Two product rules are enforced here, because both are the kind of thing that
 * ships quietly and is only noticed by a user:
 *
 *  1. No unfinished-work markers. A TODO in a shipped build is a promise to
 *     nobody. Anything genuinely deferred belongs in the docs, named as a
 *     platform limitation, not left as a comment in the source.
 *
 *  2. No dead controls. If something looks pressable it must do something. A
 *     handler whose body is empty, or a link that goes to `#`, renders as a
 *     working button and behaves as a broken one.
 *
 * The check is textual on purpose: it runs in a second, has no dependency on a
 * parser keeping up with the TS version, and the patterns it looks for are
 * unambiguous enough that a false positive is a real smell.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Everything that ends up in a build, plus the scripts that produce it. */
const SOURCE_DIRS = [
  'apps/mobile/app',
  'apps/mobile/src',
  'apps/mobile/modules',
  'apps/mobile/plugins',
  'apps/web/src',
  'packages',
  'supabase/functions',
  'scripts',
]

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.kt', '.swift'])

/**
 * This file describes the rules, so it quotes every pattern it bans. Excluding
 * it is the alternative to writing the patterns obfuscated, which would make
 * them unreadable for the sake of the checker.
 */
const SELF = path.join(root, 'scripts', 'check-no-dead-code.mjs')

/**
 * Per-line escape hatch, for the handful of places that must name a banned
 * pattern in order to check for it. Written on the offending line or the one
 * above it, the way an eslint-disable reads. It is deliberately per line and
 * visible in review rather than a file-level exclusion, so an opt-out cannot
 * quietly cover code written later in the same file.
 */
const ALLOW_PRAGMA = /verifier-allow/

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.next' || entry === 'dist' || entry === 'build') {
      continue
    }
    if (entry.startsWith('.') && entry !== '.maestro') continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (SOURCE_EXTENSIONS.has(path.extname(entry))) out.push(full)
  }
  return out
}

/** Unfinished-work markers. Word-bounded so `todoList` is not a hit. */
const MARKERS = [
  { name: 'TODO', pattern: /\bTODO\b/ },
  { name: 'FIXME', pattern: /\bFIXME\b/ },
  { name: 'XXX marker', pattern: /\bXXX\b/ },
  { name: 'COMING SOON', pattern: /coming\s+soon/i },
  { name: 'yakında gelecek', pattern: /yakında\s+gelecek/i },
  { name: 'PLACEHOLDER FEATURE', pattern: /placeholder\s+feature/i },
  { name: 'TEMP BUTTON', pattern: /temp\s+button/i },
  { name: 'lorem ipsum', pattern: /lorem\s+ipsum/i },
  { name: 'not implemented', pattern: /not\s+implemented\s+yet/i },
  { name: 'henüz yapılmadı', pattern: /henüz\s+yapılmadı/i },
]

/**
 * Controls that look interactive and are not.
 *
 * `() => {}` is the giveaway: an arrow function with nothing in it, wired to a
 * press or a click. `href="#"` is its web equivalent — a link that scrolls
 * nowhere. An in-page anchor with a real target (`#fiyat`) is fine and is not
 * matched.
 */
const DEAD_CONTROLS = [
  {
    name: 'empty press handler',
    pattern: /\b(onPress|onClick|onLongPress|onSubmitEditing|onValueChange)\s*=\s*\{\s*\(\s*\)\s*=>\s*(\{\s*\}|undefined|null|void 0)\s*\}/,
  },
  {
    name: 'handler wired to undefined',
    pattern: /\b(onPress|onClick|onLongPress)\s*=\s*\{\s*(undefined|null|noop)\s*\}/,
  },
  { name: 'link to nowhere', pattern: /\bhref\s*=\s*(\{\s*)?["'`]#["'`]/ },
  {
    name: 'alert-only handler',
    pattern: /\b(onPress|onClick)\s*=\s*\{\s*\(\s*\)\s*=>\s*(alert|window\.alert)\s*\(/,
  },
]

/** Debug output that should never reach a build. */
const DEBUG_CALLS = [
  { name: 'console.log', pattern: /\bconsole\s*\.\s*log\s*\(/ },
  { name: 'debugger statement', pattern: /^\s*debugger\s*;?\s*$/ },
]

/**
 * Files allowed to print to stdout. Build-time scripts and config plugins are
 * command-line tools whose output *is* their interface. `_shared/http.ts` is
 * the single request-logging wrapper every edge function goes through, and in
 * Deno Deploy the console *is* the log sink — so one file owns it, and a
 * stray log anywhere else in the function tree still fails.
 */
const CONSOLE_ALLOWED = [
  /^scripts\//,
  /^apps\/mobile\/plugins\//,
  /^supabase\/functions\/_shared\/http\.ts$/,
]

const offenders = []

for (const dir of SOURCE_DIRS) {
  for (const file of walk(path.join(root, dir))) {
    if (file === SELF) continue
    const relative = path.relative(root, file)
    const lines = readFileSync(file, 'utf8').split('\n')

    lines.forEach((line, index) => {
      if (ALLOW_PRAGMA.test(line) || ALLOW_PRAGMA.test(lines[index - 1] ?? '')) return
      const at = `${relative}:${index + 1}`

      for (const marker of MARKERS) {
        if (marker.pattern.test(line)) {
          offenders.push({ at, rule: `unfinished-work marker (${marker.name})`, line })
        }
      }

      for (const control of DEAD_CONTROLS) {
        if (control.pattern.test(line)) {
          offenders.push({ at, rule: `dead control (${control.name})`, line })
        }
      }

      if (CONSOLE_ALLOWED.some((allow) => allow.test(relative))) return
      for (const call of DEBUG_CALLS) {
        if (call.pattern.test(line)) {
          offenders.push({ at, rule: `debug output (${call.name})`, line })
        }
      }
    })
  }
}

if (offenders.length > 0) {
  console.error(`Dead-code check failed: ${offenders.length} problem(s).\n`)
  for (const offender of offenders) {
    console.error(`  ${offender.at}`)
    console.error(`    ${offender.rule}`)
    console.error(`    ${offender.line.trim().slice(0, 120)}\n`)
  }
  process.exit(1)
}

console.log('Dead-code check passed: no unfinished markers, dead controls or debug output.')
