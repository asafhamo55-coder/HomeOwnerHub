import Link from 'next/link'
import { Clock } from 'lucide-react'
import { Breadcrumbs, StatusBadge, StatusPill, Tabs, cn } from '@homeowner-portal/ui'
import { TENURE } from '@/lib/status/community'

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
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

/** One cell of the stat strip. `value === null` means the read failed. */
function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: React.ReactNode | null
  hint?: React.ReactNode
  tone?: 'danger' | 'warning'
}) {
  return (
    <div className="min-w-0 bg-surface px-4 py-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      {value === null ? (
        <>
          <p className="num text-lg font-semibold text-muted" aria-hidden>
            —
          </p>
          <p className="text-xs font-medium text-danger">Couldn’t load</p>
        </>
      ) : (
        <>
          <p
            className={cn(
              'num text-lg font-semibold text-foreground',
              tone === 'danger' && 'text-danger',
              tone === 'warning' && 'text-warning',
            )}
          >
            {value}
          </p>
          {hint ? <p className="truncate text-xs text-muted">{hint}</p> : null}
        </>
      )}
    </div>
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
  /** The list this property was opened from (filters kept), for the phone breadcrumb. */
  listHref: string
  /** Edit / delete, rendered on the title row. */
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

  const title = unitNumber ? `${address} · ${unitNumber}` : address

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="space-y-3 border-b border-border bg-surface px-4 pb-0 pt-4 sm:px-6">
        {/* The list pane is hidden on phones, so the way back lives here. */}
        <Breadcrumbs
          className="lg:hidden"
          linkAs={Link}
          items={[{ label: 'Properties', href: listHref }, { label: address }]}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="min-w-0 break-words text-2xl font-semibold tracking-[-0.015em] text-foreground">
                {title}
              </h1>
              {tenure ? <StatusBadge status={tenure} tones={TENURE.tones} labels={TENURE.labels} /> : null}
              {onWaitingList ? (
                <StatusPill tone="info" label="On waiting list" icon={<Clock aria-hidden />} />
              ) : null}
            </div>
            <p className="text-sm text-muted">
              {[ownerName ?? 'No owner on file', ownerEmail, ownerPhone].filter(Boolean).join(' · ')}
            </p>
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
          <Stat
            label="Balance"
            value={stats ? (stats.balance > 0 ? money(stats.balance) : '$0.00') : null}
            hint={stats && stats.daysOverdue > 0 ? `${stats.daysOverdue} days overdue` : 'Current'}
            tone={stats && stats.balance > 0 && stats.daysOverdue > 0 ? 'danger' : undefined}
          />
          <Stat
            label="Open violations"
            value={stats ? stats.openViolations : null}
            hint={stats && stats.violationsPastCure > 0 ? `${stats.violationsPastCure} past cure` : 'None past cure'}
            tone={stats && stats.violationsPastCure > 0 ? 'danger' : undefined}
          />
          <Stat label="Residents" value={stats ? stats.residents : null} hint="on file" />
          <Stat
            label="Unread mail"
            value={stats ? stats.threadsNeedingReply : null}
            hint={stats && stats.threadsNeedingReply > 0 ? 'awaiting reply' : 'nothing waiting'}
            tone={stats && stats.threadsNeedingReply > 0 ? 'warning' : undefined}
          />
        </div>

        <Tabs items={items} aria-label="Property sections" linkAs={Link} className="border-b-0" />
      </div>

      <div className="flex-1 px-4 py-5 sm:px-6">{children}</div>
    </div>
  )
}
