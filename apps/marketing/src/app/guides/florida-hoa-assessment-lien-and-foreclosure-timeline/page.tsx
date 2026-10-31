import type { Metadata } from 'next'
import { GuidePage } from '@/components/georgia/guide-page'
import { GUIDES } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const x = GUIDES['florida-hoa-assessment-lien-and-foreclosure-timeline']!

export const metadata: Metadata = pageMetadata({
  title: x.metaTitle,
  description: x.description,
  path: '/guides/florida-hoa-assessment-lien-and-foreclosure-timeline',
})

export default function Page() {
  return <GuidePage guide={x} />
}
