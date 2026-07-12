import Link from 'next/link'
import { format } from 'date-fns'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Home,
  Megaphone,
  MessageSquarePlus,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { Badge, cn } from '@homeowner-portal/ui'
import { getResidentDashboard, type OpenViolationRow } from '@/lib/resident-dashboard'
import type { ResidentUnit } from '@/lib/resident'
import type { TicketRow } from '@/lib/resident-tickets'
import type { ArcRequestRow } from '@/lib/resident-submissions'
import { GreetingHeadline } from '@/components/dashboard/GreetingHeadline'
import { IconTile, Panel, SectionLabel, TappableRow, type Tone } from '@/components/resident/screen'

export const metadata = { title: 'My Home' }

// Near-real-time state (dues, violations, tickets) that server actions
// revalidate as the resident acts — render dynamically so a fresh visit
// always shows current priorities.
export const dynamic = 'force-dynamic'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

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
    <div className="space-y-7">
      {/* Greeting */}
      <div className="space-y-1">
        <GreetingHeadline
          name={data.firstName}
          contextLabel={data.associationName ?? data.orgName}
          fallbackDate={serverDateLabel}
        />
      </div>

      {!hasUnit ? (
        <Panel className="flex flex-col items-center gap-3 py-10 text-center">
          <IconTile icon={<Home className="h-6 w-6" />} className="h-14 w-14" />
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">
              No home linked to your account yet
            </p>
            <p className="mx-auto max-w-sm text-sm text-muted">
              Your community manager hasn&apos;t linked this account to a unit. Reach out to them and
              the rest of your portal will light up.
            </p>
          </div>
        </Panel>
      ) : (
        <>
          <StatusHero dues={data.dues} allGood={actionItems === 0} />

          {actionItems > 0 ? (
            <section className="space-y-2.5">
              <SectionLabel>Needs your attention</SectionLabel>
              {data.dues.balance > 0 ? <DuesRow dues={data.dues} /> : null}
              {data.openViolations.map((v) => (
                <ViolationRow key={v.id} violation={v} />
              ))}
            </section>
          ) : null}

          {inProgress > 0 ? (
            <section className="space-y-2.5">
              <SectionLabel>Your open requests</SectionLabel>
              {data.openTickets.map((t) => (
                <TicketRowItem key={t.id} ticket={t} />
              ))}
              {data.pendingArc.map((a) => (
                <ArcRowItem key={a.id} arc={a} />
              ))}
            </section>
          ) : null}

          <section className="space-y-2.5">
            <SectionLabel>My home</SectionLabel>
            <UnitsPanel units={data.units} />
          </section>
        </>
      )}

      <section className="space-y-2.5">
        <SectionLabel>Quick actions</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <ActionTile
            icon={<Sparkles className="h-5 w-5" />}
            label="Ask the Docs"
            href="/resident/ask"
          />
          <ActionTile
            icon={<Megaphone className="h-5 w-5" />}
            label="Announcements"
            href="/resident/announcements"
            badge={data.recentAnnouncements > 0 ? `${data.recentAnnouncements} new` : null}
          />
          <ActionTile
            icon={<MessageSquarePlus className="h-5 w-5" />}
            label="New request"
            href="/resident/tickets/new"
          />
          <ActionTile
            icon={<ClipboardList className="h-5 w-5" />}
            label="Start an ARC"
            href="/resident/arc/new"
          />
          <ActionTile
            icon={<ShieldAlert className="h-5 w-5" />}
            label="Report a concern"
            href="/resident/report-violation"
          />
          <ActionTile
            icon={<CreditCard className="h-5 w-5" />}
            label="View dues"
            href="/resident/dues"
          />
        </div>
      </section>
    </div>
  )
}

// ── Status hero ─────────────────────────────────────────────────────────
// The single most important thing on the page: account standing. Either a
// prominent balance-due call to action, or a warm "all caught up" state.

function StatusHero({
  dues,
  allGood,
}: {
  dues: { balance: number; pastDueCount: number; nextDueDate: string | null }
  allGood: boolean
}) {
  if (dues.balance > 0) {
    const overdue = dues.pastDueCount > 0
    return (
      <Link
        href="/resident/dues"
        className={cn(
          'block rounded-3xl border p-5 no-underline transition active:scale-[0.99]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          overdue
            ? 'border-rose-200 bg-rose-50 dark:border-rose-500/25 dark:bg-rose-500/10'
            : 'border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10',
        )}
      >
        <p className="text-sm font-medium text-muted">Balance due</p>
        <p className="mt-1 text-4xl font-bold tracking-tight text-foreground">
          {usd.format(dues.balance)}
        </p>
        <p className="mt-2 text-sm font-medium text-foreground/80">
          {overdue
            ? `${dues.pastDueCount} past-due ${dues.pastDueCount === 1 ? 'charge' : 'charges'} · View dues →`
            : dues.nextDueDate
              ? `Next due ${format(new Date(dues.nextDueDate), 'PP')} · View dues →`
              : 'View dues →'}
        </p>
      </Link>
    )
  }

  if (allGood) {
    return (
      <div className="flex items-center gap-3.5 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-500/25 dark:bg-emerald-500/10">
        <IconTile icon={<CheckCircle2 className="h-6 w-6" />} tone="emerald" className="h-12 w-12" />
        <div className="min-w-0">
          <p className="text-base font-semibold text-foreground">You&apos;re all caught up</p>
          <p className="text-sm text-muted">No dues or open concerns — your account is in good standing.</p>
        </div>
      </div>
    )
  }

  // Standing is fine on dues, but there are other attention items below.
  return (
    <div className="flex items-center gap-3.5 rounded-3xl border border-border bg-surface p-5">
      <IconTile icon={<Home className="h-6 w-6" />} className="h-12 w-12" />
      <div className="min-w-0">
        <p className="text-base font-semibold text-foreground">Welcome home</p>
        <p className="text-sm text-muted">Here&apos;s everything for your community, in one place.</p>
      </div>
    </div>
  )
}

