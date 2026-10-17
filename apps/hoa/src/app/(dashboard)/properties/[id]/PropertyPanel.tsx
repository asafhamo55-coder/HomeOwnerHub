import Link from 'next/link'
import { Clock } from 'lucide-react'
import { BackLink, StatusBadge, StatusPill, Tabs, cn } from '@homeowner-portal/ui'
import { TENURE } from '@/lib/status/community'
import { streetOf } from '@/lib/properties/severity'
import { ContactLink } from '@/components/contact/ContactLink'
import { ActiveTabIntoView } from './ActiveTabIntoView'

export type PanelTab =
  | 'overview'
  | 'residents'
  | 'mail'
  | 'violations'
  | 'dues'
  | 'collections'
  | 'history'

// Collections sits after Dues because it is what happens when dues go
// unpaid, and before History because History is the whole-property log.
const TABS: readonly PanelTab[] = [
  'overview',
  'residents',
  'mail',
  'violations',
  'dues',
  'collections',
  'history',
]

export function parsePanelTab(raw: string | undefined): PanelTab {
  return TABS.includes(raw as PanelTab) ? (raw as PanelTab) : 'overview'
}

export interface PanelStats {
  balance: number
  daysOverdue: number
  openViolations: number
  violationsPastCure: number
  residents: number
  threadsNeedingReply: number
  /** ARC applications awaiting a decision (submitted / in review).
   *  'unlinked' = no bridged unit, so ARC can't be matched to this home;
   *  null = the count failed. */
  openArc: number | 'unlinked' | null
}

const LABELS: Record<PanelTab, string> = {
  overview: 'Overview',
  residents: 'Residents',
  mail: 'Mail',
  violations: 'Violations',
  dues: 'Dues',
  collections: 'Collections',
  history: 'History',
}

