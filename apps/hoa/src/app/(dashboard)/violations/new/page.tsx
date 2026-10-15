import Link from 'next/link'
import { Alert, Card, CardContent, LoadFailed, NoOrgSelected, Page } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadDraft } from '@/lib/drafts'
import { Wizard } from './Wizard'

export const metadata = { title: 'New violation' }

interface PropertyOption {
  id: string
  address: string
  unit_number: string | null
}

interface SearchParams {
  draft?: string
}

export default async function NewViolationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const supabase = await getSupabaseServerClient()
  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected />
  const { draft: draftId } = await searchParams

  const [propsRes, ccrRes, initialDraft] = await Promise.all([
    supabase
      .from('hoa_properties')
      .select('id, address, unit_number')
      .eq('org_id', org.id)
      .order('address', { ascending: true }),
    supabase
      .from('hoa_documents')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', org.id)
      .eq('type', 'ccr')
      .not('parsed_text', 'is', null),
    draftId ? loadDraft(draftId) : Promise.resolve(null),
  ])

  // A failed property read must not look like "no properties yet" (the
  // wizard would tell the board to add one).
  const propertiesFailed = Boolean(propsRes.error)
  const properties = (propsRes.data ?? []) as PropertyOption[]
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

      {propertiesFailed ? (
        <LoadFailed what="properties" hint="You need a property to report a violation against." />
      ) : (
        <Card>
          <CardContent className="pt-5">
            <Wizard
              properties={properties}
              hasParsedCCR={hasParsedCCR}
              initialDraft={usableDraft}
            />
          </CardContent>
        </Card>
      )}
    </Page>
  )
}
