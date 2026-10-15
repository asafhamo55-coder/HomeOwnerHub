import { Alert, Card, CardContent, NoOrgSelected, Page } from '@homeowner-portal/ui'
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
  if (!org) return <NoOrgSelected noun="workspace" />

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
    <Page
      width="narrow"
      breadcrumbs={[{ label: 'Cases', href: '/' }, { label: usableDraft ? 'Resume case' : 'New case' }]}
      title={usableDraft ? 'Resume case' : 'Open a new case'}
      description="Run the compliance check, approve the notice, and we track the filing date."
    >
      <div className="space-y-6">
        {handoffSource && !usableDraft ? (
          <Alert variant="info" title={`Pre-filled from ${handoffSource}`}>
            Address, tenant, rent and days unpaid came over from {handoffSource}. Check them before
            running the compliance check.
          </Alert>
        ) : null}

        {usableDraft ? (
          <Alert variant="info" title="Resumed your unfinished draft">
            The wizard autosaves as you go — close the tab any time and pick up again from Cases.
          </Alert>
        ) : null}

        <Card>
          <CardContent className="p-6">
            <Wizard workspaceName={org.name} initial={initial} initialDraft={usableDraft} />
          </CardContent>
        </Card>
      </div>
    </Page>
  )
}
