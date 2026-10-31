import { Suspense } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  CircleDollarSign,
  Clock,
  FileText,
  History,
  Home,
  Inbox,
  Mail,
  MessageSquare,
  NotebookPen,
  Plus,
  Scale,
  Send,
  Users,
  Wallet,
} from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  KeyValue,
  KeyValueList,
  Kpi,
  LoadFailed,
  Page,
  StatusBadge,
  StatusPill,
  Tabs,
  Timeline,
  cn,
  type TimelineItem,
} from '@homeowner-portal/ui'
import { formatDay, formatStamp, usd } from '@/lib/money/format'
import type { LoadResult } from '@/lib/load-or-fail'
import type { LetterHistoryPage } from '@/lib/violations/letter-history'
import { LETTER_HISTORY_SHOWN } from '@/lib/violations/letter-history-core'
import { describePlanStanding, type PlanStandingView } from '@/lib/money/plan-standing'
import { ARC_CATEGORY, ARC_STATUS, INBOX_THREAD_STATUS, TENURE, VIOLATION_SEVERITY, VIOLATION_STATUS } from '@/lib/status/community'
import { cureBy, cureState, sortByUrgency } from '@/lib/violation-cure'
import { collectionStatusLabel } from '@/lib/collections/statuses'
import { propertyHref } from '@/lib/properties/href'
import { asPropertyId } from '@/lib/properties/resolve'
import { streetOf } from '@/lib/properties/severity'
import { SECTIONS, SECTION_LABEL, SECTION_TAB_LABEL, type SectionKey } from '@/lib/properties/sections'
import type { Part, Property360, UnitPart } from '@/lib/properties/property-360'
import { LATEST } from '@/lib/properties/property-360'
import {
  AGING_LABEL,
  MAIL_AWAITING,
  OPEN_ARC,
  agingBuckets,
  buildPeople,
  buildTimeline,
  currentLease,
  needsAction,
  waitingPosition,
  type ActionItem,
  type ActivityItem,
  type AgingBucket,
  type Owner,
  type ViolationRow,
} from '@/lib/properties/property-360-model'
import { ContactIcons } from '@/components/contact/ContactIcons'
import { ContactLink } from '@/components/contact/ContactLink'
import { ActiveTabIntoView } from './ActiveTabIntoView'
import { AddResidentForm } from './AddResidentForm'
import { ApplyCreditButton } from './ApplyCreditButton'
import { CollectionsSection } from './CollectionsSection'
import type { GaThresholdRead } from './GaThresholdPanel'
import type { GaComplaintRead } from './GaComplaintPanel'
import { EnterPortalButton } from './EnterPortalButton'
import { LogNoteDialog } from './LogNoteDialog'
import { PropertyActions } from './PropertyActions'
import { InviteToPortalButton } from './InviteToPortalButton'
import { RecordSaleDialog } from './RecordSaleDialog'
import { ResidentRow } from './ResidentRow'
import type { ConsentState } from '@/lib/email-consent'
import { ConsentStatus } from '@/components/consent/ConsentStatus'
import { RecordConsentDialog } from '@/components/consent/RecordConsentDialog'
import { TenureSelector } from './TenureSelector'

/**
 * The property page — one home, everything about it (P2 "360").
 *
 * Header (street · unit, tenure, owner) and an action bar; a "Needs
 * action" strip only when something does; then People, Money,
 * Compliance, Leases, Communications and one merged Activity timeline.
 * From `lg` it is one scrolling page with an anchor nav; on phones the
 * sections are tabs (`?tab=`), one at a time — every section is rendered
 * either way (they're all read in the same two waves), the phone just
 * hides the others.
 *
 * Every section distinguishes failed ("Couldn't load"), not linked to a
 * unit, and genuinely empty. Pure props: page.tsx reads, this renders, and
 * the previews render it with fixtures.
 */
export interface PropertyDetailViewProps {
  data: Property360
  now: Date
  /** The association's today, 'YYYY-MM-DD'. */
  today: string
  isAdmin: boolean
  /** Board or admin: may record a sale and invite owners (the actions gate again). */
  canManage?: boolean
  /** A lease cap is set (drives "Add to waiting list"). */
  capInPlace: boolean
  /** The rental cap read failed, so `capInPlace` is unknown rather than false. */
  capLoadFailed?: boolean
  /** The section a phone shows. */
  section: SectionKey
  /** The list this home was opened from (filters kept). */
  listHref: string
  /** The list's query, carried on the phone tabs. */
  listQuery: string
  /**
   * BL-020 (M1): owners' consent to official notices by email, by user id;
   * 'failed' = couldn't be read. Omitted until M1_APPLIED — the People
   * section is then exactly as before.
   */
  consent?: ReadonlyMap<string, ConsentState> | 'failed'
  /**
   * BL-099: the plan standings, still being read. The page passes the
   * read's promise instead of awaiting it (it is a third round trip, after
   * both of the loader's waves), and only the Payment plan tile waits for
   * it. Ignored when `data.planStandings` is already set (the previews).
   */
  planStandings?: Promise<Part<Record<string, PlanStandingView>>> | null
  /** BL-158: the Georgia foreclosure-threshold read (board/admin with an open case only); null or omitted hides it. */
  gaThreshold?: GaThresholdRead | null
  /** BL-161: the Georgia Secretary of State complaint record (board/admin with a unit only); null or omitted hides it. */
  gaComplaints?: GaComplaintRead | null
  /** Round 16: the home's letters, newest first (board/admin only); null or omitted hides the card. */
  letterHistory?: LoadResult<LetterHistoryPage> | null
}

