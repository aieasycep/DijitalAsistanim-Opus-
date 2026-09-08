import { Badge } from '@/components/ui'
import { promptStatusHints, promptStatusLabels } from '@/lib/messages/prompts'
import type { PromptStatusValue } from './contract'
import { promptStatusTone } from './presentation'

/**
 * A version's place in the lifecycle, with the sentence that explains it on
 * hover.
 *
 * The tooltip text is the same string the record page prints in full, so the
 * pill in a dense table and the paragraph on the detail screen cannot come to
 * mean different things.
 */
export function StatusBadge({ status }: { status: PromptStatusValue }) {
  return (
    <Badge tone={promptStatusTone[status]} title={promptStatusHints[status]}>
      {promptStatusLabels[status]}
    </Badge>
  )
}