function money(n: number): string {
  // Whole dollars so four tiles fit one row at 375; the tile's title and
  // the Dues tab carry the cents.
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

/** One cell of the stat strip. `value === null` means the read failed. */
function Stat({
  label,
  shortLabel,
  value,
  hint,
  tone,
  href,
  title,
}: {
  label: string
  /** Shown below sm, where four tiles share 375px. */
  shortLabel?: string
  title?: string
  value: React.ReactNode | null
  hint?: React.ReactNode
  tone?: 'danger' | 'warning'
  href?: string
}) {
  const body =
    value === null ? (
      <>
        <p className="num text-base font-semibold text-muted sm:text-lg" aria-hidden>
          —
        </p>
        <p className="truncate text-xs font-medium text-danger">Couldn’t load</p>
      </>
    ) : (
      <>
        <p
          className={cn(
            'num truncate text-base font-semibold text-foreground sm:text-lg',
            tone === 'danger' && 'text-danger',
            tone === 'warning' && 'text-warning',
          )}
        >
          {value}
        </p>
        {/* Hints drop on phones so the four stats fit one row. */}
        {hint ? <p className="hidden truncate text-xs text-muted sm:block">{hint}</p> : null}
      </>
    )
  const inner = (
    <>
      <p className="truncate text-2xs font-medium text-muted sm:text-xs">
        {shortLabel ? (
          <>
            <span className="sm:hidden" aria-hidden>
              {shortLabel}
            </span>
            <span className="sr-only sm:not-sr-only">{label}</span>
          </>
        ) : (
          label
        )}
      </p>
      {body}
    </>
  )
  return href ? (
    <Link
      href={href}
      title={title}
      className="block min-w-0 bg-surface px-2.5 py-2 no-underline transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4 sm:py-3"
    >
      {inner}
    </Link>
  ) : (
    <div title={title} className="min-w-0 bg-surface px-2.5 py-2 sm:px-4 sm:py-3">{inner}</div>
  )
}

export function PropertyPanel({
  propertyId,
  address,
  unitNumber,
  ownerName,
  ownerEmail,
  ownerPhone,
  tenure,
  onWaitingList = false,
  stats,
  currentTab,
  query,
  listHref,
  linkHrefs,
  actions,
  children,
}: {
  propertyId: string
  address: string
  unitNumber: string | null
  ownerName: string | null
  ownerEmail: string | null
  ownerPhone: string | null
  tenure: string | null
  /** Property holds an open lease-waiting-list entry. Shown here as well
   *  as in the Overview tab's Tenure card: this header is sticky across
   *  every tab, and the state would otherwise vanish the moment someone
   *  clicked Mail or Dues. */
  onWaitingList?: boolean
  /** Null when the stat read failed — tiles say so instead of showing zeros. */
  stats: PanelStats | null
  currentTab: PanelTab
  query: string
  /** The list this property was opened from (filters kept), for the phone back link. */
  listHref: string
  /** Where each stat tile goes. */
  linkHrefs: { dues: string; violations: string; arc: string; mail: string }
  /** Edit / overflow menu, rendered on the title row. */
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  // Our tabs differ only by query string, so the active tab is explicit.
  const items = TABS.map((t) => ({
    label: LABELS[t],
    href: `/properties/${propertyId}?${new URLSearchParams({
      ...Object.fromEntries(new URLSearchParams(query)),
      tab: t,
    })}`,
    active: t === currentTab,
    badge: !stats
      ? null
      : t === 'violations'
        ? stats.openViolations || null
        : t === 'mail'
          ? stats.threadsNeedingReply || null
          : t === 'residents'
            ? stats.residents || null
            : null,
  }))

  // Every home in an association shares the city/state/ZIP, so the h1 is
  // the street (and unit); the full line sits under it when it differs.
  const street = streetOf(address)
  const title = unitNumber ? `${street} · ${unitNumber}` : street
  const arc = stats?.openArc

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="space-y-3 bg-surface px-4 pb-3 pt-3 sm:px-6 sm:pt-4">
        {/* The list pane is hidden on phones, so the way back lives here. A
            back link, not a breadcrumb: the trail's last crumb repeated the
            h1 right below it. */}
        <div className="lg:hidden">
          <BackLink href={listHref} label="Properties" linkAs={Link} />
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1
                className="min-w-0 break-words text-xl font-semibold tracking-[-0.015em] text-foreground sm:text-2xl"
                title={address}
              >
                {title}
              </h1>
              {tenure ? <StatusBadge status={tenure} tones={TENURE.tones} labels={TENURE.labels} /> : null}
              {onWaitingList ? (
                <StatusPill tone="info" label="On waiting list" icon={<Clock aria-hidden />} />
              ) : null}
            </div>
            {street !== address ? <p className="truncate text-xs text-muted">{address}</p> : null}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span className={ownerName ? 'text-foreground-secondary' : undefined}>{ownerName ?? 'No owner on file'}</span>
              {ownerEmail ? <ContactLink kind="email" value={ownerEmail} showIcon /> : null}
              {ownerPhone ? <ContactLink kind="phone" value={ownerPhone} showIcon /> : null}
            </div>
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>

        <div className="grid grid-cols-4 gap-px overflow-hidden rounded-xl border border-border bg-border">
          <Stat
            label="Balance"
            value={stats ? (stats.balance > 0 ? money(stats.balance) : '$0') : null}
            hint={stats && stats.daysOverdue > 0 ? `${stats.daysOverdue} days overdue` : 'Current'}
            tone={stats && stats.balance > 0 && stats.daysOverdue > 0 ? 'danger' : undefined}
            href={linkHrefs.dues}
            title={stats ? stats.balance.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : undefined}
          />
          <Stat
            label="Violations"
            value={stats ? stats.openViolations : null}
            hint={stats && stats.violationsPastCure > 0 ? `${stats.violationsPastCure} past cure` : 'None past cure'}
            tone={stats && stats.violationsPastCure > 0 ? 'danger' : undefined}
            href={linkHrefs.violations}
          />
          <Stat
            label="Open ARC"
            value={arc === null || arc === undefined ? null : arc === 'unlinked' ? '—' : arc}
            hint={arc === 'unlinked' ? 'No unit linked' : typeof arc === 'number' && arc > 0 ? 'awaiting a decision' : 'none pending'}
            tone={typeof arc === 'number' && arc > 0 ? 'warning' : undefined}
            href={linkHrefs.arc}
          />
          <Stat
            label="Awaiting reply"
            shortLabel="Replies"
            value={stats ? stats.threadsNeedingReply : null}
            hint={stats && stats.threadsNeedingReply > 0 ? 'in the inbox' : 'nothing waiting'}
            tone={stats && stats.threadsNeedingReply > 0 ? 'warning' : undefined}
            href={linkHrefs.mail}
          />
        </div>
      </div>

      {/* Sticky so the sections stay one tap away on a long tab; the active
          tab is scrolled into view on phones, where the strip overflows. */}
      <div className="sticky top-0 z-10 border-b border-border bg-surface px-4 sm:px-6">
        <Tabs items={items} aria-label="Property sections" linkAs={Link} className="border-b-0" />
        <ActiveTabIntoView />
      </div>

      <div className="flex-1 px-4 py-5 sm:px-6">{children}</div>
    </div>
  )
}
