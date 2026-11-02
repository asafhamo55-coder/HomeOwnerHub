import { Alert } from '@homeowner-portal/ui'
import { POLL_NOT_A_VOTE } from '@/lib/polls/rules'

/** Shown on every screen that shows a poll. A poll is not a legal vote. */
export function PollNotice() {
  return (
    <Alert variant="info" title="Informal poll">
      {POLL_NOT_A_VOTE}
    </Alert>
  )
}
