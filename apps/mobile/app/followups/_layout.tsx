import { Stack } from 'expo-router'
import { useTheme } from '../../src/theme/ThemeProvider'

/** Threads waiting on a reply. */
export default function FollowUpsLayout() {
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
