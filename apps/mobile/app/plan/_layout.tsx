import { Stack } from 'expo-router'
import { useTheme } from '../../src/theme/ThemeProvider'

/** Plan detail screens that sit outside the tab. */
export default function PlanDetailLayout() {
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
