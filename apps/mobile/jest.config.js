/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // `\.pnpm` has to be allowed through first: pnpm stores every package at
  // `node_modules/.pnpm/<name>@<version>/node_modules/<name>`, so without it
  // the pattern matches at the *first* `node_modules/` and ignores everything,
  // including the preset's own ESM setup file. Allowing it makes the match fall
  // through to the second segment, which is the real package name.
  transformIgnorePatterns: [
    'node_modules/(?!\\.pnpm|((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|native-base|react-native-svg|react-native-gesture-handler|@react-native-async-storage/.*|@shopify/flash-list|react-native-reanimated|react-native-worklets|@testing-library/.*|@da/.*)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@da/design-tokens$': '<rootDir>/../../packages/design-tokens/src/index.ts',
    '^@da/domain$': '<rootDir>/../../packages/domain/src/index.ts',
    '^@da/validation$': '<rootDir>/../../packages/validation/src/index.ts',
    '^@da/i18n$': '<rootDir>/../../packages/i18n/src/index.ts',
    '^@da/api-client$': '<rootDir>/../../packages/api-client/src/index.ts',
  },
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}'],
}
