import { systemClock } from '@da/domain'
import { uuidSchema } from '@da/validation'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  ANNOUNCEMENTS_PATH,
  ANNOUNCEMENT_RESULT_PARAMS,
  AnnouncementForm,
  AnnouncementPreview,
  PublishPanel,
  ReachPanel,
  ResultBanner,
  StateBadge,
  TargetingSummary,
  TrailTable,
  announcementPath,
  announcementState,
  isAnnouncementLocale,
  panelError,
  toLocalInput,
  type AnnouncementDraft,
} from '@/components/announcements'
import { Card, PageHeader } from '@/components/ui'
import { csrfField, requirePermission, sessionCan } from '@/lib/auth'
import { formatDateTime } from '@/lib/format'
import {
  announcementMessages,
  isAnnouncementOutcome,
  type AnnouncementOutcome,
} from '@/lib/messages/announcements'
import {
  estimateReach,
  loadAnnouncement,
  loadAnnouncementAdmins,
  loadAnnouncementTrail,
  type AnnouncementAdmin,
} from '@/lib/queries/announcements'
import { attempt, type RawSearchParams } from '@/lib/queries/shared'

/**
 * One announcement: what it says, who it reaches, and who decided that.
 *
 * ---------------------------------------------------------------------------
 * THE ORDER OF THIS PAGE IS THE ARGUMENT
 * ---------------------------------------------------------------------------
 *
 *   1. The state, in a sentence, and the one control that changes it. A draft
 *      says so before anything else on the screen.
 *   2. What the notice will actually look like, drawn from the app's own design
 *      tokens rather than the console's.
 *   3. Who it is aimed at, and how many accounts that resolves to.
 *   4. The editor — only for a draft, because the text users are reading must be
 *      the text somebody wrote a reason for.
 *   5. Everything ever done to it, with the written reason for each.
 *
 * ---------------------------------------------------------------------------
 * PERMISSIONS
 * ---------------------------------------------------------------------------
 *
 * `announcement.read` opens the page. `announcement.write` decides whether the
 * editor and the publish control render — and that is a rendering decision, not
 * the boundary: both Server Actions re-ask `admin_role_permissions` at the
 * moment of writing, and `runAdminAction` audits a refusal against this
 * announcement.
 *
 * Every panel is settled on its own, so a reach estimate that could not be taken
 * costs its own card and the operator can still read the notice, its trail and
 * its state.
 */

export const metadata: Metadata = { title: announcementMessages.detail.kicker }
export const dynamic = 'force-dynamic'

