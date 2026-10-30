import { ExternalLink } from 'lucide-react'
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle, StatusPill } from '@homeowner-portal/ui'
import {
  GA_PROPOSED_ADOPTION_LABEL,
  GA_PROPOSED_COMMENT_EMAIL,
  GA_PROPOSED_COMMENT_SENTENCE,
  GA_PROPOSED_PARTS,
  GA_PROPOSED_SOURCE_URL,
  proposedCommentOpen,
  type ProposedPart,
} from '@/lib/compliance/proposed-ga'

/**
 * BL-160: Georgia's proposed Secretary of State rules (Chapter 590-13),
 * shown to Georgia associations only. Labelled proposed and not in force
 * everywhere it matters. Quotes come from lib/compliance/proposed-ga.ts,
 * checked word for word against the fixture; the summaries are our words.
 */
export function ProposedRulesCard({ today }: { today: string }) {
  return (
    <Card id="proposed-rules" aria-label="Proposed Georgia rules, not in force">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle as="h2">Proposed rules (not in force)</CardTitle>
          <StatusPill tone="warning" label="Proposed" />
        </div>
        <CardDescription>
          The Georgia Secretary of State has proposed new rules, Chapter 590-13, for the owners’ association registration and complaint
          process. They are drafts. Nothing here is required of your association today, and the text can change before it is adopted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <Alert variant="warning" title="Not law yet">
          Planned effective date: {GA_PROPOSED_ADOPTION_LABEL}. Keep following the rules that are in force, and ask your association’s
          attorney before you change anything because of a draft.
        </Alert>

        <div className="space-y-1 text-foreground-secondary">
          {proposedCommentOpen(today) ? (
            <p>
              Comments: {GA_PROPOSED_COMMENT_SENTENCE} Send them by email to {GA_PROPOSED_COMMENT_EMAIL}.
            </p>
          ) : null}
          <p>Public hearings are in Atlanta on Wednesday, November 4 and Thursday, November 5, 2026. Times for each part are below.</p>
        </div>

        <div className="divide-y divide-border">
          {GA_PROPOSED_PARTS.map((p) => (
            <PartRow key={p.id} p={p} />
          ))}
        </div>

        <a
          href={GA_PROPOSED_SOURCE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          Secretary of State notices and rule text <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </CardContent>
    </Card>
  )
}

function PartRow({ p }: { p: ProposedPart }) {
  return (
    <section aria-label={`Part ${p.id}`} className="space-y-2 py-4 first:pt-0 last:pb-0">
      <h3 className="font-medium text-foreground">
        {p.title} <span className="font-normal text-muted">({p.id})</span>
      </h3>
      <p className="text-foreground-secondary">{p.summary}</p>
      <p className="text-xs text-muted">Rules: {p.rules}</p>
      <ul className="space-y-0.5 text-xs text-muted">
        {p.hearings.map((h) => (
          <li key={h.when + h.rules.join()}>
            Hearing, {h.when} ({h.rules.join(', ')})
          </li>
        ))}
      </ul>
      <details className="rounded-md border border-border bg-subtle px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-foreground-secondary">What the proposed text says ({p.quotes.length})</summary>
        <div className="mt-2 space-y-3">
          {p.quotes.map((q) => (
            <figure key={q.quote} className="space-y-1">
              <blockquote className="border-l-2 border-border pl-3 text-foreground-secondary">“{q.quote}”</blockquote>
              <figcaption className="text-xs text-muted">{q.cite} (proposed, not in force)</figcaption>
            </figure>
          ))}
        </div>
      </details>
    </section>
  )
}
