import { Stack } from 'expo-router'
import { useTheme } from '../../src/theme/ThemeProvider'

export default function OnboardingLayout() {
  const theme = useTheme()
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.bg },
        animation: 'slide_from_right',
        // The flow is linear; swiping back out of the analysis step would leave
        // a half-configured account behind.
        gestureEnabled: false,
      }}
    />
  )
}
