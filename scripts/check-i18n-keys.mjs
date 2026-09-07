#!/usr/bin/env node
/**
 * i18n verifier.
 *
 * Two failures are caught here, and both are invisible at runtime until a user
 * hits the screen:
 *
 *  1. A key the app asks for that no catalogue defines — the UI would render
 *     the raw key.
 *  2. A key one locale defines and the other does not — the app would silently
 *     fall back to Turkish for an English user.
 *
 * Keys are collected from every string literal in the app sources whose first
 * segment is a catalogue namespace, so constant lookup tables
 * (`const LOAD_KEYS = { light: 'plan.day.loadLight' }`) are covered as well as
 * direct `t('...')` calls.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PLURAL_CATEGORIES = new Set(['zero', 'one', 'two', 'few', 'many', 'other'])

/**
 * Source trees that consume the catalogues. The marketing site is deliberately
 * absent: it ships its own Turkish copy rather than importing the app's, so a
 * dotted string there (an OAuth scope name, say) is not a message key.
 */
const SOURCE_DIRS = ['apps/mobile/app', 'apps/mobile/src', 'packages/domain/src']

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (SOURCE_EXTENSIONS.has(path.extname(entry))) out.push(full)
  }
  return out
}

function flatten(node, prefix, acc) {
  for (const [key, value] of Object.entries(node)) {
    const full = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      acc.set(full, 'message')
      continue
    }
    if (!value || typeof value !== 'object') continue
    const childKeys = Object.keys(value)
    const isPlural = childKeys.length > 0 && childKeys.every((k) => PLURAL_CATEGORIES.has(k))
    if (isPlural) acc.set(full, 'plural')
    else flatten(value, full, acc)
  }
  return acc
}

/** Placeholders a message expects, e.g. `{count}` and `{name}`. */
function placeholdersOf(text) {
  return new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))
}

function collectMessages(node, prefix, acc) {
  for (const [key, value] of Object.entries(node)) {
    const full = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') acc.set(full, value)
    else if (value && typeof value === 'object') collectMessages(value, full, acc)
  }
  return acc
}

const trModule = await import(path.join(root, 'packages/i18n/src/messages/tr/index.ts'))
const enModule = await import(path.join(root, 'packages/i18n/src/messages/en/index.ts'))
const trTree = trModule.tr
const enTree = enModule.en

const trKeys = flatten(trTree, '', new Map())
const enKeys = flatten(enTree, '', new Map())
const trMessages = collectMessages(trTree, '', new Map())
const enMessages = collectMessages(enTree, '', new Map())

const namespaces = new Set(Object.keys(trTree))
const errors = []
const warnings = []

// ── 1. Parity ──────────────────────────────────────────────────────────────
const missingInEn = [...trKeys.keys()].filter((k) => !enKeys.has(k)).sort()
const missingInTr = [...enKeys.keys()].filter((k) => !trKeys.has(k)).sort()

if (missingInEn.length > 0) {
  errors.push(`${missingInEn.length} key(s) missing from en: ${missingInEn.slice(0, 12).join(', ')}${missingInEn.length > 12 ? ' …' : ''}`)
}
if (missingInTr.length > 0) {
  errors.push(`${missingInTr.length} key(s) missing from tr: ${missingInTr.slice(0, 12).join(', ')}${missingInTr.length > 12 ? ' …' : ''}`)
}

// Same key, different shape (a plural in one locale and a plain string in the
// other) breaks at the call site rather than in the copy.
for (const [key, kind] of trKeys) {
  const other = enKeys.get(key)
  if (other && other !== kind) errors.push(`shape mismatch for "${key}": tr=${kind} en=${other}`)
}

// ── 2. Placeholders ────────────────────────────────────────────────────────
for (const [key, trText] of trMessages) {
  const enText = enMessages.get(key)
  if (enText === undefined) continue
  const a = placeholdersOf(trText)
  const b = placeholdersOf(enText)
  const onlyTr = [...a].filter((p) => !b.has(p))
  const onlyEn = [...b].filter((p) => !a.has(p))
  if (onlyTr.length > 0 || onlyEn.length > 0) {
    errors.push(
      `placeholder mismatch for "${key}": tr={${[...a].join(',')}} en={${[...b].join(',')}}`,
    )
  }
}

// ── 3. Hygiene ─────────────────────────────────────────────────────────────
for (const [locale, messages] of [
  ['tr', trMessages],
  ['en', enMessages],
]) {
  for (const [key, text] of messages) {
    if (text.trim().length === 0) errors.push(`${locale}: "${key}" is empty`)
    if (/\b(TODO|FIXME|PLACEHOLDER|COMING SOON|Lorem ipsum)\b/i.test(text)) {
      errors.push(`${locale}: "${key}" contains placeholder copy`)
    }
  }
}

// The privacy wording is legally load-bearing: the product may not claim
// end-to-end encryption anywhere.
for (const [locale, messages] of [
  ['tr', trMessages],
  ['en', enMessages],
]) {
  for (const [key, text] of messages) {
    if (/uçtan\s*uca\s*şifrele|end[-\s]to[-\s]end\s*encrypt/i.test(text)) {
      errors.push(`${locale}: "${key}" claims end-to-end encryption, which is not the architecture`)
    }
  }
}

// ── 4. Usage ───────────────────────────────────────────────────────────────
const KEY_LITERAL = /'([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+)'/g
/** Filenames look like keys; a trailing known extension rules them out. */
const FILE_LIKE = /\.(jpg|jpeg|png|gif|webp|svg|pdf|json|ts|tsx|js|mjs|cjs|md|html|css|m4a|mp3|mp4|zip|sql)$/i
const used = new Map()

for (const dir of SOURCE_DIRS) {
  for (const file of walk(path.join(root, dir))) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(KEY_LITERAL)) {
      const key = match[1]
      const [namespace] = key.split('.')
      if (!namespaces.has(namespace)) continue
      if (FILE_LIKE.test(key)) continue
      if (!used.has(key)) used.set(key, path.relative(root, file))
    }
  }
}

const unknown = [...used.entries()]
  .filter(([key]) => !trKeys.has(key))
  // A plural is addressed by its parent key, which `flatten` records as
  // `plural`; a message tree node addressed as a prefix is a genuine miss.
  .filter(([key]) => trKeys.get(key) !== 'plural')

for (const [key, file] of unknown) {
  errors.push(`unknown key "${key}" used in ${file}`)
}

// Unused keys are not an error — the catalogue is deliberately ahead of the
// screens in places — but a large drift is worth seeing.
const unusedCount = [...trKeys.keys()].filter((key) => !used.has(key)).length
warnings.push(`${used.size} key(s) used, ${trKeys.size} defined, ${unusedCount} unused`)

for (const warning of warnings) console.log(`  ${warning}`)

if (errors.length > 0) {
  console.error(`\ni18n check failed with ${errors.length} error(s):\n`)
  for (const error of errors.slice(0, 400)) console.error(`  ✗ ${error}`)
  if (errors.length > 400) console.error(`  … and ${errors.length - 400} more`)
  process.exit(1)
}

console.log('\ni18n check passed.')
