import type { Metadata } from 'next'
import { FeaturePage } from '@/components/site/feature-page'
import { pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'

export const metadata: Metadata = pageMetadata({ ...PAGE_META['/features/ask-your-documents']!, path: '/features/ask-your-documents' })

export default function Page() {
  return <FeaturePage slug="ask-your-documents" />
}
