import { Stack } from 'expo-router'
import { useTheme } from '../../src/theme/ThemeProvider'

/** The commitment list, one commitment, and manual entry. */
export default function CommitmentLayout() {
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
