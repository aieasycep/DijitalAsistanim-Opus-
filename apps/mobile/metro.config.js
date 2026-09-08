const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// The shared packages are consumed as TypeScript source rather than build
// output, so Metro has to watch the whole workspace and resolve from both
// node_modules trees. Without this a change in packages/domain would not
// trigger a reload.
config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
// Hierarchical lookup stays ON, which under pnpm is not optional.
//
// Expo's monorepo guide turns it off, and that is right for npm and Yarn: those
// hoist every package into one of the two roots listed above, so walking up the
// tree can only find a second copy of something already resolved. pnpm does the
// opposite. Each package gets its own adjacent `node_modules` holding exactly
// its declared dependencies, and walking up to it is the *only* way a package
// finds them — `@expo/metro-runtime` requires `whatwg-fetch`, which lives
// nowhere else.
//
// With it off, the app could not be bundled at all: Metro failed on the first
// such import and never reached a single file of ours. Nothing caught it,
// because resolving app.config.ts does not build the module graph and Jest
// brings its own resolver, so the only thing that would have noticed was a real
// build — which is where it finally surfaced.
config.resolver.disableHierarchicalLookup = false

module.exports = config
