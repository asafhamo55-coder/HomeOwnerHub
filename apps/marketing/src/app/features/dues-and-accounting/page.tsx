import type { Metadata } from 'next'
import { FeaturePage } from '@/components/site/feature-page'
import { pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'

export const metadata: Metadata = pageMetadata({ ...PAGE_META['/features/dues-and-accounting']!, path: '/features/dues-and-accounting' })

export default function Page() {
  return <FeaturePage slug="dues-and-accounting" />
}
