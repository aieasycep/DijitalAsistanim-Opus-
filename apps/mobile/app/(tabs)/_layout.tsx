import { layout, spacing } from '@da/design-tokens'
import { MaterialIcons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import type { ColorValue } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../../src/components/ui/Text'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'

type IconName = keyof typeof MaterialIcons.glyphMap

/**
 * The four-tab shell: Bugün, Akış, Plan, Asistan.
 *
 * Chat is deliberately the fourth tab and not the home screen — the product's
 * value is what it tells you before you ask, so Today is what opens.
 */
export default function TabsLayout() {
  const theme = useTheme()
  const t = useT()
  const insets = useSafeAreaInsets()

  const renderIcon =
    (name: IconName, activeName: IconName) =>
    ({ color, focused }: { color: ColorValue; focused: boolean }) => (
      <MaterialIcons name={focused ? activeName : name} size={24} color={String(color)} />
    )

  const renderLabel =
    (label: string) =>
    ({ color, focused }: { color: ColorValue; focused: boolean }) => (
      <Text
        variant="micro"
        style={{ color: String(color), fontWeight: focused ? '700' : '500', letterSpacing: 0 }}
        numberOfLines={1}
      >
        {label}
      </Text>
    )

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        // An explicit background is what keeps the bar from rendering as a
        // light surface in dark mode on both platforms.
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.hairline,
          borderTopWidth: 0.5,
          height: layout.tabBarHeight + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: spacing.xxs,
          elevation: 0,
        },
        tabBarItemStyle: { paddingVertical: 2 },
        sceneStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: t('common.tab.today'),
          tabBarIcon: renderIcon('wb-sunny', 'wb-sunny'),
          tabBarLabel: renderLabel(t('common.tab.today')),
          tabBarAccessibilityLabel: t('a11y.tab.today'),
        }}
      />
      <Tabs.Screen
        name="flow"
        options={{
          title: t('common.tab.flow'),
          tabBarIcon: renderIcon('dynamic-feed', 'dynamic-feed'),
          tabBarLabel: renderLabel(t('common.tab.flow')),
          tabBarAccessibilityLabel: t('a11y.tab.flow'),
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: t('common.tab.plan'),
          tabBarIcon: renderIcon('calendar-today', 'calendar-today'),
          tabBarLabel: renderLabel(t('common.tab.plan')),
          tabBarAccessibilityLabel: t('a11y.tab.plan'),
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: t('common.tab.assistant'),
          tabBarIcon: renderIcon('auto-awesome', 'auto-awesome'),
          tabBarLabel: renderLabel(t('common.tab.assistant')),
          tabBarAccessibilityLabel: t('a11y.tab.assistant'),
        }}
      />
    </Tabs>
  )
}
