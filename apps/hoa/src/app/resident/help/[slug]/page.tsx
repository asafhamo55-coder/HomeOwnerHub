import { notFound } from 'next/navigation'
import { getArticle, takeMeThereHref } from '@/lib/guide'
import { GuideArticleSections, GuideRelated, TakeMeThere } from '@/components/guide/GuideArticleBody'
import { ScreenHeader } from '@/components/resident/screen'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const article = getArticle((await params).slug, 'resident')
  return { title: article ? `${article.title} · Help` : 'Help' }
}

export default async function ResidentHelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const article = getArticle((await params).slug, 'resident')
  if (!article) notFound()

  return (
    <article className="space-y-6">
      <ScreenHeader title={article.title} subtitle={article.summary} back={{ href: '/resident/help', label: 'Help' }} />
      <TakeMeThere href={takeMeThereHref(article)} fullWidth />
      <GuideArticleSections article={article} audience="resident" />
      <GuideRelated article={article} audience="resident" />
    </article>
  )
}
