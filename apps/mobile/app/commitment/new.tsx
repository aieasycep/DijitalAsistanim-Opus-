import { qk } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import { type CommitmentDirection, nextLocalTimeOccurrence, systemClock, addLocalDays } from '@da/domain'
import { formatFullDate } from '@da/i18n'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, View } from 'react-native'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { FilterChip, SegmentedControl } from '../../src/components/ui/Controls'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { Text } from '../../src/components/ui/Text'
import { TextField } from '../../src/components/ui/TextField'
import { useUserContext } from '../../src/hooks/useUserContext'
import { useI18n, useT } from '../../src/i18n/I18nProvider'
import { errorMessageKey } from '../../src/lib/query-client'
import { useApi } from '../../src/providers/AppProviders'

/** Due-date shortcuts, resolved in the user's own zone. */
const DUE_OPTIONS = [0, 1, 3, 7] as const

/**
 * A promise entered by hand.
 *
 * The extractor requires a verbatim quote before it will ever create a
 * commitment; a manual entry is its own source, so the text the user typed is
 * stored as the quote rather than leaving the field empty.
 */
export default function NewCommitmentScreen() {
  const t = useT()
  const { locale } = useI18n()
  const router = useRouter()
  const api = useApi()
  const queryClient = useQueryClient()
  const { timeZone } = useUserContext()

  const [text, setText] = useState('')
  const [person, setPerson] = useState('')
  const [direction, setDirection] = useState<CommitmentDirection>('user_owes')
  const [dueInDays, setDueInDays] = useState<number | null>(null)

  const now = systemClock.now()
  const dueAt =
    dueInDays === null
      ? null
      : nextLocalTimeOccurrence(addLocalDays(now, dueInDays, timeZone), '18:00', timeZone)

  const create = useMutation({
    mutationFn: () =>
      api.commitments.create({
        text: text.trim(),
        direction,
        personName: person.trim() || null,
        dueAt: dueAt ? dueAt.toISOString() : null,
        quote: text.trim(),
      }),
    onSuccess: async (commitment) => {
      await queryClient.invalidateQueries({ queryKey: qk.commitments() })
      router.replace(`/commitment/${commitment.id}`)
    },
  })

  return (
    <Screen scroll={false}>
      <ScreenHeader title={t('commitment.create.title')} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ flex: 1, gap: spacing.md, paddingTop: spacing.sm }}>
          <TextField
            label={t('commitment.create.whatLabel')}
            value={text}
            onChangeText={setText}
            placeholder={t('commitment.create.whatPlaceholder')}
            multiline
            height={90}
            autoFocus
            testID="commitment-text"
          />

          <View style={{ gap: spacing.xs }}>
            <Text variant="caption" tone="secondary">
              {t('commitment.create.directionLabel')}
            </Text>
            <SegmentedControl<CommitmentDirection>
              options={[
                { value: 'user_owes', label: t('commitment.directionShort.user_owes') },
                { value: 'other_owes', label: t('commitment.directionShort.other_owes') },
              ]}
              value={direction}
              onChange={setDirection}
              testID="commitment-direction"
            />
          </View>

          <TextField
            label={t('commitment.create.whoLabel')}
            value={person}
            onChangeText={setPerson}
            placeholder={t('person.searchPlaceholder')}
            testID="commitment-person"
          />

          <View style={{ gap: spacing.xs }}>
            <Text variant="caption" tone="secondary">
              {t('commitment.create.dueLabel')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              <FilterChip
                label={t('commitment.card.noDate')}
                selected={dueInDays === null}
                onPress={() => setDueInDays(null)}
                testID="commitment-due-none"
              />
              {DUE_OPTIONS.map((days) => (
                <FilterChip
                  key={days}
                  label={formatFullDate(addLocalDays(now, days, timeZone), locale, timeZone)}
                  selected={dueInDays === days}
                  onPress={() => setDueInDays(days)}
                  testID={`commitment-due-${days}`}
                />
              ))}
            </View>
          </View>

          {create.isError ? (
            <Card tone="critical">
              <Text variant="secondary" tone="critical">
                {t(errorMessageKey(create.error))}
              </Text>
            </Card>
          ) : null}

          <View style={{ flex: 1 }} />

          <Button
            label={t('commitment.create.save')}
            onPress={() => create.mutate()}
            size="lg"
            fullWidth
            loading={create.isPending}
            disabled={text.trim().length < 3}
            style={{ marginBottom: spacing.md }}
            testID="commitment-save"
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}
