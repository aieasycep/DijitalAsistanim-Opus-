import { spacing } from '@da/design-tokens'
import { catalogues, createTranslator, defaultLocale, resolveLocale } from '@da/i18n'
import * as Localization from 'expo-localization'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { View } from 'react-native'
import { reportError } from '../lib/error-reporting'
import { Button } from './ui/Button'
import { Screen } from './ui/Screen'
import { Text } from './ui/Text'

/**
 * The last line of defence.
 *
 * Expo Router renders this for an uncaught render error. It shows a plain
 * apology and a retry — never the error message, which could contain a subject
 * line or an address that made it into a render call.
 */

interface Props {
  children?: ReactNode
  /** Expo Router passes these for a route-level boundary. */
  error?: Error
  retry?: () => Promise<void>
}

interface State {
  hasError: boolean
}

/**
 * Translations are resolved directly from the catalogue rather than through the
 * i18n context: this boundary has to render even when the failure was inside
 * the provider tree it would otherwise depend on.
 */
function boundaryTranslator() {
  return createTranslator({
    locale: resolveLocale(Localization.getLocales()[0]?.languageTag ?? null),
    catalogues,
    fallbackLocale: defaultLocale,
  })
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(error, {
      scope: 'render',
      extra: { componentStack: info.componentStack?.slice(0, 500) ?? '' },
    })
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false })
    void this.props.retry?.()
  }

  override render(): ReactNode {
    const failed = this.state.hasError || Boolean(this.props.error)
    if (!failed) return this.props.children

    const t = boundaryTranslator().t

    return (
      <Screen scroll={false}>
        <View style={{ flex: 1, justifyContent: 'center', gap: spacing.md }}>
          <Text variant="h2" center>
            {t('errors.boundary.title')}
          </Text>
          <Text variant="secondary" tone="secondary" center>
            {t('errors.boundary.description')}
          </Text>
          <Button label={t('common.retry')} onPress={this.handleRetry} variant="tonal" />
        </View>
      </Screen>
    )
  }
}
