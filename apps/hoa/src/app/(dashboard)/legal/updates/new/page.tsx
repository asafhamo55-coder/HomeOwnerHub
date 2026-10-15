import Link from 'next/link'
import { Scale } from 'lucide-react'
import { Card, CardContent, EmptyState, LoadFailed, Page } from '@homeowner-portal/ui'
import { getAssociationState, listStatutesForState } from '@/lib/state-law'
import { tryLoad } from '@/lib/load-or-fail'
import { STATE_NAMES } from '@/lib/status/knowledge'
import { NewUpdateForm } from './NewUpdateForm'

export const metadata = { title: 'Post a law update' }

export default async function NewLawUpdatePage() {
  const stateResult = await tryLoad('association state', () => getAssociationState())
  const state = stateResult.ok ? stateResult.data : null
  // The statute list only feeds the optional "Related statute" picker; if
  // it fails the form still works, and says the picker is unavailable.
  const statutesResult = state ? await tryLoad('statutes', () => listStatutesForState(state)) : null

  return (
    <Page
      width="narrow"
      linkAs={Link}
      breadcrumbs={[
        { label: 'State law', href: '/legal' },
        { label: 'Law updates', href: '/legal/updates' },
        { label: 'New' },
      ]}
      title="Post a law update"
      description={
        state
          ? `A curated note about a change in ${STATE_NAMES[state]} HOA law. Written by you or your attorney — the platform never generates these. Be specific about the effective date and what boards should do.`
          : 'A curated note about a change in your state’s HOA law.'
      }
    >
      {!stateResult.ok ? (
        <LoadFailed what="your association’s state" />
      ) : !state ? (
        <EmptyState
          icon={<Scale aria-hidden />}
          title="Your state isn’t covered yet"
          description="The State Law Brain covers Georgia, Florida, California and Texas today."
        />
      ) : (
        <Card>
          <CardContent className="p-5 sm:p-6">
            <NewUpdateForm
              statutes={statutesResult?.ok ? statutesResult.data : []}
              statutesFailed={!statutesResult?.ok}
            />
          </CardContent>
        </Card>
      )}
    </Page>
  )
}
