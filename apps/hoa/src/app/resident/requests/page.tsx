import { ClipboardList, MessageSquarePlus, ShieldAlert } from 'lucide-react'
import { Badge, LoadFailed } from '@homeowner-portal/ui'
import { loadMyTickets } from '@/lib/resident-tickets'
import { loadMyArcRequests, loadMyViolationReports } from '@/lib/resident-submissions'
import { IconTile, ScreenHeader, SectionLabel, TappableRow, type Tone } from '@/components/resident/screen'

export const metadata = { title: 'Requests' }
export const dynamic = 'force-dynamic'

const CLOSED_VIOLATION = new Set(['resolved', 'dismissed', 'closed', 'waived'])

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
  const reportsOpen = reports?.filter((r) => !CLOSED_VIOLATION.has(r.status)).length ?? 0
  const anyFailed = tickets === null || arc === null || reports === null

  return (
    <div className="space-y-7">
      <ScreenHeader
        title="Requests"
        subtitle="Start something new, or track what you've already sent your community."
      />

      <section className="space-y-2.5">
        <SectionLabel>Start something new</SectionLabel>
        <TappableRow
          href="/resident/tickets/new"
          icon={<MessageSquarePlus className="h-5 w-5" />}
          title="New support request"
          subtitle="Maintenance, noise, parking, billing and more"
        />
        <TappableRow
          href="/resident/arc/new"
          icon={<ClipboardList className="h-5 w-5" />}
          title="Architectural request (ARC)"
          subtitle="Get approval for a fence, paint, addition…"
        />
        <TappableRow
          href="/resident/report-violation"
          icon={<ShieldAlert className="h-5 w-5" />}
          title="Report a concern"
          subtitle="Flag something in the community to the board"
        />
      </section>

      <section className="space-y-2.5">
        <SectionLabel>Track</SectionLabel>
        {anyFailed ? <LoadFailed what="some of your requests" /> : null}
        <TrackRow
          href="/resident/tickets"
          icon={<MessageSquarePlus className="h-5 w-5" />}
          title="Support tickets"
          total={tickets?.length ?? null}
          open={ticketsOpen}
        />
        <TrackRow
          href="/resident/arc"
          icon={<ClipboardList className="h-5 w-5" />}
          title="ARC applications"
          total={arc?.length ?? null}
          open={arcOpen}
        />
        <TrackRow
          href="/resident/violations"
          icon={<ShieldAlert className="h-5 w-5" />}
          title="Reported concerns"
          total={reports?.length ?? null}
          open={reportsOpen}
        />
      </section>
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
        : open > 0
          ? `${open} open · ${total} total`
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
          <Badge variant="warning" size="sm">
            {open}
          </Badge>
        ) : null
      }
    />
  )
}
