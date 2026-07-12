import Link from 'next/link'
import { ClipboardList, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Button, Card, EmptyState, PageHeader } from '@homeowner-portal/ui'
import { listMyArcRequests, type ArcStatus } from '@/lib/resident-submissions'

export const metadata = { title: 'My ARC applications' }

const STATUS_VARIANT: Record<ArcStatus, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
  submitted: 'outline',
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

export default async function MyArcRequestsPage() {
  const requests = await listMyArcRequests()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="My ARC applications"
        description="Your architectural review requests and the board's responses."
        actions={
          <Button asChild>
            <Link href="/resident/arc/new">
              <Plus className="h-4 w-4" />
              New application
            </Link>
          </Button>
        }
      />

      {requests.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-10 w-10" aria-hidden />}
          title="No applications yet"
          description="When you submit an application for an exterior change, it will appear here with its current status."
          action={
            <Button asChild>
              <Link href="/resident/arc/new">
                <Plus className="h-4 w-4" />
                Submit your first application
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {requests.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/resident/arc/${r.id}`}
                  className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 hover:bg-foreground/5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{r.summary}</p>
                    <p className="text-xs text-muted">
                      {CATEGORY_LABEL[r.category] ?? r.category}
                      {' · submitted '}
                      {format(new Date(r.submitted_at), 'PP')}
                    </p>
                    {r.board_response ? (
                      <p className="mt-1 text-sm">
                        <span className="font-semibold">Board response:</span>{' '}
                        {r.board_response}
                      </p>
                    ) : null}
                  </div>
                  <Badge variant={STATUS_VARIANT[r.status]} size="sm">
                    {r.status.replace('_', ' ')}
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