// ── Attention & request rows ────────────────────────────────────────────

function DuesRow({ dues }: { dues: { balance: number; pastDueCount: number; nextDueDate: string | null } }) {
  const overdue = dues.pastDueCount > 0
  return (
    <TappableRow
      href="/resident/dues"
      icon={<CreditCard className="h-5 w-5" />}
      tone={overdue ? 'rose' : 'amber'}
      title="Balance due"
      subtitle={
        overdue
          ? `${dues.pastDueCount} past-due ${dues.pastDueCount === 1 ? 'charge' : 'charges'}`
          : dues.nextDueDate
            ? `Next due ${format(new Date(dues.nextDueDate), 'PP')}`
            : 'Outstanding assessments'
      }
      trailing={<span className="text-[15px] font-semibold text-foreground">{usd.format(dues.balance)}</span>}
    />
  )
}

function ViolationRow({ violation }: { violation: OpenViolationRow }) {
  return (
    <TappableRow
      href={`/resident/violations/${violation.id}`}
      icon={<AlertTriangle className="h-5 w-5" />}
      tone="amber"
      title={humanize(violation.violation_type)}
      subtitle={
        violation.notice_sent_at
          ? `Notice sent ${format(new Date(violation.notice_sent_at), 'PP')}`
          : violation.description
      }
      trailing={
        <Badge variant="warning" size="sm">
          {humanize(violation.status)}
        </Badge>
      }
    />
  )
}

const TICKET_STATUS_VARIANT: Record<TicketRow['status'], 'outline' | 'warning' | 'success'> = {
  open: 'outline',
  in_progress: 'warning',
  closed: 'success',
}

function TicketRowItem({ ticket }: { ticket: TicketRow }) {
  return (
    <TappableRow
      href={`/resident/tickets/${ticket.id}`}
      icon={<MessageSquarePlus className="h-5 w-5" />}
      title={ticket.subject}
      subtitle={`Request · opened ${format(new Date(ticket.created_at), 'PP')}`}
      trailing={
        <Badge variant={TICKET_STATUS_VARIANT[ticket.status]} size="sm">
          {ticket.status.replace('_', ' ')}
        </Badge>
      }
    />
  )
}

const ARC_STATUS_VARIANT: Record<string, 'outline' | 'warning' | 'success' | 'destructive'> = {
  submitted: 'outline',
  in_review: 'warning',
  approved: 'success',
  denied: 'destructive',
  withdrawn: 'outline',
}

function ArcRowItem({ arc }: { arc: ArcRequestRow }) {
  return (
    <TappableRow
      href="/resident/arc"
      icon={<ClipboardList className="h-5 w-5" />}
      title={arc.summary}
      subtitle={`ARC application · submitted ${format(new Date(arc.submitted_at), 'PP')}`}
      trailing={
        <Badge variant={ARC_STATUS_VARIANT[arc.status] ?? 'outline'} size="sm">
          {arc.status.replace('_', ' ')}
        </Badge>
      }
    />
  )
}

// ── Units ───────────────────────────────────────────────────────────────

function UnitsPanel({ units }: { units: ResidentUnit[] }) {
  const communities = [
    ...new Set(units.map((u) => u.association_name).filter((n): n is string => n != null && n !== '')),
  ]
  const multiCommunity = communities.length > 1
  const groups = multiCommunity
    ? groupUnitsByCommunity(units)
    : [{ community: null as string | null, units }]

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.community ?? '__ungrouped'} className="space-y-2">
          {group.community ? <SectionLabel>{group.community}</SectionLabel> : null}
          {group.units.map((u) => (
            <TappableRow
              key={u.unit_id}
              icon={<Home className="h-5 w-5" />}
              tone="slate"
              title={u.unit_number ?? u.address ?? 'Your unit'}
              subtitle={u.unit_number && u.address ? u.address : u.association_name ?? undefined}
              trailing={
                <Badge variant="outline" size="sm">
                  {u.ownership_pct ? `${u.ownership_pct}% owner` : 'Owner'}
                </Badge>
              }
            />
          ))}
        </div>
      ))}
    </div>
  )
}

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

// ── Quick action tile ───────────────────────────────────────────────────

function ActionTile({
  icon,
  label,
  href,
  tone,
  badge,
}: {
  icon: React.ReactNode
  label: string
  href: string
  tone?: Tone
  badge?: string | null
}) {
  return (
    <Link
      href={href}
      className="relative flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 no-underline transition active:scale-[0.98] hover:border-primary/30 hover:bg-primary/[0.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <IconTile icon={icon} tone={tone} />
      <span className="text-[15px] font-semibold text-foreground">{label}</span>
      {badge ? (
        <span className="absolute right-3 top-3">
          <Badge variant="warning" size="sm">
            {badge}
          </Badge>
        </span>
      ) : null}
    </Link>
  )
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}
