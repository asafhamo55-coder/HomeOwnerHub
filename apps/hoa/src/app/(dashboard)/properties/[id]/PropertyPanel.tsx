import { Badge, StatCard, Tabs } from '@homeowner-portal/ui'

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

export function PropertyPanel({
  propertyId,
  address,
  unitNumber,
  ownerName,
  ownerEmail,
  ownerPhone,
  tenure,
  stats,
  currentTab,
  query,
  children,
}: {
  propertyId: string
  address: string
  unitNumber: string | null
  ownerName: string | null
  ownerEmail: string | null
  ownerPhone: string | null
  tenure: string | null
  stats: PanelStats
  currentTab: PanelTab
  query: string
  children: React.ReactNode
}) {
  // `Tabs` renders plain <a> elements and matches on pathname, so the active
  // tab is passed explicitly — our tabs differ only by query string.
  const items = TABS.map((t) => ({
    label: LABELS[t],
    href: `/properties/${propertyId}?${new URLSearchParams({
      ...Object.fromEntries(new URLSearchParams(query)),
      tab: t,
    })}`,
    active: t === currentTab,
    badge:
      t === 'violations'
        ? stats.openViolations || null
        : t === 'mail'
          ? stats.threadsNeedingReply || null
          : t === 'residents'
            ? stats.residents || null
            : null,
  }))

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-base font-semibold text-foreground">{address}</h1>
          {unitNumber ? <span className="text-sm text-muted">Unit {unitNumber}</span> : null}
          {tenure ? (
            <Badge variant={tenure === 'leased' ? 'warning' : tenure === 'owner_occupied' ? 'success' : 'neutral'} size="sm">
              {tenure.replace(/_/g, '-')}
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {[ownerName ?? 'No owner on file', ownerEmail, ownerPhone].filter(Boolean).join(' · ')}
        </p>
      </div>

      {/* No fills and no rules between the tiles — whitespace separates them.
          An earlier version used `bg-border` + `gap-px` to draw hairlines, but
          StatCard renders a transparent div so the parent colour showed through
          as a grey slab; replacing that with `divide-*` then drew a visible grid
          instead. The single bottom border is kept only to part the strip from
          the tabs beneath it. */}
      <div className="grid grid-cols-2 border-b border-border sm:grid-cols-4">
        <StatCard
          label="Balance"
          value={stats.balance > 0 ? `$${stats.balance.toFixed(2)}` : '$0'}
          meta={stats.daysOverdue > 0 ? `${stats.daysOverdue} days overdue` : 'Current'}
        />
        <StatCard
          label="Open violations"
          value={stats.openViolations}
          meta={stats.violationsPastCure > 0 ? `${stats.violationsPastCure} past cure` : 'None past cure'}
        />
        <StatCard label="Residents" value={stats.residents} meta="on file" />
        <StatCard
          label="Unread mail"
          value={stats.threadsNeedingReply}
          meta={stats.threadsNeedingReply > 0 ? 'awaiting reply' : 'nothing waiting'}
        />
      </div>

      <Tabs items={items} aria-label="Property sections" className="px-2" />

      <div className="flex-1 px-4 py-4">{children}</div>
    </div>
  )
}
