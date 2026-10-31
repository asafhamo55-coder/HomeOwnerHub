import type { Metadata } from 'next'
import { LibraryPage } from '@/components/georgia/library-page'
import { guideGroups } from '@/lib/library'
import { pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'

export const metadata: Metadata = pageMetadata({ ...PAGE_META['/guides']!, path: '/guides' })

const FEATURED = [
  '/guides/georgia-hoa-assessment-lien-rules',
  '/guides/florida-hoa-assessment-lien-and-foreclosure-timeline',
  '/guides/texas-hoa-violation-notice-and-hearing-209-006',
]

export default function GuidesIndexPage() {
  const sections = guideGroups().map((g) => ({ id: g.id, label: g.label, items: g.items }))
  const featured = FEATURED.flatMap((p) => sections.flatMap((s) => s.items).filter((i) => i.path === p))
  return (
    <LibraryPage
      name="Guides"
      path="/guides"
      eyebrow="Guides"
      title="HOA guides for volunteer boards"
      lead="Plain-language guides, grouped by state. Where a state’s law is quoted, the statute’s own words are on the page so you can check them."
      sections={sections}
      featured={featured}
      linkLabel="Read the guide"
      position="guides_index"
    />
  )
}
