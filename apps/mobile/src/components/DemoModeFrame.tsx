import { spacing } from '@da/design-tokens'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useT } from '../i18n/I18nProvider'
import { isDemoMode } from '../lib/env'
import { useTheme } from '../theme/ThemeProvider'
import { Text } from './ui/Text'

/**
 * Says so, when none of this is real.
 *
 * Demo mode serves a full day of mail, meetings and commitments from fixtures.
 * It is convincing on purpose — that is the point of a demo — and the app is
 * otherwise indistinguishable from one reading a live mailbox. Someone handed a
 * test build has no way to tell, and the consequences of guessing wrong run in
 * both directions: trusting a fixture reminder about a real meeting, or filing a
 * bug because a real message is missing from data that never contained it.
 *
 * The wording is the one the product already had — `settings.demo.banner`,
 * "Demo modundasın. Veriler örnektir." — which existed in both locales and was
 * rendered nowhere.
 *
 * This is also the honest half of a guarantee the code used to imply and not
 * keep: a flag named `demoMode` was forced off in release builds, which read as
 * "a shipped binary cannot serve fake data", while the API client fell back to
 * fixtures on its own whenever no project was configured. A build with no
 * backend serves fixtures; what protects the person holding it is being told,
 * not a constant that quietly claims the situation cannot arise.
 *
 * Nothing here is pressable. There is no action to offer — the way out of demo
 * mode is to configure a project, which is not something a tap can do — and a
 * control that looks pressable and is not is exactly what this codebase forbids.
 */
export function DemoModeFrame({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets()
  const theme = useTheme()
  const t = useT()

  if (!isDemoMode()) return <>{children}</>

  const message = t('settings.demo.banner')

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.infoSoft }}>
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={message}
        testID="demo-mode-banner"
        style={{
          paddingTop: insets.top + spacing.xxs,
          paddingBottom: spacing.xxs,
          paddingHorizontal: spacing.md,
          backgroundColor: theme.colors.infoSoft,
        }}
      >
        <Text variant="micro" style={{ color: theme.colors.infoText, textAlign: 'center' }}>
          {message}
        </Text>
      </View>

      {/*
        The strip has already consumed the status-bar inset, and every screen
        below applies `insets.top` itself through its own header. Left alone,
        each one would add the status bar a second time and open with a gap.
        Overriding the inset for the subtree is the supported way to say "that
        space is spent": screens keep asking the same question and now get the
        right answer, so not one of them has to know this banner exists.
      */}
      <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
        <View style={{ flex: 1 }}>{children}</View>
      </SafeAreaInsetsContext.Provider>
    </View>
  )
}
