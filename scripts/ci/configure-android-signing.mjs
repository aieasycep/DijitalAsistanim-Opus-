#!/usr/bin/env node
/**
 * Point the Android release variant at the CI signing key.
 *
 * Two files have to agree for a release APK to carry the intended identity, and
 * getting one of them right while leaving the other alone produces a build that
 * succeeds, looks correct in the log, and is signed with the wrong key. Both
 * halves live here so they cannot drift apart:
 *
 *   gradle.properties   gains the four DA_UPLOAD_* values
 *   app/build.gradle    gains a `release` signingConfig that reads them, AND
 *                       has buildTypes.release repointed at that config
 *
 * ---------------------------------------------------------------------------
 * THE TWO DEFECTS THIS EXISTS TO PREVENT
 * ---------------------------------------------------------------------------
 *
 * 1. Expo's generated `gradle.properties` does not end with a newline. Its last
 *    line is `android.targetSdkVersion=36`, unterminated, so appending with
 *    `cat >>` glues the first new line onto it and Gradle reads the property as
 *    `36DA_UPLOAD_STORE_FILE=release.jks`. The build dies during plugin
 *    application with a NumberFormatException that names neither file.
 *
 * 2. Expo's template declares only a `debug` signingConfig, and its
 *    `buildTypes.release` says `signingConfig signingConfigs.debug`. Adding a
 *    `release` signingConfig therefore changes nothing on its own: the release
 *    APK is still signed with the template's debug keystore, which ships in
 *    every React Native project and whose private key is public. A Play Store
 *    upload signed with it is signed with a key anybody can use. The step
 *    reported success and printed a correct-looking signingConfigs block, which
 *    is precisely why this needed a test against the real template rather than
 *    an invented one.
 *
 * Both were found by building on CI, not by reading. The fixtures under
 * `__fixtures__/` are the genuine output of
 *
 *   pnpm exec expo prebuild --platform android --clean --no-install
 *
 * captured from `apps/mobile/android`, so the self-test exercises the shape the
 * build actually encounters. Refresh them the same way after an Expo upgrade.
 *
 * The runtime assertions matter more than the fixtures: if a future template
 * changes shape, this fails loudly during the build instead of quietly
 * producing a debug-signed release.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *
 *   node scripts/ci/configure-android-signing.mjs <path to android dir>
 *   node scripts/ci/configure-android-signing.mjs --self-test
 *
 * The four values are read from the environment rather than from argv, so no
 * password is ever visible in the process list:
 *
 *   DA_UPLOAD_STORE_FILE  DA_UPLOAD_STORE_PASSWORD
 *   DA_UPLOAD_KEY_ALIAS   DA_UPLOAD_KEY_PASSWORD
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const PROPERTY_NAMES = /** @type {const} */ ([
  'DA_UPLOAD_STORE_FILE',
  'DA_UPLOAD_STORE_PASSWORD',
  'DA_UPLOAD_KEY_ALIAS',
  'DA_UPLOAD_KEY_PASSWORD',
])

const SIGNING_CONFIG_BODY = [
  '        release {',
  '            storeFile file(DA_UPLOAD_STORE_FILE)',
  '            storePassword DA_UPLOAD_STORE_PASSWORD',
  '            keyAlias DA_UPLOAD_KEY_ALIAS',
  '            keyPassword DA_UPLOAD_KEY_PASSWORD',
  '        }',
].join('\n')

// ── gradle.properties ───────────────────────────────────────────────────────

/**
 * Escape a value for a Java properties file.
 *
 * Gradle parses `gradle.properties` with Java's Properties reader, which treats
 * a backslash as an escape and a leading space as padding to be skipped. A
 * password containing either would otherwise arrive at the keystore altered —
 * and the resulting failure ("keystore password was incorrect") points at the
 * key, not at the file that mangled it.
 */
export function escapePropertyValue(value) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/^ /, '\\ ')
}

/** Undo `escapePropertyValue`, for verifying what was written. */
export function unescapePropertyValue(value) {
  let out = ''
  for (let i = 0; i < value.length; i++) {
    if (value[i] !== '\\') {
      out += value[i]
      continue
    }
    const next = value[++i]
    if (next === 'n') out += '\n'
    else if (next === 'r') out += '\r'
    else if (next === 't') out += '\t'
    else if (next !== undefined) out += next
  }
  return out
}

