import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
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
  if (!org) return null
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
      .eq('type', 'ccr')
      .not('parsed_text', 'is', null),
    draftId ? loadDraft(draftId) : Promise.resolve(null),
  ])

  const properties = (propsRes.data ?? []) as PropertyOption[]
  const hasParsedCCR = (ccrRes.count ?? 0) > 0

  // Only resume drafts of the right kind. If a foreign draft id is in the
  // URL, we ignore it rather than crashing.
  const usableDraft =
    initialDraft && initialDraft.kind === 'violation' && !initialDraft.completed
      ? initialDraft
      : null

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/violations"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to violations
      </Link>

      {usableDraft ? (
        <Alert variant="info" title="Resumed unfinished draft">
          Picking up where you left off. Your previous photo and notes are restored. The wizard
          autosaves as you progress; you can close the tab any time and pick up again from the
          dashboard.
        </Alert>
      ) : null}

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>{usableDraft ? 'Resume violation report' : 'Report a violation'}</CardTitle>
        </CardHeader>
        <CardContent>
          <Wizard
            properties={properties}
            hasParsedCCR={hasParsedCCR}
            initialDraft={usableDraft}
          />
        </CardContent>
      </Card>
    </div>
  )
}
