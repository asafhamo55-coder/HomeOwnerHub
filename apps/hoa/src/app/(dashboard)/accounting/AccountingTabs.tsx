'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Tabs } from '@homeowner-portal/ui'

// Ordered by how often a treasurer opens them: day-to-day books first,
// period-end and setup last.
const ACCOUNTING_TABS = [
  { label: 'Overview', href: '/accounting' },
  { label: 'Ledger', href: '/accounting/ledger' },
  { label: 'Invoices', href: '/accounting/invoices' },
  { label: 'Bank', href: '/accounting/bank' },
  { label: 'Reports', href: '/accounting/reports' },
  { label: 'Budgets', href: '/accounting/budget' },
  { label: 'Trial balance', href: '/accounting/trial-balance' },
  { label: 'Payment plans', href: '/accounting/payment-plans' },
  { label: 'Recurring', href: '/accounting/recurring' },
  { label: 'Periods', href: '/accounting/periods' },
  { label: 'Accounts', href: '/accounting/coa' },
  { label: 'Opening balances', href: '/accounting/opening-balances' },
]

/**
 * Section nav for the accounting area, rendered by each top-level
 * accounting page as `<Page tabs>` (under the title, where v2 puts it).
 * Detail and form pages use breadcrumbs instead.
 *
 * "Overview" is matched exactly: Tabs' prefix rule would otherwise mark
 * /accounting active on every /accounting/* page, which it did.
 */
export function AccountingTabs() {
  const pathname = usePathname() ?? ''
  const items = ACCOUNTING_TABS.map((t) => ({
    ...t,
    active:
      t.href === '/accounting'
        ? pathname === '/accounting'
        : pathname === t.href || pathname.startsWith(`${t.href}/`),
  }))
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <Tabs
        items={items}
        linkAs={Link}
        aria-label="Accounting sections"
        className="flex-nowrap [&_a]:whitespace-nowrap"
      />
    </div>
  )
}
