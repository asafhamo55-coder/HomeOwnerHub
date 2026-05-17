import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import {
  Badge,
  Card,
  CardContent,
  EmptyState,
} from '@homeowner-portal/ui'
import { Scale } from 'lucide-react'
import {
  getAssociationState,
  listStatutesForState,
} from '@/lib/state-law'

export const metadata = { title: 'Browse statutes' }

const CATEGORY_LABEL: Record<string, string> = {
  meetings: 'Meetings & elections',
  assessments: 'Assessments & dues',
  fines: 'Fines & enforcement',
  foreclosure: 'Liens & foreclosure',
  records: 'Records & access',
  architectural: 'Architectural review',
  fair_housing: 'Fair housing',
  amendments: 'Amendments & governance',
  uncategorized: 'Other',
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const { category } = await searchParams
  const state = await getAssociationState()

  if (!state) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Link
          href="/legal"
          className="inline-flex items-center gap-1 text-sm font-medium text-muted-fg hover:text-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <EmptyState
          icon={<Scale className="h-10 w-10" aria-hidden />}
          title="No state configured"
          description="Set up your association in onboarding first."
        />
      </div>
    )
  }

  const statutes = await listStatutesForState(state, category)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/legal"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-fg hover:text-muted"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to State Law
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-muted">
          {category ? CATEGORY_LABEL[category] ?? category : 'All statutes'}
        </h1>
        <p className="text-sm text-muted-fg">
          {state} · {statutes.length} section{statutes.length === 1 ? '' : 's'}
        </p>
      </header>

      {statutes.length === 0 ? (
        <EmptyState
          icon={<Scale className="h-10 w-10" aria-hidden />}
          title="No statutes match this filter"
          description={
            category
              ? 'Try clearing the category filter.'
              : 'No statutes have been ingested yet for this state.'
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {statutes.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/legal/browse/${s.id}`}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-background/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-muted-fg">
                      {s.code_citation}
                    </p>
                    <p className="truncate text-sm font-medium text-muted">
                      {s.title}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {s.category ? (
                      <Badge variant="outline" size="sm">
                        {CATEGORY_LABEL[s.category] ?? s.category}
                      </Badge>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
