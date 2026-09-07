/**
 * Test environment for the React Native app.
 *
 * Everything mocked here is a native module: it has no JavaScript
 * implementation to run under Node, so without a stand-in the module registry
 * throws at import time and every test in the file fails for a reason that has
 * nothing to do with the component. Nothing that has real behaviour worth
 * testing is mocked — the design tokens, the i18n engine, the domain logic and
 * the components themselves all run for real.
 */

/**
 * Reanimated 4 animates on a worklets runtime that exists only on a device;
 * its own bundled mock still loads that runtime and throws here. The app uses
 * four of its APIs, all for decorative motion, so this stands in for exactly
 * those: animations resolve to their target value immediately and
 * `Animated.View` is a plain `View`. Nothing under test depends on the
 * intermediate frames — the components' behaviour is in their props.
 */
jest.mock('react-native-reanimated', () => {
  const { View, Text, ScrollView, Image } = require('react-native')
  const immediate = (toValue) => toValue
  return {
    __esModule: true,
    default: { View, Text, ScrollView, Image, createAnimatedComponent: (c) => c },
    useSharedValue: (initial) => ({ value: initial }),
    useAnimatedStyle: (factory) => factory(),
    useDerivedValue: (factory) => ({ value: factory() }),
    withTiming: immediate,
    withSpring: immediate,
    withDelay: (_delay, animation) => animation,
    withSequence: (...animations) => animations[animations.length - 1],
    withRepeat: (animation) => animation,
    cancelAnimation: () => undefined,
    runOnJS: (fn) => fn,
    interpolate: (value) => value,
    Easing: { linear: (t) => t, ease: (t) => t, inOut: (fn) => fn, out: (fn) => fn },
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
  }
})

// Haptics: fire-and-forget on a real device, absent here.
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}))

// The device's language list. Turkish is the product default, so it is also
// the default in tests; a test that cares overrides the provider preference.
jest.mock('expo-localization', () => ({
  getLocales: () => [
    { languageTag: 'tr-TR', languageCode: 'tr', regionCode: 'TR', textDirection: 'ltr' },
  ],
  getCalendars: () => [{ timeZone: 'Europe/Istanbul' }],
}))

jest.mock('expo-secure-store', () => {
  const store = new Map()
  return {
    getItemAsync: jest.fn((key) => Promise.resolve(store.get(key) ?? null)),
    setItemAsync: jest.fn((key, value) => {
      store.set(key, value)
      return Promise.resolve()
    }),
    deleteItemAsync: jest.fn((key) => {
      store.delete(key)
      return Promise.resolve()
    }),
  }
})

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native')
  return { LinearGradient: View }
})

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    setParams: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  usePathname: () => '/',
  Link: ({ children }) => children,
  Stack: { Screen: () => null },
  Redirect: () => null,
}))

// The local native module: `requireOptionalNativeModule` already returns null
// off-device, and the JS boundary degrades gracefully, so the real module is
// left alone rather than mocked into pretending it exists.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)

// Real timers on purpose: Testing Library 14's `render` is asynchronous, and
// faking timers around an async `act()` produces overlapping act scopes and a
// tree that queries cannot see.
