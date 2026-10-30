import type { Metadata } from 'next'
import { GuidePage } from '@/components/georgia/guide-page'
import { GUIDES } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const x = GUIDES['california-hoa-fine-hearing-and-penalty-rules']!

export const metadata: Metadata = pageMetadata({
  title: x.metaTitle,
  description: x.description,
  path: '/guides/california-hoa-fine-hearing-and-penalty-rules',
})

export default function Page() {
  return <GuidePage guide={x} />
}
