import type { ReactNode } from 'react'
import { Badge } from '@/components/ui'
import { formatDateTime } from '@/lib/format'
import {
  AUDIENCE_LABELS_TR,
  PLATFORM_LABELS_TR,
  announcementMessages,
  localeLabel,
} from '@/lib/messages/announcements'
import type { AnnouncementAudienceValue, AnnouncementPlatformValue } from './contract'

/**
 * Who this announcement is aimed at, spelled out.
 *
 * Every value here is a column of the row rather than a derivation, so what the
 * panel says is what the app will apply. The two that are easy to misread get a
 * word rather than a symbol: an empty `platforms` array is "Tümü" and not a
 * blank cell, and a null `min_app_version` is "Sürüm sınırı yok" and not a
 * dash — a dash beside a version field reads as "unknown", which is a very
 * different claim.
 */

export interface TargetingSummaryProps {
  audience: AnnouncementAudienceValue
  platforms: readonly AnnouncementPlatformValue[]
  locale: string
  minAppVersion: string | null
  startsAt: string
  endsAt: string | null
  dismissible: boolean
}

export function TargetingSummary({
  audience,
  platforms,
  locale,
  minAppVersion,
  startsAt,
  endsAt,
  dismissible,
}: TargetingSummaryProps) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      <Row label={announcementMessages.columns.audience}>
        <Badge tone="primary">{AUDIENCE_LABELS_TR[audience]}</Badge>
      </Row>

      <Row label={announcementMessages.columns.platforms}>
        {platforms.length === 0 ? (
          <span className="text-[13px] text-muted">{announcementMessages.values.allPlatforms}</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {platforms.map((platform) => (
              <Badge key={platform}>{PLATFORM_LABELS_TR[platform]}</Badge>
            ))}
          </span>
        )}
      </Row>

      <Row label={announcementMessages.columns.locale}>
        <span className="text-[13px] text-ink">{localeLabel(locale)}</span>
      </Row>

      <Row label={announcementMessages.columns.minVersion}>
        {minAppVersion === null ? (
          <span className="text-[13px] text-muted">{announcementMessages.values.noMinVersion}</span>
        ) : (
          <span className="font-mono text-[13px] text-ink">{minAppVersion}</span>
        )}
      </Row>

      <Row label={announcementMessages.columns.starts}>
        <span className="tabular-nums text-[13px] text-ink">{formatDateTime(startsAt)}</span>
      </Row>

      <Row label={announcementMessages.columns.ends}>
        {endsAt === null ? (
          <span className="text-[13px] text-warning-text">{announcementMessages.values.noEnd}</span>
        ) : (
          <span className="tabular-nums text-[13px] text-ink">{formatDateTime(endsAt)}</span>
        )}
      </Row>

      <Row label={announcementMessages.columns.dismissible}>
        {dismissible ? (
          <Badge tone="neutral">{announcementMessages.values.dismissibleYes}</Badge>
        ) : (
          <Badge tone="warning">{announcementMessages.values.dismissibleNo}</Badge>
        )}
      </Row>
    </dl>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="bo-kicker">{label}</dt>
      <dd className="m-0 min-w-0">{children}</dd>
    </div>
  )
}
