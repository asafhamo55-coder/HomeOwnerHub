import Link from 'next/link'
import { BookOpen, ChevronRight, Scale, Sparkles } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
} from '@homeowner-portal/ui'
import { getStateLawSummary, type SupportedState } from '@/lib/state-law'

export const metadata = { title: 'State Law & Compliance' }

const STATE_NAME: Record<SupportedState, string> = {
  GA: 'Georgia',
  FL: 'Florida',
  CA: 'California',
  TX: 'Texas',
}

const STATE_CODE_LABEL: Record<SupportedState, string> = {
  GA: 'O.C.G.A. Title 44, Ch. 3 (POA / Condominium acts)',
  FL: 'Florida Statutes Ch. 720 (HOA Act) + Ch. 718 (Condominium Act)',
  CA: 'Davis-Stirling Common Interest Development Act (Civ. Code §§ 4000–6150)',
  TX: 'Texas Property Code Ch. 209 (Residential Property Owners Protection Act)',
}

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

export default async function LegalLandingPage() {
  const summary = await getStateLawSummary()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold text-muted">State Law & Compliance</h1>
          </div>
          <p className="text-sm text-muted-fg">
            Statute Q&A grounded in your state's HOA law — with citations.
          </p>
        </div>
      </header>

      <Alert variant="info" title="Informational, not legal advice">
        <span className="block text-sm">
          What you see here is the actual state code text plus AI-summarized
          answers grounded in those excerpts. It is <strong>not</strong> legal
          advice and does not create an attorney–client relationship.
          For decisions specific to your association, consult a licensed
          attorney in your state.
        </span>
      </Alert>

      {!summary.state ? (
        <EmptyState
          icon={<Scale className="h-10 w-10" aria-hidden />}
          title="State not supported yet"
          description={
            summary.associationName
              ? `${summary.associationName} isn't in one of the v1 states (GA, FL, CA, TX). Coverage expands in v1.5.`
              : 'Set up your association in onboarding to see state-specific law.'
          }
        />
      ) : (
        <>
          <Card variant="elevated">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BookOpen className="h-4 w-4 text-primary" />
                  {STATE_NAME[summary.state]} HOA law
                </CardTitle>
                <Badge variant="outline">{summary.state}</Badge>
              </div>
              <p className="text-xs text-muted-fg">
                {STATE_CODE_LABEL[summary.state]}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-6 text-sm">
                <Stat label="Statute sections indexed" value={summary.statuteCount} />
                <Stat label="Categories" value={summary.categories.length} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link href="/legal/ask">
                    <Sparkles className="h-4 w-4" />
                    Ask a state-law question
                  </Link>
                </Button>
                {summary.statuteCount > 0 ? (
                  <Button asChild variant="outline">
                    <Link href="/legal/browse">
                      <BookOpen className="h-4 w-4" />
                      Browse the statutes
                    </Link>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {summary.statuteCount === 0 ? (
            <Alert variant="warning" title="No statutes ingested yet">
              <span className="block text-sm">
                Run{' '}
                <span className="font-mono">
                  pnpm tsx scripts/ingest-state-statutes.ts {summary.state}
                </span>{' '}
                to load {STATE_NAME[summary.state]}'s HOA statutes. The Q&A
                workflow is wired and ready — it just needs grounding data.
              </span>
            </Alert>
          ) : null}

          {summary.categories.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Browse by topic</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {summary.categories.map((c) => (
                    <li key={c.category}>
                      <Link
                        href={`/legal/browse?category=${encodeURIComponent(c.category)}`}
                        className="flex items-center justify-between gap-3 py-2 transition-colors hover:text-primary"
                      >
                        <span className="text-sm text-muted">
                          {CATEGORY_LABEL[c.category] ?? c.category}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-muted-fg">
                          <span className="font-mono">{c.count}</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-2xl font-semibold text-muted">{value}</p>
      <p className="text-xs uppercase tracking-wide text-muted-fg">{label}</p>
    </div>
  )
}
