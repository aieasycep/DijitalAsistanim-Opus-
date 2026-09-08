import { radius, spacing } from '@da/design-tokens'
import { MaterialIcons } from '@expo/vector-icons'
import { type ReactNode } from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import { useTheme } from '../../theme/ThemeProvider'
import { Pressable } from './Pressable'
import { Text } from './Text'

/** A 1px rule in the theme's hairline colour. */
export function Divider({ inset = 0, style }: { inset?: number; style?: ViewStyle }) {
  const theme = useTheme()
  return (
    <View
      accessible={false}
      style={[
        {
          height: StyleSheet.hairlineWidth,
          backgroundColor: theme.colors.hairline,
          marginLeft: inset,
        },
        style,
      ]}
    />
  )
}

export interface SectionHeaderProps {
  /** The uppercase kicker, e.g. "ÖNCELİKLERİN · 5 EYLÜL". */
  title: string
  /** Optional trailing affordance. Only render one if it actually navigates. */
  actionLabel?: string
  onAction?: () => void
  style?: ViewStyle
}

export function SectionHeader({ title, actionLabel, onAction, style }: SectionHeaderProps) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: spacing.sm,
        },
        style,
      ]}
    >
      <Text variant="caption" tone="tertiary" accessibilityRole="header">
        {title}
      </Text>
      {actionLabel && onAction ? (
        // The label is small; the target is not. The 44pt floor comes from
        // `Pressable` and is deliberately not overridden here — a section
        // action used to be a ~30pt strip, which is a miss for anyone whose
        // aim is not exact. Extra hit slop widens the narrow text as well.
        <Pressable
          onPress={onAction}
          haptic="none"
          scaleOnPress={false}
          accessibilityLabel={actionLabel}
          hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
        >
          <Text variant="micro" tone="primary">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export interface IconTileProps {
  icon: keyof typeof MaterialIcons.glyphMap
  tone?: 'neutral' | 'primary' | 'critical' | 'warning' | 'success' | 'info'
  size?: number
}

/** The rounded icon square used on every card and settings row. */
export function IconTile({ icon, tone = 'neutral', size = 36 }: IconTileProps) {
  const theme = useTheme()
  const map = {
    neutral: { bg: theme.colors.surface2, fg: theme.colors.textSecondary },
    primary: { bg: theme.colors.primarySoft, fg: theme.colors.primaryOnSoft },
    critical: { bg: theme.colors.criticalSoft, fg: theme.colors.criticalText },
    warning: { bg: theme.colors.warningSoft, fg: theme.colors.warningText },
    success: { bg: theme.colors.successSoft, fg: theme.colors.successText },
    info: { bg: theme.colors.infoSoft, fg: theme.colors.infoText },
  } as const
  const { bg, fg } = map[tone]

  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: radius.chip,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <MaterialIcons name={icon} size={size * 0.52} color={fg} />
    </View>
  )
}

export interface ListRowProps {
  title: string
  subtitle?: string
  /** Trailing text, e.g. the current value of a setting. */
  value?: string
  icon?: keyof typeof MaterialIcons.glyphMap
  iconTone?: IconTileProps['tone']
  /** Omit to render a non-interactive informational row. */
  onPress?: (() => void) | undefined
  /** Rendered at the trailing edge instead of the chevron — a Toggle, say. */
  accessory?: ReactNode
  destructive?: boolean
  testID?: string
}

/**
 * The settings / list row. A row with no `onPress` and no `accessory` renders
 * without a chevron, so it never looks tappable when it is not. An accessory —
 * a Toggle, a Button — is always rendered outside the row's own accessibility
 * element so a screen reader can reach and operate it.
 */
export function ListRow({
  title,
  subtitle,
  value,
  icon,
  iconTone = 'neutral',
  onPress,
  accessory,
  destructive = false,
  testID,
}: ListRowProps) {
  const theme = useTheme()

  /** Everything the row *says*. Nothing in here is interactive. */
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.sm,
        minHeight: 52,
      }}
    >
      {icon ? <IconTile icon={icon} tone={destructive ? 'critical' : iconTone} size={32} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" tone={destructive ? 'critical' : 'default'} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="secondary" tone="secondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="secondary" tone="tertiary" numberOfLines={1} style={{ maxWidth: 140 }}>
          {value}
        </Text>
      ) : null}
      {!accessory && onPress ? (
        <MaterialIcons name="chevron-right" size={20} color={theme.colors.textTertiary} />
      ) : null}
    </View>
  )

  /**
   * The accessory is a *sibling* of the row's accessibility element, never a
   * descendant of it.
   *
   * `accessible` — set explicitly on an informational row, and set by
   * `Pressable` on a tappable one — collapses its whole subtree into a single
   * element on iOS. An accessory nested inside it therefore disappears from the
   * accessibility tree: every settings switch in the app, Reduce Motion
   * included, was unreachable by VoiceOver, and so was the remove button on a
   * VIP row. Keeping the accessory outside is what makes it focusable.
   */
  const row: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }

  if (!onPress) {
    return (
      <View testID={testID} style={row}>
        <View accessible style={{ flex: 1 }}>
          {body}
        </View>
        {accessory}
      </View>
    )
  }

  return (
    <View style={row}>
      <Pressable
        onPress={onPress}
        accessibilityLabel={title}
        accessibilityHint={subtitle}
        testID={testID}
        style={{ flex: 1, minHeight: 52 }}
        pressedStyle={{ backgroundColor: theme.colors.surface2 }}
      >
        {body}
      </Pressable>
      {accessory}
    </View>
  )
}
