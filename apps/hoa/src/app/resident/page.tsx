import Link from 'next/link'
import { format } from 'date-fns'
import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  ClipboardList,
  Home,
  Megaphone,
  MessageSquare,
  Sparkles,
  Wallet,
} from 'lucide-react'
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState } from '@homeowner-portal/ui'
import { getResidentDashboard, type OpenViolationRow } from '@/lib/resident-dashboard'
import type { ResidentUnit } from '@/lib/resident'
import type { TicketRow } from '@/lib/resident-tickets'
import type { ArcRequestRow } from '@/lib/resident-submissions'
import { GreetingHeadline } from '@/components/dashboard/GreetingHeadline'

export const metadata = { title: 'My Home' }

// The dashboard reflects near-real-time state (dues, violations, open
// tickets) that server actions revalidate as the resident acts. Render
// dynamically so a fresh visit always shows current priorities.
export const dynamic = 'force-dynamic'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

// Server-rendered placeholder date shown until GreetingHeadline swaps in
// the visitor's local date on mount. UTC on Vercel, so only used briefly.
const serverDateLabel = new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
})

export default async function ResidentDashboard() {
  const data = await getResidentDashboard()

  const hasUnit = data.units.length > 0
  const actionItems = data.openViolations.length + (data.dues.balance > 0 ? 1 : 0)
  const inProgress = data.openTickets.length + data.pendingArc.length

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Greeting */}
      <header className="space-y-2">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          {new Date().toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
          {data.associationName || data.orgName ? ` · ${data.associationName ?? data.orgName}` : ''}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {greeting()}
          {data.firstName ? `, ${data.firstName}` : ''}
        </h1>
        <p className="text-sm text-muted">
          {hasUnit
            ? actionItems > 0
              ? "Here's what needs your attention."
              : "You're all caught up — nothing needs your attention right now."
            : 'Welcome to your resident portal.'}
        </p>
      </header>

      {!hasUnit ? (
        <EmptyState
          icon={<Home className="h-10 w-10" aria-hidden />}
          title="No unit linked to your account yet"
          description="Your HOA administrator hasn't linked this account to a unit. Reach out to them so the rest of the resident portal can be activated for you."
        />
      ) : (
        <>
          {/* ── Priority 1: needs your attention ─────────────────── */}
          {actionItems > 0 ? (
            <section className="space-y-3">
              <SectionHeading
                icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
                title="Needs your attention"
              />

              {data.dues.balance > 0 ? <DuesCard dues={data.dues} /> : null}

              {data.openViolations.map((v) => (
                <ViolationCard key={v.id} violation={v} />
              ))}
            </section>
          ) : (
            <Card>
              <CardContent className="flex items-center gap-3 py-4 text-sm">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
                <span>
                  <span className="font-medium text-foreground">No open violations or dues.</span>{' '}
                  <span className="text-muted">Your account is in good standing.</span>
                </span>
              </CardContent>
            </Card>
          )}

          {/* ── Priority 2: your open requests ───────────────────── */}
          {inProgress > 0 ? (
            <section className="space-y-3">
              <SectionHeading
                icon={<ClipboardList className="h-4 w-4 text-primary" />}
                title="Your open requests"
              />

              {data.openTickets.map((t) => (
                <TicketItem key={t.id} ticket={t} />
              ))}
              {data.pendingArc.map((a) => (
                <ArcItem key={a.id} arc={a} />
              ))}
            </section>
          ) : null}

          {/* Units on file — grouped by community when the owner holds
              units across more than one association. */}
          <UnitsCard units={data.units} />
        </>
      )}

      {/* Quick links */}
      <section className="space-y-3">
        <SectionHeading icon={<Sparkles className="h-4 w-4 text-primary" />} title="Quick actions" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ActionCard
            icon={<Wallet className="h-4 w-4 text-primary" />}
            title="Dues"
            description="Check your current balance and payment history."
            cta="View dues"
            href="/resident/dues"
          />
          <ActionCard
            icon={<Megaphone className="h-4 w-4 text-primary" />}
            title="Announcements"
            description="Recent community updates from the board."
            cta="Read updates"
            href="/resident/announcements"
            badge={data.recentAnnouncements > 0 ? `${data.recentAnnouncements} new` : null}
          />
          <ActionCard
            icon={<Sparkles className="h-4 w-4 text-primary" />}
            title="Ask the Docs"
            description="Get cited answers from your governing documents."
            cta="Ask a question"
            href="/resident/ask"
          />
          <ActionCard
            icon={<ClipboardList className="h-4 w-4 text-primary" />}
            title="ARC application"
            description="Submit a request for an architectural change (fence, paint, addition)."
            cta="Start application"
            href="/resident/arc/new"
          />
          <ActionCard
            icon={<Briefcase className="h-4 w-4 text-primary" />}
            title="Report a concern"
            description="Submit a violation report or community concern to the board."
            cta="Submit report"
            href="/resident/report-violation"
          />
          <ActionCard
            icon={<MessageSquare className="h-4 w-4 text-primary" />}
            title="Tickets"
            description="Open a support ticket or check the status of an existing one."
            cta="My tickets"
            href="/resident/tickets"
          />
        </div>
      </section>
    </div>
  )
}

