import Link from 'next/link'
import { Scale } from 'lucide-react'
import { Button, EmptyState, LoadFailed, Page } from '@homeowner-portal/ui'
import { countLiveStatutesForState, getAssociationState } from '@/lib/state-law'
import { stateLawAskGate } from '@/lib/state-law-gate'
import { tryLoad } from '@/lib/load-or-fail'
import { STATE_NAMES } from '@/lib/status/knowledge'
import { LegalDisclaimer } from '@/components/knowledge/LegalDisclaimer'
import { AskStateLawClient } from './AskStateLawClient'

export const metadata = { title: 'Ask state law' }

export default async function AskStateLawPage() {
  const stateResult = await tryLoad('association state', () => getAssociationState())
  const state = stateResult.ok ? stateResult.data : null
  const countResult = state ? await tryLoad('state law coverage', () => countLiveStatutesForState(state)) : null
  const gate = countResult?.ok ? stateLawAskGate(state, countResult.data) : stateLawAskGate(null, 0)

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
      ) : !countResult?.ok ? (
        <LoadFailed what="which statutes are loaded" />
      ) : gate.kind === 'not_loaded' ? (
        <EmptyState
          icon={<Scale aria-hidden />}
          title={gate.title}
          description={gate.description}
          action={
            <Button asChild variant="secondary">
              <Link href="/ai/ask">Ask the Docs</Link>
            </Button>
          }
        />
      ) : (
        <AskStateLawClient state={state} />
      )}
    </Page>
  )
}
