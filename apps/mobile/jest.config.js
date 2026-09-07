/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@shopify/flash-list|react-native-reanimated|react-native-worklets|@da/.*)',
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