/** Every `key=value` pair, keyed by name. Comments and blank lines ignored. */
export function parseProperties(source) {
  const found = new Map()
  for (const line of source.split('\n')) {
    if (/^\s*[#!]/.test(line) || line.trim() === '') continue
    const separator = /[=:]/.exec(line)
    if (!separator) continue
    const key = line.slice(0, separator.index).trim()
    if (key === '') continue
    found.set(key, unescapePropertyValue(line.slice(separator.index + 1).trimStart()))
  }
  return found
}

/**
 * Append the four properties, terminating the file first when it does not end
 * in a newline. This is defect 1: the whole bug is one missing `\n`.
 */
export function appendProperties(source, values) {
  const existing = parseProperties(source)
  if (PROPERTY_NAMES.every((name) => existing.has(name))) {
    return { source, outcome: 'already-present' }
  }

  const terminated = source === '' || source.endsWith('\n') ? source : source + '\n'
  const added = PROPERTY_NAMES.map((name) => {
    const value = values[name]
    if (value === undefined || value === '') {
      throw new Error(`${name} is not set — the signing step must export all four values.`)
    }
    return `${name}=${escapePropertyValue(value)}`
  }).join('\n')

  return {
    source: `${terminated}\n# Release signing, written by scripts/ci/configure-android-signing.mjs\n${added}\n`,
    outcome: source === terminated ? 'appended' : 'appended-after-terminating',
  }
}

// ── app/build.gradle ────────────────────────────────────────────────────────

/** Index of the `}` closing the block whose `{` is at `openIndex`. */
function findBlockEnd(source, openIndex) {
  let depth = 0
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  throw new Error('unbalanced braces in build.gradle')
}

/**
 * Locate a named Groovy block within `[from, to)`.
 *
 * The name is matched on a word boundary so `release {` does not also match a
 * hypothetical `preRelease {`, and so `signingConfigs` is not found inside a
 * `signingConfig signingConfigs.debug` statement.
 */
function findBlock(source, name, from = 0, to = source.length) {
  const pattern = new RegExp(`\\b${name}\\s*\\{`, 'g')
  pattern.lastIndex = from
  const match = pattern.exec(source)
  if (!match || match.index >= to) return null
  const open = source.indexOf('{', match.index)
  const end = findBlockEnd(source, open)
  return { start: match.index, bodyStart: open + 1, end, lineStart: source.lastIndexOf('\n', match.index) + 1 }
}

/**
 * Give the release variant its own signing config and make it actually use one.
 *
 * The second half is defect 2 and is the reason this returns a structured
 * outcome: "the signingConfig was added" and "the release build signs with it"
 * are different facts, and only the second one is what anybody wanted.
 */
export function configureBuildGradle(source) {
  const signingConfigs = findBlock(source, 'signingConfigs')
  if (!signingConfigs) {
    throw new Error(
      'build.gradle has no signingConfigs block — the Expo template changed shape and this script needs revisiting.',
    )
  }

  let next = source
  let configOutcome = 'already-present'

  const existingRelease = findBlock(next, 'release', signingConfigs.bodyStart, signingConfigs.end)
  if (existingRelease === null) {
    // Append inside signingConfigs, before its closing brace, leaving the
    // template's debug config alone: `assembleDebug` still has to work.
    next = `${next.slice(0, signingConfigs.end)}${SIGNING_CONFIG_BODY}\n    ${next.slice(signingConfigs.end)}`
    configOutcome = 'inserted'
  } else if (!next.slice(existingRelease.start, existingRelease.end).includes('DA_UPLOAD_STORE_FILE')) {
    next = `${next.slice(0, existingRelease.lineStart)}${SIGNING_CONFIG_BODY}\n${next.slice(existingRelease.end + 1)}`
    configOutcome = 'replaced'
  }

  // Repoint the release build type. Recomputed against `next` because the edit
  // above moved every offset after signingConfigs.
  const buildTypes = findBlock(next, 'buildTypes')
  if (!buildTypes) {
    throw new Error('build.gradle has no buildTypes block — the Expo template changed shape.')
  }
  const releaseType = findBlock(next, 'release', buildTypes.bodyStart, buildTypes.end)
  if (!releaseType) {
    throw new Error('build.gradle has no buildTypes.release block — the Expo template changed shape.')
  }

  const body = next.slice(releaseType.bodyStart, releaseType.end)
  let variantOutcome
  if (/signingConfig\s+signingConfigs\.release\b/.test(body)) {
    variantOutcome = 'already-release'
  } else if (/signingConfig\s+signingConfigs\.\w+/.test(body)) {
    variantOutcome = 'repointed'
    next =
      next.slice(0, releaseType.bodyStart) +
      body.replace(/signingConfig\s+signingConfigs\.\w+/, 'signingConfig signingConfigs.release') +
      next.slice(releaseType.end)
  } else {
    variantOutcome = 'added'
    next =
      next.slice(0, releaseType.bodyStart) +
      '\n            signingConfig signingConfigs.release' +
      next.slice(releaseType.bodyStart)
  }

  verifyBuildGradle(next)
  return { source: next, configOutcome, variantOutcome }
}

/**
 * Assert the result is what the build needs, rather than trusting the edits.
 *
 * A release APK signed with the debug key is the failure this is guarding, and
 * it is invisible in a build log — so the check runs on every invocation, not
 * only in the self-test.
 */
export function verifyBuildGradle(source) {
  const problems = []

  const signingConfigs = findBlock(source, 'signingConfigs')
  if (!signingConfigs) problems.push('no signingConfigs block')
  else {
    const release = findBlock(source, 'release', signingConfigs.bodyStart, signingConfigs.end)
    if (!release) problems.push('signingConfigs has no release config')
    else {
      const body = source.slice(release.start, release.end)
      for (const name of PROPERTY_NAMES) {
        if (!body.includes(name)) problems.push(`signingConfigs.release does not read ${name}`)
      }
      if (body.includes('debug.keystore')) {
        problems.push('signingConfigs.release still references the debug keystore')
      }
    }
  }

  const buildTypes = findBlock(source, 'buildTypes')
  if (!buildTypes) problems.push('no buildTypes block')
  else {
    const releaseType = findBlock(source, 'release', buildTypes.bodyStart, buildTypes.end)
    if (!releaseType) problems.push('no buildTypes.release block')
    else {
      const body = source.slice(releaseType.bodyStart, releaseType.end)
      if (!/signingConfig\s+signingConfigs\.release\b/.test(body)) {
        problems.push(
          'buildTypes.release does not sign with signingConfigs.release — the APK would carry the debug key',
        )
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`Android signing configuration is wrong:\n  - ${problems.join('\n  - ')}`)
  }
}

// ── Self-test ───────────────────────────────────────────────────────────────

const here = path.dirname(fileURLToPath(import.meta.url))

function selfTest() {
  const checks = []
  const check = (name, ok) => checks.push([name, ok])

  const realGradle = readFileSync(path.join(here, '__fixtures__', 'expo-app-build.gradle'), 'utf8')
  const realProperties = readFileSync(
    path.join(here, '__fixtures__', 'expo-gradle.properties'),
    'utf8',
  )

  // — The fixture is the real thing, and still carries both defects —
  check('fixture gradle.properties is unterminated, as Expo emits it', !realProperties.endsWith('\n'))
  check(
    'fixture build.gradle signs release with the debug key, as Expo emits it',
    /signingConfig\s+signingConfigs\.debug/.test(
      realGradle.slice(findBlock(realGradle, 'buildTypes').bodyStart),
    ),
  )

  // — gradle.properties —
  const values = {
    DA_UPLOAD_STORE_FILE: 'release.jks',
    DA_UPLOAD_STORE_PASSWORD: 'p a s s',
    DA_UPLOAD_KEY_ALIAS: 'upload',
    DA_UPLOAD_KEY_PASSWORD: 'back\\slash',
  }
  const written = appendProperties(realProperties, values)
  const parsed = parseProperties(written.source)
  check('terminates the file before appending', written.outcome === 'appended-after-terminating')
  check(
    'does not corrupt the last existing property',
    parsed.get('android.targetSdkVersion') === '36',
  )
  check(
    'no property is glued onto another',
    !written.source.includes('36DA_UPLOAD') &&
      written.source.split('\n').every((line) => line.split('DA_UPLOAD_').length <= 2),
  )
  check(
    'round-trips a value containing a backslash',
    parsed.get('DA_UPLOAD_KEY_PASSWORD') === 'back\\slash',
  )
  check('round-trips a value containing spaces', parsed.get('DA_UPLOAD_STORE_PASSWORD') === 'p a s s')
  check(
    'appending is idempotent',
    appendProperties(written.source, values).outcome === 'already-present',
  )
  check(
    'refuses an empty value rather than writing a blank password',
    (() => {
      try {
        appendProperties(realProperties, { ...values, DA_UPLOAD_KEY_PASSWORD: '' })
        return false
      } catch {
        return true
      }
    })(),
  )

  // — app/build.gradle, against the real template —
  const configured = configureBuildGradle(realGradle)
  check('inserts a release signingConfig into the real template', configured.configOutcome === 'inserted')
  check('repoints buildTypes.release, which is the whole point', configured.variantOutcome === 'repointed')
  check(
    'the release variant now signs with the release config',
    /signingConfig\s+signingConfigs\.release/.test(
      configured.source.slice(findBlock(configured.source, 'buildTypes').bodyStart),
    ),
  )
  check(
    'the debug variant still signs with the debug config',
    (() => {
      const bt = findBlock(configured.source, 'buildTypes')
      const debugType = findBlock(configured.source, 'debug', bt.bodyStart, bt.end)
      return /signingConfig\s+signingConfigs\.debug/.test(
        configured.source.slice(debugType.bodyStart, debugType.end),
      )
    })(),
  )
  check(
    'the debug signingConfig is left intact, so assembleDebug still works',
    configured.source.includes("storeFile file('debug.keystore')"),
  )
  check('output stays brace-balanced', balanced(configured.source))
  check(
    'configuring is idempotent',
    (() => {
      const again = configureBuildGradle(configured.source)
      return (
        again.configOutcome === 'already-present' &&
        again.variantOutcome === 'already-release' &&
        again.source === configured.source
      )
    })(),
  )

  // — the verifier rejects the shapes that matter —
  check(
    'verification rejects a release variant left on the debug key',
    rejects(() => verifyBuildGradle(realGradle)),
  )
  check(
    'verification rejects a config added without repointing the variant',
    rejects(() => {
      const sc = findBlock(realGradle, 'signingConfigs')
      verifyBuildGradle(
        `${realGradle.slice(0, sc.end)}${SIGNING_CONFIG_BODY}\n    ${realGradle.slice(sc.end)}`,
      )
    }),
  )
  check(
    'verification rejects a release config still holding the debug keystore',
    rejects(() =>
      verifyBuildGradle(
        configured.source.replace(
          'storeFile file(DA_UPLOAD_STORE_FILE)',
          "storeFile file('debug.keystore')",
        ),
      ),
    ),
  )

  // — a template that already ships a release config is replaced, not doubled —
  const withStaleRelease = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
        }
        release {
            storeFile file('debug.keystore')
            storePassword 'android'
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
`
  const replaced = configureBuildGradle(withStaleRelease)
  check('replaces a debug-key release config', replaced.configOutcome === 'replaced')
  check('leaves an already-correct variant alone', replaced.variantOutcome === 'already-release')
  check('replacement stays balanced', balanced(replaced.source))
  check(
    'replacement drops the debug keystore from the release config',
    (() => {
      const sc = findBlock(replaced.source, 'signingConfigs')
      return !replaced.source.slice(sc.start, sc.end).includes("release {\n            storeFile file('debug")
    })(),
  )

  // — a variant with no signingConfig statement at all gets one —
  const noStatement = `android {
    signingConfigs {
        debug { storeFile file('debug.keystore') }
    }
    buildTypes {
        release {
            minifyEnabled true
        }
    }
}
`
  check('adds a signingConfig statement when the variant has none', configureBuildGradle(noStatement).variantOutcome === 'added')

  let failed = 0
  for (const [name, ok] of checks) {
    process.stdout.write(`${ok ? '  ✓' : '  ✗'} ${name}\n`)
    if (!ok) failed++
  }
  if (failed > 0) {
    process.stderr.write(`\n${failed} of ${checks.length} self-test(s) failed.\n`)
    process.exit(1)
  }
  process.stdout.write(`\nAll ${checks.length} signing self-tests passed.\n`)
}

function rejects(fn) {
  try {
    fn()
    return false
  } catch {
    return true
  }
}

function balanced(source) {
  let depth = 0
  for (const character of source) {
    if (character === '{') depth++
    else if (character === '}') depth--
    if (depth < 0) return false
  }
  return depth === 0
}

// ── Run ─────────────────────────────────────────────────────────────────────

const arg = process.argv[2]

if (arg === '--self-test') {
  selfTest()
} else if (arg === undefined) {
  process.stderr.write('Usage: node scripts/ci/configure-android-signing.mjs <path to android dir>\n')
  process.exit(1)
} else {
  const androidDir = path.resolve(arg)
  const propertiesPath = path.join(androidDir, 'gradle.properties')
  const gradlePath = path.join(androidDir, 'app', 'build.gradle')

  const values = Object.fromEntries(PROPERTY_NAMES.map((name) => [name, process.env[name]]))

  const properties = appendProperties(readFileSync(propertiesPath, 'utf8'), values)
  if (properties.outcome !== 'already-present') writeFileSync(propertiesPath, properties.source)

  const gradle = configureBuildGradle(readFileSync(gradlePath, 'utf8'))
  writeFileSync(gradlePath, gradle.source)

  // No value is printed: three of the four are credentials.
  process.stdout.write(
    `gradle.properties: ${properties.outcome}\n` +
      `signingConfigs.release: ${gradle.configOutcome}\n` +
      `buildTypes.release: ${gradle.variantOutcome}\n` +
      'Verified: the release variant signs with the CI key, not the debug key.\n',
  )
}
