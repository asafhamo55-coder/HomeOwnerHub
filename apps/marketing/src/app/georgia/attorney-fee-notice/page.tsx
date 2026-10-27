import type { Metadata } from 'next'
import { GuidePage } from '@/components/georgia/guide-page'
import { GUIDES } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const guide = GUIDES['attorney-fee-notice']!

export const metadata: Metadata = pageMetadata({
  title: guide.metaTitle,
  description: guide.description,
  path: '/georgia/attorney-fee-notice',
})

export default function Page() {
  return <GuidePage guide={guide} />
}
