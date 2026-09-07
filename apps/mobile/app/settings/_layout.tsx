import { Stack } from 'expo-router'
import { useTheme } from '../../src/theme/ThemeProvider'

/** The settings stack: an index and one screen per group of preferences. */
export default function SettingsLayout() {
  const theme = useTheme()
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.bg },
        animation: 'slide_from_right',
      }}
    />
  )
}