function UnitsCard({ units }: { units: ResidentUnit[] }) {
  const communities = [
    ...new Set(units.map((u) => u.association_name).filter((n): n is string => n != null && n !== '')),
  ]
  const multiCommunity = communities.length > 1
  // Only group under community headings when the owner spans more than
  // one association; a single-community owner sees a flat list.
  const groups = multiCommunity
    ? groupUnitsByCommunity(units)
    : [{ community: null as string | null, units }]

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">My {units.length === 1 ? 'unit' : 'units'}</CardTitle>
          <Badge variant="outline" size="sm">
            {units.length} {units.length === 1 ? 'unit' : 'units'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.map((group) => (
          <div key={group.community ?? '__ungrouped'} className="space-y-2">
            {group.community ? (
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {group.community}
              </p>
            ) : null}
            <ul className="space-y-2">
              {group.units.map((u) => (
                <UnitRow key={u.unit_id} unit={u} />
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function UnitRow({ unit }: { unit: ResidentUnit }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-foreground/5 px-3 py-2 text-sm">
      <div>
        <p className="font-medium">{unit.unit_number ?? unit.address ?? 'Your unit'}</p>
        {unit.unit_number && unit.address ? (
          <p className="text-xs text-muted">{unit.address}</p>
        ) : null}
      </div>
      <Badge variant="outline" size="sm">
        {unit.ownership_pct ? `${unit.ownership_pct}% owner` : 'Owner'}
      </Badge>
    </li>
  )
}

// Groups units by their community (association) name, preserving first-seen
// order. Units without a community fall into a trailing "Other" group.
function groupUnitsByCommunity(
  units: ResidentUnit[],
): Array<{ community: string | null; units: ResidentUnit[] }> {
  const groups: Array<{ community: string | null; units: ResidentUnit[] }> = []
  const byKey = new Map<string, { community: string | null; units: ResidentUnit[] }>()
  for (const unit of units) {
    const key = unit.association_name ?? '__other'
    let group = byKey.get(key)
    if (!group) {
      group = { community: unit.association_name ?? 'Other', units: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    group.units.push(unit)
  }
  return groups
}

function SectionHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
      {icon}
      {title}
    </h2>
  )
}

function DuesCard({
  dues,
}: {
  dues: { balance: number; pastDueCount: number; nextDueDate: string | null }
}) {
  const overdue = dues.pastDueCount > 0
  return (
    <Link
      href="/resident/dues"
      className="block rounded-xl no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Card variant="interactive" className={overdue ? 'border-destructive/40' : undefined}>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
              <Wallet className="h-5 w-5 text-amber-600" aria-hidden />
            </span>
            <div>
              <p className="font-medium text-foreground">Balance due</p>
              <p className="text-xs text-muted">
                {overdue
                  ? `${dues.pastDueCount} past-due ${dues.pastDueCount === 1 ? 'charge' : 'charges'}`
                  : dues.nextDueDate
                    ? `Next due ${format(new Date(dues.nextDueDate), 'PP')}`
                    : 'Outstanding assessments'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold text-foreground">{usd.format(dues.balance)}</span>
            {overdue ? (
              <Badge variant="destructive" size="sm">
                Overdue
              </Badge>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function ViolationCard({ violation }: { violation: OpenViolationRow }) {
  return (
    <Card className="border-amber-200">
      <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-foreground">{humanize(violation.violation_type)}</p>
            <p className="line-clamp-2 text-sm text-muted">{violation.description}</p>
            {violation.notice_sent_at ? (
              <p className="mt-1 text-xs text-muted">
                Notice sent {format(new Date(violation.notice_sent_at), 'PP')}
                {violation.cure_period_days ? ` · ${violation.cure_period_days}-day cure period` : ''}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant="warning" size="sm">
            {humanize(violation.status)}
          </Badge>
          {violation.fine_amount ? (
            <span className="text-xs font-medium text-foreground">
              {usd.format(Number(violation.fine_amount))} fine
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

const TICKET_STATUS_VARIANT: Record<TicketRow['status'], 'outline' | 'warning' | 'success'> = {
  open: 'outline',
  in_progress: 'warning',
  closed: 'success',
}

function TicketItem({ ticket }: { ticket: TicketRow }) {
  return (
    <Link
      href={`/resident/tickets/${ticket.id}`}
      className="block rounded-xl no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Card variant="interactive">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0">
              <p className="font-medium text-foreground">{ticket.subject}</p>
              <p className="text-xs text-muted">
                Ticket · opened {format(new Date(ticket.created_at), 'PP')}
              </p>
            </div>
          </div>
          <Badge variant={TICKET_STATUS_VARIANT[ticket.status]} size="sm">
            {ticket.status.replace('_', ' ')}
          </Badge>
        </CardContent>
      </Card>
    </Link>
  )
}

const ARC_STATUS_VARIANT: Record<string, 'outline' | 'warning' | 'success' | 'destructive'> = {
  submitted: 'outline',
  in_review: 'warning',
  approved: 'success',
  denied: 'destructive',
  withdrawn: 'outline',
}

function ArcItem({ arc }: { arc: ArcRequestRow }) {
  return (
    <Link
      href="/resident/arc"
      className="block rounded-xl no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Card variant="interactive">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-3">
            <ClipboardList className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0">
              <p className="font-medium text-foreground">{arc.summary}</p>
              <p className="text-xs text-muted">
                ARC application · submitted {format(new Date(arc.submitted_at), 'PP')}
              </p>
            </div>
          </div>
          <Badge variant={ARC_STATUS_VARIANT[arc.status] ?? 'outline'} size="sm">
            {arc.status.replace('_', ' ')}
          </Badge>
        </CardContent>
      </Card>
    </Link>
  )
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

function ActionCard({
  icon,
  title,
  description,
  cta,
  href,
  badge,
}: {
  icon: React.ReactNode
  title: string
  description: string
  cta: string
  href: string
  badge?: string | null
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            {icon}
            {title}
          </CardTitle>
          {badge ? (
            <Badge variant="warning" size="sm">
              {badge}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted">{description}</p>
        <Link href={href} className="inline-block text-sm font-medium text-primary hover:underline">
          {cta} →
        </Link>
      </CardContent>
    </Card>
  )
}
