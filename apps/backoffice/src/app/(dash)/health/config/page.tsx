import type { Metadata } from 'next'
import { HEALTH_PATH, SECRET_GROUPS, SecretTable, type SecretRow } from '@/components/health'
import { Badge, Card, PageHeader, StatGrid, StatTile } from '@/components/ui'
import { requirePermission } from '@/lib/auth'
import { describeEnvironment, secretInventory } from '@/lib/env'
import { formatNumber } from '@/lib/format'
import { healthMessages } from '@/lib/messages/health'
import { countMissingRequired, loadPlatformSecretState } from '@/lib/queries/health'

/**
 * Which secrets are configured. Nothing else.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS PAGE IS NOT ALLOWED TO DO
 * ---------------------------------------------------------------------------
 *
 * Section 8 of the specification is one sentence long and this page is the
 * whole of it: a secret renders "Yapılandırıldı ✅" or "Yapılandırılmadı ❌",
 * and never a value, a prefix, a length, a fingerprint or the first four
 * characters "to check it is the right key".
 *
 * The guarantee is structural rather than editorial. `loadPlatformSecretState`
 * and `secretInventory` both read `process.env`, compare against `undefined`
 * and return a boolean; the value is never bound to a name that leaves those
 * functions. So there is nothing on this page that *could* render a credential
 * — not a prop, not a variable, not an object in a server payload — and a
 * future edit that tried would have to go and fetch one first.
 *
 * ---------------------------------------------------------------------------
 * AND WHAT "NOT CONFIGURED" ACTUALLY MEANS HERE
 * ---------------------------------------------------------------------------
 *
 * Only what this console's own process can see. The edge functions hold their
 * secrets on the Supabase side (`supabase secrets set`), and a value set there
 * is invisible from here — so a red cross on this page means "this deployment's
 * console does not have it", which is a different claim from "the platform does
 * not have it". The page says so above the tables rather than leaving an
 * operator to infer it and file a bug against a working integration.
 *
 * ---------------------------------------------------------------------------
 * WHO MAY OPEN IT
 * ---------------------------------------------------------------------------
 *
 * `system.config.read`, which only `super_admin` and `operations` hold — a
 * narrower gate than the health page beside it, because the shape of a
 * deployment's configuration is itself operational intelligence. Checked
 * server-side; the URL typed in directly gets the same refusal.
 */

export const metadata: Metadata = { title: healthMessages.config.title }
export const dynamic = 'force-dynamic'

export default async function HealthConfigPage() {
  await requirePermission('system.config.read')

  const environment = describeEnvironment()

  // Two presence lists, neither of which has ever held a value. `secretInventory`
  // owns the console's own six variables — including the fallback notes only
  // that module knows about — and this module owns the platform's integrations.
  const consoleRows: readonly SecretRow[] = secretInventory().map((entry) => ({
    variable: entry.variable,
    configured: entry.configured,
    required: entry.required,
    note:
      entry.fallbackNote === null
        ? entry.description
        : `${entry.description} ${entry.fallbackNote}`,
  }))

  const platformStates = loadPlatformSecretState()
  const missingRequired =
    countMissingRequired(platformStates) +
    consoleRows.filter((row) => row.required && !row.configured).length

  return (
    <>
      <PageHeader
        title={healthMessages.config.title}
        description={healthMessages.config.description}
        kicker={healthMessages.config.kicker}
        breadcrumbs={[
          { label: healthMessages.dashboard.title, href: HEALTH_PATH },
          { label: healthMessages.config.title },
        ]}
        meta={healthMessages.config.neverShown}
      />

      <div className="flex flex-col gap-4">
        <h2 className="bo-kicker">{healthMessages.config.environmentSection}</h2>
        <StatGrid>
          <StatTile
            label={healthMessages.config.environmentLabel}
            value={environment.code}
            hint={environment.label}
            tone={environment.isProduction ? 'critical' : 'info'}
          />
          <StatTile
            label={healthMessages.config.projectRef}
            value={environment.projectRef ?? '—'}
            hint={healthMessages.config.environmentDescription}
          />
          <StatTile
            label={healthMessages.config.release}
            value={environment.release ?? healthMessages.config.releaseUnknown}
          />
          <StatTile
            label={healthMessages.config.missingTile}
            value={formatNumber(missingRequired)}
            hint={
              missingRequired === 0
                ? healthMessages.config.allRequiredPresent
                : healthMessages.config.missingRequired(missingRequired)
            }
            tone={missingRequired === 0 ? 'success' : 'critical'}
          />
        </StatGrid>

        <p className="text-[12px] text-muted">{healthMessages.config.scopeNote}</p>

        <Card
          title={healthMessages.config.consoleSection}
          description={healthMessages.config.consoleDescription}
          flush
        >
          <SecretTable rows={consoleRows} caption={healthMessages.config.consoleSection} />
        </Card>

        <h2 className="bo-kicker mt-2">{healthMessages.config.platformSection}</h2>
        <p className="-mt-2 text-[12px] text-muted">{healthMessages.config.platformDescription}</p>

        {SECRET_GROUPS.filter((group) => group !== 'console').map((group) => {
          const rows: readonly SecretRow[] = platformStates
            .filter((state) => state.group === group)
            .map((state) => ({
              variable: state.variable,
              configured: state.configured,
              required: state.required,
              // The only note this page can honestly add: which accepted name
              // the value was found under. Still a name, never a value.
              note: state.resolvedAlias,
            }))

          return (
            <Card
              key={group}
              title={healthMessages.groups[group]}
              action={
                <Badge tone={rows.every((row) => row.configured) ? 'success' : 'neutral'}>
                  {rows.filter((row) => row.configured).length}/{rows.length}
                </Badge>
              }
              flush
            >
              <SecretTable rows={rows} caption={healthMessages.groups[group]} />
            </Card>
          )
        })}
      </div>
    </>
  )
}
