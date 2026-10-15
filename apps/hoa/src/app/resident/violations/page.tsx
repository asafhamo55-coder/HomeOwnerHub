import Link from 'next/link'
import { Plus, ShieldAlert } from 'lucide-react'
import { format } from 'date-fns'
import { Button, LoadFailed } from '@homeowner-portal/ui'
import { loadMyViolationReports } from '@/lib/resident-submissions'
import { RowGroup, ScreenEmpty, ScreenHeader, TappableRow } from '@/components/resident/screen'
import { REPORT_CATEGORY_LABEL, ResidentStatus } from '@/components/resident/status'

export const metadata = { title: 'Reported concerns' }
export const dynamic = 'force-dynamic'

export default async function MyViolationReportsPage() {
  const result = await loadMyViolationReports()

  return (
    <div className="space-y-6">
      <ScreenHeader
        back={{ href: '/resident/requests', label: 'Requests' }}
        title="Reported concerns"
        subtitle="Concerns you've reported and what the board decided."
        action={
          <Button asChild size="sm">
            <Link href="/resident/report-violation">
              <Plus aria-hidden />
              New
            </Link>
          </Button>
        }
      />

      {!result.ok ? (
        <LoadFailed what="your reported concerns" />
      ) : result.data.length === 0 ? (
        <ScreenEmpty
          icon={<ShieldAlert />}
          tone="amber"
          title="No concerns reported"
          description="When you report a possible rule violation or community issue, you can follow what the board decides here."
          action={
            <Button asChild>
              <Link href="/resident/report-violation">
                <Plus aria-hidden />
                Report a concern
              </Link>
            </Button>
          }
        />
      ) : (
        <RowGroup>
          {result.data.map((r) => (
            <TappableRow
              key={r.id}
              href={`/resident/violations/${r.id}`}
              icon={<ShieldAlert />}
              tone="amber"
              title={`${REPORT_CATEGORY_LABEL[r.category] ?? r.category}${r.about_address ? ` · ${r.about_address}` : ''}`}
              subtitle={`Reported ${format(new Date(r.submitted_at), 'PP')}`}
              status={<ResidentStatus kind="report" status={r.status} />}
            />
          ))}
        </RowGroup>
      )}
    </div>
  )
}
