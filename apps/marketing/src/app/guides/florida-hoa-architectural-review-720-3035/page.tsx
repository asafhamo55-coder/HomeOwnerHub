import type { Metadata } from 'next'
import { GuidePage } from '@/components/georgia/guide-page'
import { GUIDES } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const x = GUIDES['florida-hoa-architectural-review-720-3035']!

export const metadata: Metadata = pageMetadata({
  title: x.metaTitle,
  description: x.description,
  path: '/guides/florida-hoa-architectural-review-720-3035',
})

export default function Page() {
  return <GuidePage guide={x} />
}
