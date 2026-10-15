import Link from 'next/link'
import { Tabs } from '@homeowner-portal/ui'

const VENDOR_TABS = [
  { label: 'Vendors', href: '/vendors' },
  { label: 'Invitations', href: '/vendors/invitations' },
  { label: 'Approval queue', href: '/vendors/approval-queue' },
  { label: 'RFPs', href: '/rfps' },
]

/** Section sub-nav shared by the vendor list pages and the RFP list. */
export function VendorTabs({ current }: { current: string }) {
  return (
    <Tabs
      items={VENDOR_TABS.map((t) => ({ ...t, active: t.href === current }))}
      aria-label="Vendor sections"
      linkAs={Link}
    />
  )
}
