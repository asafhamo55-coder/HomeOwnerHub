import type { Metadata } from 'next'
import { GuidePage } from '@/components/georgia/guide-page'
import { GUIDES } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const x = GUIDES['texas-hoa-written-ballots-209-0058']!

export const metadata: Metadata = pageMetadata({
  title: x.metaTitle,
  description: x.description,
  path: '/guides/texas-hoa-written-ballots-209-0058',
})

export default function Page() {
  return <GuidePage guide={x} />
}
