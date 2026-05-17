import Link from 'next/link'
import { ArrowLeft, Scale } from 'lucide-react'
import { Alert, EmptyState } from '@homeowner-portal/ui'
import { getAssociationState } from '@/lib/state-law'
import { AskStateLawClient } from './AskStateLawClient'

export const metadata = { title: 'Ask state law' }

const STATE_NAME: Record<'GA' | 'FL' | 'CA' | 'TX', string> = {
  GA: 'Georgia',
  FL: 'Florida',
  CA: 'California',
  TX: 'Texas',
}

export default async function AskStateLawPage() {
  const state = await getAssociationState()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/legal"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to State Law
      </Link>

      <header className="space-y-1">
        <h1>
          Ask the {state ? `${STATE_NAME[state]} ` : ''}state law
        </h1>
        <p className="text-sm text-muted">
          The State Law Brain (W30) answers questions grounded in your
          state's HOA statutes. Every answer cites the section it came
          from. If the statutes don't cover it, the AI says so rather
          than guessing.
        </p>
      </header>

      <Alert variant="info" title="Informational, not legal advice">
        <span className="block text-sm">
          The Q&A is grounded in actual statute text but is not a
          substitute for an attorney. For decisions specific to your
          association, consult a licensed attorney in your state.
        </span>
      </Alert>

      {!state ? (
        <EmptyState
          icon={<Scale className="h-10 w-10" aria-hidden />}
          title="State not supported"
          description="The State Law Brain currently covers GA, FL, CA, and TX."
        />
      ) : (
        <AskStateLawClient state={state} />
      )}
    </div>
  )
}
