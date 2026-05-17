import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Alert } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { loadDraft } from '@/lib/drafts'
import { Wizard } from './Wizard'

export const metadata = { title: 'New case' }

interface SearchParams {
  address?: string
  rent?: string
  tenant?: string
  days_unpaid?: string
  from?: string
  draft?: string
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

  // Resume an existing draft if ?draft= is set.
  const initialDraft = params.draft ? await loadDraft(params.draft) : null
  const usableDraft =
    initialDraft && initialDraft.kind === 'eviction_case' && !initialDraft.completed
      ? initialDraft
      : null

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to cases
      </Link>

      {handoffSource && !usableDraft ? (
        <Alert variant="info" title={`Pre-filled from ${handoffSource}`}>
          Address, tenant, rent, and days unpaid came over from {handoffSource}. Verify and edit
          anything that&apos;s wrong before running the compliance check.
        </Alert>
      ) : null}

      {usableDraft ? (
        <Alert variant="info" title="Resumed unfinished draft">
          Your previous intake is restored. The wizard autosaves as you progress; you can close
          the tab any time and pick up again from the dashboard.
        </Alert>
      ) : null}

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>{usableDraft ? 'Resume case' : 'Open a new case'}</CardTitle>
        </CardHeader>
        <CardContent>
          <Wizard
            workspaceName={org.name}
            initial={initial}
            initialDraft={usableDraft}
          />
        </CardContent>
      </Card>
    </div>
  )
}
