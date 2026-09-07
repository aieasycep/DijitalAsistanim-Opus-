module.exports = function babelConfig(api) {
  api.cache(true)
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
    plugins: [
      // Reanimated's worklet transform has to be last in the plugin chain.
      'react-native-worklets/plugin',
    ],
  }
}
