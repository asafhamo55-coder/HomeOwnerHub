import Link from 'next/link'
import { ArrowRight, SearchX } from 'lucide-react'
import { Button, EmptyState } from '@homeowner-portal/ui'
import { articleHref, getArticle, type GuideAudience, type SectionHit } from '@/lib/guide'
import type { GuideArticle } from '@/lib/guide/types'
import { GuideBlocks } from './GuideContent'

// Shared by /help/[slug] and /resident/help/[slug]: the article sections
// with their anchors, then related articles. Server component.

export function GuideArticleSections({ article, audience }: { article: GuideArticle; audience: GuideAudience }) {
  return (
    <div className="space-y-8">
      {article.sections.map((s) => (
        <section key={s.id} id={s.id} aria-labelledby={s.heading ? `${s.id}-h` : undefined} className="scroll-mt-20 space-y-3">
          {s.heading ? (
            <h2 id={`${s.id}-h`} className="text-lg text-foreground">
              {s.heading}
            </h2>
          ) : null}
          <GuideBlocks blocks={s.blocks} audience={audience} />
        </section>
      ))}
    </div>
  )
}

export function GuideRelated({ article, audience }: { article: GuideArticle; audience: GuideAudience }) {
  const related = article.related.map((id) => getArticle(id, audience)).filter((a): a is GuideArticle => !!a)
  if (related.length === 0) return null
  return (
    <section aria-labelledby="related-h" className="space-y-2 border-t border-border pt-6">
      <h2 id="related-h" className="text-lg text-foreground">
        Related
      </h2>
      <ul className="space-y-2">
        {related.map((r) => (
          <li key={r.id}>
            <Link href={articleHref(r.id, audience)} className="group inline-flex items-start gap-1.5 text-base font-medium text-primary">
              <ArrowRight className="mt-1.5 size-4 shrink-0" aria-hidden />
              <span>{r.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function TakeMeThere({ href, fullWidth }: { href: string; fullWidth?: boolean }) {
  return (
    <Button asChild size="lg" className={fullWidth ? 'w-full' : undefined}>
      <Link href={href} className="no-underline">
        Take me there
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </Button>
  )
}

/**
 * Full-text results for `?q=` (server). Nothing matching is said plainly,
 * with Ask the Docs offered for questions about the community's rules.
 */
export function GuideSearchResults({
  query,
  hits,
  audience,
  askDocsHref,
}: {
  query: string
  hits: SectionHit[]
  audience: GuideAudience
  askDocsHref: string
}) {
  if (hits.length === 0) {
    return (
      <EmptyState
        variant="compact"
        icon={<SearchX aria-hidden />}
        title={`No articles match “${query}”`}
        description="Try fewer or different words, or browse the topics below. If your question is about your community's rules, Ask the Docs answers from your governing documents."
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href={askDocsHref} className="no-underline">
              Ask the Docs
            </Link>
          </Button>
        }
      />
    )
  }
  return (
    <section aria-labelledby="results-h" className="space-y-2">
      <h2 id="results-h" className="text-sm font-medium text-muted">
        {hits.length} {hits.length === 1 ? 'article matches' : 'articles match'} “{query}”
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {hits.map((h) => (
          <li key={h.article.id}>
            <Link
              href={`${articleHref(h.article.id, audience)}#${h.sectionId}`}
              className="block px-4 py-3 no-underline transition-colors duration-fast hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span className="block text-sm font-medium text-foreground">{h.article.title}</span>
              <span className="block text-xs text-muted">{h.article.summary}</span>
              <span className="mt-1 block text-xs text-foreground-secondary">
                <span className="font-medium">{h.heading}:</span> {h.snippet}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
