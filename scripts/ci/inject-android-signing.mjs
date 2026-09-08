#!/usr/bin/env node
/**
 * Point the Android release variant at the CI signing key.
 *
 * Expo's generated `android/app/build.gradle` wires the release variant to a
 * `release` signing config that defaults to the DEBUG keystore, which produces
 * an APK nobody should install. This rewrites that config to read the four
 * `DA_UPLOAD_*` properties the workflow writes into `gradle.properties`.
 *
 * It lives here rather than inline in the workflow because a script embedded
 * in a YAML block scalar cannot contain a line indented less than the block
 * itself — and a Gradle snippet naturally is. The first version of this was
 * written inline and made the whole workflow file unparseable, which GitHub
 * reports only when you try to run it. As a file it is also testable:
 *
 *   node scripts/ci/inject-android-signing.mjs --self-test
 *
 * Usage: node scripts/ci/inject-android-signing.mjs <path to build.gradle>
 */
import { readFileSync, writeFileSync } from 'node:fs'

const SIGNING_BLOCK = [
  '        release {',
  '            storeFile file(DA_UPLOAD_STORE_FILE)',
  '            storePassword DA_UPLOAD_STORE_PASSWORD',
  '            keyAlias DA_UPLOAD_KEY_ALIAS',
  '            keyPassword DA_UPLOAD_KEY_PASSWORD',
  '        }',
].join('\n')

const MARKER = 'DA_UPLOAD_STORE_FILE'

/**
 * Replace an existing `release { … }` signing config, or add one when the
 * template has only `debug`.
 *
 * Returns the new source and what happened, so the caller can report it and a
 * test can assert on it.
 */
export function injectSigning(source) {
  if (source.includes(MARKER)) return { source, outcome: 'already-present' }

  const signingConfigs = /signingConfigs\s*\{/.exec(source)
  if (!signingConfigs) {
    throw new Error(
      'build.gradle has no signingConfigs block — the Expo template changed shape and this script needs revisiting.',
    )
  }

  // An existing `release { … }` inside signingConfigs is the debug-key default
  // and is replaced wholesale; matching its closing brace by counting depth
  // rather than by regex, because the body contains braces of its own.
  const releaseStart = source.indexOf('release {', signingConfigs.index)
  const configsEnd = findBlockEnd(source, signingConfigs.index + signingConfigs[0].length - 1)

  if (releaseStart !== -1 && releaseStart < configsEnd) {
    const releaseEnd = findBlockEnd(source, source.indexOf('{', releaseStart))
    const lineStart = source.lastIndexOf('\n', releaseStart) + 1
    return {
      source: source.slice(0, lineStart) + SIGNING_BLOCK + '\n' + source.slice(releaseEnd + 1 + 1),
      outcome: 'replaced',
    }
  }

  const insertAt = signingConfigs.index + signingConfigs[0].length
  return {
    source: source.slice(0, insertAt) + '\n' + SIGNING_BLOCK + source.slice(insertAt),
    outcome: 'inserted',
  }
}

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

// ── Self-test ───────────────────────────────────────────────────────────────

function selfTest() {
  const withDebugRelease = `android {
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
  const onlyDebug = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
        }
    }
}
`
  const checks = []

  const replaced = injectSigning(withDebugRelease)
  checks.push(['replaces the debug-key release config', replaced.outcome === 'replaced'])
  checks.push(['stops referencing the debug keystore in signingConfigs', !replaced.source.slice(
    replaced.source.indexOf('signingConfigs'),
    replaced.source.indexOf('buildTypes'),
  ).includes("file('debug.keystore')\n            storePassword")])
  checks.push(['reads the CI properties', replaced.source.includes('DA_UPLOAD_KEY_ALIAS')])
  checks.push(['keeps buildTypes intact', replaced.source.includes('signingConfig signingConfigs.release')])
  checks.push(['stays balanced', balanced(replaced.source)])

  const inserted = injectSigning(onlyDebug)
  checks.push(['inserts when only debug exists', inserted.outcome === 'inserted'])
  checks.push(['inserted output stays balanced', balanced(inserted.source)])

  const again = injectSigning(replaced.source)
  checks.push(['is idempotent', again.outcome === 'already-present' && again.source === replaced.source])

  let failed = 0
  for (const [name, ok] of checks) {
    console.log(`${ok ? '  ✓' : '  ✗'} ${name}`)
    if (!ok) failed++
  }
  if (failed > 0) {
    console.error(`\n${failed} self-test(s) failed.`)
    process.exit(1)
  }
  console.log('\nSigning injection self-test passed.')
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
} else if (!arg) {
  console.error('Usage: node scripts/ci/inject-android-signing.mjs <path to build.gradle>')
  process.exit(1)
} else {
  const original = readFileSync(arg, 'utf8')
  const { source, outcome } = injectSigning(original)
  if (outcome !== 'already-present') writeFileSync(arg, source)
  console.log(`Android release signing: ${outcome}.`)
}
