import { systemClock } from '@da/domain'
import type { Metadata } from 'next'
import {
  ANNOUNCEMENTS_PATH,
  AnnouncementForm,
  nextRoundFiveMinutes,
  toLocalInput,
  type AnnouncementDraft,
} from '@/components/announcements'
import { Card, PageHeader } from '@/components/ui'
import { csrfField, requirePermission } from '@/lib/auth'
import { announcementMessages } from '@/lib/messages/announcements'

/**
 * Compose a new announcement.
 *
 * ---------------------------------------------------------------------------
 * IT CAN ONLY PRODUCE A DRAFT
 * ---------------------------------------------------------------------------
 *
 * There is no publish control here and no "save and publish" checkbox. The
 * Server Action writes `published_at: null` whatever the form says, so what
 * leaves this page reaches nobody. Publishing is a separate decision, made on
 * the record's own page against the reach the targeting resolves to, and it
 * demands a written reason.
 *
 * ---------------------------------------------------------------------------
 * WHO MAY OPEN IT
 * ---------------------------------------------------------------------------
 *
 * `announcement.write`, server-side, on every render — not `announcement.read`.
 * A `readonly` or `support` operator who types this URL is redirected by
 * `requirePermission` before the form is built, and the Server Action re-asks
 * the database at the moment of writing anyway.
 */

export const metadata: Metadata = { title: announcementMessages.form.newTitle }
export const dynamic = 'force-dynamic'

export default async function NewAnnouncementPage() {
  const session = await requirePermission('announcement.write')
  const now = systemClock.now()

  /**
   * The defaults, and each one is a decision.
   *
   * The audience is everyone and the locale is Turkish because that is the
   * product's own default; the start is the next five-minute mark rather than
   * `now` so the field does not go stale while the operator writes; there is no
   * end date because most notices genuinely have none and inventing one would be
   * a date nobody chose; and `dismissible` is on, because a notice a person
   * cannot close is reserved for outages and forced upgrades.
   */
  const initial: AnnouncementDraft = {
    title: '',
    body: '',
    audience: 'all',
    platforms: [],
    locale: 'tr',
    minAppVersion: '',
    startsAtLocal: toLocalInput(nextRoundFiveMinutes(now).toISOString()),
    endsAtLocal: '',
    dismissible: true,
  }

  return (
    <>
      <PageHeader
        title={announcementMessages.form.newTitle}
        description={announcementMessages.form.newDescription}
        kicker={announcementMessages.detail.kicker}
        breadcrumbs={[
          { label: announcementMessages.list.title, href: ANNOUNCEMENTS_PATH },
          { label: announcementMessages.form.newTitle },
        ]}
      />

      <Card>
        <AnnouncementForm
          csrf={csrfField(session)}
          mode="create"
          initial={initial}
          cancelHref={ANNOUNCEMENTS_PATH}
        />
      </Card>
    </>
  )
}
