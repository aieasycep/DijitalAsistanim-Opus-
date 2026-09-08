import { Badge } from '@/components/ui/Badge'
import { flagStateLabels } from '@/lib/messages/flags'
import type { FlagState } from './contract'
import { flagStateTone } from './presentation'

/**
 * The state pill.
 *
 * It carries the state's own name — "Kill switch", "Kısmi", "Kapalı", "Açık" —
 * and never a colour on its own. `bo_feature_flags.effective_state` computes
 * the value in SQL with the same expression `feature_flag_is_enabled()` uses,
 * so a pill that says "Açık" is saying what the evaluator would say, not what
 * a column happens to hold.
 *
 * It is deliberately never rendered alone: every caller puts the audience
 * sentence beside it, because "Açık" for iOS Pro users on 2.1.0 and above is
 * not the same claim as "Açık", and a pill cannot tell them apart.
 */
export function StateBadge({ state, title }: { state: FlagState; title?: string }) {
  return (
    <Badge tone={flagStateTone[state]} dot title={title}>
      {flagStateLabels[state]}
    </Badge>
  )
}
