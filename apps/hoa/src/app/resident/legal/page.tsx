import { Scale } from 'lucide-react'
import { Alert, EmptyState } from '@homeowner-portal/ui'
import { getAssociationState } from '@/lib/state-law'
import { AskStateLawClient } from '@/app/(dashboard)/legal/ask/AskStateLawClient'

export const metadata = { title: 'State Law' }

const STATE_NAME: Record<'GA' | 'FL' | 'CA' | 'TX', string> = {
  GA: 'Georgia',
  FL: 'Florida',
  CA: 'California',
  TX: 'Texas',
}

export default async function ResidentLegalPage() {
  const state = await getAssociationState()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold">
            Ask the {state ? `${STATE_NAME[state]} ` : ''}state law
          </h1>
        </div>
        <p className="text-sm text-muted">
          Get plain-English answers grounded in your state's actual HOA
          statutes, with citations to specific code sections.
        </p>
      </header>

      <Alert variant="info" title="Informational, not legal advice">
        <span className="block text-sm">
          Answers cite real statutes but are not a substitute for an
          attorney. For decisions specific to your situation, consult a
          licensed attorney in your state.
        </span>
      </Alert>

      {!state ? (
        <EmptyState
          icon={<Scale className="h-10 w-10" aria-hidden />}
          title="State not supported yet"
          description="The State Law Brain currently covers GA, FL, CA, and TX. Coverage expands in a future release."
        />
      ) : (
        <AskStateLawClient state={state} />
      )}
    </div>
  )
}
