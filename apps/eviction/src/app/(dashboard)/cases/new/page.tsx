import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Alert } from '@homeownerhub/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { Wizard } from './Wizard'

export const metadata = { title: 'New case' }

interface SearchParams {
  address?: string
  rent?: string
  tenant?: string
  days_unpaid?: string
  from?: string
}

export default async function NewCasePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const org = await getCurrentOrg()
  if (!org) return null

  const params = await searchParams

  // Pre-fill from a sibling-hub handoff (PM Hub → Start Eviction). All
  // params are optional; the wizard uses its own defaults when absent.
  const initial = {
    propertyAddress: params.address ?? '',
    tenantName: params.tenant ?? '',
    monthlyRent: params.rent ? Number(params.rent) || 1500 : undefined,
    daysUnpaid: params.days_unpaid ? Number(params.days_unpaid) || 0 : undefined,
  }
  const handoffSource = params.from === 'pm-hub' ? 'PM Hub' : null

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-fg hover:text-muted"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to cases
      </Link>

      {handoffSource ? (
        <Alert variant="info" title={`Pre-filled from ${handoffSource}`}>
          Address, tenant, rent, and days unpaid came over from {handoffSource}. Verify and edit
          anything that&apos;s wrong before running the compliance check.
        </Alert>
      ) : null}

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Open a new case</CardTitle>
        </CardHeader>
        <CardContent>
          <Wizard workspaceName={org.name} initial={initial} />
        </CardContent>
      </Card>
    </div>
  )
}
