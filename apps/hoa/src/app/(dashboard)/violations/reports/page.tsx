import Link from 'next/link'
import { Megaphone } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Card, EmptyState } from '@homeowner-portal/ui'
import {
  listResidentViolationReportsForBoard,
  type ViolationReportStatus,
} from '@/lib/board-review'

export const metadata = { title: 'Resident violation reports' }

const STATUS_VARIANT: Record<ViolationReportStatus, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
  submitted: 'warning',
  under_review: 'warning',
  opened_as_violation: 'destructive',
  closed_no_action: 'outline',
  dismissed: 'outline',
}

const CATEGORY_LABEL: Record<string, string> = {
  parking: 'Parking',
  pet: 'Pet',
  noise: 'Noise',
  lawn_landscape: 'Lawn / landscape',
  trash: 'Trash',
  architectural: 'Architectural',
  rental: 'Rental',
  nuisance: 'Nuisance',
  other: 'Other',
}

export default async function ViolationReportsListPage() {
  const reports = await listResidentViolationReportsForBoard()
  const pending = reports.filter(
    (r) => r.status === 'submitted' || r.status === 'under_review',
  ).length

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Resident violation reports</h1>
        <p className="text-sm text-muted">
          Concerns submitted by residents. {pending} awaiting decision ·{' '}
          {reports.length} total. The reporter's identity is shown to you but
          should not be shared with other residents per Policy Section 12.03.
        </p>
      </header>

      {reports.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-10 w-10" aria-hidden />}
          title="No reports yet"
          description="When a resident submits a concern from their portal, it lands here for board review."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {reports.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/violations/reports/${r.id}`}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-foreground/5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {r.about_address ?? '(no address)'}
                    </p>
                    <p className="text-xs text-muted">
                      {CATEGORY_LABEL[r.category] ?? r.category}
                      {' · submitted '}
                      {format(new Date(r.submitted_at), 'PP')}
                      {r.occurred_at
                        ? ` · occurred ${format(new Date(r.occurred_at), 'PPp')}`
                        : ''}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[r.status]} size="sm">
                    {r.status.replace(/_/g, ' ')}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
