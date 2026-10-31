import Link from 'next/link'
import { ClipboardList, Plus } from 'lucide-react'
import { Button, LoadFailed } from '@homeowner-portal/ui'
import { loadMyArcRequests } from '@/lib/resident-submissions'
import { RowGroup, ScreenEmpty, ScreenHeader, TappableRow } from '@/components/resident/screen'
import { ARC_CATEGORY_LABEL, ResidentStatus } from '@/components/resident/status'
import { formatShortDate } from '@/lib/format-datetime'

export const metadata = { title: 'ARC applications' }
export const dynamic = 'force-dynamic'

export default async function MyArcRequestsPage() {
  const result = await loadMyArcRequests()

  return (
    <div className="space-y-6">
      <ScreenHeader
        back={{ href: '/resident/requests', label: 'Requests' }}
        title="ARC applications"
        subtitle="Exterior changes you've asked the board to approve."
        action={
          <Button asChild size="sm">
            <Link href="/resident/arc/new">
              <Plus aria-hidden />
              New
            </Link>
          </Button>
        }
      />

      {!result.ok ? (
        <LoadFailed what="your ARC applications" />
      ) : result.data.length === 0 ? (
        <ScreenEmpty
          icon={<ClipboardList />}
          tone="emerald"
          title="No applications yet"
          description="Planning a fence, new paint or an addition? Apply here and track the board's decision."
          action={
            <Button asChild>
              <Link href="/resident/arc/new">
                <Plus aria-hidden />
                Start an application
              </Link>
            </Button>
          }
        />
      ) : (
        <RowGroup>
          {result.data.map((r) => (
            <TappableRow
              key={r.id}
              href={`/resident/arc/${r.id}`}
              icon={<ClipboardList />}
              tone="emerald"
              title={r.summary}
              subtitle={`${ARC_CATEGORY_LABEL[r.category] ?? r.category} · submitted ${formatShortDate(r.submitted_at)}`}
              status={<ResidentStatus kind="arc" status={r.status} />}
            />
          ))}
        </RowGroup>
      )}
    </div>
  )
}
