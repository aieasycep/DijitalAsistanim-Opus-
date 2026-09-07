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
// pnpm's symlinked store means a package can otherwise be resolved twice under
// two different real paths, which breaks React's single-instance requirement.
config.resolver.disableHierarchicalLookup = true

module.exports = config
