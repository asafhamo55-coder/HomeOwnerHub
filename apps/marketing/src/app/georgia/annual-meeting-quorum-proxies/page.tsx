import type { Metadata } from 'next'
import { GuidePage } from '@/components/georgia/guide-page'
import { GUIDES } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const guide = GUIDES['annual-meeting-quorum-proxies']!

export const metadata: Metadata = pageMetadata({
  title: guide.metaTitle,
  description: guide.description,
  path: '/georgia/annual-meeting-quorum-proxies',
})

export default function Page() {
  return <GuidePage guide={guide} />
}
