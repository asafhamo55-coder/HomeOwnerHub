import { Bot, Clock, Hourglass } from 'lucide-react'
import { SummaryStrip as Strip } from '@/components/SummaryStrip'
import type { Inbox, InboxSection } from '@/lib/approvals-inbox/model'
import { aiShare, oldestWaitDays } from '@/lib/approvals-inbox/summary'
import { plural } from '@/lib/money/format'

/** Three counts above the approvals tabs. Unknown values show "—", never 0. */
export function SummaryStrip({
  inbox,
  sections,
  timeZone,
  now,
}: {
  /** Null while the sources load: the tiles show their loading state. */
  inbox: Inbox | null
  sections: InboxSection[]
  timeZone: string
  now?: Date
}) {
  const waiting = inbox ? inbox.total : null
  const oldest = oldestWaitDays(sections, timeZone, now)
  const share = inbox ? aiShare(inbox.counts) : null
  return (
    <Strip
      ariaLabel="Approvals summary"
      testId="approvals-summary"
      loading={inbox === null}
      tiles={[
        {
          label: 'Waiting now',
          icon: <Hourglass />,
          value: waiting === null ? null : String(waiting),
          unavailableHint: 'Some sections didn’t load',
          hint: waiting === 0 ? 'Nothing needs a decision' : 'Need a board decision',
        },
        {
          label: 'Oldest wait',
          icon: <Clock />,
          value: oldest === null ? null : plural(oldest, 'day'),
          unavailableHint: 'Nothing waiting',
          hint: oldest === 0 ? 'Added today' : 'Since it was proposed',
        },
        {
          label: 'Drafted by AI',
          icon: <Bot />,
          value: share === null ? null : `${share.percent}%`,
          unavailableHint: 'Some sections didn’t load',
          hint: share ? `${share.ai} of ${plural(share.total, 'waiting item')}` : undefined,
        },
      ]}
    />
  )
}
