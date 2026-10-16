import Link from 'next/link'
import { Tabs } from '@homeowner-portal/ui'

/** Balance / Ledger sub-navigation on the resident Dues screens (URL tabs). */
export function DuesTabs({ current }: { current: 'balance' | 'ledger' }) {
  return (
    <Tabs
      aria-label="Dues sections"
      linkAs={Link}
      className="print:hidden"
      items={[
        { label: 'Balance', href: '/resident/dues', active: current === 'balance' },
        { label: 'Ledger', href: '/resident/dues/ledger', active: current === 'ledger' },
      ]}
    />
  )
}
