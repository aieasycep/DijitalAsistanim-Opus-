import { Badge, DataTable, Mono, type Column } from '@/components/ui'
import { healthMessages } from '@/lib/messages/health'

/**
 * Configuration, as presence and nothing else.
 *
 * ---------------------------------------------------------------------------
 * THIS COMPONENT IS NEVER GIVEN A VALUE, SO IT CANNOT LEAK ONE
 * ---------------------------------------------------------------------------
 *
 * The specification is exact: a secret renders "Yapılandırıldı ✅" or
 * "Yapılandırılmadı ❌" and nothing more — no value, no prefix, no length, no
 * fingerprint, no first four characters "just to check it is the right key".
 *
 * The guarantee is not that this component refrains from rendering one. It is
 * that its props are a name, two booleans and an optional sentence written by
 * this codebase; a value never crosses into it, because `loadPlatformSecretState`
 * and `secretInventory` both compare against `undefined` on the server and
 * return a boolean. There is no prop here that could carry a credential even if
 * somebody tried.
 *
 * ---------------------------------------------------------------------------
 * "NOT CONFIGURED" IS NOT AUTOMATICALLY A FAULT
 * ---------------------------------------------------------------------------
 *
 * Several of these are genuinely optional — an unset speech key means the app
 * uses on-device synthesis, which is a working tier and not an outage. So the
 * "Zorunlu" column carries its own weight: only a missing *required* variable
 * is painted as a problem, and the note explains what the platform does without
 * an optional one.
 */

export interface SecretRow {
  /** The environment variable's name. Never its value. */
  readonly variable: string
  readonly configured: boolean
  readonly required: boolean
  /** One line of context, written by this codebase. Never a value. */
  readonly note: string | null
}

export interface SecretTableProps {
  rows: readonly SecretRow[]
  caption: string
  emptyMessage?: string
}

export function SecretTable({ rows, caption, emptyMessage }: SecretTableProps) {
  const columns: Column<SecretRow>[] = [
    {
      key: 'variable',
      header: healthMessages.config.columnVariable,
      hideable: false,
      cell: (row) => <Mono>{row.variable}</Mono>,
    },
    {
      key: 'state',
      header: healthMessages.config.columnState,
      width: 'w-48',
      hideable: false,
      cell: (row) => (
        <Badge tone={row.configured ? 'success' : row.required ? 'critical' : 'neutral'}>
          {row.configured ? healthMessages.config.configured : healthMessages.config.missing}
        </Badge>
      ),
    },
    {
      key: 'required',
      header: healthMessages.config.columnRequired,
      width: 'w-28',
      secondary: true,
      cell: (row) => (
        <span className="text-[12px] text-muted">
          {row.required ? healthMessages.config.required : healthMessages.config.optional}
        </span>
      ),
    },
    {
      key: 'note',
      header: healthMessages.config.columnNote,
      cell: (row) =>
        row.note === null ? null : (
          <span className="block max-w-96 text-[12px] text-muted">{row.note}</span>
        ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.variable}
      caption={caption}
      emptyMessage={emptyMessage ?? healthMessages.config.emptyGroup}
      total={rows.length}
      rowTone={(row) => (row.required && !row.configured ? 'critical' : 'default')}
    />
  )
}
