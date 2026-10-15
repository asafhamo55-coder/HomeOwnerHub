import { ClipboardList, MessageSquarePlus, ShieldAlert } from 'lucide-react'
import { Badge, LoadFailed } from '@homeowner-portal/ui'
import { loadMyTickets } from '@/lib/resident-tickets'
import { loadMyArcRequests, loadMyViolationReports } from '@/lib/resident-submissions'
import { RowGroup, ScreenHeader, Section, TappableRow, type Tone } from '@/components/resident/screen'

export const metadata = { title: 'Requests' }
export const dynamic = 'force-dynamic'

const CLOSED_REPORT = new Set(['closed_no_action', 'dismissed'])

export default async function ResidentRequestsPage() {
  const [ticketsResult, arcResult, reportsResult] = await Promise.all([
    loadMyTickets(),
    loadMyArcRequests(),
    loadMyViolationReports(),
  ])
  // A failed read must not show as "Nothing yet" on its track row.
  const tickets = ticketsResult.ok ? ticketsResult.data : null
  const arc = arcResult.ok ? arcResult.data : null
  const reports = reportsResult.ok ? reportsResult.data : null

  const ticketsOpen = tickets?.filter((t) => t.status === 'open' || t.status === 'in_progress').length ?? 0
  const arcOpen = arc?.filter((a) => a.status === 'submitted' || a.status === 'in_review').length ?? 0
  const reportsOpen = reports?.filter((r) => !CLOSED_REPORT.has(r.status)).length ?? 0
  const anyFailed = tickets === null || arc === null || reports === null

  return (
    <div className="space-y-8">
      <ScreenHeader
        title="Requests"
        subtitle="Start something new, or track what you've already sent your board."
      />

      <Section label="Track">
        {anyFailed ? <LoadFailed what="some of your requests" /> : null}
        <RowGroup>
          <TrackRow
            href="/resident/tickets"
            icon={<MessageSquarePlus />}
            title="Support requests"
            total={tickets?.length ?? null}
            open={ticketsOpen}
          />
          <TrackRow
            href="/resident/arc"
            icon={<ClipboardList />}
            tone="emerald"
            title="ARC applications"
            total={arc?.length ?? null}
            open={arcOpen}
          />
          <TrackRow
            href="/resident/violations"
            icon={<ShieldAlert />}
            tone="amber"
            title="Reported concerns"
            total={reports?.length ?? null}
            open={reportsOpen}
          />
        </RowGroup>
      </Section>

      <Section label="Start something new">
        <RowGroup>
          <TappableRow
            href="/resident/tickets/new"
            icon={<MessageSquarePlus />}
            title="New support request"
            subtitle="Maintenance, noise, parking, billing and more"
          />
          <TappableRow
            href="/resident/arc/new"
            icon={<ClipboardList />}
            tone="emerald"
            title="Architectural request (ARC)"
            subtitle="Approval for a fence, paint, addition…"
          />
          <TappableRow
            href="/resident/report-violation"
            icon={<ShieldAlert />}
            tone="amber"
            title="Report a concern"
            subtitle="Flag something in the community to the board"
          />
        </RowGroup>
      </Section>
    </div>
  )
}

function TrackRow({
  href,
  icon,
  title,
  total,
  open,
  tone,
}: {
  href: string
  icon: React.ReactNode
  title: string
  /** Null when the list could not be loaded. */
  total: number | null
  open: number
  tone?: Tone
}) {
  const subtitle =
    total === null
      ? 'Couldn’t load'
      : total === 0
        ? 'Nothing yet'
        : `${total} total`
  return (
    <TappableRow
      href={href}
      icon={icon}
      tone={tone}
      title={title}
      subtitle={subtitle}
      trailing={
        open > 0 ? (
          <Badge variant="info" size="sm">
            {open} open
          </Badge>
        ) : null
      }
    />
  )
}
