import Link from 'next/link'
import { Plus, ShieldAlert } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Button, Card, EmptyState, PageHeader } from '@homeowner-portal/ui'
import { listMyViolationReports } from '@/lib/resident-submissions'

export const metadata = { title: 'My reported concerns' }

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
  submitted: 'outline',
  under_review: 'warning',
  opened_as_violation: 'default',
  closed_no_action: 'success',
  dismissed: 'outline',
}

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  opened_as_violation: 'Action taken',
  closed_no_action: 'Closed',
  dismissed: 'Dismissed',
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

export default async function MyViolationReportsPage() {
  const reports = await listMyViolationReports()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="My reported concerns"
        description="Concerns you've reported to the board and their current status."
        actions={
          <Button asChild>
            <Link href="/resident/report-violation">
              <Plus className="h-4 w-4" />
              Report a concern
            </Link>
          </Button>
        }
      />

      {reports.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert className="h-10 w-10" aria-hidden />}
          title="No concerns reported"
          description="When you report a possible rule violation or community issue, it will appear here so you can track what the board decides."
          action={
            <Button asChild>
              <Link href="/resident/report-violation">
                <Plus className="h-4 w-4" />
                Report your first concern
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {reports.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/resident/violations/${r.id}`}
                  className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 hover:bg-foreground/5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {CATEGORY_LABEL[r.category] ?? r.category}
                      {r.about_address ? ` · ${r.about_address}` : ''}
                    </p>
                    <p className="text-xs text-muted">
                      Reported {format(new Date(r.submitted_at), 'PP')}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[r.status] ?? 'outline'} size="sm">
                    {STATUS_LABEL[r.status] ?? r.status.replace(/_/g, ' ')}
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
