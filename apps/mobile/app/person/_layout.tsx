import { Stack } from 'expo-router'
import { useTheme } from '../../src/theme/ThemeProvider'

/** People, addressed by contact id. */
export default function PersonLayout() {
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
