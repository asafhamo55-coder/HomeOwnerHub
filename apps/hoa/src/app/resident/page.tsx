import Link from 'next/link'
import { getCurrentOrg } from '@/lib/orgs'
import { getResidentUnits } from '@/lib/resident'
import { timed } from '@/lib/perf/timing'
import { format } from 'date-fns'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  CalendarPlus,
  Home,
  Send,
  MessageSquarePlus,
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
} from '@/components/resident/screen'
import { ResidentStatus } from '@/components/resident/status'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { todayIn } from '@/lib/association-time'
import { residentTimeZone } from '@/lib/resident-dues'
import { fetchResidentMeetings, type MeetingsClient } from '@/lib/resident-meetings/query'
import { formatMeetingDate, type UpcomingMeeting } from '@/lib/resident-meetings/select'
import { getResidentActor } from '@/lib/impersonation'
import { loadMySmsPreference, loadMyTextPhones } from '@/lib/sms-consent'
import { TextsPromptCard } from '@/components/resident/TextsPromptCard'
import { BoardContactsCard } from '@/components/resident/BoardContactsCard'
import { readBoardContacts, type BoardContact } from '@/lib/association-contacts'
import { residentCalendarHref } from '@/lib/meetings/resident-calendar-link'
import { LatestAnnouncementCard } from '@/components/resident/LatestAnnouncementCard'
import { QuickActions } from '@/components/resident/QuickActions'
import { AskToJoinLink } from '@/components/resident/AskToJoinLink'

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
  // The next meeting needs only the org and the units' zone — both
  // memoized reads the dashboard makes too — so it runs alongside the
  // dashboard instead of after it (BL-099).
  const [data, nextMeeting, offerTexts, contactGroups] = await Promise.all([
    timed('/resident', 'resident.dashboard', () => getResidentDashboard()),
    timed('/resident', 'resident.nextMeeting', async () => {
      const [org, units] = await Promise.all([getCurrentOrg(), getResidentUnits()])
      return org ? loadNextMeeting(org.id, residentTimeZone(units)) : null
    }),
    timed('/resident', 'resident.textsPrompt', () => shouldOfferTexts()),
    timed('/resident', 'resident.boardContacts', async () => loadBoardContacts(await getResidentUnits())),
  ])

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
          <AskToJoinLink />
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

      {hasUnit && offerTexts ? <TextsPromptCard /> : null}

      {data.orgId ? (
        <Section
          label={data.recentAnnouncements > 0 ? `Latest announcement · ${data.recentAnnouncements} new` : 'Latest announcement'}
        >
          <LatestAnnouncementCard announcement={data.latestAnnouncement} failed={data.failed.announcement} />
        </Section>
      ) : null}

      {nextMeeting ? (
        <Section label="Next meeting">
          <NextMeetingCard next={nextMeeting} />
        </Section>
      ) : null}

      {/* First visits only, until dismissed; after the account's standing, never above it. */}
      {data.orgId ? <ResidentFirstWeek scope={data.orgId} /> : null}

      {contactGroups.map((g) => (
        <BoardContactsCard
          key={g.associationId}
          contacts={g.contacts}
          communityName={contactGroups.length > 1 ? g.name : null}
        />
      ))}

      <Section label="Quick actions">
        <QuickActions newAnnouncements={data.recentAnnouncements} />
      </Section>

      {hasUnit ? (
        <Section label={data.units.length === 1 ? 'My home' : 'My homes'}>
          <UnitsPanel units={data.units} />
        </Section>
      ) : null}
    </div>
  )
}

// ── Texts prompt (BL-110) ───────────────────────────────────────────────
// True only for a signed-in resident (not an admin viewing as them) who
// has a textable number on file and hasn't agreed to texts. Any failed
// read hides the card — it is a nudge, never a status.

async function shouldOfferTexts(): Promise<boolean> {
  try {
    const actor = await getResidentActor()
    if (actor.impersonating || !actor.id) return false
    const org = await getCurrentOrg()
    if (!org) return false
    const [pref, phones] = await Promise.all([
      loadMySmsPreference(actor.client, org.id, actor.id),
      loadMyTextPhones(actor.client, org.id, actor.id),
    ])
    if (!pref.ok || !phones.ok) return false
    return !pref.pref.optIn && !pref.pref.otherOrg && phones.phones.length > 0
  } catch {
    return false
  }
}

// ── Board and emergency contacts ────────────────────────────────────────
// What the board chose to publish, from associations.compliance_settings
// (readable by org members under RLS). One group per association the
// resident has a home in; empty groups and any failed read are hidden.

type ContactGroup = { associationId: string; name: string | null; contacts: BoardContact[] }

async function loadBoardContacts(units: ResidentUnit[]): Promise<ContactGroup[]> {
  const ids = [...new Set(units.map((u) => u.association_id).filter((id): id is string => !!id))]
  if (ids.length === 0) return []
  try {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from('associations')
      .select('id, name, compliance_settings')
      .in('id', ids)
      .order('name', { ascending: true })
    if (error) throw error
    return ((data ?? []) as Array<{ id: string; name: string; compliance_settings: unknown }>)
      .map((a) => ({ associationId: a.id, name: a.name, contacts: readBoardContacts(a.compliance_settings) }))
      .filter((g) => g.contacts.length > 0)
  } catch (e) {
    console.error('[resident-home] board contacts read failed', {
      code: (e as { code?: string } | null)?.code ?? null,
    })
    return []
  }
}

// ── Next meeting (BL-088) ───────────────────────────────────────────────
// The soonest scheduled meeting, from the same resident read as
// /resident/meetings. Hidden when the read failed or the feature isn't
// available yet: it is a pointer, and the meetings page says why.

type NextMeeting = { meeting: UpcomingMeeting; calendarHref: string | null } | { meeting: null }

async function loadNextMeeting(orgId: string, timeZone: string): Promise<NextMeeting | null> {
  try {
    const supabase = await getSupabaseServerClient()
    const res = await fetchResidentMeetings(supabase as unknown as MeetingsClient, {
      orgId,
      today: todayIn(timeZone),
      timeZone,
    })
    if (!res.available) return null
    const meeting = res.upcoming[0]
    if (!meeting) return { meeting: null }
    // Signed on the server for a meeting the resident's own RLS read returned.
    return { meeting, calendarHref: residentCalendarHref(orgId, meeting.id) }
  } catch (e) {
    console.error('[resident-home] next meeting read failed', {
      code: e instanceof Error && 'code' in e ? (e as { code?: string }).code ?? null : null,
    })
    return null
  }
}

function NextMeetingCard({ next }: { next: NextMeeting }) {
  if (!next.meeting) {
    return (
      <TappableRow
        href="/resident/meetings"
        icon={<CalendarDays />}
        tone="slate"
        title="No upcoming meeting posted"
        subtitle="See approved minutes from past meetings"
      />
    )
  }
  return (
    <div className="space-y-2">
      <TappableRow
        href="/resident/meetings"
        icon={<CalendarDays />}
        tone="info"
        title={next.meeting.typeLabel}
        subtitle={`${formatMeetingDate(next.meeting.date)} · ${next.meeting.agenda ? 'Agenda posted' : 'No agenda yet'}`}
      />
      {next.calendarHref ? (
        <Button asChild variant="secondary" size="sm">
          <a href={next.calendarHref} download>
            <CalendarPlus aria-hidden />
            Add to calendar
          </a>
        </Button>
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
  // BL-129: /resident/violations/[id] serves both the resident's own
  // reports (by report id) and violations on their home (by violation id).
  return (
    <TappableRow
      href={`/resident/violations/${violation.id}`}
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

function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}
