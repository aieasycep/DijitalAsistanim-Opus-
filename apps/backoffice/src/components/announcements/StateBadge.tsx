import { Badge } from '@/components/ui'
import { STATE_HINTS_TR, type AnnouncementState } from '@/lib/messages/announcements'
import { STATE_TONES, stateLabel } from './presentation'

/**
 * The one place an announcement's state is rendered.
 *
 * A draft and a live notice differ by a single nullable column, and everywhere
 * that difference matters it is shown as this badge — carrying the sentence
 * that explains what the state means for the people using the app, because
 * "Taslak" alone is a word an operator can read as "saved" rather than as
 * "nobody has seen this".
 */
export function StateBadge({ state, dot = true }: { state: AnnouncementState; dot?: boolean }) {
  return (
    <Badge tone={STATE_TONES[state]} dot={dot} title={STATE_HINTS_TR[state]}>
      {stateLabel(state)}
    </Badge>
  )
}
