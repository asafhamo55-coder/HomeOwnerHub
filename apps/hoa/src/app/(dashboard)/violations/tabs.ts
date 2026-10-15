/**
 * Sub-nav shared by /violations, /violations/reports and
 * /violations/approval-queue. Active state is explicit: Tabs' prefix match
 * would otherwise light up "All violations" on every sibling page too.
 */
const TABS = [
  { label: 'All violations', href: '/violations' },
  { label: 'Resident reports', href: '/violations/reports' },
  { label: 'AI approval queue', href: '/violations/approval-queue' },
]

export function violationTabs(current: string) {
  return TABS.map((t) => ({ ...t, active: t.href === current }))
}
