import Link from 'next/link'
import { Plus, ShieldAlert } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Button } from '@homeowner-portal/ui'
import { listMyViolationReports } from '@/lib/resident-submissions'
import { ScreenEmpty, ScreenHeader, TappableRow } from '@/components/resident/screen'

export const metadata = { title: 'My reported concerns' }
export const dynamic = 'force-dynamic'

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
    <div className="space-y-6">
      <ScreenHeader
        title="Reported concerns"
        subtitle="Concerns you've reported and their current status."
        action={
          <Button asChild size="sm">
            <Link href="/resident/report-violation">
              <Plus className="h-4 w-4" />
              New
            </Link>
          </Button>
        }
      />

      {reports.length === 0 ? (
        <ScreenEmpty
          icon={<ShieldAlert className="h-6 w-6" />}
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
        <div className="space-y-2.5">
          {reports.map((r) => (
            <TappableRow
              key={r.id}
              href={`/resident/violations/${r.id}`}
              icon={<ShieldAlert className="h-5 w-5" />}
              tone="amber"
              title={`${CATEGORY_LABEL[r.category] ?? r.category}${r.about_address ? ` · ${r.about_address}` : ''}`}
              subtitle={`Reported ${format(new Date(r.submitted_at), 'PP')}`}
              trailing={
                <Badge variant={STATUS_VARIANT[r.status] ?? 'outline'} size="sm">
                  {STATUS_LABEL[r.status] ?? r.status.replace(/_/g, ' ')}
                </Badge>
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
