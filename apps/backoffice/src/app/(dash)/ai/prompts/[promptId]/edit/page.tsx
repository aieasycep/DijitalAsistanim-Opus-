import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  PROMPTS_PATH,
  PromptForm,
  isUuidParam,
  promptPath,
  versionReference,
} from '@/components/prompts'
import { Card, PageHeader } from '@/components/ui'
import { csrfField, requirePermission } from '@/lib/auth'
import { promptMessages, promptOutcomeMessages } from '@/lib/messages/prompts'
import { loadPromptRecord } from '@/lib/queries/prompts'

export const metadata: Metadata = { title: promptMessages.form.editTitle }
export const dynamic = 'force-dynamic'

/**
 * Edit a draft.
 *
 * ---------------------------------------------------------------------------
 * ONLY A DRAFT, AND THE PAGE REFUSES BEFORE THE FORM IS BUILT
 * ---------------------------------------------------------------------------
 *
 * A version that has served is frozen: the `ai_usage_events` rows attributed to
 * it measured that exact text, and rewriting the body would quietly make every
 * one of those rows describe something that never ran. So a non-draft version
 * renders an explanation and a link back rather than an editor.
 *
 * That refusal is a courtesy, not the control. `updatePromptDraftAction` carries
 * `status = 'draft'` in the `UPDATE`'s own filter, so an activation that landed
 * while this form was open matches no rows and the write reports a conflict
 * instead of succeeding.
 *
 * ---------------------------------------------------------------------------
 * WHO MAY OPEN IT
 * ---------------------------------------------------------------------------
 *
 * `prompt.write`, server-side, on every render.
 */
export default async function EditPromptPage({
  params,
}: {
  params: Promise<{ promptId: string }>
}) {
  const session = await requirePermission('prompt.write')
  const { promptId } = await params

  if (!isUuidParam(promptId)) notFound()

  const record = await loadPromptRecord(promptId)
  if (record === null) notFound()

  const selfHref = promptPath(promptId)
  const reference = versionReference(record.feature, record.version)

  if (record.status !== 'draft') {
    return (
      <>
        <PageHeader
          breadcrumbs={[
            { label: promptMessages.area.breadcrumb, href: '/ai' },
            { label: promptMessages.detail.breadcrumb, href: PROMPTS_PATH },
            { label: reference, href: selfHref },
            { label: promptMessages.form.editTitle },
          ]}
          kicker={record.feature}
          title={promptMessages.form.editTitle}
          description={promptMessages.form.editDescription}
        />
        <Card title={promptOutcomeMessages.locked.title}>
          <p className="max-w-prose text-[13px] text-muted">{promptOutcomeMessages.locked.body}</p>
          <Link
            href={selfHref}
            className="mt-3 inline-flex h-8 items-center rounded-md bg-primary px-4 text-[13px] font-medium text-on-primary hover:bg-primary-pressed"
          >
            {reference}
          </Link>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: promptMessages.area.breadcrumb, href: '/ai' },
          { label: promptMessages.detail.breadcrumb, href: PROMPTS_PATH },
          { label: reference, href: selfHref },
          { label: promptMessages.form.editTitle },
        ]}
        kicker={record.feature}
        title={promptMessages.form.editTitle}
        description={promptMessages.form.editDescription}
      />

      <Card>
        <PromptForm
          mode="edit"
          promptId={record.id}
          csrf={csrfField(session)}
          values={{
            feature: record.feature,
            model: record.model ?? '',
            notes: record.notes ?? '',
            body: record.body,
          }}
          currentVersion={record.version}
          cancelHref={selfHref}
        />
      </Card>
    </>
  )
}
