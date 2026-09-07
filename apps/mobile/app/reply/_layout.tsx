import { Stack } from 'expo-router'
import { useTheme } from '../../src/theme/ThemeProvider'

/** The reply composer, per thread. */
export default function ReplyLayout() {
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
