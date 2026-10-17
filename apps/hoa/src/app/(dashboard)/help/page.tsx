import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Page } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { articleHref, instantSearchData, pathsFor, searchSections, topicsFor } from '@/lib/guide'
import { GuideSearch } from '@/components/guide/GuideSearch'
import { GuideSearchResults } from '@/components/guide/GuideArticleBody'

export const metadata = { title: 'Help' }

/** The board help centre (BL-070, spec §6.1). Reads only the compiled guide. */
export default async function HelpPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { role } = await requireBoardOrAdmin()
  const q = ((await searchParams).q ?? '').trim().slice(0, 200)
  const paths = pathsFor(role)
  const topics = topicsFor(role)

  return (
    <Page
      title="Help"
      description="Short, step-by-step guides to HomeownerHub. Every step uses the words you see on the screen."
    >
      <GuideSearch data={instantSearchData(role)} action="/help" initialQuery={q} />

      {q ? <GuideSearchResults query={q} hits={searchSections(q, role)} audience="board" askDocsHref="/ai/ask" /> : null}

      {paths.length > 0 ? (
        <section aria-labelledby="start-here" className="space-y-3">
          <h2 id="start-here" className="text-lg text-foreground">
            Start here
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {paths.map(({ path, articles }) => (
              <Card key={path.id}>
                <CardHeader>
                  <CardTitle as="h3">{path.label}</CardTitle>
                  <CardDescription>{path.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-2">
                    {articles.map((a, i) => (
                      <li key={a.id} className="flex gap-2 text-sm">
                        <span aria-hidden className="num w-4 shrink-0 text-muted">
                          {i + 1}.
                        </span>
                        <Link href={articleHref(a.id, 'board')} className="font-medium text-primary">
                          {a.title}
                        </Link>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="topics" className="space-y-3">
        <h2 id="topics" className="text-lg text-foreground">
          Topics
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {topics.map(({ topic, articles }) => (
            <li key={topic.id}>
              <Link href={`/help/topics/${topic.id}`} className="block h-full rounded-xl no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Card variant="interactive" className="h-full">
                  <CardHeader>
                    <CardTitle as="h3">{topic.label}</CardTitle>
                    <CardDescription>{topic.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                      {articles.length} {articles.length === 1 ? 'article' : 'articles'}
                      <ArrowRight className="size-4" aria-hidden />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </Page>
  )
}
