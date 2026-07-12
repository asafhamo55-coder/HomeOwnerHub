import Link from 'next/link'
import { ClipboardList, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Button } from '@homeowner-portal/ui'
import { listMyArcRequests, type ArcStatus } from '@/lib/resident-submissions'
import { ScreenEmpty, ScreenHeader, TappableRow } from '@/components/resident/screen'

export const metadata = { title: 'My ARC applications' }
export const dynamic = 'force-dynamic'

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
    <div className="space-y-6">
      <ScreenHeader
        title="ARC applications"
        subtitle="Your architectural requests and the board's responses."
        action={
          <Button asChild size="sm">
            <Link href="/resident/arc/new">
              <Plus className="h-4 w-4" />
              New
            </Link>
          </Button>
        }
      />

      {requests.length === 0 ? (
        <ScreenEmpty
          icon={<ClipboardList className="h-6 w-6" />}
          title="No applications yet"
          description="When you request approval for an exterior change, it will appear here with its current status."
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
        <div className="space-y-2.5">
          {requests.map((r) => (
            <TappableRow
              key={r.id}
              href={`/resident/arc/${r.id}`}
              icon={<ClipboardList className="h-5 w-5" />}
              title={r.summary}
              subtitle={`${CATEGORY_LABEL[r.category] ?? r.category} · submitted ${format(new Date(r.submitted_at), 'PP')}`}
              trailing={
                <Badge variant={STATUS_VARIANT[r.status]} size="sm">
                  {r.status.replace('_', ' ')}
                </Badge>
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
