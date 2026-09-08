import { type gradients, gradientToNativePoints, palette, radius, spacing } from '@da/design-tokens'
import type { Briefing } from '@da/domain'
import { MaterialIcons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { View } from 'react-native'
import { useI18n, useT } from '../../i18n/I18nProvider'
import { Pressable } from '../ui/Pressable'
import { Text } from '../ui/Text'

export interface BriefingHeroProps {
  briefing: Briefing | null
  priorityCount: number
  gradient: (typeof gradients)['dawn']
  onOpen: () => void
  /** Starts audio playback. Always present; gating happens inside the handler. */
  onListen: () => void
  /** False on the free plan — the button still works, it opens the paywall. */
  canListen: boolean
}

/**
 * The hero card that opens the briefing.
 *
 * The headline comes from the generated briefing when there is one; otherwise
 * the count sentence is composed locally, so the hero is never blank and never
 * claims a briefing exists when it does not.
 */
export function BriefingHero({
  briefing,
  priorityCount,
  gradient,
  onOpen,
  onListen,
  canListen,
}: BriefingHeroProps) {
  const t = useT()
  const { plural } = useI18n()
  const { start, end } = gradientToNativePoints('dawn')

  const headline = briefing?.headline ?? plural('today.hero.count', priorityCount)
  const isReady = briefing?.status === 'ready'
  const durationMinutes = briefing?.durationSeconds
    ? Math.max(1, Math.round(briefing.durationSeconds / 60))
    : null

  return (
    <Pressable
      onPress={onOpen}
      accessibilityLabel={headline}
      accessibilityHint={t('a11y.hint.doubleTapToOpen')}
      haptic="light"
      style={{ marginTop: spacing.md, borderRadius: radius.hero, overflow: 'hidden' }}
      testID="briefing-hero"
    >
      <LinearGradient
        colors={[...gradient.colors] as [string, string, ...string[]]}
        locations={[...gradient.locations] as [number, number, ...number[]]}
        start={start}
        end={end}
        style={{ padding: spacing.lg, gap: spacing.sm }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <MaterialIcons name="auto-awesome" size={14} color={palette.indigo300} />
          <Text variant="caption" style={{ color: palette.indigo300 }}>
            {t(`briefing.kind.${briefing?.kind ?? 'morning'}`)}
          </Text>
        </View>

        <Text variant="display" style={{ color: palette.white, fontSize: 28, lineHeight: 34 }}>
          {headline}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              backgroundColor: 'rgba(255,255,255,0.14)',
              paddingHorizontal: spacing.xs,
              paddingVertical: 7,
              borderRadius: radius.chip,
            }}
          >
            <MaterialIcons name="menu-book" size={14} color={palette.white} />
            <Text variant="micro" style={{ color: palette.white, letterSpacing: 0 }}>
              {/* `briefing.readingTime` is a plain message with a `{minutes}`
                  placeholder, not a plural family. Reading it through `plural`
                  interpolated only `{count}`, so the app's most prominent card
                  printed the literal text "{minutes} dakikalık okuma". */}
              {durationMinutes
                ? t('briefing.readingTime', { minutes: durationMinutes })
                : t('today.action.openBriefing')}
            </Text>
          </View>

          {isReady ? (
            <Pressable
              onPress={onListen}
              accessibilityLabel={t('briefing.audio.listen')}
              accessibilityHint={canListen ? undefined : t('paywall.lock.body')}
              haptic="light"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: 'rgba(255,255,255,0.14)',
                paddingHorizontal: spacing.xs,
                paddingVertical: 7,
                borderRadius: radius.chip,
                minHeight: 0,
              }}
              testID="briefing-hero-listen"
            >
              <MaterialIcons name="headphones" size={14} color={palette.white} />
              <Text variant="micro" style={{ color: palette.white, letterSpacing: 0 }}>
                {t('briefing.audio.listen')}
              </Text>
              {!canListen ? (
                <MaterialIcons name="lock" size={11} color={palette.indigo300} />
              ) : null}
            </Pressable>
          ) : null}
        </View>

        {!isReady && briefing?.status === 'generating' ? (
          <Text variant="micro" style={{ color: palette.indigo300 }}>
            {t('briefing.status.generating')}
          </Text>
        ) : null}
      </LinearGradient>
    </Pressable>
  )
}
