import { BookOpen } from 'lucide-react'
import { articleHref, articlesFor, instantSearchData, searchSections } from '@/lib/guide'
import { GuideSearch } from '@/components/guide/GuideSearch'
import { GuideSearchResults } from '@/components/guide/GuideArticleBody'
import { AskGuide } from '@/components/guide/AskGuide'
import { RowGroup, ScreenHeader, Section, TappableRow } from '@/components/resident/screen'

export const metadata = { title: 'Help' }

/** Resident help home (BL-070): mobile-first, resident articles only. */
export default async function ResidentHelpPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? '').trim().slice(0, 200)
  const articles = articlesFor('resident')

  return (
    <div className="space-y-6">
      <ScreenHeader title="Help" subtitle="Step-by-step help for your resident portal." back={{ href: '/resident/account', label: 'Account' }} />

      <GuideSearch data={instantSearchData('resident')} action="/resident/help" initialQuery={q} autoFocusDesktop={false} />

      {q ? <GuideSearchResults query={q} hits={searchSections(q, 'resident')} audience="resident" askDocsHref="/resident/ask" /> : null}

      <div className="rounded-2xl border border-border bg-surface p-4">
        <AskGuide />
      </div>

      <Section label="Guides">
        <RowGroup>
          {articles.map((a) => (
            <TappableRow key={a.id} href={articleHref(a.id, 'resident')} icon={<BookOpen />} tone="info" title={a.title} subtitle={a.summary} />
          ))}
        </RowGroup>
      </Section>
    </div>
  )
}
