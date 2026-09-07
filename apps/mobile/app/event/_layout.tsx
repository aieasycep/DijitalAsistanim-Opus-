import { Stack } from 'expo-router'
import { useTheme } from '../../src/theme/ThemeProvider'

/** Calendar events, addressed by id. */
export default function EventLayout() {
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
