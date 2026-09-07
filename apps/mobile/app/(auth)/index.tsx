import { spacing } from '@da/design-tokens'
import { MaterialIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import {
  Dimensions,
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { Button } from '../../src/components/ui/Button'
import { Screen } from '../../src/components/ui/Screen'
import { Text } from '../../src/components/ui/Text'
import { useT } from '../../src/i18n/I18nProvider'
import { useTheme } from '../../src/theme/ThemeProvider'

/**
 * The four intro slides.
 *
 * Each one states a single claim the product actually keeps, in the order that
 * builds trust: what it is, what problem it solves, that it acts first, and
 * that it never acts alone.
 */
const SLIDES = [
  { key: 'welcome', icon: 'auto-awesome' },
  { key: 'noise', icon: 'filter-alt' },
  { key: 'proactive', icon: 'notifications-active' },
  { key: 'control', icon: 'verified-user' },
] as const

export default function IntroScreen() {
  const t = useT()
  const theme = useTheme()
  const router = useRouter()
  const scrollRef = useRef<ScrollView>(null)
  const [index, setIndex] = useState(0)
  const width = Dimensions.get('window').width

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(event.nativeEvent.contentOffset.x / width)
      if (next !== index) setIndex(next)
    },
    [index, width],
  )

  const advance = useCallback(() => {
    if (index >= SLIDES.length - 1) {
      router.push('/(auth)/account')
      return
    }
    const next = index + 1
    setIndex(next)
    scrollRef.current?.scrollTo({ x: next * width, animated: true })
  }, [index, router, width])

  const slide = SLIDES[index] ?? SLIDES[0]

  return (
    <Screen scroll={false} padded={false}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        style={{ flex: 1 }}
        testID="intro-pager"
      >
        {SLIDES.map((entry) => (
          <View
            key={entry.key}
            style={{
              width,
              paddingHorizontal: spacing.lg,
              justifyContent: 'center',
              gap: spacing.md,
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: theme.colors.primarySoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MaterialIcons name={entry.icon} size={30} color={theme.colors.primaryOnSoft} />
            </View>
            <Text variant="display" accessibilityRole="header">
              {t(`onboarding.${entry.key}.title`)}
            </Text>
            <Text variant="editorial" tone="secondary">
              {t(`onboarding.${entry.key}.body`)}
            </Text>
          </View>
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}
          accessible
          accessibilityLabel={t('onboarding.progress', {
            current: index + 1,
            total: SLIDES.length,
          })}
        >
          {SLIDES.map((entry, entryIndex) => (
            <View
              key={entry.key}
              style={{
                width: entryIndex === index ? 18 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor:
                  entryIndex === index ? theme.colors.primary : theme.colors.surface2,
              }}
            />
          ))}
        </View>

        <Button
          label={t(`onboarding.${slide.key}.primary`)}
          onPress={advance}
          size="lg"
          fullWidth
          testID="intro-primary"
        />
        <Button
          label={t('onboarding.welcome.secondary')}
          onPress={() => router.push('/(auth)/account')}
          variant="ghost"
          size="md"
          fullWidth
          testID="intro-secondary"
        />
      </View>
    </Screen>
  )
}
