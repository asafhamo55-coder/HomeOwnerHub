import Link from 'next/link'
import { Scale } from 'lucide-react'
import { EmptyState, LoadFailed, Page } from '@homeowner-portal/ui'
import { getAssociationState } from '@/lib/state-law'
import { tryLoad } from '@/lib/load-or-fail'
import { STATE_NAMES } from '@/lib/status/knowledge'
import { LegalDisclaimer } from '@/components/knowledge/LegalDisclaimer'
import { AskStateLawClient } from './AskStateLawClient'

export const metadata = { title: 'Ask state law' }

export default async function AskStateLawPage() {
  const stateResult = await tryLoad('association state', () => getAssociationState())
  const state = stateResult.ok ? stateResult.data : null

  return (
    <Page
      width="narrow"
      linkAs={Link}
      breadcrumbs={[{ label: 'State law', href: '/legal' }, { label: 'Ask' }]}
      title={state ? `Ask ${STATE_NAMES[state]} HOA law` : 'Ask state law'}
      description="Answers grounded in your state’s HOA statutes, with the section each one came from. If the statutes don’t cover it, the assistant says so rather than guessing."
    >
      <LegalDisclaimer />

      {!stateResult.ok ? (
        <LoadFailed what="your association’s state" />
      ) : !state ? (
        <EmptyState
          icon={<Scale aria-hidden />}
          title="Your state isn’t covered yet"
          description="The State Law Brain covers Georgia, Florida, California and Texas today."
        />
      ) : (
        <AskStateLawClient state={state} />
      )}
    </Page>
  )
}
