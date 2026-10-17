import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { Page } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { articleHref, getTopic, topicsFor } from '@/lib/guide'

export default async function HelpTopicPage({ params }: { params: Promise<{ topic: string }> }) {
  const { role } = await requireBoardOrAdmin()
  const { topic: topicId } = await params
  const topic = getTopic(topicId)
  if (!topic) notFound()
  const articles = topicsFor(role).find((t) => t.topic.id === topic.id)?.articles ?? []

  return (
    <Page
      width="narrow"
      title={topic.label}
      description={topic.description}
      breadcrumbs={[{ label: 'Help', href: '/help' }, { label: topic.label }]}
      linkAs={Link}
    >
      {articles.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {articles.map((a) => (
            <li key={a.id}>
              <Link
                href={articleHref(a.id, 'board')}
                className="flex items-center gap-3 px-4 py-4 no-underline transition-colors duration-fast hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium text-foreground">{a.title}</span>
                  <span className="block text-sm text-muted">{a.summary}</span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          The guide has no articles on this topic for your role yet. <Link href="/help">Browse every topic</Link>.
        </p>
      )}
    </Page>
  )
}
