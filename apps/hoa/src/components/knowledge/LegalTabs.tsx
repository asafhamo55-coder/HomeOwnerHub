import Link from 'next/link'
import { Tabs } from '@homeowner-portal/ui'

const ITEMS = [
  { label: 'Overview', href: '/legal' },
  { label: 'Statutes', href: '/legal/browse' },
  { label: 'Law updates', href: '/legal/updates' },
]

/** Sub-navigation shared by the State law section's list pages. */
export function LegalTabs({ current }: { current: '/legal' | '/legal/browse' | '/legal/updates' }) {
  return <Tabs items={ITEMS.map((i) => ({ ...i, active: i.href === current }))} linkAs={Link} aria-label="State law sections" />
}
