import { radius, spacing } from '@da/design-tokens'
import { MaterialIcons } from '@expo/vector-icons'
import { View } from 'react-native'
import { useI18n, useT } from '../../i18n/I18nProvider'
import { useTheme } from '../../theme/ThemeProvider'
import { Pressable } from '../ui/Pressable'
import { Text } from '../ui/Text'

export interface ApprovalBannerProps {
  count: number
  onOpen: () => void
  busy?: boolean
}

/**
 * "N action waiting for your approval."
 *
 * Rendered with the dashed proposal border, matching the approval cards
 * themselves, so the visual language for "not yet real" is consistent from the
 * summary line all the way to the card that executes it.
 */
export function ApprovalBanner({ count, onOpen, busy = false }: ApprovalBannerProps) {
  const theme = useTheme()
  const t = useT()
  const { plural } = useI18n()

  if (count <= 0) return null

  return (
    <Pressable
      onPress={onOpen}
      disabled={busy}
      accessibilityLabel={plural('approval.pendingCount', count)}
      accessibilityHint={t('a11y.approval.openCenterHint')}
      haptic="light"
      testID="approval-banner"
      style={{
        marginTop: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.sm,
        borderRadius: radius.cardSm,
        backgroundColor: theme.colors.primarySoft,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: theme.colors.primary,
      }}
    >
      <MaterialIcons name="task-alt" size={20} color={theme.colors.primaryOnSoft} />
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" tone="primary" numberOfLines={2}>
          {plural('approval.pendingCount', count)}
        </Text>
        <Text variant="micro" tone="primary" style={{ letterSpacing: 0, opacity: 0.85 }}>
          {t('approval.bannerHint')}
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={20} color={theme.colors.primaryOnSoft} />
    </Pressable>
  )
}
