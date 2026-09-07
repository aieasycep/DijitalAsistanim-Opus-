import { Stack } from 'expo-router'
import { useTheme } from '../../src/theme/ThemeProvider'

/** Meeting prep and the post-meeting note, per event. */
export default function MeetingLayout() {
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