export default async function AnnouncementDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ announcementId: string }>
  searchParams: Promise<RawSearchParams>
}) {
  const session = await requirePermission('announcement.read')
  const { announcementId } = await params
  const search = await searchParams
  const clock = systemClock
  const now = clock.now()

  // A malformed id is a 404 rather than a database error: nothing reaches
  // PostgREST that is not a uuid.
  if (!uuidSchema.safeParse(announcementId).success) notFound()

  const row = await loadAnnouncement(announcementId)
  if (row === null) notFound()

  const state = announcementState(row, now)
  const canWrite = sessionCan(session, 'announcement.write')
  const isDraft = state === 'draft'

  const [reach, trail] = await Promise.all([
    attempt(() =>
      estimateReach(
        {
          audience: row.audience,
          platforms: row.platforms,
          locale: row.locale,
          minAppVersion: row.min_app_version,
        },
        clock,
      ),
    ),
    attempt(() => loadAnnouncementTrail(announcementId)),
  ])

  // One lookup for every admin named on this page — the two the row names and
  // every actor in the trail — rather than one per row.
  const admins = await attempt(() =>
    loadAnnouncementAdmins([
      row.created_by,
      row.published_by,
      ...(trail.ok ? trail.data.map((entry) => entry.actor_admin_user_id) : []),
    ]),
  )
  const adminMap: ReadonlyMap<string, AnnouncementAdmin> = admins.ok ? admins.data : new Map()

  const outcome = readOutcome(search)

  const draft: AnnouncementDraft = {
    title: row.title,
    body: row.body,
    audience: row.audience,
    platforms: row.platforms,
    // A locale the database allows but `app_locale` has since outgrown would
    // otherwise silently become an invalid `<select>` value; the guard makes the
    // form show the product default rather than an empty control.
    locale: isAnnouncementLocale(row.locale) ? row.locale : 'tr',
    minAppVersion: row.min_app_version ?? '',
    startsAtLocal: toLocalInput(row.starts_at),
    endsAtLocal: toLocalInput(row.ends_at),
    dismissible: row.dismissible,
  }

  return (
    <>
      <PageHeader
        title={row.title}
        kicker={announcementMessages.detail.kicker}
        breadcrumbs={[
          { label: announcementMessages.list.title, href: ANNOUNCEMENTS_PATH },
          { label: row.title },
        ]}
        action={<StateBadge state={state} />}
      />

      {outcome === null ? null : (
        <ResultBanner outcome={outcome} dismissHref={announcementPath(announcementId)} />
      )}

      <div className="flex flex-col gap-4">
        <Card
          title={announcementMessages.publish.sectionTitle}
          description={announcementMessages.publish.sectionDescription}
        >
          <PublishPanel
            announcementId={announcementId}
            state={state}
            csrf={csrfField(session)}
            canWrite={canWrite}
            reach={reach.ok ? reach.data : null}
            reachError={panelError(reach)}
          />
        </Card>

        <Card
          title={announcementMessages.preview.title}
          description={announcementMessages.preview.description}
        >
          <div className="flex flex-col gap-3">
            <AnnouncementPreview
              title={row.title}
              body={row.body}
              dismissible={row.dismissible}
              published={row.published_at !== null}
            />
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card
            title={announcementMessages.targeting.title}
            description={announcementMessages.targeting.description}
          >
            <TargetingSummary
              audience={row.audience}
              platforms={row.platforms}
              locale={row.locale}
              minAppVersion={row.min_app_version}
              startsAt={row.starts_at}
              endsAt={row.ends_at}
              dismissible={row.dismissible}
            />
          </Card>

          <Card
            title={announcementMessages.reach.title}
            description={announcementMessages.reach.description}
          >
            <ReachPanel reach={reach.ok ? reach.data : null} error={panelError(reach)} />
          </Card>
        </div>

        <Card
          title={announcementMessages.detail.factsTitle}
          description={announcementMessages.detail.factsDescription}
        >
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
            <Fact label={announcementMessages.detail.createdBy}>
              {adminName(row.created_by, adminMap)}
            </Fact>
            <Fact label={announcementMessages.detail.createdAt}>
              {formatDateTime(row.created_at)}
            </Fact>
            <Fact label={announcementMessages.detail.updatedAt}>
              {formatDateTime(row.updated_at)}
            </Fact>
            <Fact label={announcementMessages.detail.publishedBy}>
              {row.published_by === null
                ? announcementMessages.values.neverPublished
                : adminName(row.published_by, adminMap)}
            </Fact>
            <Fact label={announcementMessages.detail.publishedAt}>
              {row.published_at === null
                ? announcementMessages.values.neverPublished
                : formatDateTime(row.published_at)}
            </Fact>
            <Fact label={announcementMessages.detail.identifier} mono>
              {row.id}
            </Fact>
          </dl>
        </Card>

        {canWrite ? (
          isDraft ? (
            <Card
              title={announcementMessages.form.editTitle}
              description={announcementMessages.form.editDescription}
            >
              <AnnouncementForm
                csrf={csrfField(session)}
                mode="edit"
                announcementId={announcementId}
                initial={draft}
                cancelHref={announcementPath(announcementId)}
              />
            </Card>
          ) : (
            <Card title={announcementMessages.form.lockedTitle}>
              <p className="max-w-prose text-[13px] text-muted">
                {announcementMessages.form.lockedBody}
              </p>
            </Card>
          )
        ) : null}

        <Card
          title={announcementMessages.detail.trailTitle}
          description={announcementMessages.detail.trailDescription}
          flush
        >
          <TrailTable
            rows={trail.ok ? trail.data : []}
            admins={adminMap}
            error={panelError(trail)}
          />
        </Card>
      </div>
    </>
  )
}

function Fact({
  label,
  mono = false,
  children,
}: {
  label: string
  mono?: boolean
  children: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="bo-kicker">{label}</dt>
      <dd
        className={`m-0 min-w-0 truncate text-[13px] text-ink ${mono ? 'font-mono text-[12px]' : ''}`}
        title={children}
      >
        {children}
      </dd>
    </div>
  )
}

/** A named admin, a redacted address, or the short id — never a raw address. */
function adminName(
  adminUserId: string | null,
  admins: ReadonlyMap<string, AnnouncementAdmin>,
): string {
  if (adminUserId === null) return announcementMessages.values.unknownAdmin
  const admin = admins.get(adminUserId)
  if (admin === undefined) return adminUserId.slice(0, 8)
  return admin.name ?? admin.emailRedacted ?? adminUserId.slice(0, 8)
}

function readOutcome(params: RawSearchParams): AnnouncementOutcome | null {
  const raw = params[ANNOUNCEMENT_RESULT_PARAMS.outcome]
  const value = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : undefined
  if (value === undefined || !isAnnouncementOutcome(value)) return null
  return value
}
