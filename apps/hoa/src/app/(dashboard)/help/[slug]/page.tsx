import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Page } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getArticle, getTopic, takeMeThereHref } from '@/lib/guide'
import { GuideArticleSections, GuideRelated, TakeMeThere } from '@/components/guide/GuideArticleBody'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const article = getArticle((await params).slug, 'board')
  return { title: article ? `${article.title} · Help` : 'Help' }
}

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { role } = await requireBoardOrAdmin()
  const article = getArticle((await params).slug, 'board')
  if (!article) notFound()
  const topic = getTopic(article.topic)
  const adminOnly = role === 'board' && !article.roles.includes('board')

  return (
    <Page
      width="narrow"
      title={article.title}
      description={article.summary}
      breadcrumbs={[
        { label: 'Help', href: '/help' },
        ...(topic ? [{ label: topic.label, href: `/help/topics/${topic.id}` }] : []),
        { label: article.title },
      ]}
      linkAs={Link}
      actions={<TakeMeThere href={takeMeThereHref(article)} />}
    >
      {adminOnly ? (
        <p className="rounded-lg border border-border bg-subtle px-4 py-3 text-sm text-foreground-secondary">
          This task needs an admin of your HOA. You can read how it works, but some buttons won't appear for you.
        </p>
      ) : null}
      <GuideArticleSections article={article} audience="board" />
      <GuideRelated article={article} audience="board" />
      <p className="text-xs text-muted">Checked against the app on {article.reviewed}.</p>
    </Page>
  )
}
