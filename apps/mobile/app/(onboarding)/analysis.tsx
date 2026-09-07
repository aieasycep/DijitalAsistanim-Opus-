import { spacing } from '@da/design-tokens'
import { ERROR_CODES, type ErrorCode } from '@da/domain'
import type { InitialAnalysisProgress } from '@da/validation'
import { MaterialIcons } from '@expo/vector-icons'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import { View } from 'react-native'
import { StepFrame } from '../../src/components/onboarding/StepFrame'
import { Card } from '../../src/components/ui/Card'
import { ProgressBar } from '../../src/components/ui/Controls'
import { Text } from '../../src/components/ui/Text'
import { useI18n, useT } from '../../src/i18n/I18nProvider'
import { track } from '../../src/lib/analytics'
import { errorMessageKey } from '../../src/lib/query-client'
import { useApi } from '../../src/providers/AppProviders'
import { useTheme } from '../../src/theme/ThemeProvider'

/** A server-reported code is only rendered when it is one we have copy for. */
function isErrorCode(code: string | null | undefined): code is ErrorCode {
  return typeof code === 'string' && (ERROR_CODES as readonly string[]).includes(code)
}

/** The four things the pass does, in the order the phases report them. */
const PHASES: ReadonlyArray<{
  phase: InitialAnalysisProgress['phase']
  labelKey: string
  countKey: string
  count: (progress: InitialAnalysisProgress) => number
}> = [
  {
    phase: 'mail',
    labelKey: 'onboarding.analysis.steps.mail',
    countKey: 'onboarding.analysis.foundMail',
    count: (progress) => progress.emailsFound,
  },
  {
    phase: 'analysis',
    labelKey: 'onboarding.analysis.steps.importance',
    countKey: 'onboarding.analysis.foundImportant',
    count: (progress) => progress.importantFound,
  },
  {
    phase: 'calendar',
    labelKey: 'onboarding.analysis.steps.calendar',
    countKey: 'onboarding.analysis.foundEvents',
    count: (progress) => progress.meetingsFound,
  },
  {
    phase: 'follow_ups',
    labelKey: 'onboarding.analysis.steps.followups',
    countKey: 'onboarding.analysis.foundFollowUps',
    count: (progress) => progress.followUpsFound,
  },
]

const PHASE_ORDER: ReadonlyArray<InitialAnalysisProgress['phase']> = [
  'queued',
  'mail',
  'analysis',
  'calendar',
  'follow_ups',
  'briefing',
  'done',
]

/**
 * Step six: the first pass over the mailbox.
 *
 * Progress is polled rather than streamed, because the work happens in an edge
 * function that may outlive the socket. The counts are real rows as they land,
 * so the screen is honest even when it is slow.
 */
export default function AnalysisStep() {
  const t = useT()
  const { plural } = useI18n()
  const theme = useTheme()
  const router = useRouter()
  const api = useApi()
  const started = useRef(false)

  const start = useMutation({
    mutationFn: () => api.sync.initialAnalysis({ hours: 72 }),
  })

  const progressQuery = useQuery({
    queryKey: ['sync', 'initial-analysis'],
    queryFn: () => api.sync.initialAnalysisProgress(),
    refetchInterval: (query) => {
      const phase = query.state.data?.phase
      return phase === 'done' || phase === 'failed' ? false : 2000
    },
  })

  useEffect(() => {
    if (started.current) return
    started.current = true
    start.mutate()
  }, [start])

  const progress = progressQuery.data ?? start.data ?? null
  const phase = progress?.phase ?? 'queued'
  const isDone = phase === 'done'
  const isFailed = phase === 'failed'

  useEffect(() => {
    if (isDone) track('first_analysis_completed')
  }, [isDone])

  const phaseIndex = PHASE_ORDER.indexOf(phase)

  return (
    <StepFrame
      step="analysis"
      title={isDone ? t('onboarding.aha.title') : t('onboarding.analysis.title')}
      description={isDone ? t('onboarding.aha.body') : t('onboarding.analysis.body')}
      primaryLabel={
        isFailed
          ? t('onboarding.analysis.retry')
          : isDone
            ? t('onboarding.aha.primary')
            : t('onboarding.analysis.background')
      }
      onPrimary={() => {
        if (isFailed) {
          start.mutate()
          void progressQuery.refetch()
          return
        }
        router.push('/(onboarding)/done')
      }}
      primaryLoading={start.isPending && !progress}
      testID="onboarding-analysis"
    >
      <ProgressBar
        progress={progress?.progress ?? 0.05}
        label={t('onboarding.analysis.title')}
        testID="analysis-progress"
      />

      <View style={{ gap: spacing.xs }}>
        {PHASES.map((entry) => {
          const entryIndex = PHASE_ORDER.indexOf(entry.phase)
          const reached = phaseIndex >= entryIndex
          const complete = phaseIndex > entryIndex || isDone
          return (
            <View
              key={entry.phase}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
            >
              <MaterialIcons
                name={complete ? 'check-circle' : reached ? 'radio-button-checked' : 'radio-button-unchecked'}
                size={20}
                color={
                  complete
                    ? theme.colors.success
                    : reached
                      ? theme.colors.primary
                      : theme.colors.textDisabled
                }
              />
              <Text
                variant="body"
                tone={reached ? 'default' : 'tertiary'}
                style={{ flex: 1 }}
              >
                {t(entry.labelKey)}
              </Text>
              {progress && reached ? (
                <Text variant="secondary" tone="secondary" tabular>
                  {plural(entry.countKey, entry.count(progress))}
                </Text>
              ) : null}
            </View>
          )
        })}
      </View>

      {isFailed ? (
        <Card tone="critical">
          <Text variant="secondary" tone="critical">
            {isErrorCode(progress?.errorCode)
              ? t(`errors.${progress.errorCode}`)
              : t('onboarding.analysis.failed')}
          </Text>
        </Card>
      ) : null}

      {start.isError && !progress ? (
        <Card tone="critical">
          <Text variant="secondary" tone="critical">
            {t(errorMessageKey(start.error))}
          </Text>
        </Card>
      ) : null}
    </StepFrame>
  )
}
