import Link from 'next/link'
import { ArrowRight, AlertTriangle, ClipboardCheck, Wallet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@homeowner-portal/ui'
import type { DashboardStats } from '@/lib/dashboard/queries'

function currency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

export function PendingApprovalsCard({ count }: { count: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-fg">
          <ClipboardCheck className="h-4 w-4" />
          Action required
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-3xl font-bold text-muted">{count}</p>
          <p className="text-sm text-muted-fg">
            {count === 1 ? 'item needs approval' : 'items need approval'}
          </p>
        </div>
        {count > 0 ? (
          <Link
            href="/violations?filter=pending-approval"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Review now
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <p className="text-xs text-muted-fg">Inbox zero. Nothing waiting on you.</p>
        )}
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-fg">
          <AlertTriangle className="h-4 w-4" />
          Violations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-3">
          <p className="text-3xl font-bold text-muted">{open}</p>
          <p className="text-sm text-muted-fg">open</p>
          {overdue > 0 ? (
            <Badge variant="destructive" size="sm">
              {overdue} overdue
            </Badge>
          ) : null}
        </div>
        <Link
          href="/violations"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          View all
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-fg">
          <Wallet className="h-4 w-4" />
          Dues overdue
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-3xl font-bold text-muted">{currency(amount)}</p>
          <p className="text-sm text-muted-fg">
            {propertiesBehind === 0
              ? 'No properties behind'
              : propertiesBehind === 1
                ? '1 property behind'
                : `${propertiesBehind} properties behind`}
          </p>
        </div>
        <Link
          href="/dues"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          View ledger
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardContent>
    </Card>
  )
}
