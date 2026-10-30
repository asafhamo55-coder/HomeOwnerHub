import { Bot, Clock, Hourglass } from 'lucide-react'
import { Kpi } from '@homeowner-portal/ui'
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
  const loading = inbox === null
  const state = loading ? 'loading' : 'ready'
  const waiting = inbox ? inbox.total : null
  const oldest = oldestWaitDays(sections, timeZone, now)
  const share = inbox ? aiShare(inbox.counts) : null
  return (
    <section aria-label="Approvals summary" data-testid="approvals-summary" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
      <Kpi
        label="Waiting now"
        state={state}
        icon={<Hourglass />}
        value={waiting === null ? '—' : String(waiting)}
        hint={waiting === null ? 'Some sections didn’t load' : waiting === 0 ? 'Nothing needs a decision' : 'Need a board decision'}
      />
      <Kpi
        label="Oldest wait"
        state={state}
        icon={<Clock />}
        value={oldest === null ? '—' : plural(oldest, 'day')}
        hint={oldest === null ? 'Nothing waiting' : oldest === 0 ? 'Added today' : 'Since it was proposed'}
      />
      <Kpi
        className="col-span-2 lg:col-span-1"
        label="Drafted by AI"
        state={state}
        icon={<Bot />}
        value={share === null ? '—' : `${share.percent}%`}
        hint={share === null ? 'Some sections didn’t load' : `${share.ai} of ${plural(share.total, 'waiting item')}`}
      />
    </section>
  )
}
