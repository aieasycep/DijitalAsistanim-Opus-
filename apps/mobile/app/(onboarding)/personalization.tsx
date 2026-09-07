import { qk } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { View } from 'react-native'
import { StepFrame } from '../../src/components/onboarding/StepFrame'
import { Card } from '../../src/components/ui/Card'
import { FilterChip } from '../../src/components/ui/Controls'
import { Text } from '../../src/components/ui/Text'
import { useT } from '../../src/i18n/I18nProvider'
import { errorMessageKey } from '../../src/lib/query-client'
import { useApi } from '../../src/providers/AppProviders'

/**
 * The focus areas.
 *
 * Each one is stored as a real priority rule, so a choice made here changes the
 * ranking on the very first briefing rather than being a preference the engine
 * never reads. The keywords are the Turkish and English terms that actually
 * appear in the mail these categories arrive in.
 */
const FOCUS_AREAS: ReadonlyArray<{ key: string; labelKey: string; keywords: string[] }> = [
  {
    key: 'deadlines',
    labelKey: 'onboarding.personalization.focusDeadlines',
    keywords: ['son tarih', 'deadline', 'teslim', 'due date'],
  },
  {
    key: 'meetings',
    labelKey: 'onboarding.personalization.focusMeetings',
    keywords: ['toplantı', 'meeting', 'davet', 'invitation'],
  },
  {
    key: 'clients',
    labelKey: 'onboarding.personalization.focusClients',
    keywords: ['müşteri', 'client', 'teklif', 'proposal'],
  },
  {
    key: 'team',
    labelKey: 'onboarding.personalization.focusTeam',
    keywords: ['ekip', 'takım', 'team', 'sprint'],
  },
  {
    key: 'finance',
    labelKey: 'onboarding.personalization.focusFinance',
    keywords: ['fatura', 'ödeme', 'invoice', 'payment'],
  },
  {
    key: 'travel',
    labelKey: 'onboarding.personalization.focusTravel',
    keywords: ['uçuş', 'rezervasyon', 'flight', 'booking'],
  },
  {
    key: 'personal',
    labelKey: 'onboarding.personalization.focusPersonal',
    keywords: ['randevu', 'okul', 'sağlık', 'appointment'],
  },
]

export default function PersonalizationStep() {
  const t = useT()
  const router = useRouter()
  const api = useApi()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<string[]>([])

  const toggle = useCallback((key: string) => {
    setSelected((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
    )
  }, [])

  const save = useMutation({
    mutationFn: async () => {
      const keywords = FOCUS_AREAS.filter((area) => selected.includes(area.key)).flatMap(
        (area) => area.keywords,
      )
      // Sequential rather than parallel: the list is short, and a burst of
      // writes against a fresh account is the worst time to hit a rate limit.
      for (const keyword of keywords) {
        await api.rules.create({ kind: 'keyword_high_priority', matchValue: keyword })
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.priorityRules() })
      router.push('/(onboarding)/vip')
    },
  })

  return (
    <StepFrame
      step="personalization"
      title={t('onboarding.personalization.title')}
      description={t('onboarding.personalization.body')}
      primaryLabel={t('onboarding.personalization.primary')}
      onPrimary={() => save.mutate()}
      primaryLoading={save.isPending}
      testID="onboarding-personalization"
    >
      <View style={{ gap: spacing.sm }}>
        <Text variant="caption" tone="tertiary">
          {t('onboarding.personalization.focusLabel')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {FOCUS_AREAS.map((area) => (
            <FilterChip
              key={area.key}
              label={t(area.labelKey)}
              selected={selected.includes(area.key)}
              onPress={() => toggle(area.key)}
              testID={`focus-${area.key}`}
            />
          ))}
        </View>
      </View>

      {save.isError ? (
        <Card tone="critical">
          <Text variant="secondary" tone="critical">
            {t(errorMessageKey(save.error))}
          </Text>
        </Card>
      ) : null}

      <Text variant="micro" tone="tertiary">
        {t('settings.personalization.learningHint')}
      </Text>
    </StepFrame>
  )
}
