import { AlertTriangle, Scale } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, StatusPill } from '@homeowner-portal/ui'

/**
 * BL-019 — the state enforcement rules a violation letter follows, shown
 * wherever the board creates (`/violations/new`) or reviews
 * (`/violations/approval-queue`) a draft. The rules come from
 * `@homeowner-portal/workflows/W3-state-rules`, the same module W3 drafts
 * with, so the page cannot describe a different law from the letter.
 *
 * `quotes` are only the ones W3 validated against the stored statute text
 * at draft time — this component never quotes on its own.
 */
export interface StateRulesPanelProps {
  title: string
  citation: string | null
  sourceUrl: string | null
  textVerified: boolean
  jurisdiction: 'FL' | 'CA' | 'OTHER'
  summary: string[]
  quotes?: Array<{ citation: string; pinpoint: string; quote: string }>
  warnings?: string[]
  /** `card` stands alone on a page; `inset` sits inside a draft card. */
  variant?: 'card' | 'inset'
}

export function StateRulesPanel({
  title,
  citation,
  sourceUrl,
  textVerified,
  jurisdiction,
  summary,
  quotes = [],
  warnings = [],
  variant = 'card',
}: StateRulesPanelProps) {
  const status =
    jurisdiction === 'OTHER' ? (
      <StatusPill tone="neutral" label="Not encoded" />
    ) : textVerified ? (
      <StatusPill tone="success" label="Checked against official text" />
    ) : (
      <StatusPill tone="warning" label="Verify against the statute" />
    )

  const body = (
    <div className="space-y-3 text-sm">
      <ul className="list-disc space-y-1.5 pl-5 text-foreground">
        {summary.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {quotes.length > 0 ? (
        <div className="space-y-2">
          {quotes.map((q) => (
            <blockquote key={q.pinpoint} className="border-l-2 border-border pl-3 text-muted">
              <span className="font-medium text-foreground">
                {q.citation}
                {q.pinpoint}
              </span>{' '}
              “{q.quote}”
            </blockquote>
          ))}
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <ul className="space-y-1.5 text-foreground-secondary">
          {warnings.map((w) => (
            <li key={w} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <span className="min-w-0">{w}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {citation && sourceUrl ? (
        <p className="text-xs text-muted">
          Source:{' '}
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">
            {citation}
          </a>
        </p>
      ) : null}
    </div>
  )

  if (variant === 'inset') {
    return (
      <section aria-label="State law" className="space-y-3 rounded-lg border border-border bg-subtle p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
            <Scale className="size-4 shrink-0 text-muted" aria-hidden />
            <span className="min-w-0">{title}</span>
          </h3>
          {status}
        </div>
        {body}
      </section>
    )
  }

  return (
    <Card>
      <CardHeader actions={status}>
        <CardTitle as="h2" className="flex items-center gap-2">
          <Scale className="size-4 shrink-0 text-muted" aria-hidden />
          State law for this letter
        </CardTitle>
        <CardDescription>{title}</CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  )
}
