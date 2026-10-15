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
  LoadFailed,
  Page,
} from '@homeowner-portal/ui'
import { getStateLawSummary, listRecentUpdates } from '@/lib/state-law'
import { tryLoad } from '@/lib/load-or-fail'
import { lawCategoryLabel, STATE_CODE_LABELS, STATE_NAMES } from '@/lib/status/knowledge'
import { LegalDisclaimer } from '@/components/knowledge/LegalDisclaimer'
import { LawUpdateItem } from '@/components/knowledge/LawUpdateItem'
import { LegalTabs } from '@/components/knowledge/LegalTabs'

export const metadata = { title: 'State Law & Compliance' }

export default async function LegalLandingPage() {
  const summaryResult = await tryLoad('state law summary', () => getStateLawSummary())
  const summary = summaryResult.ok ? summaryResult.data : null
  const updatesResult =
    summary?.state != null
      ? await tryLoad('recent law updates', () => listRecentUpdates(summary.state!, 10))
      : null

  const ready = summary?.state != null

  return (
    <Page
      linkAs={Link}
      title="State law"
      description="Your state’s HOA statutes, a Q&A assistant that cites them, and curated notes on recent changes."
      meta={summary?.state ? <Badge variant="neutral">{STATE_NAMES[summary.state]}</Badge> : null}
      tabs={<LegalTabs current="/legal" />}
      actions={
        ready ? (
          <Button asChild>
            <Link href="/legal/ask">
              <Sparkles aria-hidden />
              Ask a question
            </Link>
          </Button>
        ) : null
      }
    >
      <LegalDisclaimer>
        This is the actual state code plus AI answers grounded in it. It does not create an attorney–client
        relationship; for decisions specific to your association, consult a licensed attorney.
      </LegalDisclaimer>

      {!summary ? (
        <LoadFailed what="state law coverage" />
      ) : !summary.state ? (
        <EmptyState
          icon={<Scale aria-hidden />}
          title="Your state isn’t covered yet"
          description={
            summary.associationName
              ? `${summary.associationName} isn’t in one of the covered states (GA, FL, CA, TX). Coverage expands in v1.5.`
              : 'Set up your association to see the law for its state.'
          }
          action={
            summary.associationName ? null : (
              <Button asChild>
                <Link href="/onboarding/setup">Finish setup</Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle as="h2">{STATE_NAMES[summary.state]} HOA law</CardTitle>
              <p className="text-sm text-muted">{STATE_CODE_LABELS[summary.state]}</p>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-3 gap-4 border-t border-border pt-4">
                <Stat label="Sections indexed" value={summary.statuteCount} />
                <Stat label="Topics" value={summary.categories.length} />
                <Stat label="Live updates" value={summary.recentUpdateCount} />
              </dl>
            </CardContent>
          </Card>

          {summary.statuteCount === 0 ? (
            <Alert variant="warning" title="Statutes aren’t loaded yet">
              We don’t have {STATE_NAMES[summary.state]}’s HOA statutes loaded for your association yet. Contact
              support to load them — Q&amp;A and browsing turn on once they’re in place.
            </Alert>
          ) : null}

          <section aria-labelledby="updates-heading" className="space-y-3">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="updates-heading" className="text-lg font-semibold text-foreground">
                Recent law updates
              </h2>
              <Link href="/legal/updates" className="text-sm font-medium text-primary hover:underline">
                Manage updates
              </Link>
            </div>
            {!updatesResult || !updatesResult.ok ? (
              <LoadFailed what="recent law updates" />
            ) : updatesResult.data.length === 0 ? (
              <EmptyState
                variant="dashed"
                title="No recent updates"
                description="When a change in state HOA law affects your association, a curated note appears here."
                action={
                  <Button asChild variant="secondary">
                    <Link href="/legal/updates/new">Post an update</Link>
                  </Button>
                }
              />
            ) : (
              <Card>
                <ul className="divide-y divide-border">
                  {updatesResult.data.map((u) => (
                    <li key={u.id}>
                      <LawUpdateItem update={u} />
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>

          {summary.categories.length > 0 ? (
            <Card>
              <CardHeader
                actions={
                  <Link href="/legal/browse" className="text-sm font-medium text-primary hover:underline">
                    All statutes
                  </Link>
                }
              >
                <CardTitle as="h2">Browse by topic</CardTitle>
              </CardHeader>
              <ul className="divide-y divide-border border-t border-border">
                {summary.categories.map((c) => (
                  <li key={c.category}>
                    <Link
                      href={`/legal/browse?category=${encodeURIComponent(c.category)}`}
                      className="group flex items-center gap-3 px-5 py-3 text-sm transition-colors duration-fast hover:bg-subtle"
                    >
                      <BookOpen className="size-4 shrink-0 text-muted" aria-hidden />
                      <span className="flex-1 text-foreground">{lawCategoryLabel(c.category)}</span>
                      <span className="num text-muted">
                        {c.count} {c.count === 1 ? 'section' : 'sections'}
                      </span>
                      <ChevronRight className="size-4 text-muted" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      )}
    </Page>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num mt-0.5 text-2xl font-semibold text-foreground">{value.toLocaleString()}</dd>
    </div>
  )
}