export function PropertyDetailView(props: PropertyDetailViewProps) {
  const { data, now, today, isAdmin, canManage = false, capInPlace, capLoadFailed = false, section, listHref, listQuery, consent, planStandings, gaThreshold = null, gaComplaints = null, letterHistory = null } = props
  const p = data.property
  const pid = asPropertyId(p.id)
  const scoped = (path: string) => `${path}?property=${p.id}`
  const unitId = data.unit.ok ? data.unit.data.unitId : null
  const unitCount = data.unit.ok ? data.unit.data.unitCount : 0

  const residents = data.residents.ok ? data.residents.data : []
  const people = buildPeople({
    property: p,
    ownerships: data.ownerships?.ok ? data.ownerships.data : [],
    tenancies: data.tenancies?.ok ? data.tenancies.data : [],
    residents,
    today,
  })
  const aging = data.openAssessments?.ok ? agingBuckets(data.openAssessments.data, today) : null
  const waiting = data.waitingQueue.ok ? waitingPosition(data.waitingQueue.data, p.id) : null

  const actions = needsAction({
    propertyId: p.id,
    now,
    violations: data.violations,
    stats: data.stats,
    aging: data.openAssessments === null ? null : aging ? { ok: true, data: aging } : { ok: false },
    collectionCase: data.collections === null ? null : data.collections.ok ? { ok: true, data: data.collections.data.openCase ? { id: data.collections.data.openCase.id, status: data.collections.data.openCase.status, opened_on: data.collections.data.openCase.openedOn, closed_on: null } : null } : { ok: false },
    arc: data.arc,
    threads: data.threads,
    hrefs: { violations: scoped('/violations'), dues: scoped('/dues'), compliance: '#compliance', communications: '#communications' },
  })

  const street = streetOf(p.address)
  const title = p.unit_number ? `${street} · ${p.unit_number}` : street
  const primaryOwner = people.owners.find((o) => o.primary) ?? null
  const householdCount = people.residents.length

  const openViolations = data.violations.ok ? data.violations.data.filter((v) => cureState(v, now) !== 'closed').length : null
  const openArc = data.arc?.ok ? data.arc.data.filter((a) => OPEN_ARC.has(a.status)).length : null
  const awaitingMail = data.threads?.ok ? data.threads.data.filter((t) => MAIL_AWAITING.has(t.status)).length : null

  const tabs = SECTIONS.map((s) => ({
    label: SECTION_TAB_LABEL[s],
    href: propertyHref(pid, { query: { ...Object.fromEntries(new URLSearchParams(listQuery)), tab: s } }),
    active: s === section,
    badge: s === 'compliance' ? (openViolations ?? 0) + (openArc ?? 0) || null : s === 'communications' ? awaitingMail || null : null,
  }))

  return (
    <Page
      width="wide"
      back={{ href: listHref, label: 'Properties' }}
      linkAs={Link}
      title={<span title={p.address}>{title}</span>}
      meta={
        <>
          {p.tenure ? <StatusBadge status={p.tenure} tones={TENURE.tones} labels={TENURE.labels} /> : null}
          {waiting ? <StatusPill tone="info" label="On waiting list" icon={<Clock aria-hidden />} /> : null}
        </>
      }
      description={
        <div className="space-y-1">
          {street !== p.address ? <p className="truncate text-xs">{p.address}</p> : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={primaryOwner?.name ? 'text-foreground-secondary' : undefined}>
              {primaryOwner?.name ?? p.owner_name ?? 'No owner on file'}
            </span>
            {primaryOwner?.email ?? p.owner_email ? <ContactLink kind="email" value={(primaryOwner?.email ?? p.owner_email)!} showIcon /> : null}
            {primaryOwner?.phone ?? p.owner_phone ? <ContactLink kind="phone" value={(primaryOwner?.phone ?? p.owner_phone)!} showIcon /> : null}
          </div>
        </div>
      }
    >
      <ActionBar
        propertyId={p.id}
        canManage={canManage}
        address={p.address}
        householdCount={householdCount}
        ownerEmail={primaryOwner?.email ?? p.owner_email}
        stats={data.stats}
        openViolations={openViolations}
        sale={
          canManage && unitId
            ? {
                today,
                sellers: people.owners.map((o) => o.name ?? o.email ?? 'Unnamed owner'),
                tenantCount: people.residents.filter((r) => r.role === 'tenant').length + people.leaseTenants.length,
              }
            : null
        }
      />

      {unitCount > 1 ? (
        <Alert variant="warning" title={`${unitCount} unit records are linked to this property`}>
          Money, ARC, mail and leases below include all of them; the mailbox and collections use the oldest. Merge the duplicates
          to keep them from drifting.
        </Alert>
      ) : null}

      {actions.length > 0 ? <NeedsAction items={actions} /> : null}

      <div className="lg:grid lg:grid-cols-[10.5rem_minmax(0,1fr)] lg:gap-8">
        <nav aria-label="On this page" className="hidden lg:block">
          <ul className="sticky top-20 space-y-0.5 text-sm">
            {SECTIONS.map((s) => (
              <li key={s}>
                <a
                  href={`#${s}`}
                  className="block rounded-md px-2.5 py-1.5 text-muted no-underline transition-colors duration-fast hover:bg-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {SECTION_LABEL[s]}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-10">
          <div className="sticky top-14 z-10 -mx-4 bg-background px-4 sm:-mx-6 sm:px-6 lg:hidden">
            <Tabs items={tabs} aria-label="Property sections" linkAs={Link} />
            <ActiveTabIntoView />
          </div>

          <Section id="people" title="People" active={section === 'people'} action={data.residents.ok ? <AddResidentForm propertyId={p.id} /> : null}>
            <PeopleSection consent={consent} people={people} residents={data.residents} ownerships={data.ownerships} selfUpdates={data.selfUpdates?.ok ? data.selfUpdates.data : {}} isAdmin={isAdmin} canManage={canManage} propertyId={p.id} unitId={unitId} messageHref={householdCount > 0 ? scoped('/communications/new') : null} />
          </Section>

          <Section
            id="money"
            title="Money"
            active={section === 'money'}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href={scoped('/dues')}>All dues for this home</Link>
              </Button>
            }
          >
            <MoneySection data={data} planStandings={planStandings ?? null} aging={aging} today={today} unitId={unitId} canManage={canManage} duesHref={scoped('/dues')} letterHref={canManage ? propertyHref(pid, { collectionsLetter: true }) : null} gaThreshold={canManage ? gaThreshold : null} gaComplaints={canManage ? gaComplaints : null} />
          </Section>

          <Section
            id="compliance"
            title="Compliance"
            active={section === 'compliance'}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href={scoped('/violations')}>All violations for this home</Link>
              </Button>
            }
          >
            <ComplianceSection violations={data.violations} arc={data.arc} now={now} violationsHref={scoped('/violations')} letterHistory={canManage ? letterHistory : null} />
          </Section>

          <Section id="leases" title="Leases" active={section === 'leases'}>
            <LeasesSection data={data} today={today} waiting={waiting} capInPlace={capInPlace} capLoadFailed={capLoadFailed} leasesHref={scoped('/leases')} />
          </Section>

          <Section
            id="communications"
            title="Communications"
            active={section === 'communications'}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/inbox">Open inbox</Link>
              </Button>
            }
          >
            <CommunicationsSection threads={data.threads} notices={data.notices} unitFailed={!data.unit.ok} />
          </Section>

          <Section id="activity" title="Activity" active={section === 'activity'}>
            <ActivitySection data={data} />
          </Section>
        </div>
      </div>
    </Page>
  )
}

// ─── Chrome ──────────────────────────────────────────────────────────

function ActionBar({
  propertyId,
  address,
  householdCount,
  ownerEmail,
  stats,
  openViolations,
  sale,
  canManage,
}: {
  propertyId: string
  address: string
  canManage: boolean
  householdCount: number
  ownerEmail: string | null
  stats: Property360['stats']
  openViolations: number | null
  /** Set when the viewer may record a sale and the home has a unit to transfer. */
  sale: { today: string; sellers: string[]; tenantCount: number } | null
}) {
  const scoped = (path: string) => `${path}?property=${propertyId}`
  return (
    <div role="toolbar" aria-label="Property actions" className="flex flex-wrap items-center gap-2">
      {/* The composer sends to this home's residents on file. With nobody
          on file it would stop at "pick at least one resident", so the
          owner gets an email from the HOA mailbox instead. */}
      {householdCount > 0 ? (
        <Button asChild>
          <Link href={scoped('/communications/new')}>
            <MessageSquare aria-hidden />
            Message household
          </Link>
        </Button>
      ) : ownerEmail ? (
        <Button asChild>
          <Link href="/inbox/compose" title="A new email from the HOA mailbox">
            <Mail aria-hidden />
            Email owner
          </Link>
        </Button>
      ) : null}
      <Button asChild variant="secondary">
        <Link href={scoped('/dues')}>
          <CircleDollarSign aria-hidden />
          Record payment
        </Link>
      </Button>
      {canManage ? (
        <Button asChild variant="secondary">
          <Link href={propertyHref(asPropertyId(propertyId), { statement: true })}>
            <FileText aria-hidden />
            Statement
          </Link>
        </Button>
      ) : null}
      <Button asChild variant="secondary">
        <Link href={scoped('/violations/new')}>
          <Plus aria-hidden />
          New violation
        </Link>
      </Button>
      <LogNoteDialog propertyId={propertyId} />
      {sale ? (
        <RecordSaleDialog
          propertyId={propertyId}
          today={sale.today}
          sellers={sale.sellers}
          balance={stats.ok ? (stats.data?.balance ?? 0) : null}
          tenantCount={sale.tenantCount}
        />
      ) : null}
      <PropertyActions
        propertyId={propertyId}
        address={address}
        balance={stats.ok ? (stats.data?.balance ?? 0) : null}
        openViolations={openViolations}
        canManage={canManage}
      />
    </div>
  )
}

function NeedsAction({ items }: { items: ActionItem[] }) {
  return (
    <section aria-labelledby="needs-action" className="rounded-xl border border-border bg-surface">
      <h2 id="needs-action" className="border-b border-border px-4 py-2.5 text-sm font-semibold text-foreground">
        Needs action
      </h2>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 no-underline transition-colors duration-fast hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <StatusPill
                className="hidden sm:inline-flex"
                tone={item.tone}
                size="sm"
                label={item.tone === 'danger' ? 'Overdue' : item.tone === 'warning' ? 'Waiting' : 'Unknown'}
                icon={item.tone === 'neutral' ? <AlertTriangle aria-hidden /> : <Clock aria-hidden />}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{item.title}</span>
                {item.detail ? <span className="block text-xs text-muted sm:truncate">{item.detail}</span> : null}
              </span>
              <span className="w-full text-sm font-medium text-primary sm:w-auto">{item.cta} →</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Section({
  id,
  title,
  active,
  action,
  children,
}: {
  id: SectionKey
  title: string
  active: boolean
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn('scroll-mt-20 space-y-3', !active && 'hidden lg:block')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="text-lg font-semibold text-foreground">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** "Couldn't load", or "no unit linked" for a unit-keyed section. */
function UnitGate<T>({
  part,
  what,
  unlinked,
  children,
}: {
  part: UnitPart<T>
  what: string
  unlinked: string
  children: (data: T) => React.ReactNode
}) {
  if (part === null) return <p className="rounded-lg bg-subtle px-3.5 py-2.5 text-sm text-muted">{unlinked}</p>
  if (!part.ok) return <LoadFailed what={what} />
  return <>{children(part.data)}</>
}

// ─── People ──────────────────────────────────────────────────────────

function PeopleSection({
  consent,
  people,
  residents,
  ownerships,
  selfUpdates,
  isAdmin,
  canManage,
  propertyId,
  unitId,
  messageHref,
}: {
  consent?: ReadonlyMap<string, ConsentState> | 'failed'
  people: ReturnType<typeof buildPeople>
  residents: Part<unknown>
  ownerships: UnitPart<unknown>
  /** PR-10: id → when the person last updated their own contact details. */
  selfUpdates: Record<string, string>
  isAdmin: boolean
  canManage: boolean
  propertyId: string
  unitId: string | null
  messageHref: string | null
}) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 [&>*]:min-w-0">
      <Card>
        <CardHeader>
          <CardTitle as="h3">Owners</CardTitle>
          <p className="text-xs text-muted">
            {ownerships === null
              ? 'From the property record — no unit is linked, so co-owners and sale dates aren’t tracked.'
              : ownerships.ok
                ? people.owners.some((o) => o.source === 'ownership')
                  ? 'The lot’s owners of record.'
                  : 'From the property record (no ownership on file for the lot yet).'
                : 'Ownership couldn’t load; showing the property record.'}
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {people.owners.length === 0 ? (
            <EmptyState
              variant="compact"
              icon={<Users aria-hidden />}
              title="No owner on file"
              description="Add the owner so notices and dues reach someone."
              action={
                <Button asChild size="sm" variant="secondary">
                  <Link href={propertyHref(asPropertyId(propertyId), { edit: true })}>Add owner</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {people.owners.map((o) => (
                <OwnerRow key={o.key} consent={consent} owner={o} selfUpdatedAt={selfUpdates[o.key] ?? null} isAdmin={isAdmin} canManage={canManage} propertyId={propertyId} unitId={unitId} />
              ))}
            </ul>
          )}
          {consent === 'failed' ? <LoadFailed what="owners’ e-consent" hint="The owners are listed; whether they agreed to email notices couldn’t be read." /> : null}
          {people.previousOwners.length > 0 ? (
            <details className="rounded-lg bg-subtle px-3.5 py-2 text-sm">
              <summary className="cursor-pointer text-muted">
                Ownership history · {people.previousOwners.length} previous {people.previousOwners.length === 1 ? 'owner' : 'owners'}
              </summary>
              <ul className="mt-2 space-y-1.5" aria-label="Previous owners, most recent first">
                {people.previousOwners.map((o) => (
                  <li key={o.key} className="flex flex-wrap items-baseline justify-between gap-x-3 text-foreground-secondary">
                    <span className="min-w-0 truncate">
                      {o.name ?? o.email ?? 'Unnamed owner'}
                      {o.pct !== null && o.pct !== 100 ? <span className="num ml-1.5 text-xs text-muted">{o.pct}%</span> : null}
                    </span>
                    <span className="num text-xs text-muted">
                      {formatDay(o.since)} – {formatDay(o.until)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h3">Residents and tenants</CardTitle>
          <p className="text-xs text-muted">Notices and messages go to the people listed here.</p>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          {!residents.ok ? (
            <div className="px-5">
              <LoadFailed what="residents" />
            </div>
          ) : people.residents.length === 0 && people.leaseTenants.length === 0 ? (
            <div className="px-5">
              <EmptyState
                variant="compact"
                icon={<Users aria-hidden />}
                title="Nobody listed as living here"
                description="Add the owners, tenants and family living here so notices and messages reach the right people."
                action={<AddResidentForm propertyId={propertyId} />}
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {people.residents.map((r) => (
                <ResidentRow key={r.id} resident={r} selfUpdatedAt={selfUpdates[r.id] ?? null} isAdmin={isAdmin} propertyId={propertyId} unitId={unitId} messageHref={messageHref} />
              ))}
              {people.leaseTenants.map((t) => (
                <li key={t.key} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{t.name ?? t.email ?? 'Unnamed tenant'}</p>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <Badge variant="info" size="sm">
                        Tenant on lease
                      </Badge>
                      <span className="num">
                        {formatDay(t.leaseStart)} – {t.leaseEnd ? formatDay(t.leaseEnd) : 'open-ended'}
                      </span>
                      <span>{t.portal ? 'Portal account' : 'No portal account'}</span>
                    </p>
                  </div>
                  <ContactIcons name={t.name} phone={t.phone} email={t.email} />
                </li>
              ))}
            </ul>
          )}
          {people.movedOut.length > 0 ? (
            <details className="mx-4 mt-2 rounded-lg bg-subtle px-3.5 py-2 text-sm">
              <summary className="cursor-pointer text-muted">{people.movedOut.length} moved out</summary>
              <ul className="mt-1 divide-y divide-border">
                {people.movedOut.map((r) => (
                  <ResidentRow key={r.id} resident={r} isAdmin={isAdmin} propertyId={propertyId} unitId={unitId} />
                ))}
              </ul>
            </details>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function OwnerRow({
  consent,
  owner,
  selfUpdatedAt = null,
  isAdmin,
  canManage,
  propertyId,
  unitId,
}: {
  consent?: ReadonlyMap<string, ConsentState> | 'failed'
  owner: Owner
  selfUpdatedAt?: string | null
  isAdmin: boolean
  canManage: boolean
  propertyId: string
  unitId: string | null
}) {
  return (
    <li className="flex flex-col gap-2 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
          <span className="truncate">{owner.name ?? owner.email ?? 'Unnamed owner'}</span>
          {owner.primary ? (
            <Badge variant="outline" size="sm">
              Primary
            </Badge>
          ) : null}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          {owner.pct !== null ? <span className="num">{owner.pct}%</span> : null}
          {owner.since ? <span className="num">Since {formatDay(owner.since)}</span> : null}
          {owner.portal === true ? <span>Portal account</span> : owner.portal === false ? <span>No portal account</span> : null}
          {owner.email ? <span className="hidden truncate sm:inline">{owner.email}</span> : null}
          {selfUpdatedAt ? <span>Updated by owner on {formatDay(selfUpdatedAt)}</span> : null}
        </p>
        {/* BL-020 (M1): only an owner with a portal account can hold consent. */}
        {consent instanceof Map && canManage && owner.userId ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <ConsentStatus state={consent.get(owner.userId) ?? null} />
            <RecordConsentDialog
              userId={owner.userId}
              memberName={owner.name ?? owner.email ?? 'this owner'}
              currentlyGranted={consent.get(owner.userId)?.granted === true}
              revalidate={propertyHref(asPropertyId(propertyId))}
              size="xs"
            />
          </div>
        ) : null}
      </div>
      <div className="-ml-2 flex shrink-0 flex-wrap items-center gap-1 sm:ml-0">
        <ContactIcons name={owner.name} phone={owner.phone} email={owner.email} />
        {canManage && owner.source === 'ownership' && owner.portal === false && owner.email ? (
          <InviteToPortalButton propertyId={propertyId} name={owner.name} email={owner.email} variant="ghost" />
        ) : null}
        {isAdmin && owner.email ? (
          <EnterPortalButton email={owner.email} name={owner.name} propertyId={propertyId} unitId={unitId} variant="ghost" />
        ) : null}
      </div>
    </li>
  )
}

// ─── Money ───────────────────────────────────────────────────────────

const DUES_STATUS = {
  tones: { open: 'warning', partial: 'warning', paid: 'success', waived: 'neutral', written_off: 'neutral' } as const,
  labels: { open: 'Open', partial: 'Partial', paid: 'Paid', waived: 'Waived', written_off: 'Written off' },
}
const PLAN_STATUS = {
  tones: { proposed: 'info', active: 'brand', completed: 'success', defaulted: 'danger', cancelled: 'neutral' } as const,
  labels: { proposed: 'Proposed', active: 'Active', completed: 'Completed', defaulted: 'Defaulted', cancelled: 'Cancelled' },
}
const AGING_ORDER: AgingBucket[] = ['current', '1-30', '31-60', '61-90', '90+']

type PlanRow = Extract<Property360['plans'], { ok: true }>['data'][number]
type Standings = Part<Record<string, PlanStandingView>>

/** The Payment plan tile, given the standings read (or none). */
function PlanKpi({ plan, standings, failed }: { plan: PlanRow | null; standings: Standings | undefined; failed: boolean }) {
  // BL-080: behind / on track / completed on a day — only when it was read.
  const planStanding = plan && standings?.ok ? describePlanStanding(standings.data[plan.id], plan) : null
  return (
    <Kpi
      label="Payment plan"
      state={failed ? 'failed' : 'ready'}
      value={
        planStanding && plan?.status === 'active' ? (
          <span className={planStanding.tone === 'danger' ? 'text-danger' : undefined}>{planStanding.label}</span>
        ) : plan ? (
          PLAN_STATUS.labels[plan.status as keyof typeof PLAN_STATUS.labels] ?? plan.status
        ) : (
          'None'
        )
      }
      hint={
        planStanding
          ? planStanding.detail
          : plan
            ? `${plan.installment_count} × ${usd(Number(plan.installment_amount))} from ${formatDay(plan.start_date)}`
            : 'No plan on file'
      }
      href={plan ? '/accounting/payment-plans' : undefined}
      linkAs={plan ? Link : undefined}
    />
  )
}

/** BL-099: the same tile once the page's standings read resolves. */
async function StreamedPlanKpi({ plan, standings }: { plan: PlanRow; standings: Promise<Standings> }) {
  return <PlanKpi plan={plan} standings={await standings} failed={false} />
}

function MoneySection({
  data,
  planStandings,
  aging,
  today,
  unitId,
  canManage,
  duesHref,
  letterHref,
  gaThreshold,
  gaComplaints,
}: {
  data: Property360
  planStandings: Promise<Standings> | null
  aging: ReturnType<typeof agingBuckets> | null
  today: string
  unitId: string | null
  /** Board or admin: may change a case's status (the action gates again). */
  canManage: boolean
  duesHref: string
  /** BL-089: the collections letter page; null when the viewer isn't board/admin. */
  letterHref: string | null
  /** BL-158: the Georgia threshold read; null when the viewer isn't board/admin. */
  gaThreshold: GaThresholdRead | null
  /** BL-161: the Georgia complaint record read; null when the viewer isn't board/admin. */
  gaComplaints: GaComplaintRead | null
}) {
  const canApplyCredit = letterHref !== null
  const stats = data.stats
  const lastPayment = data.payments?.ok ? (data.payments.data[0] ?? null) : null
  const plan = data.plans?.ok ? (data.plans.data.find((x) => x.status === 'active' || x.status === 'proposed') ?? data.plans.data[0] ?? null) : null
  const openCase = data.collections?.ok ? data.collections.data.openCase : null
  const unlinked = data.unit.ok && data.unit.data.unitId === null

  if (unlinked) {
    return (
      <p className="rounded-lg bg-subtle px-3.5 py-2.5 text-sm text-muted">
        This home isn’t linked to a unit record, so it has no dues ledger yet. Dues, payments and collections attach to the unit.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="cq">
      <div className="grid grid-cols-2 gap-3 cq-md:grid-cols-4">
        <Kpi
          label="Balance"
          state={stats.ok ? 'ready' : 'failed'}
          value={stats.ok ? usd(stats.data?.balance ?? 0) : undefined}
          hint={stats.ok && stats.data && stats.data.balance > 0 ? (stats.data.daysOverdue > 0 ? `${stats.data.daysOverdue} days overdue` : 'Not yet due') : 'Nothing owed'}
          href={duesHref}
          linkAs={Link}
        />
        <Kpi
          label="Last payment"
          state={data.payments === null || data.payments.ok ? 'ready' : 'failed'}
          value={lastPayment ? usd(Number(lastPayment.amount)) : 'None'}
          hint={lastPayment ? formatStamp(lastPayment.paid_at) : 'No payment on file'}
        />
        {plan && data.planStandings === undefined && planStandings ? (
          <Suspense fallback={<Kpi label="Payment plan" state="loading" />}>
            <StreamedPlanKpi plan={plan} standings={planStandings} />
          </Suspense>
        ) : (
          <PlanKpi plan={plan} standings={data.planStandings} failed={!(data.plans === null || data.plans.ok)} />
        )}
        <Kpi
          label="Collections"
          state={data.collections === null || data.collections.ok ? 'ready' : 'failed'}
          value={openCase ? collectionStatusLabel(openCase.status) : 'No open case'}
          hint={openCase ? `Opened ${formatDay(openCase.openedOn)}` : 'Not in collections'}
        />
      </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h3">Aging</CardTitle>
          <p className="text-xs text-muted">What’s still owed, by how late it is.</p>
        </CardHeader>
        <CardContent>
          {!aging ? (
            <LoadFailed what="open charges" />
          ) : aging.total === 0 ? (
            <p className="text-sm text-muted">Nothing owed — every charge is paid.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
              {AGING_ORDER.map((b) => (
                <div key={b} className="space-y-0.5">
                  <dt className="text-xs font-medium text-muted">{AGING_LABEL[b]}</dt>
                  <dd className={cn('num text-sm font-medium', aging.buckets[b] > 0 && b !== 'current' ? 'text-danger' : 'text-foreground')}>
                    {usd(aging.buckets[b])}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>

      {data.credit && data.credit.ok && data.credit.data.cents > 0 ? (
        <p className="px-1 text-sm" data-testid="unapplied-credit">
          Credit on account: <span className="num font-medium">{usd(data.credit.data.cents / 100)}</span>
          <span className="text-muted"> (money received beyond what was due; not yet applied to a charge)</span>
          {canApplyCredit && data.openAssessments && data.openAssessments.ok ? (
            <span className="ml-2">
              <ApplyCreditButton
                credits={data.credit.data.items}
                charges={data.openAssessments.data
                  .map((a) => ({
                    id: a.id,
                    label: a.assessment_type.replace(/_/g, ' '),
                    dueDate: a.due_date,
                    remainingCents: Math.round(Number(a.amount) * 100) - (a.payments ?? []).reduce((n, p) => n + Math.round(Number(p.amount) * 100), 0),
                  }))
                  .filter((c) => c.remainingCents > 0)}
              />
            </span>
          ) : null}
        </p>
      ) : null}

      <UnitGate part={data.ledger} what="the ledger" unlinked="No unit linked.">
        {(ledger) => (
          <DataTable
            caption="Latest charges"
            showCaption
            density="compact"
            mobile="cards"
            rows={ledger.rows}
            rowKey={(r) => r.id}
            empty={
              <EmptyState
                variant="compact"
                icon={<Wallet aria-hidden />}
                title="No charges yet"
                description="Dues for this home appear here once they’re billed."
                action={
                  <Button asChild size="sm" variant="secondary">
                    <Link href="/dues">Open dues</Link>
                  </Button>
                }
              />
            }
            footer={
              ledger.total !== null && ledger.total > ledger.rows.length ? (
                <p className="px-3 py-2 text-xs text-muted">
                  Latest {ledger.rows.length} of {ledger.total} charges ·{' '}
                  <Link href={duesHref} className="text-primary">
                    See them all
                  </Link>
                </p>
              ) : undefined
            }
            columns={[
              { key: 'due', header: 'Due', mobilePrimary: true, cell: (r) => <span className="num">{formatDay(r.due_date)}</span> },
              { key: 'type', header: 'Type', cell: (r) => <span className="capitalize text-foreground-secondary">{r.assessment_type.replace(/_/g, ' ')}</span> },
              { key: 'amount', header: 'Amount', numeric: true, cell: (r) => usd(Number(r.amount)) },
              { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} tones={DUES_STATUS.tones} labels={DUES_STATUS.labels} size="sm" /> },
            ]}
          />
        )}
      </UnitGate>

      {data.payments?.ok && data.payments.data.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h3">Latest payments</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {data.payments.data.slice(0, LATEST.payments).map((pm) => (
                <li key={pm.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="num text-foreground-secondary">{formatStamp(pm.paid_at)}</span>
                  <span className="capitalize text-muted">{pm.payment_method.replace(/_/g, ' ')}</span>
                  <span className="num font-medium text-foreground">{usd(Number(pm.amount))}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Scale className="size-4 text-muted" aria-hidden />
          Collections file
        </h3>
        {data.collections && !data.collections.ok ? (
          <LoadFailed what="the collections file" />
        ) : (
          <CollectionsSection
            unitId={unitId}
            openCase={data.collections?.ok ? data.collections.data.openCase : null}
            events={data.collections?.ok ? data.collections.data.events : []}
            closedCases={data.collections?.ok ? data.collections.data.closed : []}
            today={today}
            canChangeStatus={canManage}
            letterHref={letterHref}
            gaThreshold={gaThreshold}
            gaComplaints={gaComplaints}
          />
        )}
      </div>
    </div>
  )
}

// ─── Compliance ──────────────────────────────────────────────────────

const VIOLATIONS_SHOWN = 10

function ComplianceSection({
  violations,
  arc,
  now,
  violationsHref,
  letterHistory,
}: {
  violations: Property360['violations']
  arc: Property360['arc']
  now: Date
  violationsHref: string
  letterHistory: LoadResult<LetterHistoryPage> | null
}) {
  return (
    <div className="space-y-4">
      {!violations.ok ? (
        <LoadFailed what="this home’s violations" />
      ) : (
        <ViolationsTable all={sortByUrgency(violations.data, now)} now={now} violationsHref={violationsHref} />
      )}

      {letterHistory ? <LetterHistoryCard history={letterHistory} violationsHref={violationsHref} /> : null}

      <Card>
        <CardHeader>
          <CardTitle as="h3">ARC requests</CardTitle>
          <p className="text-xs text-muted">Architectural changes the owner asked to make.</p>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <div className="px-5">
            <UnitGate part={arc} what="ARC requests" unlinked="ARC requests attach to the unit, and this home has none linked.">
              {(rows) =>
                rows.length === 0 ? (
                  <p className="pb-2 text-sm text-muted">No ARC requests from this home.</p>
                ) : null
              }
            </UnitGate>
          </div>
          {arc?.ok && arc.data.length > 0 ? (
            <ul className="divide-y divide-border">
              {[...arc.data]
                .sort((a, b) => Number(OPEN_ARC.has(b.status)) - Number(OPEN_ARC.has(a.status)) || b.submitted_at.localeCompare(a.submitted_at))
                .map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/arc/${a.id}`}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5 text-sm no-underline transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground">{a.summary}</span>
                        <span className="num text-xs text-muted">
                          {ARC_CATEGORY[a.category] ?? a.category} · submitted {formatStamp(a.submitted_at)}
                        </span>
                      </span>
                      <StatusBadge status={a.status} tones={ARC_STATUS.tones} labels={ARC_STATUS.labels} size="sm" />
                    </Link>
                  </li>
                ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function LetterHistoryCard({ history, violationsHref }: { history: LoadResult<LetterHistoryPage>; violationsHref: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h3">Letter history</CardTitle>
        <p className="text-xs text-muted">Notices sent for this home, newest first. Open a violation to read the letter.</p>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        {!history.ok ? (
          <div className="px-5">
            <LoadFailed what="this home’s letters" />
          </div>
        ) : history.data.rows.length === 0 ? (
          <p className="px-5 pb-2 text-sm text-muted">No letters sent for this home yet.</p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {history.data.rows.slice(0, LETTER_HISTORY_SHOWN).map((r) => (
                <li key={r.key}>
                  <Link
                    href={r.href}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5 text-sm no-underline transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">{r.stepLabel}</span>
                      <span className="num block truncate text-xs text-muted">
                        {r.title} · {formatStamp(r.date)}
                      </span>
                    </span>
                    <StatusPill tone={r.approved ? 'success' : 'neutral'} label={r.approved ? 'Approved' : 'Not approved'} size="sm" />
                  </Link>
                </li>
              ))}
            </ul>
            {history.data.hasMore || history.data.total > LETTER_HISTORY_SHOWN ? (
              <p className="px-5 pt-3 text-sm">
                <Link href={violationsHref}>See all on the violations list</Link>
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ViolationsTable({ all, now, violationsHref }: { all: ViolationRow[]; now: Date; violationsHref: string }) {
  const rows = all.slice(0, VIOLATIONS_SHOWN)
  return (
    <DataTable
      caption="Violations at this home, most urgent first"
      showCaption
      density="compact"
      mobile="cards"
      rows={rows}
      rowKey={(v) => v.id}
      empty={
        <EmptyState
          variant="compact"
          icon={<AlertTriangle aria-hidden />}
          title="No violations"
          description="This home has a clean record."
          action={
            <Button asChild size="sm" variant="secondary">
              <Link href={violationsHref.replace('/violations', '/violations/new')}>New violation</Link>
            </Button>
          }
        />
      }
      footer={
        all.length > rows.length ? (
          <p className="px-3 py-2 text-xs text-muted">
            The {rows.length} most urgent of {all.length} ·{' '}
            <Link href={violationsHref} className="text-primary">
              All for this home
            </Link>
          </p>
        ) : undefined
      }
      columns={[
        {
          key: 'description',
          header: 'Violation',
          mobilePrimary: true,
          cell: (v) => (
            <Link href={`/violations/${v.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
              {v.description}
            </Link>
          ),
        },
        {
          key: 'severity',
          header: 'Severity',
          hideBelowLg: true,
          cell: (v) =>
            v.severity ? <StatusBadge status={v.severity} tones={VIOLATION_SEVERITY.tones} labels={VIOLATION_SEVERITY.labels} size="sm" /> : <span className="text-muted">—</span>,
        },
        { key: 'cure', header: 'Cure by', cell: (v) => <CureByCell violation={v} now={now} /> },
        { key: 'status', header: 'Status', cell: (v) => <StatusBadge status={v.status} tones={VIOLATION_STATUS.tones} labels={VIOLATION_STATUS.labels} size="sm" /> },
      ]}
    />
  )
}

function CureByCell({ violation, now }: { violation: ViolationRow; now: Date }) {
  const due = cureBy(violation)
  const state = cureState(violation, now)
  if (!due || state === 'closed') return <span className="text-muted">—</span>
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <time dateTime={due.toISOString()} className={state === 'past' ? 'num font-medium text-danger' : 'num text-foreground-secondary'}>
        {formatStamp(due.toISOString())}
      </time>
      {state === 'past' ? <StatusPill tone="danger" size="sm" label="Past cure" icon={<Clock aria-hidden />} /> : null}
    </span>
  )
}

// ─── Leases ──────────────────────────────────────────────────────────

function LeasesSection({
  data,
  today,
  waiting,
  capInPlace,
  capLoadFailed,
  leasesHref,
}: {
  data: Property360
  today: string
  waiting: ReturnType<typeof waitingPosition>
  capInPlace: boolean
  capLoadFailed: boolean
  leasesHref: string
}) {
  const p = data.property
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 [&>*]:min-w-0">
      <Card>
        <CardHeader actions={<StatusBadge status={p.tenure} tones={TENURE.tones} labels={TENURE.labels} />}>
          <CardTitle as="h3">Tenure</CardTitle>
          <p className="text-xs text-muted">
            {p.tenure_updated_at
              ? `Updated ${formatStamp(p.tenure_updated_at)}`
              : p.tenure === 'unknown'
                ? 'Not recorded yet — set the current state below.'
                : 'Set before changes were tracked; no change date on file.'}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {!data.waitingQueue.ok ? (
            <LoadFailed what="the waiting list" />
          ) : waiting ? (
            <Alert variant="info" title={`On the lease waiting list — #${waiting.position} of ${waiting.of}`}>
              Queued since {formatStamp(waiting.requestedAt)}. <Link href={leasesHref}>Approve or withdraw on Leases</Link>.
            </Alert>
          ) : null}
          {capLoadFailed ? <LoadFailed what="the rental cap" hint="Whether this association has a cap is unknown right now." /> : null}
          <TenureSelector propertyId={p.id} currentTenure={p.tenure} capInPlace={capInPlace} alreadyWaiting={waiting !== null} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h3">Lease</CardTitle>
        </CardHeader>
        <CardContent>
          <UnitGate part={data.tenancies} what="leases" unlinked="Leases attach to the unit, and this home has none linked.">
            {(tenancies) => {
              const lease = currentLease(tenancies, today)
              if (!lease) return <p className="text-sm text-muted">No lease on file for this home.</p>
              const l = lease.lease
              return (
                <div className="space-y-3">
                  <KeyValueList>
                    <KeyValue label={lease.current ? 'Current lease' : 'Last lease'} value={<span className="num">{formatDay(l.lease_start)} – {l.lease_end ? formatDay(l.lease_end) : 'open-ended'}</span>} />
                    <KeyValue label="Tenant" value={l.tenant_name ?? l.tenant_email} />
                    <KeyValue label="Status" value={<span className="capitalize">{l.status}</span>} />
                  </KeyValueList>
                  {tenancies.length > 1 ? <p className="text-xs text-muted">{tenancies.length - 1} earlier {tenancies.length === 2 ? 'lease' : 'leases'} on file.</p> : null}
                </div>
              )
            }}
          </UnitGate>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Communications ──────────────────────────────────────────────────

function CommunicationsSection({ threads, notices, unitFailed }: { threads: Property360['threads']; notices: Property360['notices']; unitFailed: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 [&>*]:min-w-0">
      <Card>
        <CardHeader>
          <CardTitle as="h3">Email</CardTitle>
          <p className="text-xs text-muted">Conversations in the HOA mailbox matched to this home.</p>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          {threads === null ? (
            <p className="px-5 pb-2 text-sm text-muted">This home isn’t linked to a unit, so incoming email can’t be matched to it yet.</p>
          ) : !threads.ok ? (
            <div className="px-5">
              <LoadFailed what="email" hint={unitFailed ? undefined : 'You can still check the inbox directly.'} />
            </div>
          ) : threads.data.length === 0 ? (
            <p className="px-5 pb-2 text-sm text-muted">No email from this household yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {threads.data.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/inbox/${t.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm no-underline transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">{t.subject || '(no subject)'}</span>
                      <span className="num text-xs text-muted">{t.lastMessageAt ? formatStamp(t.lastMessageAt) : ''}</span>
                    </span>
                    <StatusBadge status={t.status} tones={INBOX_THREAD_STATUS.tones} labels={INBOX_THREAD_STATUS.labels} size="sm" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h3">Notices sent</CardTitle>
          <p className="text-xs text-muted">Announcements and notices delivered to this home, latest first.</p>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          {notices === null ? (
            <p className="px-5 pb-2 text-sm text-muted">Notices are recorded against the unit, and this home has none linked.</p>
          ) : !notices.ok ? (
            <div className="px-5">
              <LoadFailed what="notices" />
            </div>
          ) : notices.data.length === 0 ? (
            <p className="px-5 pb-2 text-sm text-muted">No notices sent to this home yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {notices.data.map((n) => (
                <li key={n.id}>
                  <Link
                    href={`/communications/${n.communicationId}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm no-underline transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">{n.subject}</span>
                      <span className="num text-xs text-muted">
                        {formatStamp(n.at)} · <span className="uppercase">{n.channel}</span>
                      </span>
                    </span>
                    <Badge variant="neutral" size="sm" className="capitalize">
                      {n.deliveryStatus.replace(/_/g, ' ')}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Activity ────────────────────────────────────────────────────────

const ACTIVITY_ICON: Record<ActivityItem['kind'], React.ComponentType<{ className?: string }>> = {
  history: History,
  note: NotebookPen,
  violation: AlertTriangle,
  arc: Home,
  payment: Wallet,
  mail: Inbox,
  notice: Send,
  collections: Scale,
}

function ActivitySection({ data }: { data: Property360 }) {
  const items = buildTimeline({
    events: data.events.ok ? data.events.data : [],
    violations: data.violations.ok ? data.violations.data : [],
    arc: data.arc?.ok ? data.arc.data : [],
    payments: data.payments?.ok ? data.payments.data : [],
    threads: data.threads?.ok ? data.threads.data : [],
    notices: data.notices?.ok ? data.notices.data : [],
    cases: data.collections?.ok ? [...(data.collections.data.openCase ? [data.collections.data.openCase] : []), ...data.collections.data.closed].map((c) => ({ id: c.id, status: c.status, opened_on: c.openedOn, closed_on: c.closedOn })) : [],
    tenureLabels: TENURE.labels,
  })
  const missing = [
    !data.events.ok && 'record history',
    !data.violations.ok && 'violations',
    data.arc && !data.arc.ok && 'ARC',
    data.payments && !data.payments.ok && 'payments',
    data.threads && !data.threads.ok && 'email',
    data.notices && !data.notices.ok && 'notices',
  ].filter(Boolean) as string[]

  return (
    <div className="space-y-3">
      {missing.length > 0 ? (
        <Alert variant="warning" title="Some activity couldn’t load">
          Not shown: {missing.join(', ')}. Everything else below is complete.
        </Alert>
      ) : null}
      {items.length === 0 ? (
        missing.length > 0 ? null : (
          <EmptyState
            icon={<History aria-hidden />}
            title="Nothing recorded yet"
            description="Payments, violations, ARC requests, email, notices and record changes appear here as they happen."
            action={<LogNoteDialog propertyId={data.property.id} />}
          />
        )
      ) : (
        <Card>
          <CardContent className="pt-5">
            <Timeline label="Activity at this home" items={items.map(timelineItem)} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function timelineItem(item: ActivityItem): TimelineItem {
  const Icon = ACTIVITY_ICON[item.kind] ?? FileText
  return {
    id: item.id,
    title: item.href ? (
      <Link href={item.href} className="text-foreground no-underline hover:text-primary hover:underline">
        {item.title}
      </Link>
    ) : (
      item.title
    ),
    time: <time dateTime={item.at}>{formatStamp(item.at)}</time>,
    icon: <Icon />,
    tone: item.tone,
    body: item.body,
  }
}
