import Link from 'next/link'
import { format } from 'date-fns'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileText,
  Home,
  Send,
  Megaphone,
  MessageSquarePlus,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { Badge, Button, LoadFailed } from '@homeowner-portal/ui'
import { getResidentDashboard, type OpenViolationRow } from '@/lib/resident-dashboard'
import type { ResidentUnit } from '@/lib/resident'
import { nextDueText } from '@/lib/resident-due-text'
import type { TicketRow } from '@/lib/resident-tickets'
import type { ArcRequestRow } from '@/lib/resident-submissions'
import { GreetingHeadline } from '@/components/dashboard/GreetingHeadline'
import { ResidentFirstWeek } from '@/components/guide/FirstWeekGate'
import {
  Hero,
  IconTile,
  Panel,
  RowGroup,
  Section,
  SectionLabel,
  TappableRow,
  type Tone,
} from '@/components/resident/screen'
import { ResidentStatus } from '@/components/resident/status'

export const metadata = { title: 'My Home' }

// Near-real-time state (dues, violations, tickets) that server actions
// revalidate as the resident acts — render dynamically so a fresh visit
// always shows current priorities.
export const dynamic = 'force-dynamic'

/** Open requests shown on the home screen; the rest are one tap away. */
const HOME_LIMIT = 5

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
  // A failed dues or violations read leaves those empty, which would render
  // as "You're all caught up" — a wrong answer about someone's account.
  const standingUnknown = data.failed.dues || data.failed.violations

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <GreetingHeadline
          name={data.firstName}
          contextLabel={data.associationName ?? data.orgName}
          fallbackDate={serverDateLabel}
        />
      </div>

      {!hasUnit ? (
        <Panel className="flex flex-col items-center gap-3 py-10 text-center">
          <IconTile icon={<Home />} size="lg" />
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">No home linked to your account yet</p>
            <p className="mx-auto max-w-sm text-sm text-muted">
              Your community manager hasn&apos;t linked this account to a unit. Reach out to them and
              the rest of your portal will light up.
            </p>
          </div>
        </Panel>
      ) : (
        <>
          {standingUnknown ? (
            <LoadFailed
              what={
                data.failed.dues && data.failed.violations
                  ? 'your balance or open notices'
                  : data.failed.dues
                    ? 'your balance'
                    : 'your open notices'
              }
              hint="Anything listed below did load correctly."
            />
          ) : (
            <div className="space-y-3">
              <StatusHero dues={data.dues} allGood={actionItems === 0} />
              {data.dues.balance > 0 ? (
                <Button asChild size="lg" className="w-full">
                  <Link href="/resident/dues/pay">
                    <Send aria-hidden />
                    Pay {usd.format(data.dues.balance)}
                  </Link>
                </Button>
              ) : null}
            </div>
          )}

          {data.openViolations.length > 0 ? (
            <Section label="Needs your attention">
              <RowGroup>
                {data.openViolations.map((v) => (
                  <ViolationRow key={v.id} violation={v} />
                ))}
              </RowGroup>
            </Section>
          ) : null}

          {data.failed.requests ? (
            <Section label="Your open requests">
              <LoadFailed what="your open requests" />
            </Section>
          ) : inProgress > 0 ? (
            <Section
              label={`Your open requests · ${inProgress}`}
              aside={
                inProgress > HOME_LIMIT ? (
                  <Link href="/resident/requests" className="font-medium text-primary no-underline hover:underline">
                    See all
                  </Link>
                ) : null
              }
            >
              <RowGroup>
                {data.openTickets.slice(0, HOME_LIMIT).map((t) => (
                  <TicketRowItem key={t.id} ticket={t} />
                ))}
                {data.pendingArc.slice(0, Math.max(0, HOME_LIMIT - data.openTickets.length)).map((a) => (
                  <ArcRowItem key={a.id} arc={a} />
                ))}
              </RowGroup>
            </Section>
          ) : null}
        </>
      )}

      {/* First visits only, until dismissed; after the account's standing, never above it. */}
      {data.orgId ? <ResidentFirstWeek scope={data.orgId} /> : null}

      <Section label="Quick actions">
        {/* Seven tiles: the odd one out spans the last row rather than sitting alone. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 max-sm:[&>:last-child:nth-child(odd)]:col-span-2 sm:[&>:last-child:nth-child(3n+1)]:col-span-3">
          <ActionTile
            icon={<MessageSquarePlus />}
            label="New request"
            hint="Maintenance, noise, billing"
            href="/resident/tickets/new"
          />
          <ActionTile icon={<Sparkles />} tone="ai" label="Ask the Docs" hint="Your rules, answered" href="/resident/ask" />
          <ActionTile icon={<FileText />} tone="slate" label="Documents" hint="CC&Rs, bylaws, rules" href="/resident/documents" />
          <ActionTile
            icon={<Megaphone />}
            tone="info"
            label="Announcements"
            hint="From your board"
            href="/resident/announcements"
            badge={data.recentAnnouncements > 0 ? `${data.recentAnnouncements} new` : null}
          />
          <ActionTile
            icon={<ClipboardList />}
            tone="emerald"
            label="Start an ARC"
            hint="Exterior changes"
            href="/resident/arc/new"
          />
          <ActionTile
            icon={<ShieldAlert />}
            tone="amber"
            label="Report a concern"
            hint="Tell the board"
            href="/resident/report-violation"
          />
          <ActionTile icon={<CreditCard />} tone="slate" label="Dues" hint="Balance & charges" href="/resident/dues" />
        </div>
      </Section>

      {hasUnit ? (
        <Section label={data.units.length === 1 ? 'My home' : 'My homes'}>
          <UnitsPanel units={data.units} />
        </Section>
      ) : null}
    </div>
  )
}

// ── Status hero ─────────────────────────────────────────────────────────
// The single most important thing on the page: account standing. Either a
// prominent balance-due call to action, or a calm "all caught up" state.

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
      <Hero
        tone={overdue ? 'danger' : 'warning'}
        href="/resident/dues"
        eyebrow={overdue ? 'Balance past due' : 'Balance due'}
        value={usd.format(dues.balance)}
        footer={
          overdue
            ? `${dues.pastDueCount} past-due ${dues.pastDueCount === 1 ? 'charge' : 'charges'} · View dues`
            : dues.nextDueDate
              ? `${nextDueText(dues.nextDueDate)} · View dues`
              : 'View dues'
        }
      />
    )
  }

  if (allGood) {
    return (
      <Hero
        tone="success"
        icon={<CheckCircle2 />}
        title="You’re all caught up"
        description="No balance due and no open notices — your account is in good standing."
      />
    )
  }

  // No balance, but open notices are listed below.
  return (
    <Hero
      tone="neutral"
      icon={<Home />}
      title="No balance due"
      description="There are open notices on your home — see below."
    />
  )
}

// ── Attention & request rows ────────────────────────────────────────────

function ViolationRow({ violation }: { violation: OpenViolationRow }) {
  // Not a link: /resident/violations/[id] is the resident's own *reports*,
  // keyed by report id — a violation id there was a 404.
  return (
    <TappableRow
      icon={<AlertTriangle />}
      tone="amber"
      title={humanize(violation.violation_type)}
      subtitle={
        violation.notice_sent_at
          ? `Notice sent ${format(new Date(violation.notice_sent_at), 'PP')}`
          : violation.description
      }
      status={<ResidentStatus kind="violation" status={violation.status} />}
    />
  )
}

function TicketRowItem({ ticket }: { ticket: TicketRow }) {
  return (
    <TappableRow
      href={`/resident/tickets/${ticket.id}`}
      icon={<MessageSquarePlus />}
      title={ticket.subject}
      subtitle={`Request · opened ${format(new Date(ticket.created_at), 'PP')}`}
      status={<ResidentStatus kind="ticket" status={ticket.status} />}
    />
  )
}

function ArcRowItem({ arc }: { arc: ArcRequestRow }) {
  return (
    <TappableRow
      href={`/resident/arc/${arc.id}`}
      icon={<ClipboardList />}
      tone="emerald"
      title={arc.summary}
      subtitle={`ARC · submitted ${format(new Date(arc.submitted_at), 'PP')}`}
      status={<ResidentStatus kind="arc" status={arc.status} />}
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
          <RowGroup>
            {group.units.map((u) => (
              <TappableRow
                key={u.unit_id}
                icon={<Home />}
                tone="slate"
                title={u.unit_number ?? u.address ?? 'Your unit'}
                subtitle={u.unit_number && u.address ? u.address : u.association_name ?? undefined}
                trailing={
                  <Badge variant="neutral" size="sm">
                    {u.ownership_pct ? `${u.ownership_pct}% owner` : 'Owner'}
                  </Badge>
                }
              />
            ))}
          </RowGroup>
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
  hint,
  href,
  tone,
  badge,
}: {
  icon: React.ReactNode
  label: string
  hint: string
  href: string
  tone?: Tone
  badge?: string | null
}) {
  return (
    <Link
      href={href}
      className="relative flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 no-underline transition-colors duration-fast hover:border-border-strong hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <IconTile icon={icon} tone={tone} />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        <span className="mt-0.5 block truncate text-xs text-muted">{hint}</span>
      </span>
      {badge ? (
        <span className="absolute right-3 top-3">
          <Badge variant="info" size="sm">
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
