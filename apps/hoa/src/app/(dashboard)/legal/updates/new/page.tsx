import Link from 'next/link'
import { ArrowLeft, Scale } from 'lucide-react'
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
} from '@homeowner-portal/ui'
import {
  getAssociationState,
  listStatutesForState,
} from '@/lib/state-law'
import { NewUpdateForm } from './NewUpdateForm'

export const metadata = { title: 'Post a law update' }

export default async function NewLawUpdatePage() {
  const state = await getAssociationState()

  if (!state) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link
          href="/legal"
          className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <EmptyState
          icon={<Scale className="h-10 w-10" aria-hidden />}
          title="State not supported"
          description="The State Law Brain currently covers GA, FL, CA, and TX."
        />
      </div>
    )
  }

  const statutes = await listStatutesForState(state)

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
        <h1 className="text-2xl font-bold text-foreground">Post a law update</h1>
        <p className="text-sm text-muted">
          Post a curated note about a recent change in {state} HOA law.
          Appears in the Recent updates feed on /legal.
        </p>
      </header>

      <Alert variant="info" title="Editorial — not auto-generated">
        <span className="block text-sm">
          The platform never auto-generates updates. Write what you (or
          your attorney) want every board to see. Be specific about the
          effective date and action items — that's how this is useful.
        </span>
      </Alert>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>New update</CardTitle>
        </CardHeader>
        <CardContent>
          <NewUpdateForm statutes={statutes} />
        </CardContent>
      </Card>
    </div>
  )
}
