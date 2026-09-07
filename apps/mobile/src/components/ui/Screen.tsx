import { layout, spacing } from '@da/design-tokens'
import { type ReactNode } from 'react'
import {
  RefreshControl,
  type ScrollView as ScrollViewType,
  ScrollView,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useTheme } from '../../theme/ThemeProvider'

export interface ScreenProps {
  children: ReactNode
  /** Scrollable by default; pass false for a screen that manages its own list. */
  scroll?: boolean
  onRefresh?: (() => void) | undefined
  refreshing?: boolean
  /** Applied to the horizontal edges. Set false for full-bleed content. */
  padded?: boolean
  /** Extra bottom space so content clears a floating tab bar or action row. */
  bottomInset?: number
  style?: StyleProp<ViewStyle>
  contentStyle?: StyleProp<ViewStyle>
  /** Fills the whole screen (including the status bar area) with a gradient. */
  edgeToEdge?: boolean
  scrollRef?: React.Ref<ScrollViewType>
  testID?: string
}

/**
 * The screen shell.
 *
 * Owns safe-area handling and the status-bar style so no screen has to think
 * about either — and so the status bar can never end up dark-on-dark, which is
 * the classic way a "dark mode" ships half-done.
 */
export function Screen({
  children,
  scroll = true,
  onRefresh,
  refreshing = false,
  padded = true,
  bottomInset = 0,
  style,
  contentStyle,
  edgeToEdge = false,
  scrollRef,
  testID,
}: ScreenProps) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: edgeToEdge ? 'transparent' : theme.colors.bg,
  }

  const padding: ViewStyle = {
    ...(padded ? { paddingHorizontal: layout.screenPaddingHorizontal } : {}),
    paddingBottom: insets.bottom + bottomInset + spacing.lg,
  }

  return (
    <View style={[containerStyle, style]} testID={testID}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={[padding, contentStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.colors.primary}
                colors={[theme.colors.primary]}
                progressBackgroundColor={theme.colors.surface}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, padding, contentStyle]}>{children}</View>
      )}
    </View>
  )
}
