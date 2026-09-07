import { layout, radius, spacing } from '@da/design-tokens'
import { MaterialIcons } from '@expo/vector-icons'
import { type ReactNode } from 'react'
import { Modal, Platform, Pressable as RNPressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../theme/ThemeProvider'
import { elevationStyle } from '../../theme/useStyles'
import { IconButton } from './Controls'
import { Text } from './Text'

export interface SheetProps {
  visible: boolean
  onClose: () => void
  title: string
  /** Localised label for the close button — it is icon-only. */
  closeLabel: string
  children: ReactNode
  /** Pinned action row at the bottom, above the safe area. */
  footer?: ReactNode
  scrollable?: boolean
  testID?: string
}

/**
 * The bottom sheet.
 *
 * Uses a real `Modal` so the OS back gesture and the Android hardware back
 * button both dismiss it — a sheet implemented as an absolutely-positioned
 * view swallows both and strands the user.
 */
export function Sheet({
  visible,
  onClose,
  title,
  closeLabel,
  children,
  footer,
  scrollable = true,
  testID,
}: SheetProps) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  const body = <View style={{ gap: spacing.md, paddingHorizontal: spacing.lg }}>{children}</View>

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
      testID={testID}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <RNPressable
          accessibilityLabel={closeLabel}
          accessibilityRole="button"
          onPress={onClose}
          style={{ ...StyleSheetAbsoluteFill, backgroundColor: theme.colors.scrim }}
        />
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: radius.hero,
            borderTopRightRadius: radius.hero,
            paddingTop: spacing.sm,
            paddingBottom: insets.bottom + spacing.md,
            maxHeight: '88%',
            ...elevationStyle('sheet'),
          }}
        >
          {/* Grabber — decorative on iOS, where the gesture is expected. */}
          {Platform.OS === 'ios' ? (
            <View
              accessible={false}
              style={{
                alignSelf: 'center',
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.colors.hairline,
                marginBottom: spacing.xs,
              }}
            />
          ) : null}

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: spacing.md,
              paddingBottom: spacing.sm,
            }}
          >
            <Text variant="h3" accessibilityRole="header" style={{ flex: 1 }} numberOfLines={2}>
              {title}
            </Text>
            <IconButton onPress={onClose} accessibilityLabel={closeLabel}>
              <MaterialIcons name="close" size={22} color={theme.colors.textSecondary} />
            </IconButton>
          </View>

          {scrollable ? (
            <ScrollView
              contentContainerStyle={{ paddingBottom: spacing.md }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {body}
            </ScrollView>
          ) : (
            body
          )}

          {footer ? (
            <View
              style={{
                paddingHorizontal: spacing.lg,
                paddingTop: spacing.sm,
                gap: spacing.xs,
                maxWidth: layout.maxContentWidth,
                width: '100%',
                alignSelf: 'center',
              }}
            >
              {footer}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}

const StyleSheetAbsoluteFill = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
}
