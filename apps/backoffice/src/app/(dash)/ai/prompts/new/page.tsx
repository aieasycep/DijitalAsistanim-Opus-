import type { Metadata } from 'next'
import {
  NEW_PARAMS,
  PROMPTS_PATH,
  PromptForm,
  firstParam,
  isFeatureName,
  isUuidParam,
  promptPath,
} from '@/components/prompts'
import { Card, PageHeader } from '@/components/ui'
import { csrfField, requirePermission } from '@/lib/auth'
import { promptMessages } from '@/lib/messages/prompts'
import { loadPromptRecord, nextVersionFor } from '@/lib/queries/prompts'

export const metadata: Metadata = { title: promptMessages.form.newTitle }
export const dynamic = 'force-dynamic'

/**
 * Write a new version of a feature's prompt.
 *
 * ---------------------------------------------------------------------------
 * IT CAN ONLY PRODUCE A DRAFT
 * ---------------------------------------------------------------------------
 *
 * There is no activate control here and no "kaydet ve yayına al" checkbox. The
 * Server Action writes `status: 'draft'` whatever the form says, so what leaves
 * this page reaches no model call until somebody makes that decision separately,
 * against a diff, and writes a reason for it.
 *
 * ---------------------------------------------------------------------------
 * WHY IT COPIES
 * ---------------------------------------------------------------------------
 *
 * A prompt is revised, not rewritten: `?from=<id>` loads an existing version's
 * body into the form so the next version starts as the current one and the diff
 * afterwards shows the actual edit rather than 300 lines of "changed
 * everything". The copy is a read — nothing is written until the form is
 * submitted — and a `from` that resolves to nothing produces an empty form and
 * says so, instead of silently starting from scratch.
 *
 * ---------------------------------------------------------------------------
 * WHO MAY OPEN IT
 * ---------------------------------------------------------------------------
 *
 * `prompt.write`, server-side, on every render — not `prompt.read`. An
 * `analyst` or `readonly` operator who types this URL is redirected by
 * `requirePermission` before the form is built, and the Server Action re-asks
 * the database at the moment of writing anyway.
 */
export default async function NewPromptPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePermission('prompt.write')
  const raw = await searchParams

  const requestedFeature = firstParam(raw, NEW_PARAMS.feature).toLowerCase()
  const fromId = firstParam(raw, NEW_PARAMS.from)

  // A `from` that is not a uuid is a broken link rather than a missing record,
  // and both land the operator on an empty form — the difference is only whether
  // the page apologises for it.
  const source =
    isUuidParam(fromId) === true ? await loadPromptRecord(fromId).catch(() => null) : null
  const copyMissing = fromId !== '' && source === null

  const feature = source?.feature ?? (isFeatureName(requestedFeature) ? requestedFeature : '')

  // Advisory only: `prompt_versions_unique_version` decides, and the field's own
  // label says the number is settled at save time. A failed read here must not
  // stop somebody writing a prompt.
  const nextVersion = feature === '' ? null : await nextVersionFor(feature).catch(() => null)

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: promptMessages.area.breadcrumb, href: '/ai' },
          { label: promptMessages.detail.breadcrumb, href: PROMPTS_PATH },
          { label: promptMessages.form.newTitle },
        ]}
        title={promptMessages.form.newTitle}
        description={promptMessages.form.newDescription}
      />

      <Card>
        <PromptForm
          mode="create"
          csrf={csrfField(session)}
          values={{
            feature,
            model: source?.model ?? '',
            notes: '',
            body: source?.body ?? '',
          }}
          nextVersion={nextVersion}
          cancelHref={source === null ? PROMPTS_PATH : promptPath(source.id)}
          copiedFrom={
            source === null ? null : promptMessages.form.copiedFrom(source.feature, source.version)
          }
          copyMissing={copyMissing}
        />
      </Card>
    </>
  )
}
