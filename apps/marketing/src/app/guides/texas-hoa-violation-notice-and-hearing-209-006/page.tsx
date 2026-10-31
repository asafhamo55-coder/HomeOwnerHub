import type { Metadata } from 'next'
import { GuidePage } from '@/components/georgia/guide-page'
import { GUIDES } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const x = GUIDES['texas-hoa-violation-notice-and-hearing-209-006']!

export const metadata: Metadata = pageMetadata({
  title: x.metaTitle,
  description: x.description,
  path: '/guides/texas-hoa-violation-notice-and-hearing-209-006',
})

export default function Page() {
  return <GuidePage guide={x} />
}
