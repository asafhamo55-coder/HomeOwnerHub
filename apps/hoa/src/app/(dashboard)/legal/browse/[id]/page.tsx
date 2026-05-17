import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@homeowner-portal/ui'
import { getStatute } from '@/lib/state-law'

export const metadata = { title: 'Statute' }

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

export default async function StatuteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const statute = await getStatute(id)
  if (!statute) notFound()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/legal/browse"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to statutes
      </Link>

      <header className="space-y-2">
        <p className="font-mono text-xs text-muted">{statute.code_citation}</p>
        <h1 className="text-2xl font-bold text-foreground">{statute.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {statute.category ? (
            <Badge variant="outline" size="sm">
              {CATEGORY_LABEL[statute.category] ?? statute.category}
            </Badge>
          ) : null}
          {statute.effective_date ? (
            <span>Effective {format(new Date(statute.effective_date), 'PP')}</span>
          ) : null}
          <span>·</span>
          <span>
            Ingested {format(new Date(statute.fetched_at), 'PP')}
          </span>
        </div>
      </header>

      <Alert variant="info" title="Informational, not legal advice">
        <span className="block text-sm">
          This is the statute text. For interpretation specific to your
          association, consult a licensed attorney.
        </span>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Statute text</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-foreground">
            {statute.body}
          </p>
        </CardContent>
      </Card>

      {statute.source_url ? (
        <p className="text-xs text-muted">
          Source:{' '}
          <a
            href={statute.source_url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            {statute.source_url}
            <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      ) : null}
    </div>
  )
}
