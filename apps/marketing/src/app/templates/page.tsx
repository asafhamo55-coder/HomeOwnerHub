import type { Metadata } from 'next'
import { LibraryPage } from '@/components/georgia/library-page'
import { templateGroups } from '@/lib/library'
import { pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'

export const metadata: Metadata = pageMetadata({ ...PAGE_META['/templates']!, path: '/templates' })

export default function TemplatesIndexPage() {
  return (
    <LibraryPage
      name="Templates"
      path="/templates"
      eyebrow="Free templates"
      title="Free HOA templates and checklists"
      lead="Print them or fill them in. No sign-up. Each one is a starting point for your board, not a substitute for your governing documents."
      sections={templateGroups().map((g) => ({ id: g.id, label: g.label, blurb: g.blurb, items: g.items }))}
      linkLabel="Open the template"
      position="templates_index"
    />
  )
}
