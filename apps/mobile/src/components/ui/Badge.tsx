import { type Theme, radius, spacing } from '@da/design-tokens'
import { MaterialIcons } from '@expo/vector-icons'
import { View, type ViewStyle } from 'react-native'
import { useTheme } from '../../theme/ThemeProvider'
import { Text } from './Text'

export type BadgeTone = 'neutral' | 'critical' | 'warning' | 'success' | 'info' | 'primary'

function palette(tone: BadgeTone, theme: Theme): { bg: string; fg: string } {
  switch (tone) {
    case 'critical':
      return { bg: theme.colors.criticalSoft, fg: theme.colors.criticalText }
    case 'warning':
      return { bg: theme.colors.warningSoft, fg: theme.colors.warningText }
    case 'success':
      return { bg: theme.colors.successSoft, fg: theme.colors.successText }
    case 'info':
      return { bg: theme.colors.infoSoft, fg: theme.colors.infoText }
    case 'primary':
      return { bg: theme.colors.primarySoft, fg: theme.colors.primaryOnSoft }
    case 'neutral':
      return { bg: theme.colors.surface2, fg: theme.colors.textSecondary }
  }
}

export interface BadgeProps {
  label: string
  tone?: BadgeTone
  /**
   * Material icon name. Status is never carried by colour alone — an icon or
   * the label itself always says what the badge means, so the badge stays
   * readable for colour-blind users and in high-contrast mode.
   */
  icon?: keyof typeof MaterialIcons.glyphMap
  style?: ViewStyle
  testID?: string
}

export function Badge({ label, tone = 'neutral', icon, style, testID }: BadgeProps) {
  const theme = useTheme()
  const { bg, fg } = palette(tone, theme)

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={label}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          alignSelf: 'flex-start',
          backgroundColor: bg,
          paddingHorizontal: spacing.xs,
          paddingVertical: 3,
          borderRadius: radius.chip,
        },
        style,
      ]}
    >
      {icon ? <MaterialIcons name={icon} size={12} color={fg} /> : null}
      <Text variant="micro" style={{ color: fg }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}
