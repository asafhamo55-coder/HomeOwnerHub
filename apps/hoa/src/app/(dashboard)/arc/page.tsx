import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Card, EmptyState } from '@homeowner-portal/ui'
import { listArcRequestsForBoard, type ArcStatus } from '@/lib/board-review'

export const metadata = { title: 'ARC review' }

const STATUS_VARIANT: Record<ArcStatus, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
  submitted: 'warning',
  in_review: 'warning',
  approved: 'success',
  denied: 'destructive',
  withdrawn: 'outline',
}

const CATEGORY_LABEL: Record<string, string> = {
  paint: 'Paint',
  fence: 'Fence',
  deck_patio: 'Deck / patio',
  roof: 'Roof',
  landscaping: 'Landscaping',
  addition: 'Addition',
  pool: 'Pool / spa',
  solar: 'Solar',
  other: 'Other',
}

export default async function ArcReviewListPage() {
  const requests = await listArcRequestsForBoard()
  const pending = requests.filter((r) => r.status === 'submitted' || r.status === 'in_review').length

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">ARC review</h1>
        <p className="text-sm text-muted">
          Resident-submitted architectural review applications. {pending} pending
          decision · {requests.length} total.
        </p>
      </header>

      {requests.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-10 w-10" aria-hidden />}
          title="No ARC applications yet"
          description="When a resident submits an application from their portal, it lands here for board review."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {requests.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/arc/${r.id}`}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-foreground/5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.summary}</p>
                    <p className="text-xs text-muted">
                      {r.submitter_name ?? r.submitter_email ?? '(unknown submitter)'}
                      {r.unit_number ? ` · unit ${r.unit_number}` : ''}
                      {' · '}
                      {format(new Date(r.submitted_at), 'PP')}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <Badge variant="outline" size="sm">
                      {CATEGORY_LABEL[r.category] ?? r.category}
                    </Badge>
                    <Badge variant={STATUS_VARIANT[r.status]} size="sm">
                      {r.status.replace('_', ' ')}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
