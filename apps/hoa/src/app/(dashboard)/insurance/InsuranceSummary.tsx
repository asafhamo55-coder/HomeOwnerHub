import Link from 'next/link'
import { FilterChips } from '@homeowner-portal/ui'
import { SummaryStrip } from '@/components/SummaryStrip'
import { EXPIRING_LABEL, type InsuranceCounts, type InsuranceStatus } from '@/lib/insurance/status-filter'

const HREF: Record<InsuranceStatus | 'all', string> = {
  all: '/insurance',
  active: '/insurance?status=active',
  expiring: '/insurance?status=expiring',
  expired: '/insurance?status=expired',
  missing: '/insurance?status=missing',
}

/** Count tiles plus filter chips for ?status=. Both link to the same filtered list. */
export function InsuranceSummary({ counts, status, total }: { counts: InsuranceCounts; status: InsuranceStatus | null; total: number }) {
  return (
    <>
      <SummaryStrip
        ariaLabel="Insurance summary"
        testId="insurance-summary"
        tiles={[
          { label: 'Active', value: String(counts.active), hint: 'In force today', href: HREF.active },
          { label: EXPIRING_LABEL, value: String(counts.expiring), hint: 'Not yet renewed', href: HREF.expiring, tone: counts.expiring > 0 ? 'warning' : 'default' },
          { label: 'Expired', value: String(counts.expired), hint: 'Past the end date, not renewed', href: HREF.expired, tone: counts.expired > 0 ? 'danger' : 'default' },
          { label: 'Missing required kinds', value: String(counts.missing), hint: 'From the coverage check', href: HREF.missing, tone: counts.missing > 0 ? 'danger' : 'default' },
        ]}
      />
      <FilterChips
        label="Filter policies by status"
        linkAs={Link}
        items={[
          { label: 'All', href: HREF.all, active: status === null, count: total },
          { label: 'Active', href: HREF.active, active: status === 'active', count: counts.active },
          { label: EXPIRING_LABEL, href: HREF.expiring, active: status === 'expiring', count: counts.expiring },
          { label: 'Expired', href: HREF.expired, active: status === 'expired', count: counts.expired },
          { label: 'Missing kinds', href: HREF.missing, active: status === 'missing', count: counts.missing },
        ]}
      />
    </>
  )
}
