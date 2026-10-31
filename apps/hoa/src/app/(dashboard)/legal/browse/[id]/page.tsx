import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExternalLink, Sparkles } from 'lucide-react'
import { formatDay } from '@/lib/money/format'
import { Badge, Button, Card, CardContent, LoadFailed, Page } from '@homeowner-portal/ui'
import { getStatute } from '@/lib/state-law'
import { tryLoad } from '@/lib/load-or-fail'
import { lawCategoryLabel } from '@/lib/status/knowledge'
import { LegalDisclaimer } from '@/components/knowledge/LegalDisclaimer'
import { formatShortDate } from '@/lib/format-datetime'

export const metadata = { title: 'Statute' }

export default async function StatuteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await tryLoad('statute', () => getStatute(id))

  if (!result.ok) {
    return (
      <Page
        width="narrow"
        linkAs={Link}
        breadcrumbs={[
          { label: 'State law', href: '/legal' },
          { label: 'Statutes', href: '/legal/browse' },
          { label: 'Section' },
        ]}
        title="Statute"
      >
        <LoadFailed what="this statute" />
      </Page>
    )
  }

  const statute = result.data
  if (!statute) notFound()
  const category = lawCategoryLabel(statute.category)

  return (
    <Page
      width="narrow"
      linkAs={Link}
      breadcrumbs={[
        { label: 'State law', href: '/legal' },
        { label: 'Statutes', href: '/legal/browse' },
        { label: statute.code_citation },
      ]}
      eyebrow={statute.code_citation}
      title={statute.title}
      meta={category ? <Badge variant="neutral">{category}</Badge> : null}
      description={
        <span className="num">
          {statute.effective_date
            ? `Effective ${formatDay(statute.effective_date.slice(0, 10))} · `
            : ''}
          Loaded {formatShortDate(statute.fetched_at)}
        </span>
      }
      actions={
        <Button asChild variant="secondary">
          <Link href="/legal/ask">
            <Sparkles aria-hidden />
            Ask about this law
          </Link>
        </Button>
      }
    >
      <LegalDisclaimer>
        This is the statute text. For interpretation specific to your association, consult a licensed attorney.
      </LegalDisclaimer>

      <Card>
        <CardContent className="p-5 sm:p-8">
          <div className="whitespace-pre-wrap font-serif text-base leading-[1.75] text-foreground">{statute.body}</div>
        </CardContent>
      </Card>

      {statute.source_url ? (
        <p className="text-sm text-muted">
          Official source:{' '}
          <a
            href={statute.source_url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 break-all font-medium text-primary hover:underline"
          >
            {statute.source_url}
            <ExternalLink className="size-3.5 shrink-0" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </p>
      ) : null}
    </Page>
  )
}
