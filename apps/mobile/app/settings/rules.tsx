import { qk } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import {
  EMAIL_CATEGORIES,
  PRIORITY_RULE_KINDS,
  type EmailCategory,
  type PriorityRule,
  type PriorityRuleKind,
} from '@da/domain'
import { CATEGORY_RULE_KIND } from '@da/validation'
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
import { EmptyState, ErrorState, SkeletonCard } from '../../src/components/ui/States'
import { Text } from '../../src/components/ui/Text'
import { TextField } from '../../src/components/ui/TextField'
import { usePriorityRules } from '../../src/hooks/queries'
import { useEntitlements } from '../../src/hooks/useEntitlements'
import { useT } from '../../src/i18n/I18nProvider'
import { track } from '../../src/lib/analytics'
import { errorMessageKey, isRetryable } from '../../src/lib/query-client'
import { useApi } from '../../src/providers/AppProviders'

/**
 * Which placeholder a rule kind expects — a sender, a domain or a keyword.
 *
 * `category_low_priority` is absent on purpose: its target is one of the
 * `EmailCategory` values, not something the user types, so it is picked from a
 * list instead of written into a field.
 */
const INPUT_KEY: Record<
  Exclude<PriorityRuleKind, typeof CATEGORY_RULE_KIND>,
  { label: string; placeholder: string }
> = {
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
}

/** The shortest match value worth sending — one character matches everything. */
const MIN_MATCH_LENGTH = 2

/**
 * Priority rules.
 *
 * These are the user's explicit overrides, and they outrank anything the model
 * decided: a muted sender stays muted no matter how urgent the mail looks,
 * which is the whole point of having them.
 *
 * A category rule is demoted by `matchCategory` and never by `matchValue`
 * (`evaluatePriority`'s demotion tier), so this screen asks for the category
 * itself. It also sends that category as the match value, because the row must
 * name its target — `priority_rules_has_a_target` — and a `PriorityRule` has no
 * empty match value in the domain.
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
  const [category, setCategory] = useState<EmailCategory>('promotion')

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: qk.priorityRules() }),
    [queryClient],
  )

  const isCategoryRule = kind === CATEGORY_RULE_KIND

  const create = useMutation({
    mutationFn: () =>
      api.rules.create(
        isCategoryRule
          ? { kind, matchValue: category, matchCategory: category }
          : { kind, matchValue: value.trim() },
      ),
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
  const ruleLimit = entitlements.limits.priorityRules
  const atLimit = rules.length >= ruleLimit
  const listError = toggle.error ?? remove.error

  return (
    <Screen scroll bottomInset={spacing.xxl}>
      <ScreenHeader title={t('priority.title')} subtitle={t('priority.subtitle')} />

      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        {query.isLoading && rules.length === 0 ? (
          <SkeletonCard />
        ) : query.isError && rules.length === 0 ? (
          // A failed read must not read as "you have no rules": the user would
          // add one they already have, against a limit they cannot see.
          <ErrorState
            message={t(errorMessageKey(query.error))}
            {...(isRetryable(query.error)
              ? { retryLabel: t('common.action.retry'), onRetry: () => void query.refetch() }
              : {})}
            testID="rules-error"
          />
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
                  title={
                    rule.matchCategory ? t(`mail.category.${rule.matchCategory}`) : rule.matchValue
                  }
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

        {/* A toggle or a delete that failed left the row exactly as it was, so
            the screen has to say so rather than look like it worked. */}
        {listError ? (
          <Text variant="secondary" tone="critical" testID="rules-mutation-error">
            {t(errorMessageKey(listError))}
          </Text>
        ) : null}

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
            {t('priority.rule.limitReached', { limit: ruleLimit })}
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
            disabled={!isCategoryRule && value.trim().length < MIN_MATCH_LENGTH}
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

        {kind === CATEGORY_RULE_KIND ? (
          <View style={{ gap: spacing.xs }}>
            <Text variant="secondary" tone="secondary">
              {t('priority.rule.categoryLabel')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {EMAIL_CATEGORIES.map((entry) => (
                <FilterChip
                  key={entry}
                  label={t(`mail.category.${entry}`)}
                  selected={category === entry}
                  onPress={() => setCategory(entry)}
                  testID={`rule-category-${entry}`}
                />
              ))}
            </View>
          </View>
        ) : (
          <TextField
            label={t(INPUT_KEY[kind].label)}
            value={value}
            onChangeText={setValue}
            placeholder={t(INPUT_KEY[kind].placeholder)}
            autoCapitalize="none"
            autoCorrect={false}
            testID="rule-value"
          />
        )}

        {create.isError ? (
          <Text variant="secondary" tone="critical">
            {t(errorMessageKey(create.error))}
          </Text>
        ) : null}
      </Sheet>
    </Screen>
  )
}
