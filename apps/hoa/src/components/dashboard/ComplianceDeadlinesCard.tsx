import Link from 'next/link'
import { ExternalLink, Scale } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, StatusPill } from '@homeowner-portal/ui'
import type { PendingComplianceItem } from '@/lib/compliance/deadlines'
import { FailedNote } from './BreakdownList'
import { MarkComplianceDoneButton } from './MarkComplianceDoneButton'

/**
 * BL-131 stopgap: statutory deadlines for the board's state that nobody has
 * marked done yet (the GA Secretary of State registration, the TX
 * management certificate). Board-facing only. Renders nothing when there
 * is nothing to show; `items` null = the read failed.
 */
export function ComplianceDeadlinesCard({
  items,
  multipleAssociations = false,
}: {
  items: PendingComplianceItem[] | null
  multipleAssociations?: boolean
}) {
  if (items !== null && items.length === 0) return null
  return (
    <Card id="compliance-deadlines">
      <CardHeader className="pb-3">
        <CardTitle as="h2" className="flex items-center gap-2">
          <Scale className="size-4 text-muted" aria-hidden />
          State law deadlines
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {items === null ? (
          <FailedNote what="your state law deadlines" />
        ) : (
          items.map((item) => (
            <section
              key={`${item.associationId}:${item.deadline.code}`}
              aria-label={item.deadline.title}
              className="space-y-2 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="min-w-0 font-medium text-foreground">
                  {item.deadline.title}
                  {multipleAssociations ? <span className="font-normal text-muted"> · {item.associationName}</span> : null}
                </h3>
                <StatusPill
                  tone={item.tone === 'overdue' ? 'danger' : item.tone === 'soon' ? 'warning' : item.tone === 'standing' ? 'neutral' : 'info'}
                  label={item.label}
                />
              </div>
              <p className="text-foreground-secondary">{item.deadline.consequence}</p>
              <ol className="list-decimal space-y-1 pl-5 text-foreground-secondary">
                {item.deadline.whatToDo.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p className="text-xs text-muted">
                {item.deadline.citation}. Applies to {lowerFirst(item.deadline.appliesTo)} Informational, not legal advice.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={item.deadline.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  {item.deadline.officialLabel} <ExternalLink className="size-3.5" aria-hidden />
                </a>
                {item.deadline.prepHref ? (
                  <Link href={item.deadline.prepHref} className="font-medium text-primary hover:underline">
                    {item.deadline.prepLabel ?? 'Open'}
                  </Link>
                ) : null}
                <MarkComplianceDoneButton associationId={item.associationId} code={item.deadline.code} />
              </div>
            </section>
          ))
        )}
        {/* BL-145: the full list, with evidence, lives on /compliance. */}
        <p className="text-sm">
          <Link href="/compliance" className="font-medium text-primary hover:underline">
            See every obligation on Compliance
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1)
}
