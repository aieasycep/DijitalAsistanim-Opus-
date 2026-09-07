import { spacing } from '@da/design-tokens'
import { type ReactNode } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useT } from '../../i18n/I18nProvider'
import { useTheme } from '../../theme/ThemeProvider'
import { Button } from '../ui/Button'
import { Screen } from '../ui/Screen'
import { Text } from '../ui/Text'

/** The ordered onboarding steps. The index drives the progress indicator. */
export const ONBOARDING_STEPS = [
  'connect',
  'permissions',
  'personalization',
  'vip',
  'preferences',
  'analysis',
  'done',
] as const

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

export interface StepFrameProps {
  step: OnboardingStep
  title: string
  description?: string
  children: ReactNode
  /** The main forward action. Every step has exactly one. */
  primaryLabel: string
  onPrimary: () => void
  primaryLoading?: boolean
  primaryDisabled?: boolean
  /** An optional way past a step that is not strictly required. */
  secondaryLabel?: string
  onSecondary?: () => void
  testID?: string
}

/**
 * The shell every onboarding step renders inside.
 *
 * It owns the progress indicator and the action row so the flow feels like one
 * continuous thing rather than seven separate screens, and so no step can
 * accidentally ship without a way forward.
 */
export function StepFrame({
  step,
  title,
  description,
  children,
  primaryLabel,
  onPrimary,
  primaryLoading = false,
  primaryDisabled = false,
  secondaryLabel,
  onSecondary,
  testID,
}: StepFrameProps) {
  const t = useT()
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const index = ONBOARDING_STEPS.indexOf(step)

  return (
    <Screen scroll contentStyle={{ flexGrow: 1 }} testID={testID}>
      <View
        style={{
          paddingTop: insets.top + spacing.sm,
          flexDirection: 'row',
          gap: 6,
          alignItems: 'center',
        }}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('onboarding.progress', {
          current: index + 1,
          total: ONBOARDING_STEPS.length,
        })}
      >
        {ONBOARDING_STEPS.map((entry, entryIndex) => (
          <View
            key={entry}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              backgroundColor: entryIndex <= index ? theme.colors.primary : theme.colors.surface2,
            }}
          />
        ))}
      </View>

      <View style={{ flex: 1, gap: spacing.lg, paddingTop: spacing.xl }}>
        <View style={{ gap: spacing.xs }}>
          <Text variant="h1" accessibilityRole="header">
            {title}
          </Text>
          {description ? (
            <Text variant="body" tone="secondary">
              {description}
            </Text>
          ) : null}
        </View>

        <View style={{ flex: 1, gap: spacing.md }}>{children}</View>

        <View style={{ gap: spacing.xs, paddingBottom: spacing.lg }}>
          <Button
            label={primaryLabel}
            onPress={onPrimary}
            size="lg"
            fullWidth
            loading={primaryLoading}
            disabled={primaryDisabled}
            testID={`onboarding-${step}-primary`}
          />
          {secondaryLabel && onSecondary ? (
            <Button
              label={secondaryLabel}
              onPress={onSecondary}
              variant="ghost"
              size="md"
              fullWidth
              testID={`onboarding-${step}-secondary`}
            />
          ) : null}
        </View>
      </View>
    </Screen>
  )
}
