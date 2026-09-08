import type { Clock } from '@da/domain'
import type { ReactNode } from 'react'
import { formatDateTime, formatRelative } from '@/lib/format'
import { promptMessages, promptStatusHints } from '@/lib/messages/prompts'
import type { PromptRecord } from '@/lib/queries/prompts'
import { versionLabel } from './contract'
import { adminLabel, type NamedAdmin } from './presentation'
import { StatusBadge } from './StatusBadge'

/**
 * The version's identity: what it is, who wrote it, who put it in front of
 * users and when.
 *
 * `body_length` and `body_fingerprint` are printed in full here rather than
 * abbreviated, because this is the one screen where somebody is checking that
 * the version in the incident report and the version on the page are the same
 * one.
 *
 * A missing value renders an em dash and, where the absence means something —
 * "no model recorded", "never activated" — a sentence saying what it means. A
 * blank cell reads as "no idea" to everybody who did not write the record.
 */
export function PromptFacts({
  record,
  createdBy,
  activatedBy,
  clock,
}: {
  record: PromptRecord
  createdBy: NamedAdmin | undefined
  activatedBy: NamedAdmin | undefined
  clock: Clock
}) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      <Fact label={promptMessages.detail.factFeature}>
        <span className="font-mono text-[13px] text-ink">{record.feature}</span>
      </Fact>

      <Fact label={promptMessages.detail.factVersion}>
        <span className="font-mono text-[13px] text-ink">{versionLabel(record.version)}</span>
      </Fact>

      <Fact label={promptMessages.detail.factStatus} note={promptStatusHints[record.status]}>
        <StatusBadge status={record.status} />
      </Fact>

      <Fact label={promptMessages.detail.factModel} note={promptMessages.detail.factModelHint}>
        {record.model === null ? (
          <span className="text-[13px] text-faint">{promptMessages.detail.factModelEmpty}</span>
        ) : (
          <span className="font-mono text-[13px] text-ink">{record.model}</span>
        )}
      </Fact>

      <Fact label={promptMessages.detail.factLength}>
        <span className="text-[13px] text-ink tabular-nums">
          {promptMessages.table.characters(record.body_length)}
        </span>
      </Fact>

      <Fact
        label={promptMessages.detail.factFingerprint}
        note={promptMessages.table.fingerprintTitle}
      >
        <span className="font-mono text-[12px] break-all text-ink">{record.body_fingerprint}</span>
      </Fact>

      <Fact label={promptMessages.detail.factCreated}>
        <span className="text-[13px] text-ink">{adminLabel(createdBy)}</span>
        <span className="mt-0.5 block text-[11px] text-faint">
          {formatDateTime(record.created_at)} · {formatRelative(record.created_at, clock)}
        </span>
      </Fact>

      <Fact label={promptMessages.detail.factActivated}>
        {record.activated_at === null ? (
          <span className="text-[13px] text-faint">{promptMessages.table.notActivated}</span>
        ) : (
          <>
            <span className="text-[13px] text-ink">{adminLabel(activatedBy)}</span>
            <span className="mt-0.5 block text-[11px] text-faint">
              {formatDateTime(record.activated_at)} · {formatRelative(record.activated_at, clock)}
            </span>
          </>
        )}
      </Fact>

      {record.archived_at === null ? null : (
        <Fact label={promptMessages.detail.factArchived}>
          <span className="text-[13px] text-ink">{formatDateTime(record.archived_at)}</span>
          <span className="mt-0.5 block text-[11px] text-faint">
            {formatRelative(record.archived_at, clock)}
          </span>
        </Fact>
      )}

      <Fact label={promptMessages.detail.factUpdated}>
        <span className="text-[13px] text-ink">{formatDateTime(record.updated_at)}</span>
        <span className="mt-0.5 block text-[11px] text-faint">
          {formatRelative(record.updated_at, clock)}
        </span>
      </Fact>
    </dl>
  )
}

function Fact({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="bo-kicker">{label}</dt>
      <dd className="mt-0.5 min-w-0">
        {children}
        {note === undefined ? null : (
          <p className="mt-1 max-w-prose text-[11px] text-faint">{note}</p>
        )}
      </dd>
    </div>
  )
}
