import type { Metadata } from 'next'
import { LibraryPage } from '@/components/georgia/library-page'
import { guideGroups } from '@/lib/library'
import { pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'

export const metadata: Metadata = pageMetadata({ ...PAGE_META['/guides']!, path: '/guides' })

export default function GuidesIndexPage() {
  return (
    <LibraryPage
      name="Guides"
      path="/guides"
      eyebrow="Guides"
      title="HOA guides for volunteer boards"
      lead="Plain-language guides, grouped by state. Where a state’s law is quoted, the statute’s own words are on the page so you can check them."
      sections={guideGroups().map((g) => ({ id: g.id, label: g.label, items: g.items }))}
      linkLabel="Read the guide"
      position="guides_index"
    />
  )
}
