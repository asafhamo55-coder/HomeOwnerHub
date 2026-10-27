import type { Metadata } from 'next'
import { GuidePage } from '@/components/georgia/guide-page'
import { GUIDES } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const guide = GUIDES['hoa-treasurer-duties']!

export const metadata: Metadata = pageMetadata({
  title: guide.metaTitle,
  description: guide.description,
  path: '/guides/hoa-treasurer-duties',
})

export default function Page() {
  return <GuidePage guide={guide} />
}
