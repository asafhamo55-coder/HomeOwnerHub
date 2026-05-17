'use client'

import { usePathname } from 'next/navigation'
import { Tabs } from '@homeowner-portal/ui'

const ACCOUNTING_TABS = [
  { label: 'Overview', href: '/accounting' },
  { label: 'Ledger', href: '/accounting/ledger' },
  { label: 'Invoices', href: '/accounting/invoices' },
  { label: 'Bank', href: '/accounting/bank' },
  { label: 'Budget', href: '/accounting/budget' },
  { label: 'Recurring', href: '/accounting/recurring' },
  { label: 'Periods', href: '/accounting/periods' },
  { label: 'Reports', href: '/accounting/reports' },
  { label: 'Trial balance', href: '/accounting/trial-balance' },
  { label: 'Payment plans', href: '/accounting/payment-plans' },
  { label: 'Chart of accounts', href: '/accounting/coa' },
]

export function AccountingTabs() {
  const pathname = usePathname()
  return (
    <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <Tabs
        items={ACCOUNTING_TABS}
        currentPath={pathname}
        aria-label="Accounting sections"
        className="flex-nowrap [&_a]:whitespace-nowrap"
      />
    </div>
  )
}
