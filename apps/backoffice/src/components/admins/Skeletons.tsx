import { Card, CardSkeleton, StatGrid, StatTileSkeleton } from '@/components/ui'
import { adminMessages } from '@/lib/messages/admins'

/**
 * The loading states, shaped like the pages they precede.
 *
 * A skeleton that does not match its page is a layout shift dressed as
 * progress. These carry the same tile count, the same panel order and the same
 * heading text, so the only thing that changes when the data lands is the
 * numbers.
 */

function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="bo-panel overflow-hidden" aria-hidden="true">
      <div className="border-b border-hairline px-3 py-2">
        <span className="bo-skeleton block h-2.5 w-40" />
      </div>
      <div className="flex flex-col gap-2 p-3">
        {Array.from({ length: rows }, (_, index) => (
          <span
            key={index}
            className="bo-skeleton block h-3"
            style={{ width: `${95 - (index % 4) * 12}%` }}
          />
        ))}
      </div>
    </div>
  )
}

export function AdminListSkeleton() {
  return (
    <>
      <div className="mb-4 flex flex-col gap-2">
        <span className="bo-skeleton block h-5 w-48" aria-hidden="true" />
        <span className="bo-skeleton block h-3 w-96" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-4">
        <StatGrid>
          <StatTileSkeleton />
          <StatTileSkeleton />
          <StatTileSkeleton />
          <StatTileSkeleton />
        </StatGrid>
        <TableSkeleton rows={8} />
        <Card title={adminMessages.invites.section}>
          <CardSkeleton lines={3} />
        </Card>
      </div>
      <span role="status" className="sr-only">
        {adminMessages.list.title}
      </span>
    </>
  )
}

export function AdminDetailSkeleton() {
  return (
    <>
      <div className="mb-4 flex flex-col gap-2">
        <span className="bo-skeleton block h-5 w-64" aria-hidden="true" />
        <span className="bo-skeleton block h-3 w-80" aria-hidden="true" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          <Card title={adminMessages.detail.factsSection}>
            <CardSkeleton lines={8} />
          </Card>
          <Card title={adminMessages.detail.sessionsSection}>
            <CardSkeleton lines={4} />
          </Card>
          <Card title={adminMessages.detail.trailSection}>
            <CardSkeleton lines={5} />
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card title={adminMessages.detail.roleSection}>
            <CardSkeleton lines={3} />
          </Card>
          <Card title={adminMessages.detail.accessSection}>
            <CardSkeleton lines={2} />
          </Card>
          <Card title={adminMessages.detail.permissionsSection}>
            <CardSkeleton lines={6} />
          </Card>
        </div>
      </div>
    </>
  )
}

export function InviteFormSkeleton() {
  return (
    <>
      <div className="mb-4 flex flex-col gap-2">
        <span className="bo-skeleton block h-5 w-52" aria-hidden="true" />
        <span className="bo-skeleton block h-3 w-96" aria-hidden="true" />
      </div>
      <Card title={adminMessages.invite.title}>
        <CardSkeleton lines={6} />
      </Card>
    </>
  )
}

export function RoleMatrixSkeleton() {
  return (
    <>
      <div className="mb-4 flex flex-col gap-2">
        <span className="bo-skeleton block h-5 w-56" aria-hidden="true" />
        <span className="bo-skeleton block h-3 w-96" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-4">
        <StatGrid>
          <StatTileSkeleton />
          <StatTileSkeleton />
          <StatTileSkeleton />
          <StatTileSkeleton />
        </StatGrid>
        <TableSkeleton rows={12} />
      </div>
    </>
  )
}
