import { Card, CardSkeleton, PageHeader, StatGrid, StatTileSkeleton } from '@/components/ui'
import { healthMessages } from '@/lib/messages/health'

/**
 * The loading states, shaped like the pages they precede.
 *
 * A skeleton exists to stop the layout jumping when the answer lands, so these
 * mirror the real pages panel for panel rather than being a generic spinner.
 * Neither of them shows a status, a count or a tick: a placeholder that looks
 * like a green dot is the same lie as a real one, briefly.
 */

export function HealthDashboardSkeleton() {
  return (
    <>
      <PageHeader
        title={healthMessages.dashboard.title}
        description={healthMessages.dashboard.description}
        kicker={healthMessages.dashboard.kicker}
      />
      <div className="flex flex-col gap-4">
        <StatGrid>
          <StatTileSkeleton />
          <StatTileSkeleton />
          <StatTileSkeleton />
          <StatTileSkeleton />
        </StatGrid>
        <Card title={healthMessages.table.section} description={healthMessages.table.description}>
          <CardSkeleton lines={7} />
        </Card>
        <Card title={healthMessages.jobs.section} description={healthMessages.jobs.description}>
          <CardSkeleton lines={6} />
        </Card>
      </div>
    </>
  )
}

export function HealthConfigSkeleton() {
  return (
    <>
      <PageHeader
        title={healthMessages.config.title}
        description={healthMessages.config.description}
        kicker={healthMessages.config.kicker}
      />
      <div className="flex flex-col gap-4">
        <Card
          title={healthMessages.config.consoleSection}
          description={healthMessages.config.consoleDescription}
        >
          <CardSkeleton lines={6} />
        </Card>
        <Card
          title={healthMessages.config.platformSection}
          description={healthMessages.config.platformDescription}
        >
          <CardSkeleton lines={8} />
        </Card>
      </div>
    </>
  )
}
