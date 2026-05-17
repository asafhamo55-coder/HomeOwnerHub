import { AlertTriangle, ClipboardCheck, Wallet } from 'lucide-react'
import { Badge, StatCard } from '@homeowner-portal/ui'

function currency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

export function PendingApprovalsCard({ count }: { count: number }) {
  return (
    <StatCard
      icon={<ClipboardCheck className="h-4 w-4" />}
      label="Action required"
      value={count}
      meta={count === 1 ? 'item needs approval' : 'items need approval'}
      href="/violations?filter=pending-approval"
      cta={count > 0 ? 'Review now →' : undefined}
      emptyState={count === 0 ? 'Inbox zero. Nothing waiting on you.' : null}
    />
  )
}

export function ViolationSummaryCard({
  open,
  overdue,
}: {
  open: number
  overdue: number
}) {
  return (
    <StatCard
      icon={<AlertTriangle className="h-4 w-4" />}
      label="Violations"
      value={open}
      meta="open"
      valueExtra={
        overdue > 0 ? (
          <Badge variant="destructive" size="sm">
            {overdue} overdue
          </Badge>
        ) : null
      }
      href="/violations"
      cta="View all →"
    />
  )
}

export function DuesOverviewCard({
  amount,
  propertiesBehind,
}: {
  amount: number
  propertiesBehind: number
}) {
  return (
    <StatCard
      icon={<Wallet className="h-4 w-4" />}
      label="Dues overdue"
      value={currency(amount)}
      meta={
        propertiesBehind === 0
          ? 'No properties behind'
          : propertiesBehind === 1
            ? '1 property behind'
            : `${propertiesBehind} properties behind`
      }
      href="/dues"
      cta="View ledger →"
    />
  )
}
