import Link from 'next/link'
import { Alert, Card, CardContent, LoadFailed, NoOrgSelected, Page } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadDraft } from '@/lib/drafts'
import { loadOrFail } from '@/lib/load-or-fail'
import { selectStateRules } from '@homeowner-portal/workflows/W3-state-rules'
import { StateRulesPanel } from '@/components/violations/StateRulesPanel'
import { Wizard } from './Wizard'
import { parsePropertyParam } from '@/lib/property-scope'

export const metadata = { title: 'New violation' }

interface PropertyOption {
  id: string
  address: string
  unit_number: string | null
}

interface SearchParams {
  draft?: string
  /** A property page's "New violation here". */
  property?: string
}

export default async function NewViolationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const supabase = await getSupabaseServerClient()
  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected />
  const { draft: draftId, property: propertyParam } = await searchParams

  const [propsRes, ccrRes, initialDraft, assocRes] = await Promise.all([
    supabase
      .from('hoa_properties')
      .select('id, address, unit_number')
      .eq('org_id', org.id)
      // Archived homes can't take a new violation.
      .is('deleted_at', null)
      .order('address', { ascending: true }),
    supabase
      .from('hoa_documents')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', org.id)
      .eq('type', 'ccr')
      .not('parsed_text', 'is', null),
    draftId ? loadDraft(draftId) : Promise.resolve(null),
    // BL-019: the association's state picks the enforcement rules the
    // letter must follow. Primary association = first by name, the same
    // rule W3 and getPrimaryAssociation use.
    loadOrFail(
      'the association state',
      supabase
        .from('associations' as never)
        .select('state')
        .eq('organization_id' as never, org.id)
        .order('name' as never, { ascending: true })
        // One row: the primary association (a single lookup, not a list).
        .range(0, 0)
        .returns<Array<{ state: string | null }>>(),
    ),
  ])
  const stateRules = assocRes.ok ? selectStateRules(assocRes.data?.[0]?.state ?? null) : null

  // A failed property read must not look like "no properties yet" (the
  // wizard would tell the board to add one).
  const propertiesFailed = Boolean(propsRes.error)
  const properties = (propsRes.data ?? []) as PropertyOption[]
  const wanted = parsePropertyParam(propertyParam)
  const initialPropertyId = wanted && properties.some((p) => p.id === wanted) ? wanted : null
  const hasParsedCCR = (ccrRes.count ?? 0) > 0

  // Only resume drafts of the right kind. If a foreign draft id is in the
  // URL, we ignore it rather than crashing.
  const usableDraft =
    initialDraft && initialDraft.kind === 'violation' && !initialDraft.completed
      ? initialDraft
      : null

  const title = usableDraft ? 'Resume violation report' : 'Report a violation'
  return (
    <Page
      width="narrow"
      title={title}
      description="Add photos and notes. Covenant Brain matches the CC&R section and drafts the notice; nothing is sent until you approve it."
      breadcrumbs={[{ label: 'Violations', href: '/violations' }, { label: usableDraft ? 'Resume draft' : 'New' }]}
      linkAs={Link}
    >
      {usableDraft ? (
        <Alert variant="info" title="Resumed unfinished draft">
          Picking up where you left off. Your previous photo and notes are restored. The wizard
          autosaves as you progress; you can close the tab any time and pick up again from the
          dashboard.
        </Alert>
      ) : null}

      {stateRules ? (
        <StateRulesPanel
          title={stateRules.title}
          citation={stateRules.citation}
          sourceUrl={stateRules.sourceUrl}
          textVerified={stateRules.textVerified}
          jurisdiction={stateRules.jurisdiction}
          summary={stateRules.summary}
          warnings={stateRules.verifyNote ? [stateRules.verifyNote] : []}
        />
      ) : (
        <LoadFailed what="your association's state law rules" />
      )}

      {propertiesFailed ? (
        <LoadFailed what="properties" hint="You need a property to report a violation against." />
      ) : (
        <Card>
          <CardContent className="pt-5">
            <Wizard
              properties={properties}
              hasParsedCCR={hasParsedCCR}
              initialDraft={usableDraft}
              initialPropertyId={initialPropertyId}
            />
          </CardContent>
        </Card>
      )}
    </Page>
  )
}
