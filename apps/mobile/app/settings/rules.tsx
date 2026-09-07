import { qk } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import { PRIORITY_RULE_KINDS, type PriorityRule, type PriorityRuleKind } from '@da/domain'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { View } from 'react-native'
import { Button } from '../../src/components/ui/Button'
import { Card } from '../../src/components/ui/Card'
import { FilterChip, Toggle } from '../../src/components/ui/Controls'
import { Divider, ListRow } from '../../src/components/ui/Layout'
import { Screen } from '../../src/components/ui/Screen'
import { ScreenHeader } from '../../src/components/ui/ScreenHeader'
import { Sheet } from '../../src/components/ui/Sheet'
import { EmptyState, SkeletonCard } from '../../src/components/ui/States'
import { Text } from '../../src/components/ui/Text'
import { TextField } from '../../src/components/ui/TextField'
import { usePriorityRules } from '../../src/hooks/queries'
import { useEntitlements } from '../../src/hooks/useEntitlements'
import { useT } from '../../src/i18n/I18nProvider'
import { track } from '../../src/lib/analytics'
import { errorMessageKey } from '../../src/lib/query-client'
import { useApi } from '../../src/providers/AppProviders'

/** Which placeholder a rule kind expects — a sender, a domain or a keyword. */
const INPUT_KEY: Record<PriorityRuleKind, { label: string; placeholder: string }> = {
  sender_always_important: {
    label: 'priority.rule.senderLabel',
    placeholder: 'priority.rule.senderPlaceholder',
  },
  mute_sender: {
    label: 'priority.rule.senderLabel',
    placeholder: 'priority.rule.senderPlaceholder',
  },
  vip_always_notify: {
    label: 'priority.rule.senderLabel',
    placeholder: 'priority.rule.senderPlaceholder',
  },
  domain_always_important: {
    label: 'priority.rule.domainLabel',
    placeholder: 'priority.rule.domainPlaceholder',
  },
  keyword_high_priority: {
    label: 'priority.rule.keywordLabel',
    placeholder: 'priority.rule.keywordPlaceholder',
  },
  category_low_priority: {
    label: 'priority.rule.categoryLabel',
    placeholder: 'priority.rule.keywordPlaceholder',
  },
}

/**
 * Priority rules.
 *
 * These are the user's explicit overrides, and they outrank anything the model
 * decided: a muted sender stays muted no matter how urgent the mail looks,
 * which is the whole point of having them.
 */
export default function RulesSettingsScreen() {
  const t = useT()
  const router = useRouter()
  const api = useApi()
  const queryClient = useQueryClient()
  const query = usePriorityRules()
  const { entitlements } = useEntitlements()

  const [editorOpen, setEditorOpen] = useState(false)
  const [kind, setKind] = useState<PriorityRuleKind>('sender_always_important')
  const [value, setValue] = useState('')

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: qk.priorityRules() }),
    [queryClient],
  )

  const create = useMutation({
    mutationFn: () => api.rules.create({ kind, matchValue: value.trim() }),
    onSuccess: async () => {
      track('settings_changed')
      setEditorOpen(false)
      setValue('')
      await refresh()
    },
  })

  const toggle = useMutation({
    mutationFn: (rule: PriorityRule) => api.rules.update(rule.id, { enabled: !rule.enabled }),
    onSuccess: refresh,
  })

  const remove = useMutation({
    mutationFn: (ruleId: string) => api.rules.delete(ruleId),
    onSuccess: refresh,
  })

  const rules = query.data ?? []
  const atLimit = rules.length >= entitlements.limits.priorityRules

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader title={t('priority.title')} subtitle={t('priority.subtitle')} />

      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        {query.isLoading && rules.length === 0 ? (
          <SkeletonCard />
        ) : rules.length === 0 ? (
          <EmptyState
            icon="rule"
            title={t('empty.rules.title')}
            description={t('empty.rules.hint')}
          />
        ) : (
          <Card padded={false} style={{ paddingHorizontal: spacing.md }}>
            {rules.map((rule, index) => (
              <View key={rule.id}>
                {index > 0 ? <Divider /> : null}
                <ListRow
                  title={rule.matchValue}
                  subtitle={t(`priority.rule.kind.${rule.kind}`)}
                  accessory={
                    <Toggle
                      value={rule.enabled}
                      onValueChange={() => toggle.mutate(rule)}
                      accessibilityLabel={t(
                        rule.enabled ? 'priority.rule.enabled' : 'priority.rule.disabled',
                      )}
                      testID={`rule-toggle-${rule.id}`}
                    />
                  }
                  testID={`rule-${rule.id}`}
                />
                <Button
                  label={t('priority.rule.delete')}
                  onPress={() => remove.mutate(rule.id)}
                  variant="ghost"
                  size="sm"
                  loading={remove.isPending}
                  style={{ alignSelf: 'flex-start', marginBottom: spacing.xs }}
                  testID={`rule-delete-${rule.id}`}
                />
              </View>
            ))}
          </Card>
        )}

        <Button
          label={t('priority.rule.add')}
          onPress={() => setEditorOpen(true)}
          variant="tonal"
          fullWidth
          disabled={atLimit}
          testID="rule-add"
        />
        {atLimit ? (
          <Text variant="micro" tone="tertiary">
            {t('priority.rule.limitReached')}
          </Text>
        ) : null}

        <Card
          style={{ gap: spacing.xxs }}
          onPress={() => router.push('/settings/personalization')}
          accessibilityLabel={t('priority.learned.title')}
          testID="rules-learned"
        >
          <Text variant="bodyStrong">{t('priority.learned.title')}</Text>
          <Text variant="secondary" tone="secondary">
            {t('priority.learned.subtitle')}
          </Text>
        </Card>
      </View>

      <Sheet
        visible={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={t('priority.rule.add')}
        closeLabel={t('common.action.close')}
        footer={
          <Button
            label={t('common.action.save')}
            onPress={() => create.mutate()}
            fullWidth
            loading={create.isPending}
            disabled={value.trim().length < 2}
            testID="rule-save"
          />
        }
        testID="rule-sheet"
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {PRIORITY_RULE_KINDS.map((entry) => (
            <FilterChip
              key={entry}
              label={t(`priority.rule.kind.${entry}`)}
              selected={kind === entry}
              onPress={() => setKind(entry)}
              testID={`rule-kind-${entry}`}
            />
          ))}
        </View>

        <Text variant="micro" tone="tertiary">
          {t(`priority.rule.kindHint.${kind}`)}
        </Text>

        <TextField
          label={t(INPUT_KEY[kind].label)}
          value={value}
          onChangeText={setValue}
          placeholder={t(INPUT_KEY[kind].placeholder)}
          autoCapitalize="none"
          autoCorrect={false}
          testID="rule-value"
        />

        {create.isError ? (
          <Text variant="secondary" tone="critical">
            {t(errorMessageKey(create.error))}
          </Text>
        ) : null}
      </Sheet>
    </Screen>
  )
}
